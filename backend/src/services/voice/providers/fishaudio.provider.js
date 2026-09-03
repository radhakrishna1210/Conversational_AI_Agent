// backend/src/services/voice/providers/fishaudio.provider.js
/**
 * Fish Audio voice provider (TTS + token-streaming TTS).
 *
 * Requires FISH_API_KEY. Fish Audio is a TTS / STT / voice-cloning company —
 * it has NO conversational-agent (speech-to-speech) API, so it plugs into the
 * Voice (TTS) slot of the modular pipeline, not the Conversational Agent slot.
 *
 * Two synthesis paths, mirroring the ElevenLabs provider:
 *   • streamVoice()        HTTP streaming — POST /v1/tts, bytes as they generate.
 *                          Used by the per-segment `split` path in voiceTurnStream.
 *   • FishAudioTtsStream   WebSocket /v1/tts/live — incremental TEXT in, audio
 *                          out, so LLM tokens feed synthesis directly (the
 *                          `ws-overlap` path). MessagePack framed.
 *
 * Voice identity is a persistent `reference_id` (a model `_id` from Fish's
 * library, including instant clones), so nothing is re-uploaded per call.
 *
 * PROTOCOL CAVEAT — verify against a live account before trusting in
 * production (`node --env-file=.env scripts/probe-fish.js`):
 *  - the model-listing endpoint's response shape (its reference page 404s);
 *  - whether the WS `model` header accepts `s2.1-pro` (the docs list only
 *    `s1` / `s2-pro` there, which may be stale) — hence the separate
 *    FISH_TTS_WS_MODEL knob;
 *  - whether emotion tags are honored or SPOKEN ALOUD on s2.x (see
 *    applyEmotionTag — double-gated off by default for exactly this reason).
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { createRequire } from 'module';
import logger from '../../../lib/logger.js';
import { fromFishAudioVoice } from '../voice.dto.js';
import { takeCompleteSentences, cleanForSpeech } from '../sentenceBuffer.js';

const BASE_URL = 'https://api.fish.audio';
const WS_URL = 'wss://api.fish.audio/v1/tts/live';
// Model library lives off the root, NOT under /v1 (per the create-model docs).
const MODEL_URL = `${BASE_URL}/model`;
/** The listing endpoint rejects page_size > 100 outright (422), verified live. */
const PAGE_SIZE = 100;
/** Its result window stops at max_offset=1000, so page 11 comes back empty. */
const MAX_PAGES = 10;

/** HTTP synthesis model. s2.1-pro is Fish's recommended production model. */
function ttsModel() {
  return process.env.FISH_TTS_MODEL || 's2.1-pro';
}

/**
 * WebSocket synthesis model. Deliberately a SEPARATE knob from ttsModel():
 * the WS reference lists only s1/s2-pro, so defaulting it to s2.1-pro could
 * break the handshake on the path whose whole purpose is lower latency. Raise
 * it to s2.1-pro once the probe script confirms the WS endpoint accepts it.
 */
function wsModel() {
  if (process.env.FISH_TTS_WS_MODEL) return process.env.FISH_TTS_WS_MODEL;
  // Mirror a free-tier HTTP model rather than silently falling back to the paid
  // s2-pro default: setting FISH_TTS_MODEL alone would otherwise leave the WS
  // path pointed at an id this key cannot pay for (402 on every turn).
  // canStreamTokens() reads this and disables token streaming for -free ids.
  if (/-free$/.test(ttsModel())) return ttsModel();
  return 's2-pro';
}

export const hasCredentials = () => Boolean(process.env.FISH_API_KEY);

function getApiKey() {
  const key = process.env.FISH_API_KEY;
  if (!key) throw new Error('FISH_API_KEY is not set');
  return key;
}

function authHeaders(model) {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    model,                       // required on every TTS request
    'Content-Type': 'application/json',
  };
}

// ─── Delivery controls ────────────────────────────────────────────────────────

/**
 * Speaking rate → Fish's prosody block.
 *
 * NOTE the caller's `pace` (speakingRate in voiceTurnStream) ALREADY carries the
 * caller-affect nudge and the per-turn jitter, so affect must NOT move speed
 * again here or it is applied twice. Affect touches only the sampling knobs
 * below.
 *
 * Clamped to the API's own 0.5-2.0 rather than something tighter: s2.x reads
 * SLOWER than the other providers at the same nominal rate — measured with
 * ffprobe on 2026-08-19, a 42-word reply runs 140 wpm at speed 1.05 and a
 * 14-word greeting only 94 wpm, against ~150 wpm for natural speech. Capping
 * at 1.25 put the useful range out of reach, so the UI slider appeared dead
 * above that point.
 */
function fishProsody(pace) {
  const speed = Number.isFinite(pace) && pace > 0
    ? Math.min(2.0, Math.max(0.5, pace))
    : 1.0;
  return { speed, volume: Number(process.env.FISH_TTS_VOLUME) || 0 };
}

/**
 * Detected caller affect → sampling parameters. Lower temperature reads as a
 * steadier, more controlled delivery; higher is warmer and more varied. This is
 * the delivery-level control Fish exposes on s2.x (unlike emotion tags, which
 * are an s1 feature).
 */
function fishGenerationParams(affect) {
  if (affect === 'agitated') return { temperature: 0.6, top_p: 0.7 };
  if (affect === 'hesitant' || affect === 'quiet') return { temperature: 0.65, top_p: 0.7 };
  if (affect === 'rushed') return { temperature: 0.7, top_p: 0.7 };
  return { temperature: 0.75, top_p: 0.75 };
}

/**
 * Optionally prefix an s1-style emotion tag.
 *
 * OFF unless BOTH gates pass, and that is deliberate: parenthesised emotion
 * tags are documented for s1 only. Send one to s2.x and the most likely outcome
 * is the model SPEAKING "(calm)" aloud to the caller — an audible regression
 * that no test would catch. Enable only after the probe script confirms
 * behaviour on the model actually in use.
 */
/**
 * Mode A background ambience: an S2 inline tag asking the model to generate
 * the room itself. Only ever applied to the synthesis request — never to the
 * text that is logged, echoed to the model or shown to a person — and only on
 * an S2-family model, which is the family that reads tags as directions
 * rather than words. Measured on this deployment (reports/AMBIENCE_VOICE.md):
 * s2.1-pro-free spoke none of 8 tagged utterances' tags aloud.
 * Exported for the tag-leak regression test.
 */
export function applyAmbienceTag(text, tag) {
  if (!tag || !/^\[[^\]]{2,80}\]$/.test(String(tag))) return text;
  if (!/^s2/.test(ttsModel())) return text;
  return `${tag} ${text}`;
}

function applyEmotionTag(text, affect) {
  if (process.env.FISH_EMOTION_TAGS !== 'true') return text;
  if (!/^s1/.test(ttsModel())) return text;
  const tag = { agitated: 'calm', hesitant: 'gentle', quiet: 'soft', rushed: 'brisk' }[affect];
  return tag ? `(${tag}) ${text}` : text;
}

/**
 * Valid sample rate for the configured container.
 *
 * Fish REJECTS the rate outright (400 "Invalid sample rate N for format X")
 * rather than resampling, and the accepted set differs per format — measured
 * against the live API on 2026-08-18:
 *   mp3   32000 | 44100      (24000 rejected)
 *   opus  48000 only         (24000 and 32000 both rejected)
 * The old hardcoded 24000 therefore 400'd on every fast/streaming request,
 * independently of billing — the 402 masked it until the free tier was enabled.
 */
const fishFormat = (override) => override || process.env.FISH_TTS_FORMAT || 'mp3';

/**
 * Formats Fish returns as decodable-free audio a phone bridge can convert.
 * `pcm` is raw mono s16le at exactly the requested rate — verified against the
 * live API on 2026-08-19, including 8000, which is what a carrier runs at.
 *
 * `wav` is NOT here on purpose even though Fish supports it: the bridge converts
 * chunk by chunk, and only the FIRST chunk of a WAV stream carries the RIFF
 * header. Every later chunk would be parsed as headerless PCM at the wrong
 * assumed rate.
 */
const RAW_PCM_FORMATS = new Set(['pcm']);

/**
 * Rate for raw PCM when the caller names none.
 *
 * 8000 rather than the MP3 default, and this is load-bearing. Raw PCM is only
 * ever asked for by a telephony bridge, and that bridge converts the bytes using
 * the rate from its OWN capability table, not from anything the response says.
 * Answering a rateless PCM request with 32000 therefore does not sound slightly
 * off — the samples are emitted at 8000, so the reply plays four times too slow,
 * two octaves down, and occupies four times its real duration. That last part is
 * what makes it more than a bad noise: the bridge's playout window stays open
 * for the whole inflated span and gates the caller's speech out of STT, so the
 * agent goes deaf as well as unintelligible.
 */
const RAW_PCM_DEFAULT_RATE = 8000;

function fishSampleRate(format, fast, requested) {
  // An explicit rate wins for raw PCM: the phone bridge asks for 8000 because
  // that is the line rate, and resampling it here would be undone downstream.
  if (RAW_PCM_FORMATS.has(format)) return requested || RAW_PCM_DEFAULT_RATE;
  if (format === 'opus') return 48000;          // the only rate opus accepts
  return fast ? 32000 : 44100;                  // mp3/wav: lowest valid, then full
}

/**
 * Shared request body for both HTTP paths.
 * `fast` (live calls) trades fidelity for latency; previews keep full quality.
 */
function ttsBody(voiceId, text, opts = {}) {
  const fast = Boolean(opts.fast);
  // The CALLER's format wins when it asks for one. Ignoring opts.audioFormat is
  // what kept Fish off the phone: the bridge would have received the env default
  // (MP3) and fed those bytes to a PCM converter, which is static on a live call
  // rather than a clean failure.
  const format = fishFormat(opts.audioFormat);
  return {
    text: applyAmbienceTag(applyEmotionTag(text, opts.affect), opts.ambienceTag),
    reference_id: voiceId,
    format,
    mp3_bitrate: fast ? 64 : 128,
    sample_rate: fishSampleRate(format, fast, opts.sampleRate),
    // "balanced" is Fish's low-latency mode (~300ms TTFA per their docs);
    // "normal" is steadier and used for previews where latency is invisible.
    latency: fast ? 'balanced' : 'normal',
    chunk_length: fast ? (Number(process.env.FISH_CHUNK_LENGTH) || 150) : 200,
    prosody: fishProsody(opts.pace),
    ...fishGenerationParams(opts.affect),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Hand-picked voices from the Fish Audio dashboard.
 *
 * Format: "id:Name:lang:gender,id2:..." — only the id is required; the rest
 * override what the API reports (a deliberate label beats Fish's own title).
 * The id is the model's `_id`, i.e. the last path segment of its dashboard URL.
 *
 * When this is set the public score-sorted sweep is SKIPPED: the point of a
 * curated list is those voices, not those voices buried in the library's top
 * 60. Your own models and clones (self=true) are always included on top.
 */
function parsePinnedVoices() {
  return (process.env.FISH_VOICE_IDS || '')
    .split(',')
    .map((entry) => entry.split(':').map((s) => s?.trim()))
    .filter(([id]) => id)
    .map(([_id, title, language, gender]) => ({
      _id,
      title: title || undefined,
      languages: language ? [language] : undefined,
      gender: gender || undefined,
    }));
}

/** Fetch one model by id. Throws on a non-2xx so callers can decide what to do. */
async function fetchModel(id, key) {
  const res = await fetch(`${MODEL_URL}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Resolve one pinned id against the model API so the picker shows Fish's real
 * name, languages and visibility instead of whatever was typed into the env var.
 * Degrades to the typed fields rather than dropping the voice: a hand-picked
 * entry must never vanish from the catalogue because a metadata lookup 404'd.
 */
async function fetchPinnedVoice(stub, key) {
  try {
    const raw = await fetchModel(stub._id, key);
    return {
      ...(raw && typeof raw === 'object' ? raw : {}),
      _id: stub._id,                                   // never trust the echo
      title: stub.title || raw?.title || stub._id,
      languages: stub.languages || raw?.languages,
      gender: stub.gender || raw?.gender,
    };
  } catch (err) {
    logger.warn(
      `Fish Audio pinned voice ${stub._id} lookup failed (${err.message}) — using the FISH_VOICE_IDS fields`,
    );
    return { ...stub, title: stub.title || stub._id, languages: stub.languages || [] };
  }
}

/**
 * Fetch available voice models and return normalised VoiceDTOs.
 *
 * Merges the caller's OWN models (including clones) with a page of the public
 * library — or, when FISH_VOICE_IDS pins a curated set, with exactly those.
 * Response unwrapping is defensive because this endpoint's reference page is
 * not published — see the caveat at the top of this file.
 *
 * @returns {Promise<import('../voice.dto.js').VoiceDTO[]>}
 */
export async function getVoices() {
  const key = getApiKey();
  const limit = Number(process.env.FISH_VOICE_LIMIT) || 200;

  const fetchPage = async (params) => {
    const res = await fetch(`${MODEL_URL}?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Fish Audio listModels failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    // Shape is unconfirmed — accept the plausible envelopes rather than assume.
    const items = data?.items ?? data?.data ?? data?.models ?? (Array.isArray(data) ? data : []);
    return { items, hasMore: data?.has_more ?? items.length >= PAGE_SIZE };
  };

  /**
   * Walk `page_number` until `want` models are collected or the API runs out.
   *
   * Without this the sync only ever saw ONE page: a single page_size=30 request
   * per language, so raising FISH_VOICE_LIMIT past 100 changed nothing and the
   * picker showed a few dozen voices out of a library of ~1000 — which is what
   * "why aren't all my dashboard voices here?" actually was. Verified live
   * 2026-08-19: page_size caps at 100 (422 above it) and the result window caps
   * at max_offset=1000 per query, so 1000 per language is the real ceiling.
   */
  const fetchAll = async (params, want) => {
    const out = [];
    for (let page = 1; out.length < want && page <= MAX_PAGES; page += 1) {
      const size = Math.min(PAGE_SIZE, want - out.length);
      // eslint-disable-next-line no-await-in-loop -- page N+1 needs page N's has_more
      const { items, hasMore } = await fetchPage(`${params}&page_size=${size}&page_number=${page}`);
      out.push(...items);
      if (!hasMore || !items.length) break;
    }
    return out;
  };

  // Pull a page PER LANGUAGE this deployment actually serves, not just the
  // globally top-scored voices. Sorting by score alone returned Spanish, Arabic
  // and English only — zero Hindi — which is useless for a Hindi agent. The
  // `language` filter does work (its `total` is just inexact).
  const languages = (process.env.FISH_VOICE_LANGUAGES || 'en,hi')
    .split(',').map((l) => l.trim()).filter(Boolean);
  const perLang = Math.max(10, Math.round(limit / Math.max(1, languages.length)));

  // Pinned voices go in FIRST so the dedupe below keeps their metadata when the
  // same model also comes back from a listing page.
  const pinned = parsePinnedVoices();
  const items = pinned.length
    ? await Promise.all(pinned.map((stub) => fetchPinnedVoice(stub, key)))
    : [];

  const requests = [
    fetchAll('self=true', PAGE_SIZE * MAX_PAGES),                 // own + clones
    // A curated FISH_VOICE_IDS replaces the public sweep (see parsePinnedVoices).
    ...(pinned.length ? [] : languages.map((l) => fetchAll(
      `visibility=public&sort_by=score&language=${encodeURIComponent(l)}`, perLang,
    ))),
  ];
  const settled = await Promise.allSettled(requests);
  for (const r of settled) if (r.status === 'fulfilled') items.push(...r.value);
  if (settled.every((r) => r.status === 'rejected')) {
    // Pinned ids are also the escape hatch for a listing shape we guessed wrong,
    // so only surface the real error when there is nothing at all to show.
    if (!items.length) throw settled[0].reason;
    logger.warn(
      `Fish Audio model listing failed (${settled[0].reason?.message}) — serving pinned FISH_VOICE_IDS only`,
    );
  }

  const seen = new Set();
  const dtos = [];
  for (const raw of items) {
    const id = raw?._id || raw?.id;
    if (!id || seen.has(id)) continue;   // skip malformed rows and duplicates
    seen.add(id);
    // Pass the deployment's languages so a MULTILINGUAL voice is filed under one
    // the picker actually filters by (see fromFishAudioVoice).
    dtos.push(fromFishAudioVoice(raw, { preferLanguages: languages }));
  }
  return dtos;
}

/**
 * Search Fish's public library BY NAME, live.
 *
 * The sync can only ever hold a slice of the library: Fish caps a listing query
 * at 1000 results, and pre-syncing thousands of voices to make one findable is
 * the wrong trade. Searching by title hits the same endpoint with `title=` and
 * returns matches regardless of score rank, so a voice picked off the dashboard
 * is reachable without a sync at all.
 *
 * Results are NOT persisted — see importVoice() for that.
 *
 * @param {string} query
 * @param {{ limit?: number, languages?: string[] }} [opts]
 * @returns {Promise<import('../voice.dto.js').VoiceDTO[]>}
 */
export async function searchVoices(query, opts = {}) {
  const key = getApiKey();
  const q = String(query || '').trim();
  if (!q) return [];
  const limit = Math.min(PAGE_SIZE, Math.max(1, opts.limit || 30));
  const preferLanguages = opts.languages
    ?? (process.env.FISH_VOICE_LANGUAGES || 'en,hi').split(',').map((l) => l.trim()).filter(Boolean);

  const params = new URLSearchParams({
    title: q,
    page_size: String(limit),
    page_number: '1',
  });
  const res = await fetch(`${MODEL_URL}?${params}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fish Audio search failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const items = data?.items ?? data?.data ?? (Array.isArray(data) ? data : []);

  const seen = new Set();
  const dtos = [];
  for (const raw of items) {
    const id = raw?._id || raw?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    dtos.push(fromFishAudioVoice(raw, { preferLanguages }));
  }
  return dtos;
}

/**
 * Resolve ONE library voice by its Fish model id, for importing a search hit.
 * @param {string} providerVoiceId
 * @returns {Promise<import('../voice.dto.js').VoiceDTO|null>}
 */
export async function getVoiceById(providerVoiceId) {
  const key = getApiKey();
  try {
    const raw = await fetchModel(providerVoiceId, key);
    if (!raw?._id && !raw?.id) return null;
    const preferLanguages = (process.env.FISH_VOICE_LANGUAGES || 'en,hi')
      .split(',').map((l) => l.trim()).filter(Boolean);
    return fromFishAudioVoice(raw, { preferLanguages });
  } catch (err) {
    logger.warn(`Fish Audio model ${providerVoiceId} lookup failed (${err.message})`);
    return null;
  }
}

/**
 * Synthesise speech and return a complete audio Buffer (previews).
 * @param {string} voiceId – Fish model _id, used as reference_id
 * @param {string} text
 * @param {{ fast?: boolean, pace?: number, affect?: string|null }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function previewVoice(voiceId, text, opts = {}) {
  const res = await fetch(`${BASE_URL}/v1/tts`, {
    method: 'POST',
    headers: authHeaders(ttsModel()),
    body: JSON.stringify(ttsBody(voiceId, text, opts)),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fish Audio TTS failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Start Fish Audio's HTTP streaming synthesis: resolves once headers arrive and
 * yields audio as it is generated, so the first bytes reach the caller before
 * the clip is finished. Same contract as elevenLabsProvider.streamVoice, so
 * voice.service.js can wrap it with Readable.fromWeb() identically.
 * @returns {Promise<{ body: ReadableStream, contentType: string }>}
 */
export async function streamVoice(voiceId, text, opts = {}) {
  const res = await fetch(`${BASE_URL}/v1/tts`, {
    method: 'POST',
    headers: authHeaders(ttsModel()),
    body: JSON.stringify(ttsBody(voiceId, text, { ...opts, fast: opts.fast !== false })),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok || !res.body) {
    const body = await res.text();
    throw new Error(`Fish Audio streaming TTS failed (${res.status}): ${body.slice(0, 300)}`);
  }
  // Label the stream by what we ASKED for. Fish answers a raw-PCM request with
  // application/octet-stream, and a bridge that trusts the header would treat
  // 8kHz PCM as MP3.
  const asked = fishFormat(opts.audioFormat);
  const contentType = RAW_PCM_FORMATS.has(asked)
    ? 'audio/l16'
    : (res.headers.get('content-type') || 'audio/mpeg');
  return { body: res.body, contentType };
}

// ─── Token streaming (WebSocket) ──────────────────────────────────────────────

// MessagePack is needed ONLY for the WebSocket path; the HTTP paths above use
// JSON. Probe for it without importing so a deploy that lacks the dependency
// degrades to HTTP streaming instead of crashing the provider module.
const require_ = createRequire(import.meta.url);
let _msgpackResolvable = null;
function msgpackAvailable() {
  if (_msgpackResolvable === null) {
    try { require_.resolve('@msgpack/msgpack'); _msgpackResolvable = true; }
    catch { _msgpackResolvable = false; }
  }
  return _msgpackResolvable;
}

let _msgpackModule = null;
const loadMsgpack = async () => {
  if (!_msgpackModule) _msgpackModule = await import('@msgpack/msgpack');
  return _msgpackModule;
};

/**
 * Can this provider stream LLM tokens straight into synthesis right now?
 *
 * The free tier is HTTP-only: /v1/tts/live accepts the handshake with a
 * `-free` model and then never emits an audio frame — it hangs until the
 * timeout instead of returning 402 like the paid ids do (measured 2026-08-18).
 * Silence with no error is worse than a hard failure, so gate the WS path off
 * entirely and let the runtime fall back to the HTTP `split` path, which the
 * free tier does serve.
 */
export function canStreamTokens() {
  return hasCredentials() && msgpackAvailable() && !/-free$/.test(wsModel());
}

/**
 * Why token streaming is unavailable, phrased for the person choosing a voice
 * in the agent editor — or null when it IS available.
 *
 * The free-tier case is the one worth stating plainly: it is the reason the
 * socket path silently never ran on this deployment, and no log said so. The
 * message names the two env values that fix it, because the person reading it
 * in the UI cannot see .env and the person who can does not see this screen.
 *
 * @returns {string|null}
 */
export function streamingBlockReason() {
  if (!hasCredentials()) {
    return 'No Fish Audio API key is configured on this platform, so this voice cannot stream.';
  }
  if (!msgpackAvailable()) {
    return 'Fish Audio streaming needs the @msgpack/msgpack package, which is not installed on this server.';
  }
  if (/-free$/.test(wsModel())) {
    return `Fish Audio's free-tier model (${wsModel()}) accepts the streaming connection but never returns audio, `
      + 'so streaming is disabled for it. Set FISH_TTS_WS_MODEL to a paid model (for example s2-pro), '
      + 'or pick a voice from a provider whose streaming tier is enabled.';
  }
  return null;
}

/**
 * Fish Audio WebSocket TTS ("/v1/tts/live") — the true low-latency path. Text is
 * pushed in incrementally as the LLM generates it and audio comes back as one
 * continuous stream, so the agent starts speaking on the first sentence while
 * the reply is still being written.
 *
 * Interface is deliberately IDENTICAL to ElevenLabsTtsStream (connect / pushText
 * / end / close, events 'audio' | 'done' | 'error') so ttsStreamFactory.js can
 * swap them without the runtime knowing which provider is active.
 *
 * Protocol: MessagePack frames. Client sends { event:'start', request:{...} },
 * then { event:'text', text } per chunk, optional { event:'flush' }, finally
 * { event:'stop' }. Server replies with { event:'audio', audio:<bytes> } frames
 * and a terminal { event:'finish', reason }.
 */
export class FishAudioTtsStream extends EventEmitter {
  constructor(voiceId, opts = {}) {
    super();
    this.voiceId = voiceId;
    this.modelId = opts.modelId || wsModel();
    // Same contract as the HTTP path: the caller's format wins. Without this the
    // WS path always sent the env default, so enabling token streaming would put
    // MP3 on a bridge expecting PCM.
    this.audioFormat = opts.audioFormat || null;
    this.sampleRate = opts.sampleRate || null;
    this.pace = opts.pace;
    this.affect = opts.affect ?? null;
    this.ws = null;
    this._open = false;
    this._pending = [];       // text queued before the socket is ready
    this._endRequested = false;
    this._done = false;
    this._buf = '';           // LLM tokens buffered until a sentence boundary
    this._encode = null;
    this._decode = null;
  }

  connect() {
    const key = getApiKey();
    if (!msgpackAvailable()) throw new Error('@msgpack/msgpack is not installed — Fish Audio WS TTS unavailable');

    // Load the codec, then open the socket. Text pushed in the meantime waits in
    // _pending, which is the same mechanism used for pre-open text anyway.
    loadMsgpack().then(({ encode, decode }) => {
      this._encode = encode;
      this._decode = decode;
      this._openSocket(key);
    }).catch((err) => {
      this.emit('error', new Error(`Fish Audio WS TTS: msgpack load failed: ${err.message}`));
      this._finish();
    });
  }

  _openSocket(key) {
    if (this._done) return;
    // Auth + model go in the HANDSHAKE HEADERS here (ElevenLabs used a query
    // string); `ws` supports per-connection headers.
    this.ws = new WebSocket(WS_URL, {
      headers: { Authorization: `Bearer ${key}`, model: this.modelId },
    });

    this.ws.on('unexpected-response', (_req, res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        logger.warn(
          `Fish Audio WS TTS handshake rejected (${res.statusCode}, model=${this.modelId}): ${body.slice(0, 300)}`,
        );
      });
    });

    this.ws.on('open', () => {
      this._raw({
        event: 'start',
        request: {
          text: '',                       // text arrives via 'text' events
          reference_id: this.voiceId,
          format: fishFormat(this.audioFormat),
          mp3_bitrate: 64,
          sample_rate: fishSampleRate(fishFormat(this.audioFormat), true, this.sampleRate),
          latency: 'balanced',
          chunk_length: Number(process.env.FISH_CHUNK_LENGTH) || 150,
          prosody: fishProsody(this.pace),
          ...fishGenerationParams(this.affect),
        },
      });
      this._open = true;
      for (const t of this._pending) this._raw({ event: 'text', text: t });
      this._pending = [];
      if (this._endRequested) this._raw({ event: 'stop' });
    });

    this.ws.on('message', (raw) => {
      let msg;
      try { msg = this._decode(raw); } catch { return; } // ignore undecodable frames
      if (msg?.event === 'audio' && msg.audio) {
        this.emit('audio', Buffer.from(msg.audio));
      } else if (msg?.event === 'finish') {
        if (msg.reason === 'error') {
          this.emit('error', new Error(`Fish Audio WS TTS finished with error: ${msg.message || 'no detail'}`));
        }
        this._finish();
      }
      // 'log' and any unknown events are ignored by design.
    });

    this.ws.on('error', (err) => { this.emit('error', err); this._finish(); });
    this.ws.on('close', () => this._finish());
  }

  _raw(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this._encode) {
      this.ws.send(this._encode(obj));
    }
  }

  /**
   * Queue reply text as the LLM produces it. Buffered to sentence boundaries —
   * see ../sentenceBuffer.js for why never mid-word.
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
    const t = `${clean} `;
    if (this._open) {
      this._raw({ event: 'text', text: t });
      // Flush asks Fish to synthesize what it holds instead of waiting for more
      // text — the main latency lever on this path. Togglable because it may
      // cost prosody continuity across the seam between sentences.
      if (process.env.FISH_WS_FLUSH !== 'false') this._raw({ event: 'flush' });
    } else {
      this._pending.push(t);
    }
  }

  /** Signal end-of-text; 'done' fires once Fish returns the tail. */
  end() {
    if (!this._endRequested) {
      const rest = this._buf;
      this._buf = '';
      if (rest) this._sendText(rest);   // speak the unterminated tail too
    }
    this._endRequested = true;
    if (this._open) this._raw({ event: 'stop' });
  }

  _finish() {
    if (this._done) return;
    this._done = true;
    this.emit('done');
    try { this.ws?.close(); } catch { /* already closed */ }
  }

  close() { this._finish(); }
}

/**
 * Lightweight health check — lists a single model (cheap, proves the key works).
 * @returns {Promise<{ healthy: boolean, error?: string, latencyMs?: number }>}
 */
export async function healthCheck() {
  const start = Date.now();
  try {
    if (!process.env.FISH_API_KEY) {
      return { healthy: false, error: 'FISH_API_KEY not configured' };
    }
    const res = await fetch(`${MODEL_URL}?page_size=1`, {
      headers: { Authorization: `Bearer ${getApiKey()}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { healthy: true, latencyMs: Date.now() - start };
    // 401/403 is a real credential failure. Anything else means the key was
    // accepted well enough to be judged — don't report the provider down
    // because a listing route moved (same tolerance as the Sarvam check).
    if (res.status === 401 || res.status === 403) {
      const body = await res.text();
      return { healthy: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}
