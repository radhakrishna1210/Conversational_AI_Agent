// backend/src/services/voice/providers/sarvam.provider.js
/**
 * Sarvam AI voice provider.
 *
 * Requires SARVAM_API_KEY environment variable.
 * Uses the Sarvam REST API.
 */

import { fromSarvamVoice } from '../voice.dto.js';

const BASE_URL = 'https://api.sarvam.ai';

function getApiKey() {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error('SARVAM_API_KEY is not set');
  return key;
}

function authHeaders() {
  return {
    'api-subscription-key': getApiKey(),
    'Content-Type': 'application/json',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return hardcoded available voices from Sarvam.
 * @returns {Promise<import('../voice.dto.js').VoiceDTO[]>}
 */
export async function getVoices() {
  const voicesList = [
    { name: 'shubh', gender: 'male', language_code: 'hi-IN', style: 'conversational', tone: 'friendly' },
    { name: 'ritu', gender: 'female', language_code: 'hi-IN', style: 'conversational', tone: 'warm' },
    { name: 'aditya', gender: 'male', language_code: 'en-IN', style: 'conversational', tone: 'clear' },
    { name: 'simran', gender: 'female', language_code: 'en-IN', style: 'conversational', tone: 'clear' },
    { name: 'anand', gender: 'male', language_code: 'hi-IN', style: 'news', tone: 'authoritative' },
    { name: 'roopa', gender: 'female', language_code: 'hi-IN', style: 'news', tone: 'authoritative' },
    { name: 'priya', gender: 'female', language_code: 'bn-IN', style: 'conversational', tone: 'friendly' },
  ];
  return voicesList.map(fromSarvamVoice);
}

/**
 * Synthesise speech using Sarvam TTS and return an audio Buffer.
 * @param {string} voiceId – Sarvam voice name
 * @param {string} text    – Text to synthesise
 * @param {string} languageCode - Target language code (e.g. 'en-IN')
 * @returns {Promise<Buffer>}
 */
export async function previewVoice(voiceId, text, languageCode = 'en-IN') {
  const res = await fetch(`${BASE_URL}/text-to-speech`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      inputs: [text],
      target_language_code: languageCode,
      speaker: voiceId,
      pace: 1.05,
      // Match the streaming endpoint (22050) — at 8000 the same speaker
      // sounds like a different (telephone-quality) voice, so the welcome
      // and the streamed replies audibly mismatched mid-call.
      speech_sample_rate: 22050,
      enable_preprocessing: true,
      model: 'bulbul:v3'
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sarvam TTS failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data.audios || !data.audios[0]) {
    throw new Error('Sarvam API returned no audio data');
  }

  // Sarvam returns a base64 encoded string, decode it to raw binary Buffer
  return Buffer.from(data.audios[0], 'base64');
}

/**
 * Start Sarvam's binary HTTP audio stream. Unlike the JSON REST endpoint,
 * this resolves as soon as response headers arrive and lets callers forward
 * audio chunks without buffering the complete utterance.
 */
export async function streamVoice(voiceId, text, languageCode = 'en-IN', opts = {}) {
  const res = await fetch(`${BASE_URL}/text-to-speech/stream`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      text,
      target_language_code: languageCode,
      speaker: voiceId,
      pace: opts.pace ?? 1.05,
      speech_sample_rate: 22050,
      enable_preprocessing: false,
      model: 'bulbul:v3',
      temperature: 0.6,
      output_audio_codec: 'mp3',
      output_audio_bitrate: '64k',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok || !res.body) {
    const body = await res.text();
    throw new Error(`Sarvam streaming TTS failed (${res.status}): ${body.slice(0, 300)}`);
  }

  return {
    body: res.body,
    contentType: res.headers.get('content-type') || 'audio/mpeg',
  };
}

/**
 * Lightweight health check.
 * @returns {Promise<{ healthy: boolean, error?: string, latencyMs?: number }>}
 */
export async function healthCheck() {
  const start = Date.now();
  try {
    if (!process.env.SARVAM_API_KEY) {
      return { healthy: false, error: 'SARVAM_API_KEY not configured' };
    }
    const res = await fetch(`${BASE_URL}/text-to-speech`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({})
    });
    // 400 Bad Request indicates API key is valid but body is missing
    if (res.ok || res.status === 400 || res.status === 422) {
      return { healthy: true, latencyMs: Date.now() - start };
    }
    const body = await res.text();
    return { healthy: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}
