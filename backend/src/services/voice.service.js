// backend/src/services/voice.service.js
/**
 * Top-level voice service.
 * Delegates to sub-modules for sync, provider health, and audio preview.
 */

import prisma from '../config/prisma.js';
import { Readable } from 'stream';
import * as googleProvider from './voice/providers/google.provider.js';
import * as elevenLabsProvider from './voice/providers/elevenlabs.provider.js';
import * as sarvamProvider from './voice/providers/sarvam.provider.js';
import * as cartesiaProvider from './voice/providers/cartesia.provider.js';
import * as fishAudioProvider from './voice/providers/fishaudio.provider.js';
export { syncVoices } from './voice/voice.sync.service.js';

const DEFAULT_PREVIEW_TEXT =
  'Hello, thank you for calling. How can I assist you today?';

// ─── Voice queries ─────────────────────────────────────────────────────────────

/**
 * List voices with optional provider name filter and pagination.
 * @param {{ page?: number, limit?: number, provider?: string }} opts
 */
export const listVoices = async ({ page = 1, limit = 20, provider, gender, language, allowedProviders } = {}) => {
  const skip = (page - 1) * limit;
  const where = {
    // Hide un-cloned samples from the agent voice picker: a sample_only voice
    // cannot synthesize speech, so selecting it would break calls (#9 L5).
    NOT: { AND: [{ category: 'cloned' }, { metadata: { contains: '"status":"sample_only"' } }] },
  };
  if (provider) where.provider = { name: { equals: provider } };
  // Providers Super Admin has switched off must not appear in the picker. This
  // is applied on top of any explicit ?provider= filter, so asking for a
  // disabled provider by name returns nothing rather than bypassing the gate.
  if (Array.isArray(allowedProviders)) {
    where.AND = [...(where.AND ?? []), { provider: { name: { in: allowedProviders } } }];
  }
  // Case-insensitive: provider labels are normalised on sync (voice.dto.js), but
  // rows written by earlier syncs keep their original casing ("FEMALE"/"Female"),
  // and an exact match would silently drop them from the picker.
  if (gender) where.gender = { equals: gender, mode: 'insensitive' };
  if (language) where.language = { equals: language, mode: 'insensitive' };


  const [total, voices] = await Promise.all([
    prisma.voice.count({ where }),
    prisma.voice.findMany({
      skip,
      take: limit,
      where,
      include: { provider: { select: { name: true } } },
      orderBy: [{ language: 'asc' }, { name: 'asc' }],
    }),
  ]);

  return { total, page, limit, voices };
};

/**
 * Get a single voice by internal DB id.
 * @param {string} id
 */
export const getVoice = async (id) =>
  prisma.voice.findUnique({
    where: { id },
    include: { provider: { select: { name: true } } },
  });

// ─── Provider health ──────────────────────────────────────────────────────────

// Provider health is derived from live external API calls, which are slow and
// occasionally flaky. Cache the result briefly so repeated modal opens / page
// refreshes are instant and stable instead of re-hammering every provider and
// flickering "not connected" on each load.
let _providerStatusCache = null; // { at: number, value: object }
const PROVIDER_STATUS_TTL_MS = 60_000;

// Bound each check so one hung provider can't stall the whole response.
const withHealthTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((resolve) =>
      setTimeout(() => resolve({ healthy: false, error: `${label} health check timed out` }), ms)
    ),
  ]);

/**
 * Check health of all configured voice providers.
 * Returns real results from each provider's lightweight healthCheck(), cached
 * for PROVIDER_STATUS_TTL_MS. Pass { force: true } to bypass the cache.
 */
export const getProviderStatus = async ({ force = false } = {}) => {
  if (!force && _providerStatusCache && Date.now() - _providerStatusCache.at < PROVIDER_STATUS_TTL_MS) {
    return _providerStatusCache.value;
  }

  const [googleResult, elevenLabsResult, sarvamResult, cartesiaResult, fishAudioResult] = await Promise.allSettled([
    withHealthTimeout(googleProvider.healthCheck(), 4000, 'Google'),
    withHealthTimeout(elevenLabsProvider.healthCheck(), 4000, 'ElevenLabs'),
    withHealthTimeout(sarvamProvider.healthCheck(), 4000, 'Sarvam'),
    withHealthTimeout(cartesiaProvider.healthCheck(), 4000, 'Cartesia'),
    withHealthTimeout(fishAudioProvider.healthCheck(), 4000, 'FishAudio'),
  ]);

  const value = {
    google: googleResult.status === 'fulfilled' ? googleResult.value?.healthy : false,
    elevenlabs: elevenLabsResult.status === 'fulfilled' ? elevenLabsResult.value?.healthy : false,
    sarvam: sarvamResult.status === 'fulfilled' ? sarvamResult.value?.healthy : false,
    cartesia: cartesiaResult.status === 'fulfilled' ? cartesiaResult.value?.healthy : false,
    fishaudio: fishAudioResult.status === 'fulfilled' ? fishAudioResult.value?.healthy : false,
    details: {
      google: googleResult.status === 'fulfilled' ? googleResult.value : { healthy: false, error: googleResult.reason?.message },
      elevenlabs: elevenLabsResult.status === 'fulfilled' ? elevenLabsResult.value : { healthy: false, error: elevenLabsResult.reason?.message },
      sarvam: sarvamResult.status === 'fulfilled' ? sarvamResult.value : { healthy: false, error: sarvamResult.reason?.message },
      cartesia: cartesiaResult.status === 'fulfilled' ? cartesiaResult.value : { healthy: false, error: cartesiaResult.reason?.message },
      fishaudio: fishAudioResult.status === 'fulfilled' ? fishAudioResult.value : { healthy: false, error: fishAudioResult.reason?.message },
    },
  };

  _providerStatusCache = { at: Date.now(), value };
  return value;
};

// ─── Audio preview ────────────────────────────────────────────────────────────

/**
 * Generate a real audio preview for a voice and return a readable stream.
 * Selects the correct provider based on voice.provider.name.
 * @param {string} voiceId  – internal DB id
 * @param {string} [text]   – preview text (falls back to default)
 * @returns {Promise<import('stream').Readable>}
 */
export const streamVoicePreview = async (voiceId, text = DEFAULT_PREVIEW_TEXT) => {
  const voice = await getVoice(voiceId);
  if (!voice) throw new Error('Voice not found');
  const { buffer, contentType } = await synthesizeVoiceToBuffer(voice, text);
  return { stream: Readable.from(buffer), contentType };
};

/**
 * Which provider actually synthesizes this Voice row, and with what id?
 *
 * For every real provider that is just (name, providerVoiceId). The exception is
 * a CLONED voice, which is stored under a synthetic 'Custom' provider with the
 * upstream id in its metadata — so every synthesis path used to need its own
 * copy of the same "unwrap the clone" branch. Resolving it once here keeps the
 * dispatch tables below honest, and means cloned voices automatically get the
 * streaming path rather than only the buffered one.
 *
 * @param {object} voice – Voice row including { provider: { name } }
 * @returns {{ providerName: string, providerVoiceId: string, meta: object }}
 * @throws {Error & { statusCode: 409 }} when a clone has no usable upstream voice
 */
export const resolveSynthesisTarget = (voice) => {
  let meta = {};
  try { meta = JSON.parse(voice.metadata || '{}'); } catch { /* treat as empty */ }
  const providerName = voice.provider?.name;
  if (providerName !== 'Custom') {
    return { providerName, providerVoiceId: voice.providerVoiceId, meta };
  }

  // Cloned voice: hand back the provider that actually holds the clone.
  const CLONE_PROVIDERS = { elevenlabs: 'ElevenLabs', fishaudio: 'FishAudio' };
  const target = CLONE_PROVIDERS[meta.clonedProvider];
  if (meta.status === 'cloned' && target && meta.clonedVoiceId) {
    return { providerName: target, providerVoiceId: meta.clonedVoiceId, meta };
  }
  const err = new Error(
    'This cloned voice has only a raw sample (status: sample_only) — it cannot synthesize new text yet. Re-submit it on the Clone Voice page with FISH_API_KEY or ELEVENLABS_API_KEY configured to complete neural cloning.'
  );
  err.statusCode = 409;
  throw err;
};

/**
 * Synthesize speech for a loaded Voice record and return the raw audio buffer.
 * Shared by the preview endpoint and the web-call runtime.
 * @param {object} voice – Voice row including { provider: { name } }
 * @param {string} text
 * @param {{ fast?: boolean, pace?: number, affect?: string|null }} [opts] – fast
 *   mode trades a little audio quality for much lower latency (live calls);
 *   previews keep full quality.
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export const synthesizeVoiceToBuffer = async (voice, text, opts = {}) => {
  const { providerName, providerVoiceId, meta } = resolveSynthesisTarget(voice);
  let audioBuffer;

  if (providerName === 'Google') {
    audioBuffer = await googleProvider.previewVoice(providerVoiceId, text);
  } else if (providerName === 'ElevenLabs') {
    audioBuffer = await elevenLabsProvider.previewVoice(providerVoiceId, text, opts);
  } else if (providerName === 'Sarvam') {
    // Sarvam requires the language code for generation
    const langCode = meta.language_code || 'en-IN';
    audioBuffer = await sarvamProvider.previewVoice(providerVoiceId, text, langCode);
  } else if (providerName === 'Cartesia') {
    audioBuffer = await cartesiaProvider.previewVoice(providerVoiceId, text);
  } else if (providerName === 'FishAudio') {
    audioBuffer = await fishAudioProvider.previewVoice(providerVoiceId, text, opts);
  } else {
    throw new Error(`TTS not implemented for provider: ${providerName}`);
  }

  // Sniff magic bytes to determine content type
  let contentType = 'audio/mpeg';
  if (audioBuffer.length > 4) {
    const magic = audioBuffer.toString('ascii', 0, 4);
    if (magic === 'RIFF') contentType = 'audio/wav';
    // Fish Audio can emit Opus in an Ogg container (FISH_TTS_FORMAT=opus).
    else if (magic === 'OggS') contentType = 'audio/ogg';
  }

  return { buffer: audioBuffer, contentType };
};

/**
 * Return a Node-readable audio stream for live calls. Providers with a real
 * low-latency streaming endpoint (Sarvam, ElevenLabs, Fish Audio) deliver bytes
 * as they generate; the rest are exposed as a one-chunk stream so callers need
 * only one code path.
 */
export const streamSynthesizeVoice = async (voice, text, opts = {}) => {
  const { providerName, providerVoiceId, meta } = resolveSynthesisTarget(voice);

  if (providerName === 'Sarvam') {
    const langCode = meta.language_code || 'en-IN';
    const { body, contentType } = await sarvamProvider.streamVoice(
      providerVoiceId,
      text,
      langCode,
      opts
    );
    return { stream: Readable.fromWeb(body), contentType };
  }

  // ElevenLabs streams its fast Flash model chunk-by-chunk — genuine
  // first-byte-early audio for live web calls (B4), unlike Sarvam whose
  // "stream" endpoint buffers server-side (ttfaMs ≈ totalMs in the logs).
  if (providerName === 'ElevenLabs') {
    const { body, contentType } = await elevenLabsProvider.streamVoice(providerVoiceId, text, opts);
    return { stream: Readable.fromWeb(body), contentType };
  }

  if (providerName === 'FishAudio') {
    const { body, contentType } = await fishAudioProvider.streamVoice(providerVoiceId, text, opts);
    return { stream: Readable.fromWeb(body), contentType };
  }

  const { buffer, contentType } = await synthesizeVoiceToBuffer(voice, text, opts);
  return { stream: Readable.from(buffer), contentType };
};

// ─── Agent voice resolution ───────────────────────────────────────────────────

export const providerHasCredentials = (name) => {
  switch (name) {
    case 'Google':
      return Boolean(process.env.GOOGLE_TTS_CREDENTIALS_JSON || process.env.GOOGLE_TTS_KEY_FILE);
    case 'ElevenLabs':
      return Boolean(process.env.ELEVENLABS_API_KEY);
    case 'Sarvam':
      return Boolean(process.env.SARVAM_API_KEY);
    case 'Cartesia':
      return Boolean(process.env.CARTESIA_API_KEY);
    case 'FishAudio':
      return Boolean(process.env.FISH_API_KEY);
    // Cloned voices live under the synthetic 'Custom' provider and are
    // synthesized upstream (see resolveSynthesisTarget). This returned false,
    // so a cloned voice could never be resolved from its saved label — an agent
    // configured with one silently fell back to a different provider's voice.
    case 'Custom':
      return Boolean(process.env.ELEVENLABS_API_KEY || process.env.FISH_API_KEY);
    default:
      return false;
  }
};

// Voice rows change only on sync/UI selection; caching the resolution saves
// ~2s of remote-DB round-trips on every single web-call turn.
const voiceResolutionCache = new Map(); // voiceLabel -> { voice, at }
// Must outlast the gap BETWEEN turns (not just one turn) or every turn re-pays
// the multi-query DB resolution. Safe to cache long: the key is the label
// itself, so changing an agent's voice hits a fresh key immediately.
const VOICE_CACHE_TTL_MS = 10 * 60_000;

/**
 * Resolve an agent's configured voice label (e.g. "Google - Aoede (female)")
 * to a usable Voice row. Falls back to the first voice of a provider that
 * actually has credentials when the configured one is unavailable — the web
 * call must always be able to speak.
 * @param {string} voiceLabel – Agent.voice display string
 * @returns {Promise<object|null>} Voice row incl. { provider: { name } }
 */
export const resolveAgentVoice = async (voiceLabel) => {
  const cached = voiceResolutionCache.get(voiceLabel);
  if (cached && Date.now() - cached.at < VOICE_CACHE_TTL_MS) return cached.voice;
  const voice = await resolveAgentVoiceUncached(voiceLabel);
  if (voice) voiceResolutionCache.set(voiceLabel, { voice, at: Date.now() });
  return voice;
};

const resolveAgentVoiceUncached = async (voiceLabel) => {
  const include = { provider: { select: { name: true } } };
  // A clone whose neural training never completed holds only a raw sample and
  // CANNOT synthesize — resolveSynthesisTarget throws 409 on it. Excluding it
  // here (the same filter listVoices uses) means such a label falls through to
  // the provider fallback below and the call still speaks, instead of dying
  // mid-turn. Matters now that 'Custom' has credentials and is matchable at all.
  const usable = { NOT: { metadata: { contains: '"status":"sample_only"' } } };

  // Parse "Provider - Voice Name (extra)" labels
  if (voiceLabel && typeof voiceLabel === 'string') {
    const [providerPart, ...rest] = voiceLabel.split(' - ');
    const namePart = rest.join(' - ').replace(/\s*\(.*\)\s*$/, '').trim();
    if (providerPart && namePart && providerHasCredentials(providerPart.trim())) {
      const match = await prisma.voice.findFirst({
        where: {
          ...usable,
          provider: { name: { equals: providerPart.trim() } },
          name: { contains: namePart, mode: 'insensitive' },
        },
        include,
      });
      if (match) return match;
    }
    // Label may also be a bare voice name from any credentialed provider
    const byName = await prisma.voice.findFirst({
      where: { ...usable, name: { contains: voiceLabel.trim(), mode: 'insensitive' } },
      include,
    });
    if (byName && providerHasCredentials(byName.provider?.name)) return byName;
  }

  // Fallback: first voice from any provider with working credentials.
  // Prefer English/en-family voices so the default is broadly understandable.
  // FishAudio is LAST on purpose: adding a provider must never change the
  // default voice of an existing deployment. Promote it once its measured TTFB
  // justifies the switch (scripts/measure-providers.js).
  for (const providerName of ['ElevenLabs', 'Cartesia', 'Google', 'Sarvam', 'FishAudio']) {
    if (!providerHasCredentials(providerName)) continue;
    const fallback = await prisma.voice.findFirst({
      where: { provider: { name: providerName }, language: { startsWith: 'en' } },
      include,
    }) || await prisma.voice.findFirst({
      where: { provider: { name: providerName } },
      include,
    });
    if (fallback) return fallback;
  }
  return null;
};

// ─── Agent voice assignment ───────────────────────────────────────────────────
//
// There is no AgentVoice join table — an agent's voice is the label string in
// `Agent.voice` ("Provider - Name"), which resolveAgentVoice() above parses at
// call time. These two functions used to read and write a `prisma.agentVoice`
// model that does not exist in the schema, so every save threw a TypeError and
// the endpoint 500'd. They now read and write the column that is really there,
// in exactly the format the resolver and the agent editor already use.

/** The label format resolveAgentVoice() parses and EditAgent writes. */
export const formatVoiceLabel = (voice) => `${voice.provider?.name ?? 'Unknown'} - ${voice.name}`;

/**
 * Point an agent at a voice.
 * @param {string} agentId
 * @param {string} voiceId      internal DB voice id
 * @param {string} [workspaceId] when given, the agent must belong to it
 * @returns {Promise<{ agent: object, voice: object, label: string }>}
 */
export const setAgentVoice = async (agentId, voiceId, workspaceId) => {
  const voice = await prisma.voice.findUnique({
    where: { id: voiceId },
    include: { provider: { select: { name: true } } },
  });
  if (!voice) {
    const err = new Error('Voice not found');
    err.status = 404;
    throw err;
  }

  // Ownership check, mirroring updateAgent: never retarget an agent in another
  // workspace. `updateMany` would silently no-op, so look it up first and say so.
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!agent) {
    const err = new Error('Agent not found in this workspace');
    err.status = 404;
    throw err;
  }

  // A workspace-scoped clone must not be assignable from another tenant.
  if (voice.workspaceId && workspaceId && voice.workspaceId !== workspaceId) {
    const err = new Error('That voice belongs to another workspace');
    err.status = 403;
    throw err;
  }

  const label = formatVoiceLabel(voice);
  const updated = await prisma.agent.update({
    where: { id: agentId },
    data: { voice: label },
  });

  // The resolver caches label → voice; a stale entry here would keep the agent
  // speaking in its previous voice until the TTL expired.
  voiceResolutionCache.delete(label);

  return { agent: updated, voice, label };
};

/**
 * The voice an agent will actually speak with, resolved from its label.
 *
 * Note resolveAgentVoice() falls back to a default when the stored label no
 * longer matches anything (a deleted clone, a provider that lost its key), so
 * the result can differ from what the label says. `exactMatch: false` flags
 * that, rather than quietly presenting the fallback as the agent's setting.
 * @param {string} agentId
 * @param {string} [workspaceId]
 */
export const getAgentVoice = async (agentId, workspaceId) => {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, ...(workspaceId ? { workspaceId } : {}) },
    select: { voice: true },
  });
  if (!agent) {
    const err = new Error('Agent not found in this workspace');
    err.status = 404;
    throw err;
  }
  if (!agent.voice) return null;

  const v = await resolveAgentVoice(agent.voice);
  if (!v) return null;

  return {
    id: v.id,
    provider: v.provider?.name,
    providerVoiceId: v.providerVoiceId,
    name: v.name,
    language: v.language,
    accent: v.accent,
    gender: v.gender,
    category: v.category,
    label: agent.voice,
    exactMatch: formatVoiceLabel(v) === agent.voice,
    metadata: v.metadata ? (() => { try { return JSON.parse(v.metadata); } catch { return v.metadata; } })() : null,
  };
};
