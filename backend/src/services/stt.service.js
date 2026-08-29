/**
 * Batch speech-to-text for the agent web-call pipeline.
 *
 * This is the FALLBACK path. A live call is transcribed by the streaming
 * recogniser as the caller speaks; this runs only when that produced nothing —
 * because the socket was still connecting, died mid-call, or is not configured.
 * By the time it runs, the caller has already stopped talking, so every
 * millisecond here is dead air.
 *
 * TWO BUGS THIS FILE HAD, BOTH OF WHICH SURFACED AS ONE CONFUSING MESSAGE
 * ("All STT providers failed: sarvam: … | elevenlabs: …" on an agent whose
 * transcription was set to Deepgram):
 *
 *  1. THE AGENT'S CHOSEN PROVIDER WAS SILENTLY IGNORED. The chain was a
 *     hardcoded [Sarvam, ElevenLabs], sorted by a preference string that was
 *     matched literally. The editor stores `deepgram_stream`, which equals
 *     neither, so the sort was a no-op and Sarvam always went first — a
 *     provider the operator had not selected and might not have credentials
 *     for. Deepgram has a perfectly good pre-recorded endpoint and simply was
 *     not wired to it.
 *  2. THE LANGUAGE WAS PASSED THROUGH RAW. The editor stores display names, so
 *     Sarvam was asked for `language_code: "Hindi"` and answered 400 with the
 *     list of codes it actually takes. That meant this fallback had never once
 *     worked for an agent with a specific language — only for "Multi", where
 *     the field was omitted and the failure stayed invisible.
 */

import logger from '../lib/logger.js';
import { toDeepgramLanguage, toSarvamLanguage } from './stt/sttLanguage.js';

/**
 * Per-request ceiling.
 *
 * It was 4.5s, on the reasoning that this is dead air on a live call. True, but
 * it optimised the wrong thing: when this path times out the turn produces NO
 * transcript, so the caller has to say the whole thing again — a full extra
 * turn, several seconds, plus the impression that the agent is deaf. Waiting
 * another second or two is strictly cheaper than that.
 *
 * Measured against this deployment (2026-08-29), same silent clip twice:
 * 4526ms on a cold connection and 3091ms on a warm one. A 4.5s ceiling
 * therefore lost roughly half of all COLD fallbacks — which is most of them,
 * since this path runs precisely when nothing else has warmed the socket.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.STT_BATCH_TIMEOUT_MS) || 8_000;

/**
 * Normalize whatever the agent has stored into a provider key this file knows.
 *
 * The editor's values come from the platform catalogue and are neither
 * lowercase nor stable in shape (`deepgram_stream`, `Sarvam`, `Standard
 * Providers`). Matching them literally is what made the preference a no-op, so
 * match on the provider NAME inside the value instead.
 *
 * Returns null for a provider with no batch implementation here (Azure,
 * Soniox) — the caller reports that rather than pretending a choice was
 * honoured.
 */
export function normalizeSttPreference(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('deepgram')) return 'deepgram';
  if (raw.includes('sarvam')) return 'sarvam';
  if (raw.includes('eleven')) return 'elevenlabs';
  return null;
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {{ preferredProvider?: string, languageCode?: string } | string} [options]
 * @returns {Promise<{ text: string, provider: string }>}
 */
export async function transcribeAudio(buffer, mimeType = 'audio/webm', options = {}) {
  if (typeof options === 'string') options = { languageCode: options };
  const requested = options.preferredProvider;
  const preferred = normalizeSttPreference(requested);
  const languageCode = options.languageCode;
  const errors = [];

  const transcribeDeepgram = async () => {
    const params = new URLSearchParams({
      model: process.env.DEEPGRAM_BATCH_MODEL || 'nova-2',
      punctuate: 'true',
      smart_format: 'true',
    });
    // 'multi' is a streaming-only value; on the pre-recorded endpoint the way to
    // ask for code-switching is to send no language at all and let it detect.
    const lang = toDeepgramLanguage(languageCode);
    if (lang && lang !== 'multi') params.set('language', lang);
    else params.set('detect_language', 'true');

    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': mimeType,
      },
      body: buffer,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Deepgram STT HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    return { text: text.trim(), provider: 'deepgram' };
  };

  const transcribeElevenLabs = async () => {
    const fd = new FormData();
    fd.append('file', new Blob([buffer], { type: mimeType }), 'audio.webm');
    fd.append('model_id', 'scribe_v1');
    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: fd,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    // ALWAYS a code Sarvam accepts — never the agent's display name, and never
    // omitted. toSarvamLanguage falls back to Sarvam's own auto-detect for a
    // language it does not serve, because a slightly worse transcript beats the
    // hard 400 that used to fail the whole turn.
    fd.append('language_code', toSarvamLanguage(languageCode));
    const res = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: { 'api-subscription-key': process.env.SARVAM_API_KEY },
      body: fd,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Sarvam STT HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    return { text: (data.transcript || '').trim(), provider: 'sarvam' };
  };

  const providers = [
    process.env.DEEPGRAM_API_KEY && { name: 'deepgram', run: transcribeDeepgram },
    process.env.SARVAM_API_KEY && { name: 'sarvam', run: transcribeSarvam },
    process.env.ELEVENLABS_API_KEY && { name: 'elevenlabs', run: transcribeElevenLabs },
  ].filter(Boolean);
  providers.sort((a, b) => Number(b.name === preferred) - Number(a.name === preferred));

  // Say so when the agent asked for something this path cannot do. Silence here
  // is what let an agent sit on "Deepgram" while every fallback went to Sarvam.
  if (requested && !preferred) {
    logger.warn(
      `Batch STT has no implementation for the agent's provider "${requested}" — `
      + `falling back to ${providers.map((p) => p.name).join(' → ') || 'nothing'}`,
    );
  } else if (preferred && !providers.some((p) => p.name === preferred)) {
    logger.warn(
      `Batch STT cannot use "${requested}": no credentials configured for it — `
      + `falling back to ${providers.map((p) => p.name).join(' → ') || 'nothing'}`,
    );
  }

  for (const provider of providers) {
    try {
      return await provider.run();
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
      logger.warn(`${provider.name} STT failed, trying fallback: ${err.message}`);
    }
  }

  if (!errors.length) {
    throw new Error('No STT provider configured (set DEEPGRAM_API_KEY, SARVAM_API_KEY or ELEVENLABS_API_KEY)');
  }
  // Name the provider the operator actually chose. The old message listed only
  // whoever happened to run, which read as "your configuration was used and
  // failed" when in fact the configured provider was never tried.
  const chosen = preferred && providers.some((p) => p.name === preferred)
    ? `(agent's provider: ${preferred})`
    : requested
      ? `(agent asked for "${requested}", which this fallback cannot use)`
      : '';
  throw new Error(`All STT providers failed ${chosen}: ${errors.join(' | ')}`.replace('  ', ' '));
}
