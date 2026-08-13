// backend/src/ws/callRecordingTap.js
/**
 * The recording tap every carrier bridge hangs off, so a phone call produces
 * audio the way a web call always has.
 *
 * Extracted rather than repeated for the same reason callFinalizer.js was:
 * there are four bridges (Twilio and Plivo x bundled and modular), and the one
 * thing they would each have to get right is the least obvious part —
 * OUTBOUND AUDIO IS NOT SENT AT THE TIME IT IS HEARD.
 *
 * Nothing paces the agent leg. Engine/TTS bytes go to the carrier as fast as
 * they are produced and the carrier's jitter buffer drains them at realtime, so
 * a 15s reply is handed over in ~3s. Timestamping outbound frames with
 * Date.now() would compress every reply into the moment it was generated: the
 * recording would show the agent talking over a caller who had already
 * finished, and each turn followed by a long silence. Four independent copies
 * of that reasoning would have become four different bugs.
 *
 * So this keeps a playhead — the wall-clock time up to which the carrier has
 * audio buffered — and places each frame where it will actually be HEARD. It is
 * the same rule playoutWindow.js uses for barge-in, generalised to frames of
 * any size, because the bundled engines emit arbitrary chunk lengths while the
 * modular bridge emits exact 20ms frames.
 *
 * Inbound needs none of this: the carrier streams the caller at realtime for
 * the whole call, so arrival time is call time.
 */

import { createCallRecorder } from '../services/voice/callRecorder.js';
import { persistCallRecording } from '../services/callRecordingStore.js';
import { PHONE_SAMPLE_RATE } from '../services/voice/telephonyAudio.js';
import logger from '../lib/logger.js';

/**
 * On by default. Before this, phone and campaign calls stored no audio at all
 * while web calls did — the same agent leaving different evidence depending on
 * which transport a customer happened to use.
 */
const enabled = () => String(process.env.PHONE_RECORDING || 'on').toLowerCase() !== 'off';

/** mu-law is one byte per sample, so bytes map straight to duration. */
const ulawDurationMs = (bytes) => (bytes / PHONE_SAMPLE_RATE) * 1000;

/**
 * @param {object} p
 * @param {string} p.label      names the bridge in log lines
 * @param {number} p.startedAt  Date.now() at call start; all offsets are from here
 * @param {() => number} [p.now] injectable clock, for tests
 * @param {() => object} [p.createRecorder] injectable sink, for tests — the
 *   placement maths below is the whole point of this module and is otherwise
 *   only observable in a finished WAV.
 */
export function createRecordingTap({
  label,
  startedAt,
  now = Date.now,
  createRecorder = createCallRecorder,
}) {
  const recorder = enabled() ? createRecorder() : null;

  /** Wall-clock ms up to which the carrier already holds unplayed audio. */
  let playhead = 0;
  let saved = false;

  return {
    /** False when recording is switched off, so callers can skip work entirely. */
    get active() { return Boolean(recorder); },

    /** One inbound (caller) mu-law frame, as it arrives. */
    inbound(frame) {
      if (recorder && frame?.length) recorder.writeInbound(frame, now() - startedAt);
    },

    /** One outbound (agent) mu-law frame, at the moment it is handed to the carrier. */
    outbound(frame) {
      if (!recorder || !frame?.length) return;
      const at = now();
      // max(): when the carrier had already drained, the gap since is silence
      // rather than buffered audio, so the playhead restarts from now.
      const startsAt = Math.max(playhead, at);
      playhead = startsAt + ulawDurationMs(frame.length);
      recorder.writeOutbound(frame, startsAt - startedAt);
    },

    /**
     * The caller interrupted and the carrier was told to drop what it had
     * buffered. That audio was never heard, so it must not appear in the
     * recording — otherwise the audio shows the agent finishing a sentence the
     * transcript records it being cut off in.
     */
    barge() {
      if (!recorder) return;
      playhead = 0;
      recorder.dropOutboundAfter(now() - startedAt);
    },

    /**
     * Render and store. Guarded, because every carrier ends a call with both a
     * `stop` event and a socket `close`, so bridge cleanup is always reachable
     * twice — unguarded that writes two files and orphans the first.
     */
    save(callLogId) {
      if (!recorder || saved) return;
      saved = true;
      if (!callLogId || !recorder.hasAudio) { recorder.discard(); return; }

      // Off the teardown path: toWav() is one synchronous pass over the whole
      // call, and other calls are live on this single-threaded process.
      setImmediate(async () => {
        try {
          const wav = recorder.toWav();
          const capped = recorder.wasCapped;
          recorder.discard();
          if (!wav) return;
          const result = await persistCallRecording(callLogId, wav);
          if (result.saved) {
            logger.info(
              { callLogId, bytes: result.bytes, ...(capped ? { capped: true } : {}) },
              `${label}: call recording saved`,
            );
          }
        } catch (err) {
          // A lost recording must never surface as a failed call.
          logger.warn({ callLogId, err: err.message }, `${label}: call recording failed`);
        }
      });
    },
  };
}
