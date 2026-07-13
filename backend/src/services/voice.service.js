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

/**
 * Check health of all configured voice providers.
 * Returns real results from each provider's lightweight healthCheck().
 */
export const getProviderStatus = async () => {
  const [googleResult, elevenLabsResult, sarvamResult, cartesiaResult] = await Promise.allSettled([
    googleProvider.healthCheck(),
    elevenLabsProvider.healthCheck(),
    sarvamProvider.healthCheck(),
    cartesiaProvider.healthCheck(),
  ]);

  return {
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

  const providerName = voice.provider?.name;
  let audioBuffer;

  if (providerName === 'Google') {
    audioBuffer = await googleProvider.previewVoice(voice.providerVoiceId, text);
  } else if (providerName === 'ElevenLabs') {
    audioBuffer = await elevenLabsProvider.previewVoice(voice.providerVoiceId, text);
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
      audioBuffer = await elevenLabsProvider.previewVoice(meta.clonedVoiceId, text);
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

  // Convert buffer to readable stream
  return { stream: Readable.from(audioBuffer), contentType };
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
