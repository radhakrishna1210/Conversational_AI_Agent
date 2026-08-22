/**
 * One 20ms ticker for the whole process, instead of one per call.
 *
 * WHY THIS EXISTS — it is a bulk-campaign fix, not a single-call one. The API,
 * the dialler and every live bridge share a single event loop (PM2 runs this
 * app `exec_mode: 'fork', instances: 1`), on a box that also hosts several
 * other apps. Each outbound pacer used to own a `setInterval(tick, 20)`, so 45
 * concurrent calls meant 45 timers and ~2250 timer callbacks a second competing
 * with the frame work itself. When the loop slipped, every one of those timers
 * came due AT ONCE and each call's playback queue deepened together — which is
 * precisely why bulk latency was worse than a single call, and why it grew as a
 * campaign ramped up rather than staying flat.
 *
 * Collapsing them to one timer that walks a subscriber list turns 2250
 * callbacks/second into 50, and makes the pacers' work sequential-by-
 * construction rather than an interleaved stampede.
 *
 * SAFE BECAUSE THE PACERS ARE WALL-CLOCK DRIVEN. A pacer decides what to emit
 * from `Date.now()` against its own `nextFrameAt`, never from how many times it
 * has been ticked, and it resyncs after a long stall. So a shared tick that
 * arrives early, late, or coalesced produces the same output as a private one —
 * this changes who calls `tick`, not what `tick` decides. Do NOT subscribe a
 * pacer that counts ticks instead of reading the clock (pcmStreamPacer runs on
 * its own half-frame cadence and deliberately stays independent).
 */

const FRAME_MS = 20;

/** @type {Set<() => void>} */
const subscribers = new Set();
let timer = null;

function runAll() {
  for (const tick of subscribers) {
    // One call's pacer must never take down every other live call's audio.
    // A pacer that throws here has already failed for its own socket; the
    // remaining subscribers are unrelated calls and must keep their cadence.
    try {
      tick();
    } catch {
      /* the pacer owns its own error reporting via onError */
    }
  }
}

/**
 * Run `tick` about every 20ms for as long as the returned function is uncalled.
 *
 * @param {() => void} tick
 * @returns {() => void} unsubscribe — idempotent, stops the shared timer when
 *   the last subscriber leaves so an idle process holds no interval at all.
 */
export function subscribeFrameClock(tick) {
  subscribers.add(tick);
  if (!timer) {
    timer = setInterval(runAll, FRAME_MS);
    // Never hold the process open: a live call is not a reason to refuse exit.
    if (typeof timer.unref === 'function') timer.unref();
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    subscribers.delete(tick);
    if (!subscribers.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Live subscriber count — for tests and event-loop instrumentation. */
export const frameClockSubscribers = () => subscribers.size;
