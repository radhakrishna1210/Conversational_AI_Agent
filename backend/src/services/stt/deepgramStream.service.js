// backend/src/services/stt/deepgramStream.service.js
/**
 * Deepgram streaming speech-to-text (B3). Transcribes the caller's audio AS
 * THEY SPEAK over a WebSocket, so the transcript is ready the instant they stop
 * — removing batch STT (0.7–3.5s in logs/latency.log) from the turn's critical
 * path.
 *
 * Opt-in and fully additive: only used when DEEPGRAM_API_KEY is set. The
 * modular Web Call handler streams the same PCM it already buffers into a
 * session here; if Deepgram yields no transcript (or the key is absent) the
 * handler falls back to the existing batch STT on the buffered WAV. Nothing
 * changes until a key is configured.
 *
 * Protocol: wss://api.deepgram.com/v1/listen with `Authorization: Token <key>`,
 * raw linear16 PCM frames in, JSON results out (channel.alternatives[0].
 * transcript, is_final). `{ type: 'CloseStream' }` flushes the final results.
 */

import WebSocket from 'ws';
import logger from '../../lib/logger.js';

export function isDeepgramConfigured() {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

// Map an agent's language (display name like "Hindi" / "English (Indian)", or an
// ISO code) to the Deepgram `language` param. Without this, a Hindi agent's
// audio is transcribed as English → empty/garbage → silent fallback to batch
// STT (which is exactly what the logs showed: sttProvider stayed "sarvam").
const DEEPGRAM_LANG = {
  hindi: 'hi', english: 'en', 'english (american)': 'en-US', 'english (british)': 'en-GB',
  'english (indian)': 'en-IN', 'english (australian)': 'en-AU', tamil: 'ta', telugu: 'te',
  spanish: 'es', french: 'fr', german: 'de', portuguese: 'pt', italian: 'it', dutch: 'nl',
  russian: 'ru', japanese: 'ja', korean: 'ko', mandarin: 'zh', chinese: 'zh',
};

export function toDeepgramLanguage(value) {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (/^[a-z]{2}(-[A-Za-z]{2,})?$/.test(raw)) return raw; // already a code like "hi" / "en-IN"
  return DEEPGRAM_LANG[raw.toLowerCase()];
}

export class DeepgramStreamSession {
  /**
   * @param {object} opts
   * @param {number} opts.sampleRate - PCM16 sample rate the browser is sending
   * @param {string} [opts.language] - optional Deepgram language code (e.g. 'en', 'hi')
   */
  constructor({ sampleRate = 24000, language } = {}) {
    this.sampleRate = sampleRate;
    this.language = language;
    this.ws = null;
    this.finals = [];
    this._open = false;
    this._pending = [];
  }

  connect() {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error('DEEPGRAM_API_KEY not set');

    const params = new URLSearchParams({
      model: process.env.DEEPGRAM_MODEL || 'nova-2',
      encoding: 'linear16',
      sample_rate: String(this.sampleRate),
      channels: '1',
      punctuate: 'true',
      smart_format: 'true',
      interim_results: 'false',
    });
    if (this.language) params.set('language', this.language);

    this.ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
      headers: { Authorization: `Token ${key}` },
    });

    this.ws.on('open', () => {
      this._open = true;
      for (const buf of this._pending) {
        try { this.ws.send(buf); } catch { /* dropped */ }
      }
      this._pending = [];
    });

    this.ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const alt = msg?.channel?.alternatives?.[0];
      if (alt?.transcript && msg.is_final) this.finals.push(alt.transcript);
    });

    this.ws.on('error', (err) => logger.warn(`Deepgram STT stream error: ${err.message}`));
  }

  /** Feed one PCM16 frame (queued until the socket is open). */
  send(buf) {
    if (!this.ws) return;
    if (this._open && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(buf); } catch { /* dropped */ }
    } else {
      this._pending.push(buf);
    }
  }

  /**
   * Flush the stream and wait (bounded) for Deepgram's final results, then
   * return the assembled transcript. Returns '' on any failure so the caller
   * can fall back to batch STT.
   */
  async finish(timeoutMs = 3000) {
    if (!this.ws) return '';
    try {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'CloseStream' }));
    } catch { /* noop */ }

    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      this.ws.on('close', finish);
      setTimeout(finish, timeoutMs);
    });

    try { this.ws.close(); } catch { /* already closed */ }
    return this.finals.join(' ').trim();
  }
}
