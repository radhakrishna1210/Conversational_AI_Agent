// backend/src/services/voice/providers/elevenlabs.provider.js
/**
 * ElevenLabs voice provider.
 *
 * Requires ELEVENLABS_API_KEY environment variable.
 * Uses the ElevenLabs REST API directly (no SDK dependency).
 */

import { fromElevenLabsVoice } from '../voice.dto.js';

const BASE_URL = 'https://api.elevenlabs.io/v1';

function getApiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  return key;
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
  const fast = Boolean(opts.fast);
  const query = fast
    ? 'output_format=mp3_22050_32&optimize_streaming_latency=3'
    : 'output_format=mp3_44100_128';
  const res = await fetch(
    `${BASE_URL}/text-to-speech/${voiceId}?${query}`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        text,
        model_id: fast ? 'eleven_flash_v2_5' : 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
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
 * first bytes to the browser before the whole clip is done (B4). Uses the fast
 * eleven_flash_v2_5 model (multilingual incl. Hindi, ~75ms first-byte) with
 * latency-optimized routing — the low-latency TTS for live web calls.
 * @param {string} voiceId
 * @param {string} text
 * @returns {Promise<{ body: ReadableStream, contentType: string }>}
 */
export async function streamVoice(voiceId, text /* opts reserved */) {
  const res = await fetch(
    `${BASE_URL}/text-to-speech/${voiceId}/stream?output_format=mp3_22050_32&optimize_streaming_latency=3`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: AbortSignal.timeout(15_000),
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
