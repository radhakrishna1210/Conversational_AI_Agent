// backend/src/services/voice/xaiRealtime.service.js
/**
 * Bridges one call to xAI's Grok Voice Agent — a bundled speech-to-speech
 * (STT + LLM + TTS in one model) engine, reachable over a single WebSocket.
 *
 * Protocol: xAI documents the Voice Agent API as a near drop-in replacement
 * for OpenAI's Realtime API — same message shapes (session.update,
 * input_audio_buffer.append, response.audio.delta, ...), swap only the base
 * URL, API key, and voice model. This file isolates that wire format to one
 * place; confirm exact field/event names against a live xAI account before
 * relying on this in production — a stale/incorrect field name here is the
 * most likely failure point, not the surrounding bridge logic.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import logger from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { buildAgentSystemPrompt } from '../agentRuntime.service.js';

/**
 * @typedef {'g711_ulaw'|'pcm16'} XaiAudioFormat
 */

export class XaiRealtimeSession extends EventEmitter {
  /**
   * @param {object} opts
   * @param {object} opts.agent - Agent row (drives persona/instructions)
   * @param {string} opts.kbText - grounding text (same source as the modular pipeline)
   * @param {XaiAudioFormat} opts.audioFormat - 'g711_ulaw' for Twilio telephony (no
   *   transcoding needed), 'pcm16' for browser Web Call
   */
  constructor({ agent, kbText, audioFormat }) {
    super();
    this.agent = agent;
    this.kbText = kbText;
    this.audioFormat = audioFormat;
    this.ws = null;
    this.ready = false;
    this._closed = false;
  }

  connect() {
    if (!env.XAI_API_KEY) {
      throw new Error('XAI_API_KEY is not configured — cannot start an xAI Conversational Agent session');
    }
    if (this.ws) return;

    const url = `${env.XAI_VOICE_WS_URL}?model=${encodeURIComponent(env.XAI_VOICE_MODEL)}`;
    this.ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${env.XAI_API_KEY}` },
    });

    // The 'ws' library's generic error ("Unexpected server response: 403")
    // discards the actual response body. xAI's handshake-rejection body
    // usually contains the real reason (bad model, no credits, key scope,
    // etc.) — surface it instead of guessing.
    this.ws.on('unexpected-response', (_req, res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        logger.error(
          { status: res.statusCode, headers: res.headers, body: body.slice(0, 2000) },
          'xAI Voice Agent WS handshake rejected'
        );
      });
    });

    this.ws.on('open', () => {
      const instructions = buildAgentSystemPrompt(this.agent, this.kbText, { voiceMode: true });
      this._send({
        type: 'session.update',
        session: {
          instructions,
          ...(env.XAI_VOICE_NAME ? { voice: env.XAI_VOICE_NAME } : {}),
          modalities: ['audio', 'text'],
          input_audio_format: this.audioFormat,
          output_audio_format: this.audioFormat,
          turn_detection: { type: 'server_vad' },
        },
      });
      this.ready = true;
      this.emit('ready');
    });

    this.ws.on('message', (raw, isBinary) => {
      if (isBinary) {
        // Some realtime deployments push audio as raw binary frames instead
        // of base64-in-JSON — support both.
        this.emit('audio', raw);
        return;
      }
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.type) {
        case 'response.audio.delta':
          if (msg.delta) this.emit('audio', Buffer.from(msg.delta, 'base64'));
          break;
        case 'response.audio_transcript.delta':
          if (msg.delta) this.emit('transcript', { role: 'assistant', text: msg.delta, done: false });
          break;
        case 'response.audio_transcript.done':
          if (msg.transcript) this.emit('transcript', { role: 'assistant', text: msg.transcript, done: true });
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (msg.transcript) this.emit('transcript', { role: 'user', text: msg.transcript, done: true });
          break;
        case 'error':
          logger.warn({ err: msg.error }, 'xAI Voice Agent session error');
          this.emit('error', new Error(msg.error?.message || 'xAI Voice Agent session error'));
          break;
        default:
          break;
      }
    });

    this.ws.on('error', (err) => {
      logger.error({ err: err.message }, 'xAI Voice Agent WS transport error');
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
    this._send({ type: 'input_audio_buffer.append', audio: buf.toString('base64') });
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
