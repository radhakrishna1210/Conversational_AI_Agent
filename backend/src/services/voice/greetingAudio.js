// backend/src/services/voice/greetingAudio.js
/**
 * Synthesized greeting audio, cached across calls.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 *
 * A carrier opens the media socket the instant the callee picks up, so every
 * millisecond before the first greeting frame is dead air on a live line. The
 * phone bridge used to open a fresh TTS connection at that exact moment and
 * wait for first byte — measured `ttsTtfaMs` p50 581ms, p90 1450ms — for one or
 * two sentences that are IDENTICAL on every call to that agent. A 500-recipient
 * campaign synthesized the same greeting 500 times, and paid for it 500 times
 * in silence the callee actually hears.
 *
 * A web call pays none of this: the browser fetched and buffered its welcome
 * over HTTP before the user pressed the button. This closes that half of the
 * gap — after the first call, the greeting is memory I/O.
 *
 * ── WHAT IS AND IS NOT KEYED ────────────────────────────────────────────────
 *
 * The FORMAT AND RATE ARE PART OF THE KEY, not just the voice and the text.
 * This is the trap `fillerKey()` in agentRuntime.service.js already documents
 * and paid for once: the acknowledgment clip was cached without a format, so an
 * MP3 was handed to a G.711 carrier as if it were mu-law — a burst of static in
 * front of every reply. Two requests for 'pcm' at different rates are likewise
 * different audio; keying on the format alone would serve a 24kHz clip to a
 * bridge about to emit it at 8kHz, which plays at the wrong speed.
 *
 * `pace` is in the key for the same reason — it changes the bytes.
 *
 * There is deliberately NO TTL. A greeting only changes when its text changes,
 * and the text IS the key, so a stale entry cannot be served; a changed welcome
 * simply lands on a new key and the old one falls out of the LRU. A TTL would
 * only re-pay the synthesis on calls that were about to be served correctly.
 */

import { createHash } from 'crypto';
import logger from '../../lib/logger.js';
import { streamSynthesizeVoice } from '../voice.service.js';
import { ambienceTagFor } from './ambience.js';

/**
 * Bounded so a workspace with hundreds of agents (or an agent whose greeting is
 * edited repeatedly) cannot grow this without limit. A telephony greeting is
 * ~2s of G.711 = ~16KB, so this ceiling is a few megabytes at worst.
 */
const MAX_ENTRIES = Number(process.env.GREETING_AUDIO_CACHE_ENTRIES) || 200;

/**
 * Refuse to cache anything implausibly large for a one-or-two-sentence
 * greeting. Not a correctness guard — the call still works, it just streams —
 * but it stops a misconfigured voice (an MP3 default that slipped past
 * `telephonyOutputFormat`, a runaway welcome) from pinning megabytes per agent.
 */
const MAX_BYTES = Number(process.env.GREETING_AUDIO_MAX_BYTES) || 1_500_000;

/** key -> { buf, contentType, audioFormat } */
const cache = new Map();
/** key -> Promise, so N concurrent calls to one agent synthesize once. */
const inFlight = new Map();

const textHash = (text) => createHash('sha1').update(String(text)).digest('hex').slice(0, 16);

/**
 * @param {object} voice   Voice row (needs `id`)
 * @param {string} text    the exact greeting that will be spoken
 * @param {{pace?: number, audioFormat?: string|null, sampleRate?: number|null}} opts
 */
const keyFor = (voice, text, { pace = null, audioFormat = null, sampleRate = null } = {}) =>
  `${voice?.id}|${audioFormat || 'default'}|${sampleRate || 'default'}|${pace || 'default'}|${textHash(text)}`;

/**
 * What to ask TTS for, given a bridge's resolved telephony format.
 *
 * Exported and used by BOTH the warm path (the dialler, while the phone is
 * ringing) and the read path (the bridge, on answer). They have to agree
 * exactly or the warm populates a key the bridge never looks up — which is not
 * a bug you would notice, because the call still works, just slowly. One
 * function so they cannot drift.
 *
 * @param {{kind: string, format: string, rate?: number}|null} ttsFormat
 * @param {object} settings  the agent's parsed settings
 */
export function greetingSynthesisOpts(ttsFormat, settings = {}) {
  return {
    pace: Number(settings.speakingRate) || 1.05,
    audioFormat: ttsFormat?.format ?? null,
    // Only raw PCM needs the rate stated: a native mu-law format already
    // implies 8kHz, and passing a rate there would key two identical clips
    // differently depending on which caller filled the field in.
    sampleRate: ttsFormat?.kind === 'pcm' && ttsFormat.rate ? ttsFormat.rate : null,
    // Mode A ambience rides on every synthesis request, the greeting included;
    // it is part of the cache key by construction (the opts are hashed).
    ambienceTag: ambienceTagFor(settings),
  };
}

/**
 * The greeting's audio if we already have it, else null. Synchronous and cheap
 * — safe to call on the answer path, which is the whole point.
 * @returns {{buf: Buffer, contentType: string, audioFormat: string|null}|null}
 */
export function getGreetingAudio(voice, text, opts = {}) {
  if (!voice || !text) return null;
  const key = keyFor(voice, text, opts);
  const hit = cache.get(key);
  if (!hit) return null;
  // Refresh recency: Map iterates in insertion order, so re-inserting is what
  // makes the eviction below an LRU rather than a FIFO. An agent called all day
  // must not be evicted by a one-off test dial to a hundred others.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

/**
 * Store audio that was synthesized on the fly, so the NEXT call is a hit.
 *
 * Callers must only reach here with a COMPLETE stream. A greeting cut short by
 * a barge-in or a hangup is a truncated buffer, and caching it would replay the
 * truncation on every subsequent call to that agent — a permanent, silent
 * regression from a transient event.
 */
export function rememberGreetingAudio(voice, text, opts, buf, contentType) {
  if (!voice || !text || !buf?.length) return;
  if (buf.length > MAX_BYTES) {
    logger.warn(
      `Greeting audio for voice ${voice.id} is ${buf.length} bytes — not caching `
      + `(over ${MAX_BYTES}). Check that this voice is emitting a telephony format.`,
    );
    return;
  }
  const key = keyFor(voice, text, opts);
  cache.delete(key);
  cache.set(key, { buf, contentType, audioFormat: opts.audioFormat ?? null });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Synthesize and cache a greeting ahead of time — fire and forget.
 *
 * Called by the dialler WHILE THE PHONE IS RINGING, which is the one stretch of
 * a phone call where there is nobody to keep waiting. Idempotent, deduplicated
 * across concurrent callers (a campaign dials the same agent 50 times a minute
 * and must not open 50 TTS connections for one sentence), and never throws: a
 * failed warm just means the bridge streams it the old way.
 *
 * @returns {Promise<boolean>} whether the cache holds it afterwards
 */
export async function warmGreetingAudio(voice, text, opts = {}) {
  if (!voice || !text) return false;
  const key = keyFor(voice, text, opts);
  if (cache.has(key)) return true;

  const running = inFlight.get(key);
  if (running) return running;

  const task = (async () => {
    try {
      const { stream, contentType } = await streamSynthesizeVoice(voice, text, {
        fast: true,
        ...(opts.pace ? { pace: opts.pace } : {}),
        ...(opts.audioFormat ? { audioFormat: opts.audioFormat } : {}),
        ...(opts.sampleRate ? { sampleRate: opts.sampleRate } : {}),
      });
      const chunks = [];
      for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      const buf = Buffer.concat(chunks);
      if (!buf.length) return false;
      rememberGreetingAudio(voice, text, opts, buf, contentType);
      return cache.has(key);
    } catch (err) {
      logger.warn(`Greeting pre-synthesis failed (the call will stream it instead): ${err.message}`);
      return false;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

/** Test seam. */
export function _resetGreetingAudioCache() {
  cache.clear();
  inFlight.clear();
}
