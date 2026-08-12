// backend/src/services/voice/pcmStreamPacer.js
/**
 * Paces outbound PCM16 to Exotel AgentStream at realtime, in 320-byte-aligned
 * frames carrying the sequence metadata Exotel expects.
 *
 * WHY THIS EXISTS AND THE TWILIO BRIDGE NEEDS NOTHING LIKE IT. Twilio accepts
 * whatever arrives, whenever it arrives: the bundled bridge forwards engine
 * audio verbatim and Twilio's jitter buffer absorbs the burstiness. Exotel does
 * not. Its own reference bridge (github.com/exotel/Agent-Stream,
 * integrations/agents/_shared/wss_server.py) is explicit on three points, each
 * of which is a dropped call rather than a quality nit:
 *
 *   - frames must be multiples of 320 bytes;
 *   - a payload dumped in one message (a whole greeting) or blasted with no
 *     delay correlates with the call hanging up after ~4 seconds, and payloads
 *     over 100KB risk a timeout;
 *   - `chunk`, `timestamp` and `sequenceNumber` on the media event are load
 *     bearing — "omit them and some Connect streams drop / end early".
 *
 * A realtime engine emits audio far faster than realtime (a whole sentence
 * arrives in a few hundred milliseconds), so without a clock every reply would
 * be exactly the burst Exotel drops. This is that clock.
 *
 * WHY NOT REUSE ambiencePump. That one is µ-law specific end to end — 160-byte
 * frames, 0xFF silence, logarithmic mixing — and it emits continuously because
 * a background bed has to play during silence. This emits only when there is
 * something to say, so an idle call costs nothing.
 */

/** Exotel's frame alignment. Every emitted frame is a whole multiple of this. */
export const EXOTEL_FRAME_ALIGN_BYTES = 320;

/**
 * Exotel's own docs call ~100ms the sweet spot, and their reference bridge uses
 * it. It is the default here because the integration is not yet proven against
 * a live account and a dropped call is worse than 100ms of buffering; once real
 * calls are stable, EXOTEL_FRAME_MS=20 gives back that latency (20ms is also a
 * clean 320-byte multiple at all three supported rates).
 */
const DEFAULT_FRAME_MS = 100;

/** Cap catch-up after an event-loop stall, so a hiccup cannot become a burst. */
const MAX_FRAMES_PER_TICK = 3;
/** Past this the clock jumps instead of trying to make up lost frames. */
const RESYNC_THRESHOLD_MS = 500;
/** ~10s of engine audio. Beyond this the oldest is dropped, not the newest. */
const MAX_QUEUE_MS = 10_000;
const MAX_CONSECUTIVE_SEND_FAILURES = 3;

/**
 * @param {object} opts
 * @param {number} opts.sampleRate   8000 | 16000 | 24000 — the rate on the socket
 * @param {(frame: Buffer, meta: {chunk: number, timestampMs: number,
 *          sequenceNumber: number}) => void} opts.send  emits one aligned frame
 * @param {number} [opts.frameMs]    override the frame size
 * @param {(err: Error) => void} [opts.onError]
 * @returns {{ start(): void, push(buf: Buffer): void, flush(): void,
 *             stop(): void, isRunning(): boolean, stats(): object }}
 */
export function createPcmStreamPacer({ sampleRate, send, frameMs, onError }) {
  const ms = Number(frameMs || process.env.EXOTEL_FRAME_MS || DEFAULT_FRAME_MS);

  // Round the frame DOWN to a whole 320 bytes rather than padding up to it:
  // padding would insert silence into the middle of continuous speech, once per
  // frame, for the whole call.
  const rawBytes = Math.floor((sampleRate * ms) / 1000) * 2;
  const frameBytes = Math.max(
    EXOTEL_FRAME_ALIGN_BYTES,
    Math.floor(rawBytes / EXOTEL_FRAME_ALIGN_BYTES) * EXOTEL_FRAME_ALIGN_BYTES,
  );
  // Derive the tick from the frame we actually emit, not from the requested ms —
  // otherwise the alignment rounding above would make us emit slightly fast, and
  // on Exotel emitting fast means an ever-growing playout delay.
  const frameDurationMs = ((frameBytes / 2) / sampleRate) * 1000;
  const maxQueueBytes = Math.ceil((MAX_QUEUE_MS / frameDurationMs)) * frameBytes;

  let timer = null;
  let nextFrameAt = 0;
  let startedAt = 0;
  let queue = Buffer.alloc(0);
  let sequence = 0;
  let emitted = 0;
  let dropped = 0;
  let padded = 0;
  let peakQueueBytes = 0;
  let sendFailures = 0;
  /** Set when push() adds audio; lets a short tail wait one tick for its rest. */
  let grewSinceTick = false;

  const emit = (frame) => {
    sequence += 1;
    try {
      send(frame, {
        chunk: sequence,
        timestampMs: Math.max(0, Date.now() - startedAt),
        sequenceNumber: sequence,
      });
      emitted += 1;
      sendFailures = 0;
    } catch (err) {
      sendFailures += 1;
      onError?.(err);
      // A closed socket throws on every frame; stop rather than log 10x/second.
      if (sendFailures >= MAX_CONSECUTIVE_SEND_FAILURES) stop();
    }
  };

  const tick = () => {
    // stop() can be reached from inside emit() below, i.e. from within this
    // very callback, and a timer callback already dispatched is not unscheduled
    // by clearInterval. Without this, a socket failing on every frame would
    // keep being written to after the pacer had given up.
    if (!timer) return;

    const now = Date.now();
    if (now - nextFrameAt > RESYNC_THRESHOLD_MS) nextFrameAt = now;

    let n = 0;
    while (nextFrameAt <= now && n < MAX_FRAMES_PER_TICK) {
      if (queue.length >= frameBytes) {
        emit(queue.subarray(0, frameBytes));
        queue = queue.subarray(frameBytes);
      } else if (queue.length > 0 && !grewSinceTick) {
        // End of an utterance: the remainder will never reach a full frame, so
        // pad it to alignment with PCM silence (zero, unlike µ-law's 0xFF) and
        // send it. Waiting one tick first means a tail that is merely mid-stream
        // gets its rest rather than being emitted as a short frame.
        const remainder = queue.length % EXOTEL_FRAME_ALIGN_BYTES;
        const tail = remainder
          ? Buffer.concat([queue, Buffer.alloc(EXOTEL_FRAME_ALIGN_BYTES - remainder)])
          : queue;
        queue = Buffer.alloc(0);
        if (remainder) padded += 1;
        emit(tail);
      } else {
        // Nothing to send this tick — either silence, or a partial frame that
        // just arrived and is being given one tick to complete. Realign the
        // clock to the wall so the next frame goes out on time rather than
        // inheriting this gap as catch-up.
        nextFrameAt = now;
        break;
      }
      nextFrameAt += frameDurationMs;
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
      startedAt = Date.now();
      nextFrameAt = startedAt;
      // Tick faster than the frame so a 100ms frame is not systematically late
      // by up to a full frame; the wall-clock schedule above decides what
      // actually goes out.
      timer = setInterval(tick, Math.max(5, Math.round(frameDurationMs / 2)));
      if (typeof timer.unref === 'function') timer.unref();
    },

    /** Queue engine PCM16 for the next frame slots. */
    push(buf) {
      if (!timer || !buf?.length) return;
      queue = queue.length ? Buffer.concat([queue, buf]) : Buffer.from(buf);
      if (queue.length > maxQueueBytes) {
        dropped += Math.ceil((queue.length - maxQueueBytes) / frameBytes);
        queue = queue.subarray(queue.length - maxQueueBytes);  // keep the freshest
      }
      if (queue.length > peakQueueBytes) peakQueueBytes = queue.length;
      grewSinceTick = true;
    },

    /**
     * Barge-in: drop audio not yet emitted.
     *
     * Required, not cosmetic. Exotel's `clear` flushes what Exotel already
     * holds; anything still queued here would go out afterwards and resurrect
     * the sentence the caller just interrupted.
     */
    flush() {
      queue = Buffer.alloc(0);
    },

    stop,
    isRunning: () => timer !== null,
    stats: () => ({
      frameBytes,
      frameDurationMs,
      emitted,
      dropped,
      padded,
      queuedMs: Math.round(((queue.length / 2) / sampleRate) * 1000),
      peakQueuedMs: Math.round(((peakQueueBytes / 2) / sampleRate) * 1000),
    }),
  };
}
