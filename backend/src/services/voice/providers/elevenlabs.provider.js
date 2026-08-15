// backend/src/services/voice/providers/elevenlabs.provider.js
/**
 * ElevenLabs voice provider.
 *
 * Requires ELEVENLABS_API_KEY environment variable.
 * Uses the ElevenLabs REST API directly (no SDK dependency).
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { fromElevenLabsVoice } from '../voice.dto.js';
import { takeCompleteSentences, cleanForSpeech } from '../sentenceBuffer.js';

const BASE_URL = 'https://api.elevenlabs.io/v1';
const WS_BASE_URL = 'wss://api.elevenlabs.io/v1/text-to-speech';

// Live-call TTS model. Default to the high-quality multilingual model for the
// most natural, human-sounding voice (incl. Hindi). Override with
// ELEVENLABS_TTS_MODEL — e.g. eleven_turbo_v2_5 (balanced) or eleven_flash_v2_5
// (fastest) if you want to trade warmth for lower latency.
function ttsModel() {
  return process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2';
}

// Voice settings tuned for a warm, expressive, HUMAN delivery instead of the
// flat/robotic default. Lower stability = more emotional/varied intonation;
// `style` adds expressiveness; speaker boost adds presence/clarity; `speed`
// (from the agent's speaking rate) keeps a natural, unrushed pace.
// `affect` (detected caller state) nudges DELIVERY, not just wording: an
// agitated caller gets a steadier-but-expressive read, a hesitant/quiet one a
// calmer, softer one. This is the delivery-level control ElevenLabs exposes on
// realtime models (v2 family has no per-utterance emotion tags — those are an
// eleven_v3 feature, and v3 has no realtime/websocket tier).
// `stability` is THE intonation dial, and it is inverted: HIGH stability means
// the model repeats one prosodic contour, which is precisely the "everything in
// a single tone" read. It was 0.4, which is still firmly in the even-delivery
// half of the range. 0.28 lets pitch actually move across a sentence — questions
// rise, lists step, a closing clause falls — while staying above the ~0.2 mark
// where the v2 models start drifting in timbre between generations.
//
// `style` is expressiveness on top of that. 0.35 → 0.5 for the same reason.
// It is not free: ElevenLabs notes style > 0 costs some latency, which is why it
// is a moderate bump rather than a maximum one.
//
// `similarity_boost` is nudged DOWN (0.85 → 0.78). At high values the model
// clings to the reference recording's delivery, and most stock reference clips
// are read evenly — so a high value quietly re-flattens what stability just
// bought. 0.78 keeps the voice identity without pinning its prosody.
//
// The affect variants keep their RELATIVE ordering (agitated/hesitant read
// steadier than neutral) rather than their old absolute values, so a detected
// caller state still changes the delivery without landing back on monotone.
function ttsVoiceSettings(pace, affect) {
  const settings = { stability: 0.28, similarity_boost: 0.78, style: 0.5, use_speaker_boost: true };
  if (affect === 'agitated') { settings.stability = 0.38; settings.style = 0.42; }
  else if (affect === 'hesitant' || affect === 'quiet') { settings.stability = 0.42; settings.style = 0.38; }
  else if (affect === 'rushed') { settings.stability = 0.33; }
  if (Number.isFinite(pace) && pace > 0) settings.speed = Math.min(1.2, Math.max(0.7, pace));
  return settings;
}

/**
 * Latency-optimization level, 0-4. This is a WARMTH/LATENCY DIAL, not a free
 * win: each step up trades prosodic planning for speed, and level 3 — the value
 * this ran at unconditionally — is aggressive enough to audibly flatten
 * intonation. Level 4 additionally disables the text normalizer, which mangles
 * numbers and dates, so it is clamped out entirely.
 *
 * NOW 2 BY DEFAULT, was 3. Level 3 was reported as the agent "speaking
 * everything in a single tone", and it is the setting this file already
 * described as flattening intonation — it buys its latency by cutting how much
 * of the sentence the model plans prosody over, so the pitch contour that makes
 * a sentence sound meant flattens out first. Level 2 keeps most of the latency
 * win and restores most of the contour.
 *
 * Set ELEVENLABS_STREAMING_LATENCY=3 to go back to the faster/flatter read, or
 * 1/0 for maximum warmth; measure the cost with scripts/measure-turn.js.
 */
function streamingLatency() {
  const raw = Number(process.env.ELEVENLABS_STREAMING_LATENCY);
  if (!Number.isFinite(raw)) return 2;
  return Math.min(3, Math.max(0, Math.round(raw)));
}

/**
 * How many characters the WebSocket path buffers before generating each audio
 * chunk. A small FIRST value is what makes time-to-first-byte short, but it is
 * also how much text the model gets to plan intonation over — at 50 characters
 * the opening of every reply is planned almost blind, which is why replies tend
 * to start flat and warm up. Env-tunable for the same reason as the level above.
 */
function chunkLengthSchedule() {
  const raw = String(process.env.ELEVENLABS_CHUNK_SCHEDULE || '').trim();
  if (!raw) return [50, 120, 160, 290];
  const parsed = raw.split(',')
    .map((n) => Math.round(Number(n.trim())))
    .filter((n) => Number.isFinite(n) && n >= 50 && n <= 500);
  // ElevenLabs accepts at most 4 values and requires them ascending.
  const ok = parsed.length > 0 && parsed.length <= 4
    && parsed.every((n, i) => i === 0 || n > parsed[i - 1]);
  return ok ? parsed : [50, 120, 160, 290];
}

function getApiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  return key;
}

export const hasCredentials = () => Boolean(process.env.ELEVENLABS_API_KEY);

/** Can this provider accept LLM tokens directly? (see ../ttsStreamFactory.js) */
export function canStreamTokens() {
  return hasCredentials();
}

function authHeaders() {
  return {
    'xi-api-key': getApiKey(),
    'Content-Type': 'application/json',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all available voices from ElevenLabs and return normalised VoiceDTOs.
 * @returns {Promise<import('../voice.dto.js').VoiceDTO[]>}
 */
export async function getVoices() {
  const res = await fetch(`${BASE_URL}/voices`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs getVoices failed (${res.status}): ${body}`);
  }
  const { voices } = await res.json();
  return (voices || []).map(fromElevenLabsVoice);
}

/**
 * Synthesise speech using ElevenLabs TTS and return an audio Buffer.
 * @param {string} voiceId – ElevenLabs voice_id
 * @param {string} text    – Text to synthesise
 * @param {{ fast?: boolean }} [opts] – fast mode uses eleven_flash_v2_5 with a
 *   lower bitrate and latency-optimized routing (~700ms vs ~7s for long text);
 *   used by live web calls. Default (quality) mode is kept for voice previews.
 * @returns {Promise<Buffer>}
 */
export async function previewVoice(voiceId, text, opts = {}) {
  // 44.1kHz/128k for full fidelity (less compression = less "tinny/robotic").
  const res = await fetch(
    `${BASE_URL}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        text,
        model_id: ttsModel(),
        voice_settings: ttsVoiceSettings(opts.pace),
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${body}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Start ElevenLabs' streaming TTS: resolves as soon as headers arrive and
 * yields audio chunks as they're synthesized, so the caller can forward the
 * first bytes to the browser before the whole clip is done. Model comes from
 * ttsModel() (default multilingual_v2 for the most natural voice; set
 * ELEVENLABS_TTS_MODEL to a faster tier to trade warmth for latency). 44.1kHz/
 * 128k output for fidelity.
 * @param {string} voiceId
 * @param {string} text
 * @param {{ pace?: number, audioFormat?: string }} [opts] - `audioFormat`
 *   overrides the default MP3. The phone bridge passes 'ulaw_8000' so the bytes
 *   ElevenLabs returns are already exactly what a carrier's media stream wants:
 *   no MP3 decode, no resample, no added latency on a live call.
 * @returns {Promise<{ body: ReadableStream, contentType: string }>}
 */
export async function streamVoice(voiceId, text, opts = {}) {
  const outputFormat = opts.audioFormat || 'mp3_44100_128';
  const res = await fetch(
    // Level 3 by default = max latency optimization that keeps the text
    // normalizer on (4 would disable it and mangle numbers/dates). See
    // streamingLatency() for why this is worth turning DOWN.
    `${BASE_URL}/text-to-speech/${voiceId}/stream?output_format=${encodeURIComponent(outputFormat)}&optimize_streaming_latency=${streamingLatency()}`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        text,
        model_id: ttsModel(),
        voice_settings: ttsVoiceSettings(opts.pace, opts.affect),
      }),
      signal: AbortSignal.timeout(20_000),
    }
  );

  if (!res.ok || !res.body) {
    const body = await res.text();
    throw new Error(`ElevenLabs streaming TTS failed (${res.status}): ${body.slice(0, 300)}`);
  }

  return {
    body: res.body,
    contentType: res.headers.get('content-type') || 'audio/mpeg',
  };
}

/**
 * ElevenLabs WebSocket streaming TTS ("stream-input") — the TRUE low-latency
 * path. Text is pushed in incrementally (as the LLM generates it) and audio
 * comes back as ONE continuous MP3 stream, so the agent starts speaking on the
 * first words while the reply is still being written, with no MP3-concatenation
 * corruption (unlike synthesizing each sentence separately).
 *
 * Usage:  const s = new ElevenLabsTtsStream(voiceId); s.connect();
 *         s.on('audio', buf => ...); s.on('done', ...); s.on('error', ...);
 *         s.pushText('some words '); ...; s.end();
 *
 * NOTE: verify the message shape against a live ElevenLabs account — a stale
 * field name is the most likely failure point (same caveat as the realtime
 * services). Gated behind VOICE_TTS_OVERLAP so the default single-call path is
 * unaffected.
 */
export class ElevenLabsTtsStream extends EventEmitter {
  constructor(voiceId, opts = {}) {
    super();
    this.voiceId = voiceId;
    this.modelId = opts.modelId || ttsModel();
    this.pace = opts.pace;
    this.affect = opts.affect;
    // 'ulaw_8000' on the phone bridge — see streamVoice(). Kept as a plain
    // string so the caller owns the provider's vocabulary and this class stays
    // a transport.
    this.audioFormat = opts.audioFormat || 'mp3_44100_128';
    this.ws = null;
    this._open = false;
    this._pending = [];
    this._endRequested = false;
    this._done = false;
    this._buf = ''; // LLM tokens buffered until a sentence boundary (see pushText)
  }

  connect() {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error('ELEVENLABS_API_KEY is not set');

    const url = `${WS_BASE_URL}/${this.voiceId}/stream-input`
      + `?model_id=${encodeURIComponent(this.modelId)}`
      // Same output format as the single-call/welcome path so the reply doesn't
      // audibly drop in fidelity when the overlap pipeline is active.
      + `&output_format=${encodeURIComponent(this.audioFormat)}`
      + `&optimize_streaming_latency=${streamingLatency()}&auto_mode=true`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      // BOS: initialize the stream + authenticate. chunk_length_schedule keeps
      // the first audio chunk small for low time-to-first-byte.
      this._raw({
        text: ' ',
        voice_settings: ttsVoiceSettings(this.pace, this.affect),
        generation_config: { chunk_length_schedule: chunkLengthSchedule() },
        xi_api_key: key,
      });
      this._open = true;
      for (const t of this._pending) this._raw({ text: t });
      this._pending = [];
      if (this._endRequested) this._raw({ text: '' });
    });

    this.ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.audio) this.emit('audio', Buffer.from(msg.audio, 'base64'));
      if (msg.isFinal) this._finish();
    });

    this.ws.on('error', (err) => { this.emit('error', err); this._finish(); });
    this.ws.on('close', () => this._finish());
  }

  _finish() {
    if (this._done) return;
    this._done = true;
    this.emit('done');
    try { this.ws?.close(); } catch { /* already closed */ }
  }

  _raw(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  /**
   * Queue a piece of reply text as the LLM produces it. Tokens are BUFFERED and
   * released only at sentence boundaries — never mid-word. See
   * ../sentenceBuffer.js for why that matters (sub-word deltas → gibberish).
   * Sentence-sized chunks also honor auto_mode's contract (partial phrases
   * degrade generation quality per the ElevenLabs docs).
   */
  pushText(text) {
    if (!text || this._endRequested) return;
    this._buf += text;
    const { chunk, rest } = takeCompleteSentences(this._buf);
    if (!chunk) return;
    this._buf = rest;
    this._sendText(chunk);
  }

  _sendText(chunk) {
    const clean = cleanForSpeech(chunk);
    if (!clean) return;
    const t = `${clean} `; // ElevenLabs expects chunks to end on a word break
    if (this._open) this._raw({ text: t });
    else this._pending.push(t);
  }

  /** Signal end-of-text (flush) — audio 'done' fires once the tail is returned. */
  end() {
    if (!this._endRequested) {
      const rest = this._buf;
      this._buf = '';
      if (rest) this._sendText(rest); // speak the unterminated tail too
    }
    this._endRequested = true;
    if (this._open) this._raw({ text: '' });
  }

  close() { this._finish(); }
}

/**
 * Lightweight health check – calls the /user endpoint (cheap, no data transfer).
 * @returns {Promise<{ healthy: boolean, error?: string, latencyMs?: number }>}
 */
export async function healthCheck() {
  const start = Date.now();
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return { healthy: false, error: 'ELEVENLABS_API_KEY not configured' };
    }
    const res = await fetch(`${BASE_URL}/user`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const body = await res.text();
      return { healthy: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}
