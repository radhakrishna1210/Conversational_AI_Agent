/**
 * Speech-to-text service for the agent web-call pipeline.
 *
 * The agent's configured provider is attempted first. Both supported REST
 * APIs accept webm/opus directly, so no transcoding is needed.
 */

import logger from '../lib/logger.js';

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {{ preferredProvider?: string, languageCode?: string } | string} [options]
 * @returns {Promise<{ text: string, provider: string }>}
 */
export async function transcribeAudio(buffer, mimeType = 'audio/webm', options = {}) {
  if (typeof options === 'string') options = { languageCode: options };
  const preferred = String(options.preferredProvider || '').trim().toLowerCase();
  const languageCode = options.languageCode;
  const errors = [];

  const transcribeElevenLabs = async () => {
    const fd = new FormData();
    fd.append('file', new Blob([buffer], { type: mimeType }), 'audio.webm');
    fd.append('model_id', 'scribe_v1');
    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: fd,
      signal: AbortSignal.timeout(4_500),
    });
    if (!res.ok) {
      throw new Error(`ElevenLabs STT HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    return { text: (data.text || '').trim(), provider: 'elevenlabs' };
  };

  const transcribeSarvam = async () => {
    const fd = new FormData();
    fd.append('file', new Blob([buffer], { type: mimeType }), 'audio.webm');
    fd.append('model', 'saaras:v3');
    fd.append('mode', 'transcribe');
    if (languageCode) fd.append('language_code', languageCode);
    const res = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: { 'api-subscription-key': process.env.SARVAM_API_KEY },
      body: fd,
      signal: AbortSignal.timeout(4_500),
    });
    if (!res.ok) {
      throw new Error(`Sarvam STT HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    return { text: (data.transcript || '').trim(), provider: 'sarvam' };
  };

  const providers = [
    process.env.SARVAM_API_KEY && { name: 'sarvam', run: transcribeSarvam },
    process.env.ELEVENLABS_API_KEY && { name: 'elevenlabs', run: transcribeElevenLabs },
  ].filter(Boolean);
  providers.sort((a, b) => Number(b.name === preferred) - Number(a.name === preferred));

  for (const provider of providers) {
    try {
      return await provider.run();
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
      logger.warn(`${provider.name} STT failed, trying fallback: ${err.message}`);
    }
  }

  throw new Error(
    errors.length
      ? `All STT providers failed: ${errors.join(' | ')}`
      : 'No STT provider configured (set ELEVENLABS_API_KEY or SARVAM_API_KEY)'
  );
}
