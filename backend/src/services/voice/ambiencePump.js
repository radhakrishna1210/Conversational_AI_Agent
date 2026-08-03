// backend/src/services/voice/ambiencePump.js
/**
 * Paces outbound µ-law to Twilio at realtime and mixes a continuous ambience
 * bed underneath the agent's speech.
 *
 * WHY A CLOCK AT ALL. Today the phone bridge is purely event-driven: whenever
 * the engine emits audio it is forwarded verbatim, and when the engine is quiet
 * nothing is sent. A background bed has to play during those silences — that is
 * the entire point of ambience — so something must emit frames continuously.
 * This is the only timer in backend/src/ws-adjacent code, and it exists solely
 * because there is no other source of a frame clock.
 *
 * WHY MIXING AND NOT INTERLEAVING. Twilio's outbound leg is ONE mono track.
 * Sending a bed frame between two speech frames does not layer them, it
 * concatenates: every bed frame would push the agent's speech 20ms later, for
 * the whole call. Mixing at sample level is the only correct option, and µ-law
 * is logarithmic so that means decode → sum → re-encode per frame.
 *
 * COST. This is only ever constructed when the agent has a real ambience preset
 * selected. With ambience off the caller keeps the original zero-transcode
 * passthrough and this file is never loaded into the hot path at all. When on,
 * it adds ~10ms average (one frame of queue residency) and rate-limits the
 * engine to realtime instead of letting it burst into Twilio's jitter buffer.
 */

import { createAmbienceSource, mixUlawFrame, ULAW_FRAME_BYTES } from './ambience.js';

const FRAME_MS = 20;                 // 160 samples @ 8kHz
const MAX_FRAMES_PER_TICK = 5;       // cap catch-up after an event-loop stall
const RESYNC_THRESHOLD_MS = 500;     // beyond this, jump the clock instead of bursting
const MAX_QUEUE_FRAMES = 500;        // ~10s of engine audio; drop oldest past this
const MAX_CONSECUTIVE_SEND_FAILURES = 3;

/**
 * @param {object} opts
 * @param {string} opts.presetName  ambience preset; must be a real one
 * @param {(frame: Buffer) => void} opts.send  emits one 160-byte µ-law frame
 * @param {(err: Error) => void} [opts.onError]
 * @returns {{ start(): void, push(buf: Buffer): void, flush(): void,
 *             stop(): void, isRunning(): boolean, stats(): object }|null}
 *   null when the preset is not synthesizable — caller should keep passthrough.
 */
export function createAmbiencePump({ presetName, send, onError }) {
  const bed = createAmbienceSource(presetName);
  if (!bed) return null;

  let timer = null;
  let nextFrameAt = 0;
  let queue = Buffer.alloc(0);   // engine µ-law awaiting its slot on the clock
  let emitted = 0;
  let dropped = 0;
  let maxQueueBytes = 0;
  let sendFailures = 0;

  const emitOne = () => {
    let engineFrame = null;
    if (queue.length >= ULAW_FRAME_BYTES) {
      engineFrame = queue.subarray(0, ULAW_FRAME_BYTES);
      queue = queue.subarray(ULAW_FRAME_BYTES);
    } else if (queue.length > 0) {
      // Tail shorter than a frame: pad with µ-law silence (0xFF) so the frame
      // is still exactly 160 bytes and the engine's last syllable isn't lost.
      engineFrame = Buffer.concat([queue, Buffer.alloc(ULAW_FRAME_BYTES - queue.length, 0xff)]);
      queue = Buffer.alloc(0);
    }

    try {
      send(mixUlawFrame(engineFrame, bed.nextFrame()));
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
    const now = Date.now();
    // A long stall (GC, event-loop block, clock step) must not produce a burst:
    // Twilio buffers whatever it receives, so a burst becomes permanent added
    // latency for the rest of the call. Resync instead of catching up.
    if (now - nextFrameAt > RESYNC_THRESHOLD_MS) nextFrameAt = now;

    let n = 0;
    while (nextFrameAt <= now && n < MAX_FRAMES_PER_TICK) {
      emitOne();
      nextFrameAt += FRAME_MS;
      n += 1;
    }
  };

  function stop() {
    if (!timer) return;     // idempotent: cleanup() in the handler re-enters
    clearInterval(timer);
    timer = null;
  }

  return {
    start() {
      if (timer) return;
      // Derive frame times from the wall clock rather than accumulating interval
      // drift, so the long-run rate is exactly realtime. Emitting even slightly
      // fast makes Twilio's buffer — and therefore speech latency — grow without
      // bound over a multi-minute call.
      nextFrameAt = Date.now();
      timer = setInterval(tick, FRAME_MS);
      if (typeof timer.unref === 'function') timer.unref(); // never hold the process open
    },

    /** Queue engine audio (µ-law) for the next available frame slots. */
    push(buf) {
      if (!timer || !buf?.length) return;
      queue = queue.length ? Buffer.concat([queue, buf]) : Buffer.from(buf);
      const cap = MAX_QUEUE_FRAMES * ULAW_FRAME_BYTES;
      if (queue.length > cap) {
        dropped += Math.ceil((queue.length - cap) / ULAW_FRAME_BYTES);
        queue = queue.subarray(queue.length - cap);  // keep the freshest audio
      }
      if (queue.length > maxQueueBytes) maxQueueBytes = queue.length;
    },

    /**
     * Barge-in: discard engine audio that has not been emitted yet. The bed
     * keeps running — a room does not fall silent because the caller spoke.
     *
     * REQUIRED, not cosmetic. Twilio's `clear` flushes what Twilio already
     * holds, but anything still sitting in THIS queue would be emitted after
     * the clear and resurrect the sentence the caller just interrupted. That is
     * a failure mode the queue itself introduces, so the queue must own the fix.
     */
    flush() {
      queue = Buffer.alloc(0);
    },

    stop,
    isRunning: () => timer !== null,
    stats: () => ({
      emitted,
      dropped,
      queuedFrames: Math.floor(queue.length / ULAW_FRAME_BYTES),
      maxQueueMs: Math.round((maxQueueBytes / ULAW_FRAME_BYTES) * FRAME_MS),
    }),
  };
}
