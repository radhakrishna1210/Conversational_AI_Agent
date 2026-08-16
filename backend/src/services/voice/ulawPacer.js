// backend/src/services/voice/ulawPacer.js
/**
 * Paces outbound mu-law to Plivo at realtime, in 20ms / 160-byte frames.
 *
 * WHY THIS EXISTS, AND WHY IT DID NOT UNTIL NOW. The Plivo bridges were built on
 * the assumption — written into plivoMediaModular.handler.js's own header — that
 * Plivo, like Twilio, absorbs whatever arrives whenever it arrives, and that only
 * Exotel needs a clock. That conflated frame SIZE with frame CADENCE. We were
 * emitting correctly sized 160-byte frames as fast as the TTS stream yielded
 * them, so a whole sentence left in tens of milliseconds.
 *
 * Plivo support, 2026-08-16, on their media infrastructure:
 *
 *   "Our media infrastructure consumes audio from your WebSocket at a fixed 20ms
 *    frame cadence (160 bytes per frame at 8kHz mu-law). [...] Bursting audio
 *    faster than real-time: audio plays correctly, but perceived latency grows
 *    proportionally to how deep the buffer gets. Do not send audio faster than
 *    real-time."
 *
 * That is why this is a latency fix and not a correctness one, and why it was
 * invisible for so long: Exotel DROPS a burst (loud, ~4s hangup) and Twilio
 * ABSORBS one (harmless). Plivo accepts it and quietly plays further and further
 * behind, which presents as "the phone agent is slow" — indistinguishable from a
 * slow LLM without measuring, and we spent a while blaming the LLM.
 *
 * WHY NOT REUSE THE TWO CLOCKS WE ALREADY HAVE.
 *   - ambiencePump is mu-law and 160-byte, but emits CONTINUOUSLY because a
 *     background bed has to play during silence, and it mixes every frame. On an
 *     agent with no ambience preset that is a per-frame mix of nothing, forever.
 *     It is also constructed only when a real preset is selected, which is why
 *     most agents were bursting even on the bundled path.
 *   - pcmStreamPacer has exactly the right shape — a clock that emits only when
 *     there is something to say — but is PCM16 end to end: 320-byte alignment,
 *     zero-valued silence, and the chunk/timestamp/sequenceNumber metadata
 *     Exotel requires and Plivo has no field for.
 *
 * So: pcmStreamPacer's shape, ambiencePump's mu-law frame. The interface is
 * deliberately identical to ambiencePump's, so plivoMediaRealtime.handler.js can
 * take either one and its existing start/push/flush/stop wiring is unchanged.
 */

import { ULAW_FRAME_BYTES } from './ambience.js';

/** 160 mu-law bytes = 160 samples at 8kHz = exactly 20ms, Plivo's cadence. */
const FRAME_MS = 20;
/** Cap catch-up after an event-loop stall, so a hiccup cannot become a burst. */
const MAX_FRAMES_PER_TICK = 5;
/** Past this the clock jumps to the wall instead of trying to make up frames. */
const RESYNC_THRESHOLD_MS = 500;
/** ~10s of speech. Beyond this the OLDEST is dropped — the freshest audio is
 *  the audio still worth playing. */
const MAX_QUEUE_FRAMES = 500;
const MAX_CONSECUTIVE_SEND_FAILURES = 3;

/**
 * @param {object} opts
 * @param {(frame: Buffer) => void} opts.send  emits one 160-byte mu-law frame
 * @param {(err: Error) => void} [opts.onError]
 * @returns {{ start(): void, push(buf: Buffer): void, flush(): void,
 *             stop(): void, isRunning(): boolean, stats(): object }}
 */
export function createUlawPacer({ send, onError }) {
  let timer = null;
  let nextFrameAt = 0;
  let queue = Buffer.alloc(0);
  let emitted = 0;
  let dropped = 0;
  let padded = 0;
  let maxQueueBytes = 0;
  let sendFailures = 0;
  /** Set by push(); lets a partial frame wait one tick for the rest of itself. */
  let grewSinceTick = false;

  const emit = (frame) => {
    try {
      send(frame);
      emitted += 1;
      sendFailures = 0;
    } catch (err) {
      sendFailures += 1;
      onError?.(err);
      // A closed socket throws on every frame; stop rather than log 50x/second.
      if (sendFailures >= MAX_CONSECUTIVE_SEND_FAILURES) stop();
    }
  };

  const tick = () => {
    // stop() is reachable from inside emit() above, i.e. from within this very
    // callback, and a timer callback already dispatched is not unscheduled by
    // clearInterval. Without this a socket failing on every frame would keep
    // being written to after the pacer had given up.
    if (!timer) return;

    const now = Date.now();
    // A long stall (GC, event-loop block, clock step) must not produce a burst —
    // that is the exact failure this whole file exists to prevent. Resync.
    if (now - nextFrameAt > RESYNC_THRESHOLD_MS) nextFrameAt = now;

    let n = 0;
    while (nextFrameAt <= now && n < MAX_FRAMES_PER_TICK) {
      if (queue.length >= ULAW_FRAME_BYTES) {
        emit(queue.subarray(0, ULAW_FRAME_BYTES));
        queue = queue.subarray(ULAW_FRAME_BYTES);
      } else if (queue.length > 0 && !grewSinceTick) {
        // End of an utterance: this remainder will never reach a full frame, so
        // pad it with mu-law silence (0xFF, not zero) and send it, rather than
        // holding the last syllable until the next turn. Waiting one tick first
        // means a tail that is merely mid-stream gets its rest instead.
        const tail = Buffer.concat([
          queue,
          Buffer.alloc(ULAW_FRAME_BYTES - queue.length, 0xff),
        ]);
        queue = Buffer.alloc(0);
        padded += 1;
        emit(tail);
      } else {
        // Nothing to send — silence between turns, or a partial frame being
        // given its tick. Rebase a full frame ahead, not to `now`: `now` means
        // "due already", so the next tick would find this slot 20ms late AND
        // its own slot due, and emit two frames back to back. One frame of
        // head start is not fatal but it is the same bug in miniature.
        nextFrameAt = now + FRAME_MS;
        break;
      }
      nextFrameAt += FRAME_MS;
      n += 1;
    }
    grewSinceTick = false;
  };

  function stop() {
    if (!timer) return;   // idempotent: cleanup() is reachable more than once
    clearInterval(timer);
    timer = null;
  }

  return {
    start() {
      if (timer) return;
      // Derive frame times from the wall clock rather than accumulating interval
      // drift. Emitting even slightly fast is the same bug in slow motion: the
      // playback queue grows without bound over a multi-minute call.
      //
      // One frame ahead, not `Date.now()`: the first tick fires 20ms from now,
      // by which time a slot dated now would be due alongside the tick's own,
      // and the call would open by emitting two frames at once.
      nextFrameAt = Date.now() + FRAME_MS;
      timer = setInterval(tick, FRAME_MS);
      if (typeof timer.unref === 'function') timer.unref(); // never hold the process open
    },

    /** Queue synthesized mu-law for the next available frame slots. */
    push(buf) {
      if (!timer || !buf?.length) return;
      queue = queue.length ? Buffer.concat([queue, buf]) : Buffer.from(buf);
      const cap = MAX_QUEUE_FRAMES * ULAW_FRAME_BYTES;
      if (queue.length > cap) {
        dropped += Math.ceil((queue.length - cap) / ULAW_FRAME_BYTES);
        queue = queue.subarray(queue.length - cap);   // keep the freshest audio
      }
      if (queue.length > maxQueueBytes) maxQueueBytes = queue.length;
      grewSinceTick = true;
    },

    /**
     * Barge-in: discard audio not yet emitted.
     *
     * REQUIRED, not cosmetic — the same trap ambiencePump documents. Plivo's
     * `clearAudio` flushes what PLIVO holds; anything still sitting in this
     * queue would be emitted immediately afterwards and resurrect the sentence
     * the caller just interrupted. The queue introduces that failure, so the
     * queue owns the fix.
     */
    flush() {
      queue = Buffer.alloc(0);
    },

    stop,
    isRunning: () => timer !== null,
    stats: () => ({
      emitted,
      dropped,
      padded,
      queuedFrames: Math.floor(queue.length / ULAW_FRAME_BYTES),
      maxQueueMs: Math.round((maxQueueBytes / ULAW_FRAME_BYTES) * FRAME_MS),
    }),
  };
}
