// backend/src/services/voice/ttsStreamFactory.js
/**
 * Picks the token-streaming TTS session for a voice.
 *
 * "Token streaming" = the TTS provider accepts text INCREMENTALLY over a socket
 * and returns one continuous audio stream, so LLM tokens can be piped straight
 * into synthesis and the agent starts speaking before the reply is finished
 * (the `ws-overlap` path in voiceTurnStream). It is strictly better than
 * synthesizing per sentence over HTTP, which produces independently-encoded
 * clips that cannot share one decoder.
 *
 * Not every provider can do this — Sarvam, Google and Cartesia have no
 * incremental-text endpoint wired up here — so callers must treat a null return
 * as "use the HTTP split path instead", which is fully functional.
 *
 * Every session class exposes the SAME interface, which is what lets the
 * runtime stay provider-agnostic:
 *   connect() / pushText(text) / end() / close()
 *   events: 'audio' (Buffer) | 'done' | 'error'
 */

import * as elevenLabsProvider from './providers/elevenlabs.provider.js';
import * as fishAudioProvider from './providers/fishaudio.provider.js';
import { resolveSynthesisTarget } from '../voice.service.js';

const TOKEN_STREAMERS = {
  ElevenLabs: {
    supported: () => elevenLabsProvider.canStreamTokens(),
    reason: () => elevenLabsProvider.streamingBlockReason(),
    create: (voiceId, opts) => new elevenLabsProvider.ElevenLabsTtsStream(voiceId, opts),
  },
  FishAudio: {
    supported: () => fishAudioProvider.canStreamTokens(),
    reason: () => fishAudioProvider.streamingBlockReason(),
    create: (voiceId, opts) => new fishAudioProvider.FishAudioTtsStream(voiceId, opts),
  },
};

/**
 * Resolve a voice to its token-streaming entry, or null. Goes through
 * resolveSynthesisTarget so a CLONED voice is judged by the provider that
 * actually holds the clone rather than by the synthetic 'Custom' wrapper.
 * Never throws — an unusable clone simply reports "no token streaming".
 */
function entryFor(voice) {
  if (!voice) return null;
  let target;
  try { target = resolveSynthesisTarget(voice); } catch { return null; }
  const entry = TOKEN_STREAMERS[target.providerName];
  if (!entry || !target.providerVoiceId) return null;
  return { entry, voiceId: target.providerVoiceId, providerName: target.providerName };
}

/**
 * Can this voice accept LLM tokens directly (credentials present, deps
 * installed)? Cheap and synchronous — safe to call on the hot path.
 * @param {object} voice - Voice row including { provider: { name } }
 * @returns {boolean}
 */
export function supportsTokenStreaming(voice) {
  const resolved = entryFor(voice);
  return Boolean(resolved && resolved.entry.supported());
}

/**
 * Build a token-streaming session for this voice, or null when the provider
 * can't (caller falls back to the HTTP split path).
 * @param {object} voice
 * @param {{ pace?: number, affect?: string|null, modelId?: string }} [opts]
 * @returns {import('events').EventEmitter|null}
 */
export function createTokenTtsStream(voice, opts = {}) {
  const resolved = entryFor(voice);
  if (!resolved || !resolved.entry.supported()) return null;
  return resolved.entry.create(resolved.voiceId, opts);
}

/**
 * What this specific voice can actually do, and why — the answer the agent
 * editor needs in order to let someone CHOOSE a voice knowingly instead of
 * discovering months later that the fast path never ran.
 *
 * Deliberately describes the voice the workspace picked rather than
 * recommending one: which provider is fastest is a product decision that
 * belongs to the person configuring the agent, not to this file. Everything
 * here is derived — no provider is named in the logic, and a provider added to
 * TOKEN_STREAMERS later is described by this function with no edit.
 *
 * @param {object} voice - Voice row including { provider: { name } }
 * @returns {{ providerName: string, tokenStreaming: boolean, ssmlBreaks: boolean,
 *   deliveryMode: 'socket'|'http', reason: string|null }}
 */
export function describeTtsCapabilities(voice) {
  const resolved = entryFor(voice);
  const providerName = synthesisProviderName(voice);
  if (!resolved) {
    return {
      providerName,
      tokenStreaming: false,
      ssmlBreaks: supportsSsmlBreaks(voice),
      deliveryMode: 'http',
      // Not an error: the per-sentence HTTP path is fully functional, and for
      // several providers it is the only path they publish.
      reason: `${providerName} does not offer an incremental-text streaming endpoint here, `
        + 'so replies are synthesized sentence by sentence over HTTP.',
    };
  }
  const supported = resolved.entry.supported();
  return {
    providerName,
    tokenStreaming: supported,
    ssmlBreaks: supportsSsmlBreaks(voice),
    deliveryMode: supported ? 'socket' : 'http',
    reason: supported ? null : (resolved.entry.reason?.() ?? null),
  };
}

/** Provider name that would actually synthesize this voice (for logs). */
export function synthesisProviderName(voice) {
  try { return resolveSynthesisTarget(voice).providerName; } catch { return voice?.provider?.name ?? 'unknown'; }
}

/**
 * Will this voice PARSE `<break time="…"/>`, or would it read the tag aloud?
 *
 * This has to be a capability check rather than an assumption, because the
 * failure is not graceful: a provider that does not implement SSML speaks the
 * literal characters, so a pause meant to sound thoughtful becomes the agent
 * saying "break time three hundred milliseconds" to a customer. Callers use it
 * to decide whether to keep pause markup or convert it back to a comma (see
 * services/voice/disfluency.js).
 *
 * ElevenLabs honours break tags on every model EXCEPT eleven_v3 — which has no
 * realtime WebSocket tier and so cannot serve a live call anyway, but the model
 * is env-selectable (ELEVENLABS_TTS_MODEL) and this must not silently break if
 * someone points it there. Sarvam, Google, Cartesia and Fish Audio are not
 * wired for SSML here, so they get commas.
 *
 * @param {object} voice - Voice row including { provider: { name } }
 * @returns {boolean}
 */
export function supportsSsmlBreaks(voice) {
  if (!voice) return false;
  let providerName;
  try { providerName = resolveSynthesisTarget(voice).providerName; } catch { return false; }
  if (providerName !== 'ElevenLabs') return false;
  return !/v3/i.test(process.env.ELEVENLABS_TTS_MODEL || '');
}
