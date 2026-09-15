// backend/src/services/voice/playoutWindow.js
/**
 * Tracks the one question a phone bridge's barge-in detector depends on:
 * IS THE CALLER HEARING THE AGENT RIGHT NOW?
 *
 * A browser answers this for itself — it owns the audio element, so it knows
 * when playback ends and can send a `barge` the instant the caller talks over
 * it. A phone call has no client. The bridge hands mu-law frames to a carrier
 * and never hears about them again, so the answer has to be inferred, and
 * inferring it wrong disables barge-in completely while leaving every other
 * part of the call working — which is exactly how it shipped broken.
 *
 * Two things make the naive version wrong, and both are load bearing:
 *
 *  1. GENERATING IS NOT PLAYING. Nothing paces the outbound leg: TTS bytes go
 *     to the carrier as fast as they are produced and the carrier's jitter
 *     buffer plays them at realtime. A 15s reply is shipped in ~3s, so "TTS is
 *     running" is false for the last ~12s — the whole stretch a caller is most
 *     likely to interrupt. `noteFrame()` is the fix: one 20ms mu-law frame is
 *     worth exactly 20ms of playout, and the carrier drains at realtime, so
 *     counting frames gives the far end's finishing time exactly.
 *  2. AN UTTERANCE IS NOT A SENTENCE. The echo grace (a handset feeds our own
 *     audio back up the inbound leg, loudest at onset) must start once per
 *     stretch of speech. voiceTurnStream emits one audio-start per SENTENCE
 *     segment plus one for the filler, and re-arming the grace on each of them
 *     — while segments are generated faster than they play — means the grace
 *     never expires and the detector never looks at a frame. `speakingSince`
 *     therefore only moves when speech begins from silence.
 *  3. QUEUED IS NOT SENT. On a paced carrier (Plivo's ulawPacer, or any agent
 *     with a manual ambience bed) frames wait in OUR queue and only reach
 *     noteFrame() when the 20ms clock releases them, so `endsAt` leads the wire
 *     by about one frame. A cached greeting is pushed into that queue in one
 *     synchronous burst — no clock tick in between — so the moment speakLine()
 *     returned, this reported "not speaking" with the whole greeting still
 *     queued, and armNextTurn() started listening (and the no-input timer)
 *     over the top of it. `queuedMs` is the pacer's answer to "how much have I
 *     been handed that the caller has not heard yet", and it counts as speech.
 *
 * Deliberately not a timer. Everything here is derived from the clock on
 * demand, so an idle call costs nothing and there is no handle to leak.
 */

import { FRAME_MS } from './telephonyAudio.js';

/**
 * @param {object} [opts]
 * @param {number} [opts.frameMs]      playout duration of one emitted frame
 * @param {() => number} [opts.now]    injectable clock, for tests
 * @param {() => number} [opts.queuedMs] ms of audio accepted for playout but
 *   not yet emitted — an outbound pacer's queue. Read live, so a pacer created
 *   (or torn down) after this window is still described correctly.
 */
export function createPlayoutWindow({ frameMs = FRAME_MS, now = Date.now, queuedMs = () => 0 } = {}) {
  let generating = false;
  let endsAt = 0;
  let startedAt = 0;

  const queued = () => Math.max(0, Number(queuedMs()) || 0);
  const isSpeaking = () => generating || now() < endsAt || queued() > 0;

  return {
    isSpeaking,

    /**
     * TTS for a segment has started. Safe to call per sentence: the grace
     * window only restarts when this begins a new stretch of speech.
     */
    beginGenerating() {
      if (!isSpeaking()) startedAt = now();
      generating = true;
    },

    /** TTS is done producing. Playout continues until the carrier drains. */
    endGenerating() {
      generating = false;
    },

    /** One frame was handed to the carrier. */
    noteFrame() {
      // max() rather than a running sum: when the carrier had already gone
      // quiet the gap is not buffered audio, so the clock restarts from now.
      endsAt = Math.max(endsAt, now()) + frameMs;
    },

    /**
     * Barge-in or hangup: nothing is audible any more. Forgets what was SENT;
     * a queue behind `queuedMs` is the pacer's to flush (clearPlayback does
     * both, back to back).
     */
    stop() {
      generating = false;
      endsAt = 0;
    },

    /** ms since this stretch of speech began — the echo grace is measured off it. */
    speakingForMs() {
      return now() - startedAt;
    },

    /** ms of audio the caller has not heard yet — sent, or still queued to send. */
    remainingMs() {
      return Math.max(0, endsAt - now()) + queued();
    },
  };
}
