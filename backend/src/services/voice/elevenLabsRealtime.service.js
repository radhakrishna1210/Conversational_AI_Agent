// backend/src/services/voice/elevenLabsRealtime.service.js
/**
 * Bridges one call to ElevenLabs' Conversational AI — a bundled
 * speech-to-speech (STT + LLM + TTS) engine, analogous to xAI's Voice Agent
 * (see xaiRealtime.service.js — same EventEmitter interface, so both plug
 * into the same bridge handlers via realtimeEngine.factory.js).
 *
 * Unlike xAI, ElevenLabs requires a pre-provisioned "shell" Agent (created
 * once in the ElevenLabs dashboard, with per-session Prompt/First Message/
 * Language overrides enabled in its Security settings — see
 * ELEVENLABS_CONVAI_AGENT_ID in env.js). Our per-call persona/KB instructions
 * are still supplied dynamically via `conversation_config_override`, so one
 * shell agent serves every one of our Agents, same as one xAI model does.
 *
 * Protocol (per ElevenLabs docs — verify exact field names against a live
 * account before relying on this in production, same caveat as xAI):
 *   1. GET /v1/convai/conversation/get-signed-url?agent_id=... (xi-api-key header)
 *   2. Open WS to the returned signed_url
 *   3. First message: { type: 'conversation_initiation_client_data', conversation_config_override: {...} }
 *   4. Audio in:  { user_audio_chunk: '<base64 audio>' }
 *   5. Audio out: { type: 'audio', audio_event: { audio_base_64: '...' } }
 *   6. Transcripts: { type: 'user_transcript', ... } / { type: 'agent_response', ... }
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import logger from '../../lib/logger.js';
import { buildAgentSystemPrompt } from '../agentRuntime.service.js';

const SIGNED_URL_ENDPOINT = 'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url';

export class ElevenLabsRealtimeSession extends EventEmitter {
  /**
   * @param {object} opts
   * @param {object} opts.agent - Agent row (drives persona/instructions)
   * @param {string} opts.kbText - grounding text
   * @param {'g711_ulaw'|'pcm16'} opts.audioFormat - 'g711_ulaw' for Twilio (ulaw_8000,
   *   passthrough, no transcoding), 'pcm16' for browser Web Call
   */
  constructor({ agent, kbText, audioFormat }) {
    super();
    this.agent = agent;
    this.kbText = kbText;
    // NOTE: unlike xAI, ElevenLabs' input/output audio format is set on the
    // shell Agent itself in the dashboard (not reliably client-overridable
    // across plans), so `audioFormat` is accepted for interface parity with
    // XaiRealtimeSession but not currently sent in the override payload.
    // The shell agent's configured format MUST match the caller: ulaw_8000
    // for the Twilio bridge, pcm_16000 (or similar) for the browser Web Call
    // — using the same shell agent for both surfaces may require splitting
    // into two ElevenLabs agents if the dashboard can't reconcile both.
    this.audioFormat = audioFormat;
    this.ws = null;
    this.ready = false;
    this._closed = false;
  }

  async connect() {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_CONVAI_AGENT_ID;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured — cannot start an ElevenLabs Conversational Agent session');
    if (!agentId) throw new Error('ELEVENLABS_CONVAI_AGENT_ID is not configured — create a shell Agent in the ElevenLabs dashboard first');
    if (this.ws) return;

    let signedUrl;
    try {
      const res = await fetch(`${SIGNED_URL_ENDPOINT}?agent_id=${encodeURIComponent(agentId)}`, {
        headers: { 'xi-api-key': apiKey },
      });
      const body = await res.text();
      if (!res.ok) {
        throw new Error(`ElevenLabs signed-url request failed (${res.status}): ${body.slice(0, 500)}`);
      }
      const data = JSON.parse(body);
      signedUrl = data.signed_url;
      if (!signedUrl) throw new Error(`ElevenLabs signed-url response missing signed_url: ${body.slice(0, 500)}`);
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to obtain ElevenLabs signed URL');
      this.emit('error', err);
      return;
    }

    this.ws = new WebSocket(signedUrl);

    this.ws.on('unexpected-response', (_req, res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        logger.error(
          { status: res.statusCode, headers: res.headers, body: body.slice(0, 2000) },
          'ElevenLabs Conversational AI WS handshake rejected'
        );
      });
    });

    this.ws.on('open', () => {
      const instructions = buildAgentSystemPrompt(this.agent, this.kbText, { voiceMode: true });
      const languages = (() => {
        try { return JSON.parse(this.agent.languages || '[]'); } catch { return []; }
      })();
      this._send({
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: {
            prompt: { prompt: instructions },
            ...(this.agent.welcomeMessage ? { first_message: this.agent.welcomeMessage } : {}),
            ...(languages[0] ? { language: languages[0] } : {}),
          },
        },
      });
      this.ready = true;
      this.emit('ready');
    });

    this.ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.type) {
        case 'audio':
          if (msg.audio_event?.audio_base_64) {
            this.emit('audio', Buffer.from(msg.audio_event.audio_base_64, 'base64'));
          }
          break;
        case 'user_transcript':
          if (msg.user_transcription_event?.user_transcript) {
            this.emit('transcript', { role: 'user', text: msg.user_transcription_event.user_transcript, done: true });
          }
          break;
        case 'agent_response':
          if (msg.agent_response_event?.agent_response) {
            this.emit('transcript', { role: 'assistant', text: msg.agent_response_event.agent_response, done: true });
          }
          break;
        case 'ping':
          this._send({ type: 'pong', event_id: msg.ping_event?.event_id });
          break;
        default:
          break;
      }
    });

    this.ws.on('error', (err) => {
      logger.error({ err: err.message }, 'ElevenLabs Conversational AI WS transport error');
      this.emit('error', err);
    });

    this.ws.on('close', () => {
      this.ready = false;
      this.emit('close');
    });
  }

  /** Send one chunk of caller audio, already encoded as `this.audioFormat`. */
  sendAudioChunk(buf) {
    if (!this.ready || !buf?.length) return;
    this._send({ user_audio_chunk: buf.toString('base64') });
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
  }
}
