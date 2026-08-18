// backend/src/services/voice/providers/sarvam.provider.js
/**
 * Sarvam AI voice provider.
 *
 * Requires SARVAM_API_KEY environment variable.
 * Uses the Sarvam REST API.
 */

import { fromSarvamVoice } from '../voice.dto.js';
import logger from '../../../lib/logger.js';

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

// ─── Speaker roster ───────────────────────────────────────────────────────────

export const hasCredentials = () => Boolean(process.env.SARVAM_API_KEY);

/**
 * Curated metadata for the speakers we have actually listened to. Everything
 * else in the roster is exposed with what we can honestly say about it and
 * nothing more — a guessed gender is worse than a blank one, since the picker's
 * gender filter would then hide voices under a label nobody verified.
 */
const KNOWN_SPEAKERS = {
  shubh:  { gender: 'male',   language_code: 'hi-IN', style: 'conversational', tone: 'friendly' },
  ritu:   { gender: 'female', language_code: 'hi-IN', style: 'conversational', tone: 'warm' },
  aditya: { gender: 'male',   language_code: 'en-IN', style: 'conversational', tone: 'clear' },
  simran: { gender: 'female', language_code: 'en-IN', style: 'conversational', tone: 'clear' },
  anand:  { gender: 'male',   language_code: 'hi-IN', style: 'news', tone: 'authoritative' },
  roopa:  { gender: 'female', language_code: 'hi-IN', style: 'news', tone: 'authoritative' },
  priya:  { gender: 'female', language_code: 'bn-IN', style: 'conversational', tone: 'friendly' },
};

/**
 * TTS model. Was hardcoded in three places; discovery has to ask about the SAME
 * model the synthesis calls use, or it reports speakers that 400 on every call.
 */
const ttsModel = () => process.env.SARVAM_TTS_MODEL || 'bulbul:v3';

/**
 * bulbul:v3's compatible speakers as of the last live probe (2026-08-19). Only a
 * fallback for when discovery fails — Sarvam adds speakers, and a stale constant
 * is exactly how the picker ended up offering 7 of the 38 that existed.
 */
const FALLBACK_SPEAKERS = [
  'aditya', 'ritu', 'ashutosh', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran',
  'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit', 'roopa',
  'kabir', 'aayan', 'shubh', 'advait', 'anand', 'tanya', 'tarun', 'sunny', 'mani', 'gokul',
  'vijay', 'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali',
];

/**
 * Speakers Sarvam recognises but which belong to an OLDER bulbul generation.
 * Probing with one of these is what makes the API name the current model's
 * roster; they are not offered as voices themselves unless discovery says so.
 */
const LEGACY_PROBE_SPEAKERS = ['anushka', 'abhilash', 'hitesh'];

/**
 * Every Sarvam speaker can speak every supported language — the language comes
 * from `target_language_code` at synthesis time, not from the speaker. The Voice
 * row still has to carry ONE code (voice.service.js reads metadata.language_code
 * when it synthesises), so this is the code an uncurated speaker gets. Set it to
 * your deployment's primary language.
 */
const defaultLanguage = () => process.env.SARVAM_DEFAULT_LANGUAGE || 'en-IN';

// Discovery costs 2 requests, so it is cached — but NOT for the life of the
// process: Sarvam adds speakers, and a server that has been up for a week would
// otherwise never see them. An hour keeps the picker responsive and current.
const ROSTER_TTL_MS = 60 * 60 * 1000;
let rosterCache = null;
let rosterCachedAt = 0;

/** Drop the cached roster (tests, and anything that wants a forced re-probe). */
export function resetSpeakerCache() {
  rosterCache = null;
  rosterCachedAt = 0;
}

/**
 * Ask Sarvam which speakers exist.
 *
 * Sarvam publishes no list-speakers endpoint, but it validates the `speaker`
 * field against the live roster and names every valid option in the 400 body —
 * so a deliberately invalid speaker IS the listing call. It synthesises nothing
 * and costs nothing. Falls back to FALLBACK_SPEAKERS if the message ever stops
 * carrying the list, which keeps the picker populated either way.
 *
 * @returns {Promise<string[]>}
 */
export async function discoverSpeakers() {
  if (rosterCache && Date.now() - rosterCachedAt < ROSTER_TTL_MS) return rosterCache;
  const model = ttsModel();

  const probe = async (speaker) => {
    const res = await fetch(`${BASE_URL}/text-to-speech`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ text: '.', target_language_code: 'en-IN', speaker, model }),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok, body: res.ok ? '' : await res.text() };
  };

  // \S+ for the model id, NOT [^:]+ — the id contains a colon ("bulbul:v3"), so
  // a colon-excluding class stops halfway and the match fails.
  const parseList = (body) => {
    const m = /Available speakers(?: for \S+)? are:\s*([^"}]+)/i.exec(body);
    if (!m) return null;
    const names = m[1].split(',').map((n) => n.trim().replace(/[.\s]+$/, '')).filter(Boolean);
    return names.length ? names : null;
  };

  let recognized = null;   // every speaker the endpoint knows, across all models
  let compatible = null;   // the ones THIS model will accept

  try {
    // An unknown name is rejected with the union list.
    const { ok, body } = await probe('__roster_probe__');
    if (!ok) recognized = parseList(body);

    // A speaker from an older generation is rejected with the current model's
    // own list: "...not compatible with model X. Available speakers for X are:".
    for (const candidate of LEGACY_PROBE_SPEAKERS) {
      if (compatible) break;
      // eslint-disable-next-line no-await-in-loop -- stop at the first rejection
      const res = await probe(candidate);
      if (res.ok || !res.body.includes(model)) continue;   // accepted here, or a different error
      compatible = parseList(res.body);
    }
  } catch (err) {
    logger.warn(`Sarvam speaker discovery probe failed (${err.message})`);
  }

  // INTERSECT the two, because neither list alone is safe to offer:
  //  • the union includes speakers this model rejects (bulbul:v3 refuses anushka);
  //  • the per-model list advertises names synthesis then refuses — measured
  //    2026-08-19, "niharika" is in v3's compatible list and comes back
  //    "not recognized" on an actual call.
  // A voice in the picker that 400s on every call is worse than one missing.
  let roster = recognized && compatible
    ? compatible.filter((n) => recognized.includes(n))
    : (compatible ?? recognized);

  if (!roster?.length) {
    logger.warn(`Sarvam speaker discovery yielded nothing for ${model} — using the last known roster`);
    roster = FALLBACK_SPEAKERS;
  }
  rosterCache = roster;
  rosterCachedAt = Date.now();
  return roster;
}

/** Build the DTO for one speaker name, curated metadata first. */
function speakerToDto(name) {
  const known = KNOWN_SPEAKERS[name];
  return fromSarvamVoice({
    name,
    gender: known?.gender,
    language_code: known?.language_code || defaultLanguage(),
    style: known?.style || 'conversational',
    tone: known?.tone,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Every speaker Sarvam currently offers.
 *
 * This used to be a hardcoded 7. The live roster is 44 (probed 2026-08-19), so
 * the picker was hiding 37 usable voices — including every speaker Sarvam has
 * added since that list was written.
 *
 * @returns {Promise<import('../voice.dto.js').VoiceDTO[]>}
 */
export async function getVoices() {
  const roster = await discoverSpeakers();
  return roster.map(speakerToDto);
}

/**
 * Search the roster by name. Sarvam has no library endpoint to query — the
 * roster IS the catalogue — so this filters what discovery returns, which keeps
 * the picker's library search behaving the same across providers.
 *
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<import('../voice.dto.js').VoiceDTO[]>}
 */
export async function searchVoices(query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const roster = await discoverSpeakers();
  return roster
    .filter((name) => name.toLowerCase().includes(q))
    .slice(0, Math.max(1, opts.limit || 30))
    .map(speakerToDto);
}

/**
 * Resolve one speaker by name, for importing a search hit.
 * @param {string} providerVoiceId – the speaker name
 * @returns {Promise<import('../voice.dto.js').VoiceDTO|null>}
 */
export async function getVoiceById(providerVoiceId) {
  const name = String(providerVoiceId || '').trim();
  if (!name) return null;
  const roster = await discoverSpeakers();
  // Case-insensitive lookup, but the roster's own spelling is what gets stored:
  // the speaker field is matched exactly at synthesis time.
  const match = roster.find((n) => n.toLowerCase() === name.toLowerCase());
  return match ? speakerToDto(match) : null;
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
      model: ttsModel(),
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
 * Codecs Sarvam's stream endpoint accepts. `mulaw` is the one that matters:
 * it is raw 8kHz G.711 with no container header, which is exactly what a
 * carrier media stream carries — so a Sarvam voice reaches the phone with no
 * transcoding at all, the same passthrough ElevenLabs gets.
 *
 * This is why `sarvam` is registered in TELEPHONY_TTS. Without it, every
 * Sarvam-voiced agent was refused by the phone bridge ("cannot emit a
 * telephony audio format") — which, for a product whose Indian-language voices
 * all come from Sarvam, meant those agents could not take calls at all.
 */
const TELEPHONY_CODECS = new Set(['mulaw', 'alaw']);

/**
 * Start Sarvam's binary HTTP audio stream. Unlike the JSON REST endpoint,
 * this resolves as soon as response headers arrive and lets callers forward
 * audio chunks without buffering the complete utterance.
 *
 * @param {{ pace?: number, audioFormat?: 'mp3'|'mulaw'|'alaw'|'linear16' }} [opts]
 */
export async function streamVoice(voiceId, text, languageCode = 'en-IN', opts = {}) {
  const codec = opts.audioFormat || 'mp3';
  const telephony = TELEPHONY_CODECS.has(codec);

  const res = await fetch(`${BASE_URL}/text-to-speech/stream`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      text,
      target_language_code: languageCode,
      speaker: voiceId,
      pace: opts.pace ?? 1.05,
      // 22050 elsewhere: at 8000 the same speaker sounds like a different
      // (telephone-quality) voice, so the welcome and the streamed replies
      // audibly mismatched mid-call. On a phone line that argument inverts —
      // the line IS 8kHz, and G.711 is only defined at 8kHz.
      speech_sample_rate: telephony ? 8000 : 22050,
      enable_preprocessing: false,
      model: ttsModel(),
      temperature: 0.6,
      output_audio_codec: codec,
      // Meaningless for G.711, which is a fixed 64kbit/s, and Sarvam rejects
      // parameters that do not apply.
      ...(codec === 'mp3' ? { output_audio_bitrate: '64k' } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok || !res.body) {
    const body = await res.text();
    throw new Error(`Sarvam streaming TTS failed (${res.status}): ${body.slice(0, 300)}`);
  }

  return {
    body: res.body,
    contentType: res.headers.get('content-type') || (telephony ? 'audio/mulaw' : 'audio/mpeg'),
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
