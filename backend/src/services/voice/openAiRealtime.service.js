// backend/src/services/voice/openAiRealtime.service.js
/**
 * Bridges one call to OpenAI's GPT Realtime API — a bundled speech-to-speech
 * (STT + LLM + TTS in one multimodal model) engine over a persistent WebSocket.
 *
 * Protocol: OpenAI Realtime GA API (/v1/realtime)
 *   - Connect: wss://api.openai.com/v1/realtime?model=gpt-realtime
 *   - Auth: Authorization: Bearer $OPENAI_API_KEY
 *   - Formats supported: pcm16 (24kHz Web Call) and g711_ulaw (Twilio / Plivo telephony)
 *   - Voice: alloy, ash, ballad, coral, echo, sage, shimmer, verse
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import logger from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { buildAgentSystemPrompt } from '../agentRuntime.service.js';

/**
 * @typedef {'g711_ulaw'|'pcm16'} OpenAiAudioFormat
 */

const OPENAI_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar',
]);

export class OpenAiRealtimeSession extends EventEmitter {
  /**
   * @param {object} opts
   * @param {object} opts.agent - Agent row (drives persona/instructions)
   * @param {string} opts.kbText - grounding text (same source as the modular pipeline)
   * @param {OpenAiAudioFormat} opts.audioFormat - 'g711_ulaw' for telephony, 'pcm16' for browser Web Call
   */
  constructor({ agent, kbText, audioFormat = 'pcm16' }) {
    super();
    this.agent = agent;
    this.kbText = kbText;
    this.audioFormat = audioFormat;
    this.ws = null;
    this.ready = false;
    this._closed = false;
    this._lastUserTurnAt = null;
    this._awaitingReply = false;
  }

  _resolveVoice() {
    let chosen = '';
    try {
      const settings = typeof this.agent?.settings === 'string'
        ? JSON.parse(this.agent.settings || '{}')
        : (this.agent?.settings || {});
      chosen = String(settings?.voice || this.agent?.voice || '').toLowerCase().trim();
    } catch {
      chosen = String(this.agent?.voice || '').toLowerCase().trim();
    }
    if (OPENAI_VOICES.has(chosen)) {
      return chosen;
    }
    const envVoice = String(env.OPENAI_REALTIME_VOICE || 'alloy').toLowerCase().trim();
    return OPENAI_VOICES.has(envVoice) ? envVoice : 'alloy';
  }

  connect() {
    const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured — cannot start an OpenAI GPT Realtime session');
    }
    if (this.ws) return;

    const model = env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
    const baseUrl = env.OPENAI_REALTIME_WS_URL || 'wss://api.openai.com/v1/realtime';
    const url = `${baseUrl}?model=${encodeURIComponent(model)}`;

    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    this.ws.on('unexpected-response', (_req, res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        logger.error(
          { status: res.statusCode, headers: res.headers, body: body.slice(0, 2000) },
          'OpenAI GPT Realtime WS handshake rejected'
        );
      });
    });

    this.ws.on('open', () => {
      const instructions = buildAgentSystemPrompt(this.agent, this.kbText, { voiceMode: true });
      const voice = this._resolveVoice();

      const audioFormatSpec = this.audioFormat === 'g711_ulaw'
        ? { type: 'audio/pcmu' }
        : { type: 'audio/pcm', rate: 24000 };

      this._send({
        type: 'session.update',
        session: {
          type: 'realtime',
          instructions,
          audio: {
            input: {
              format: audioFormatSpec,
              transcription: {
                model: 'whisper-1',
              },
              turn_detection: {
                type: 'server_vad',
                threshold: env.OPENAI_REALTIME_TURN_THRESHOLD,
                prefix_padding_ms: env.OPENAI_REALTIME_TURN_PREFIX_MS,
                silence_duration_ms: env.OPENAI_REALTIME_TURN_SILENCE_MS,
              },
            },
            output: {
              format: audioFormatSpec,
              voice,
            },
          },
        },
      });
      this.ready = true;
      this.emit('ready');
    });

    this.ws.on('message', (raw, isBinary) => {
      if (isBinary) {
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
          if (msg.delta) {
            if (this._awaitingReply && this._lastUserTurnAt != null) {
              logger.info(
                { agentId: this.agent?.id, replyLatencyMs: Date.now() - this._lastUserTurnAt },
                'OpenAI GPT Realtime: first reply audio chunk received'
              );
              this._awaitingReply = false;
            }
            this.emit('audio', Buffer.from(msg.delta, 'base64'));
          }
          break;

        case 'response.audio_transcript.delta':
          if (msg.delta) {
            this.emit('transcript', { role: 'assistant', text: msg.delta, done: false });
          }
          break;

        case 'response.audio_transcript.done':
          if (msg.transcript) {
            this.emit('transcript', { role: 'assistant', text: msg.transcript, done: true });
          }
          break;

        case 'conversation.item.input_audio_transcription.completed':
          if (msg.transcript) {
            this._lastUserTurnAt = Date.now();
            this._awaitingReply = true;
            this.emit('transcript', { role: 'user', text: msg.transcript, done: true });
          }
          break;

        case 'input_audio_buffer.speech_started':
          // Caller interrupted the assistant — signal bridge to clear outgoing audio buffer
          this.emit('clear');
          break;

        case 'error':
          logger.warn({ err: msg.error }, 'OpenAI GPT Realtime session error');
          this.emit('error', new Error(msg.error?.message || 'OpenAI GPT Realtime session error'));
          break;

        default:
          break;
      }
    });

    this.ws.on('error', (err) => {
      logger.error({ err: err.message }, 'OpenAI GPT Realtime WS transport error');
      this.emit('error', err);
    });

    this.ws.on('close', () => {
      this.ready = false;
      this.emit('close');
    });
  }

  /** Send one chunk of caller audio, already encoded in `this.audioFormat`. */
  sendAudioChunk(buf) {
    if (!this.ready || !buf?.length) return;
    this._send({
      type: 'input_audio_buffer.append',
      audio: buf.toString('base64'),
    });
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
