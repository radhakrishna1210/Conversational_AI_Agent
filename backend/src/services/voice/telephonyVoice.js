// backend/src/services/voice/telephonyVoice.js
/**
 * "Can THIS voice be spoken down a phone line, and in what format?"
 *
 * telephonyAudio.js answers that for a PROVIDER NAME (`TELEPHONY_TTS`), and it
 * deliberately knows nothing about the database. This module is the one line of
 * glue between the two: it takes a `Voice` row and works out which provider will
 * really synthesize it before asking that question.
 *
 * ── WHY THE ROW'S OWN PROVIDER IS THE WRONG THING TO ASK ────────────────────
 *
 * A CLONED voice is stored under the synthetic `Custom` provider, with the
 * provider that actually holds the clone recorded in `metadata.clonedProvider`
 * (see resolveSynthesisTarget in voice.service.js). `Custom` is a billing and
 * display label; nobody synthesizes anything with it, and it is not — and must
 * not be — a row in TELEPHONY_TTS.
 *
 * So `telephonyOutputFormat(voice.provider.name)` returns null for EVERY cloned
 * voice, including the Fish- and ElevenLabs-hosted ones that are perfectly
 * capable of feeding a carrier. The modular phone bridge treated that null as
 * "this voice cannot do telephony" and threw at the top of its `start` handler,
 * which closes the media socket — so the callee picked up, heard about one
 * second of nothing, and the line dropped. The call log recorded FAILED with a
 * one-second duration and an empty transcript, which is the same shape a dozen
 * unrelated faults produce, and the real reason existed only in a process log.
 *
 * Every telephony capability decision goes through here so the dial-time
 * pre-flight (resolveCallMode) and the answer-time bridge can never again
 * disagree about the same voice — the disagreement is what made the failure land
 * on a live call instead of before one was placed.
 */

import { resolveSynthesisTarget } from '../voice.service.js';
import { telephonyOutputFormat, supportsTelephony } from './telephonyAudio.js';

/**
 * The provider that will really speak this voice.
 *
 * @param {object|null} voice     Voice row including { provider: { name } }
 * @param {string} [fallback]     settings.ttsProvider, for a call with no
 *                                resolvable voice row at all
 * @returns {string} '' when nothing can synthesize it — a clone whose neural
 *   training never completed holds only a raw sample, and resolveSynthesisTarget
 *   throws on it. Empty is the honest answer, and it is NOT the same as the
 *   fallback: guessing a provider for a voice that cannot speak would move the
 *   failure back onto the live call this module exists to keep it off.
 */
export function synthesisProviderForVoice(voice, fallback = '') {
  if (!voice) return String(fallback || '');
  try {
    return resolveSynthesisTarget(voice).providerName || String(fallback || '');
  } catch {
    return '';
  }
}

/**
 * The audio format to ask TTS for on a carrier leg, or null when this voice
 * cannot feed one at all.
 *
 * @param {object|null} voice   Voice row including { provider: { name } }
 * @param {string} [fallback]   settings.ttsProvider
 * @returns {{kind:'native'|'pcm', format:string, rate?:number}|null}
 */
export function telephonyFormatForVoice(voice, fallback = '') {
  return telephonyOutputFormat(synthesisProviderForVoice(voice, fallback));
}

/**
 * Can this voice hold a two-way phone conversation? Same question as
 * telephonyFormatForVoice, for the pre-flight that only needs a yes/no.
 */
export function voiceSupportsTelephony(voice, fallback = '') {
  return supportsTelephony(synthesisProviderForVoice(voice, fallback));
}
