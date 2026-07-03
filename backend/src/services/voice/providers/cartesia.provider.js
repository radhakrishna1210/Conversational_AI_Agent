/**
 * Cartesia voice provider.
 *
 * Requires CARTESIA_API_KEY environment variable.
 */

import { fromCartesiaVoice } from '../voice.dto.js';

const BASE_URL = 'https://api.cartesia.ai';

function getApiKey() {
  const key = process.env.CARTESIA_API_KEY;
  if (!key) throw new Error('CARTESIA_API_KEY is not set');
  return key;
}

function authHeaders() {
  return {
    'X-API-Key': getApiKey(),
    'Cartesia-Version': '2024-06-10',
    'Content-Type': 'application/json',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all available voices from Cartesia and return normalised VoiceDTOs.
 * @returns {Promise<import('../voice.dto.js').VoiceDTO[]>}
 */
export async function getVoices() {
  const res = await fetch(`${BASE_URL}/voices`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cartesia getVoices failed (${res.status}): ${body}`);
  }
  const voices = await res.json();
  return voices.map(fromCartesiaVoice);
}

/**
 * Synthesise speech using Cartesia TTS and return an audio Buffer.
 * @param {string} voiceId – Cartesia voice id
 * @param {string} text    – Text to synthesise
 * @returns {Promise<Buffer>}
 */
export async function previewVoice(voiceId, text) {
  const res = await fetch(`${BASE_URL}/tts/bytes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      model_id: 'sonic-english',
      transcript: text,
      voice: { mode: 'id', id: voiceId },
      output_format: {
        container: 'mp3',
        encoding: 'pcm_f32le',
        sample_rate: 44100
      }
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cartesia TTS failed (${res.status}): ${body}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Lightweight health check.
 * @returns {Promise<{ healthy: boolean, error?: string, latencyMs?: number }>}
 */
export async function healthCheck() {
  const start = Date.now();
  try {
    if (!process.env.CARTESIA_API_KEY) {
      return { healthy: false, error: 'CARTESIA_API_KEY not configured' };
    }
    const res = await fetch(`${BASE_URL}/voices`, {
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
