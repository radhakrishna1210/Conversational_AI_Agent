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
export { syncVoices } from './voice/voice.sync.service.js';

const DEFAULT_PREVIEW_TEXT =
  'Hello, thank you for calling. How can I assist you today?';

// ─── Voice queries ─────────────────────────────────────────────────────────────

/**
 * List voices with optional provider name filter and pagination.
 * @param {{ page?: number, limit?: number, provider?: string }} opts
 */
export const listVoices = async ({ page = 1, limit = 20, provider, gender, language } = {}) => {
  const skip = (page - 1) * limit;
  const where = {
    // Hide un-cloned samples from the agent voice picker: a sample_only voice
    // cannot synthesize speech, so selecting it would break calls (#9 L5).
    NOT: { AND: [{ category: 'cloned' }, { metadata: { contains: '"status":"sample_only"' } }] },
  };
  if (provider) where.provider = { name: { equals: provider } };
  if (gender) where.gender = { equals: gender.toLowerCase() };
  if (language) where.language = { equals: language };


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

  const [googleResult, elevenLabsResult, sarvamResult, cartesiaResult] = await Promise.allSettled([
    withHealthTimeout(googleProvider.healthCheck(), 4000, 'Google'),
    withHealthTimeout(elevenLabsProvider.healthCheck(), 4000, 'ElevenLabs'),
    withHealthTimeout(sarvamProvider.healthCheck(), 4000, 'Sarvam'),
    withHealthTimeout(cartesiaProvider.healthCheck(), 4000, 'Cartesia'),
  ]);

  const value = {
    google: googleResult.status === 'fulfilled' ? googleResult.value?.healthy : false,
    elevenlabs: elevenLabsResult.status === 'fulfilled' ? elevenLabsResult.value?.healthy : false,
    sarvam: sarvamResult.status === 'fulfilled' ? sarvamResult.value?.healthy : false,
    cartesia: cartesiaResult.status === 'fulfilled' ? cartesiaResult.value?.healthy : false,
    details: {
      google: googleResult.status === 'fulfilled' ? googleResult.value : { healthy: false, error: googleResult.reason?.message },
      elevenlabs: elevenLabsResult.status === 'fulfilled' ? elevenLabsResult.value : { healthy: false, error: elevenLabsResult.reason?.message },
      sarvam: sarvamResult.status === 'fulfilled' ? sarvamResult.value : { healthy: false, error: sarvamResult.reason?.message },
      cartesia: cartesiaResult.status === 'fulfilled' ? cartesiaResult.value : { healthy: false, error: cartesiaResult.reason?.message },
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
 * Synthesize speech for a loaded Voice record and return the raw audio buffer.
 * Shared by the preview endpoint and the web-call runtime.
 * @param {object} voice – Voice row including { provider: { name } }
 * @param {string} text
 * @param {{ fast?: boolean }} [opts] – fast mode trades a little audio quality
 *   for much lower latency (live calls); previews keep full quality.
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export const synthesizeVoiceToBuffer = async (voice, text, opts = {}) => {
  const providerName = voice.provider?.name;
  let audioBuffer;

  if (providerName === 'Google') {
    audioBuffer = await googleProvider.previewVoice(voice.providerVoiceId, text);
  } else if (providerName === 'ElevenLabs') {
    audioBuffer = await elevenLabsProvider.previewVoice(voice.providerVoiceId, text, opts);
  } else if (providerName === 'Sarvam') {
    // Sarvam requires the language code for generation
    const meta = JSON.parse(voice.metadata || '{}');
    const langCode = meta.language_code || 'en-IN';
    audioBuffer = await sarvamProvider.previewVoice(voice.providerVoiceId, text, langCode);
  } else if (providerName === 'Cartesia') {
    audioBuffer = await cartesiaProvider.previewVoice(voice.providerVoiceId, text);
  } else if (providerName === 'Custom') {
    // Cloned voices: if the clone completed on ElevenLabs, synthesize there
    // using the stored ElevenLabs voice id. If it's still sample_only, fail
    // with a clear, actionable message instead of a generic 500.
    const meta = JSON.parse(voice.metadata || '{}');
    if (meta.status === 'cloned' && meta.clonedProvider === 'elevenlabs' && meta.clonedVoiceId) {
      audioBuffer = await elevenLabsProvider.previewVoice(meta.clonedVoiceId, text, opts);
    } else {
      const err = new Error(
        'This cloned voice has only a raw sample (status: sample_only) — it cannot synthesize new text yet. Re-submit it on the Clone Voice page with ELEVENLABS_API_KEY configured to complete neural cloning.'
      );
      err.statusCode = 409;
      throw err;
    }
  } else {
    throw new Error(`TTS not implemented for provider: ${providerName}`);
  }

  // Sniff magic bytes to determine content type
  let contentType = 'audio/mpeg';
  if (audioBuffer.length > 4) {
    const magic = audioBuffer.toString('ascii', 0, 4);
    if (magic === 'RIFF') {
      contentType = 'audio/wav';
    }
  }

  return { buffer: audioBuffer, contentType };
};

/**
 * Return a Node-readable audio stream for live calls. Sarvam has a dedicated
 * low-latency HTTP streaming endpoint; other providers retain their existing
 * synthesis behavior and are exposed as a one-chunk stream.
 */
export const streamSynthesizeVoice = async (voice, text, opts = {}) => {
  if (voice.provider?.name === 'Sarvam') {
    const meta = JSON.parse(voice.metadata || '{}');
    const langCode = meta.language_code || 'en-IN';
    const { body, contentType } = await sarvamProvider.streamVoice(
      voice.providerVoiceId,
      text,
      langCode,
      opts
    );
    return { stream: Readable.fromWeb(body), contentType };
  }

  // ElevenLabs streams its fast Flash model chunk-by-chunk — genuine
  // first-byte-early audio for live web calls (B4), unlike Sarvam whose
  // "stream" endpoint buffers server-side (ttfaMs ≈ totalMs in the logs).
  if (voice.provider?.name === 'ElevenLabs') {
    const { body, contentType } = await elevenLabsProvider.streamVoice(voice.providerVoiceId, text, opts);
    return { stream: Readable.fromWeb(body), contentType };
  }

  const { buffer, contentType } = await synthesizeVoiceToBuffer(voice, text, opts);
  return { stream: Readable.from(buffer), contentType };
};

// ─── Agent voice resolution ───────────────────────────────────────────────────

const providerHasCredentials = (name) => {
  switch (name) {
    case 'Google':
      return Boolean(process.env.GOOGLE_TTS_CREDENTIALS_JSON || process.env.GOOGLE_TTS_KEY_FILE);
    case 'ElevenLabs':
      return Boolean(process.env.ELEVENLABS_API_KEY);
    case 'Sarvam':
      return Boolean(process.env.SARVAM_API_KEY);
    case 'Cartesia':
      return Boolean(process.env.CARTESIA_API_KEY);
    default:
      return false;
  }
};

// Voice rows change only on sync/UI selection; caching the resolution saves
// ~2s of remote-DB round-trips on every single web-call turn.
const voiceResolutionCache = new Map(); // voiceLabel -> { voice, at }
const VOICE_CACHE_TTL_MS = 60_000;

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

  // Parse "Provider - Voice Name (extra)" labels
  if (voiceLabel && typeof voiceLabel === 'string') {
    const [providerPart, ...rest] = voiceLabel.split(' - ');
    const namePart = rest.join(' - ').replace(/\s*\(.*\)\s*$/, '').trim();
    if (providerPart && namePart && providerHasCredentials(providerPart.trim())) {
      const match = await prisma.voice.findFirst({
        where: {
          provider: { name: { equals: providerPart.trim() } },
          name: { contains: namePart, mode: 'insensitive' },
        },
        include,
      });
      if (match) return match;
    }
    // Label may also be a bare voice name from any credentialed provider
    const byName = await prisma.voice.findFirst({
      where: { name: { contains: voiceLabel.trim(), mode: 'insensitive' } },
      include,
    });
    if (byName && providerHasCredentials(byName.provider?.name)) return byName;
  }

  // Fallback: first voice from any provider with working credentials.
  // Prefer English/en-family voices so the default is broadly understandable.
  for (const providerName of ['ElevenLabs', 'Cartesia', 'Google', 'Sarvam']) {
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

// ─── AgentVoice persistence ───────────────────────────────────────────────────

/**
 * Assign a voice to an agent (upsert).
 * @param {string} agentId
 * @param {string} voiceId – internal DB voice id
 */
export const setAgentVoice = async (agentId, voiceId) => {
  // Verify voice exists
  const voice = await prisma.voice.findUnique({
    where: { id: voiceId },
    include: { provider: { select: { name: true } } },
  });
  if (!voice) throw new Error('Voice not found');

  const agentVoice = await prisma.agentVoice.upsert({
    where: { agentId },
    create: { agentId, voiceId },
    update: { voiceId },
    include: { voice: { include: { provider: { select: { name: true } } } } },
  });

  return agentVoice;
};

/**
 * Get the voice currently assigned to an agent.
 * @param {string} agentId
 */
export const getAgentVoice = async (agentId) => {
  const agentVoice = await prisma.agentVoice.findUnique({
    where: { agentId },
    include: { voice: { include: { provider: { select: { name: true } } } } },
  });

  if (!agentVoice) return null;

  const v = agentVoice.voice;
  return {
    id: v.id,
    provider: v.provider?.name,
    providerVoiceId: v.providerVoiceId,
    name: v.name,
    language: v.language,
    accent: v.accent,
    gender: v.gender,
    category: v.category,
    metadata: v.metadata ? JSON.parse(v.metadata) : null,
  };
};
