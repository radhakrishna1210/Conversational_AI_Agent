// backend/src/services/voice/providers/google.provider.js
/**
 * Google Cloud Text-to-Speech provider.
 *
 * Credentials resolution order:
 *   1. GOOGLE_TTS_CREDENTIALS_JSON – base64-encoded service account JSON string
 *   2. GOOGLE_TTS_KEY_FILE         – path to a service account JSON file
 *   3. Application Default Credentials (gcloud auth, Workload Identity, etc.)
 *
 * Install: npm install @google-cloud/text-to-speech
 */

import { fromGoogleVoice } from '../voice.dto.js';

// ─── Lazy-loaded client ───────────────────────────────────────────────────────

let _client = null;

async function getClient() {
  if (_client) return _client;

  // Dynamic import so the module doesn't crash if the package isn't installed.
  const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');

  let clientOptions = {};

  if (process.env.GOOGLE_TTS_CREDENTIALS_JSON) {
    // Base64-encoded service account JSON
    const json = Buffer.from(
      process.env.GOOGLE_TTS_CREDENTIALS_JSON,
      'base64'
    ).toString('utf-8');
    clientOptions.credentials = JSON.parse(json);
  } else if (process.env.GOOGLE_TTS_KEY_FILE) {
    clientOptions.keyFilename = process.env.GOOGLE_TTS_KEY_FILE;
  }
  // else: falls back to ADC

  const client = new TextToSpeechClient(clientOptions);

  // Resolve credentials up-front. If none are configured (no service-account
  // env vars and no Application Default Credentials), this rejects cleanly and
  // is caught by callers' try/catch. Doing it here — before any gRPC call —
  // avoids the detached "Could not load the default credentials" unhandled
  // rejection that grpc's lazy stub creation otherwise fires, which crashes the
  // whole process (and previously killed the entire voice sync).
  await client.auth.getClient();

  _client = client;
  return _client;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all available voices from Google TTS and return them as normalised VoiceDTOs.
 * @returns {Promise<import('../voice.dto.js').VoiceDTO[]>}
 */
export async function getVoices() {
  const client = await getClient();
  const [response] = await client.listVoices({});
  const voices = response.voices || [];
  return voices.map(fromGoogleVoice);
}

/**
 * Synthesise speech and return an audio Buffer (audio/mpeg via MP3 encoding).
 * @param {string} voiceId  – Google voice name, e.g. "en-IN-Chirp3-HD-Despina"
 * @param {string} text     – Text to synthesise
 * @returns {Promise<Buffer>}
 */
export async function previewVoice(voiceId, text) {
  const client = await getClient();

  // Derive language code from voice name (first two parts, e.g. "en-IN")
  const parts = voiceId.split('-');
  const languageCode = parts.slice(0, 2).join('-'); // "en-IN"

  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: { languageCode, name: voiceId },
    audioConfig: { audioEncoding: 'MP3' },
  });

  return Buffer.from(response.audioContent);
}

/**
 * Lightweight health check – fetches a minimal voice list.
 * @returns {Promise<{ healthy: boolean, error?: string, latencyMs?: number }>}
 */
export async function healthCheck() {
  const start = Date.now();
  try {
    const client = await getClient();
    // Only fetch English voices to minimise data transfer
    await client.listVoices({ languageCode: 'en-US' });
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}
