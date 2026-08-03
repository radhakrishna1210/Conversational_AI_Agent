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
    create: (voiceId, opts) => new elevenLabsProvider.ElevenLabsTtsStream(voiceId, opts),
  },
  FishAudio: {
    supported: () => fishAudioProvider.canStreamTokens(),
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

/** Provider name that would actually synthesize this voice (for logs). */
export function synthesisProviderName(voice) {
  try { return resolveSynthesisTarget(voice).providerName; } catch { return voice?.provider?.name ?? 'unknown'; }
}
