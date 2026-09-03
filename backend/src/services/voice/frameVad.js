// backend/src/services/voice/frameVad.js
/**
 * A tiny per-frame voice-activity detector for the caller's inbound PCM.
 *
 * WHY THE SERVER NEEDS ITS OWN. The recogniser's `speech_final` is the only
 * end-of-speech signal the turn machinery had, and measured with a wire-level
 * harness (scripts/measure-webcall.mjs) it lands ~1.2-1.4s after the caller's
 * last voiced frame — the configured 300ms `endpointing` plus the recogniser's
 * own decode/transport latency, which nothing here can shorten. That single
 * wait is larger than the LLM's first token and was invisible, because the
 * server never knew when the caller actually stopped.
 *
 * This detector answers that from the audio the server is already holding:
 * every inbound frame gets an RMS, a slowly-adapting noise floor tracks the
 * quiet stretches, and a frame is "voiced" when it sits clearly above the
 * floor AND above an absolute minimum (so a silent, noiseless line never
 * counts its own dither as speech). The transport reads `silenceMs()` and,
 * once it has been quiet for long enough, asks the recogniser to flush what
 * it is holding instead of waiting for it to notice the silence by itself.
 *
 * Deliberately simple and deterministic: no model, no allocation per frame,
 * ~2µs per 20ms frame. It is not a speech/noise classifier; the recogniser's
 * transcript remains the authority on whether WORDS were said. This only
 * decides when the energy stopped.
 */

/** Frames quieter than this never count as speech, whatever the floor. */
const ABSOLUTE_MIN_RMS = 0.004;          // ≈ -48 dBFS
/** A voiced frame must exceed the noise floor by this factor. */
const FLOOR_RATIO = 3.0;
/** Floor adaptation: fast down (quiet reasserts itself), slow up. */
const FLOOR_DOWN = 0.2;
const FLOOR_UP = 0.02;
/** How many consecutive voiced frames before speech is "on" (rejects clicks). */
const ONSET_FRAMES = 2;

/**
 * @param {object} [opts]
 * @param {number} [opts.sampleRate]  informational; the detector is rate-agnostic
 * @param {() => number} [opts.now]   monotonic clock, injectable for tests
 * @param {number} [opts.absoluteMinRms]
 * @param {number} [opts.floorRatio]
 */
export function createFrameVad({ now = () => performance.now(), absoluteMinRms = ABSOLUTE_MIN_RMS, floorRatio = FLOOR_RATIO } = {}) {
  let floor = absoluteMinRms;
  let voicedRun = 0;
  let speaking = false;
  let lastVoicedAt = null;   // clock time of the last frame judged voiced
  let speechStartedAt = null;
  let frames = 0;
  let voicedFrames = 0;

  /** RMS (0..1) of little-endian PCM16 mono. */
  const rmsOf = (buf) => {
    const n = buf.length >> 1;
    if (!n) return 0;
    let acc = 0;
    for (let i = 0; i < buf.length - 1; i += 2) {
      const v = buf.readInt16LE(i) / 32768;
      acc += v * v;
    }
    return Math.sqrt(acc / n);
  };

  return {
    /**
     * Feed one inbound frame. Returns what was decided for it.
     * @param {Buffer} buf PCM16LE mono
     * @returns {{ rms: number, voiced: boolean, speaking: boolean, floor: number }}
     */
    push(buf) {
      const rms = rmsOf(buf);
      const t = now();
      frames += 1;
      const voiced = rms > absoluteMinRms && rms > floor * floorRatio;
      if (voiced) {
        voicedFrames += 1;
        voicedRun += 1;
        if (voicedRun >= ONSET_FRAMES) {
          if (!speaking) { speaking = true; speechStartedAt = t; }
          lastVoicedAt = t;
        }
      } else {
        voicedRun = 0;
        // Only quiet frames teach the floor, and mostly downward: a floor
        // that chased speech upward would eventually call speech "noise".
        floor = rms < floor ? floor + (rms - floor) * FLOOR_DOWN : floor + (rms - floor) * FLOOR_UP;
        if (floor < absoluteMinRms / 4) floor = absoluteMinRms / 4;
        if (speaking && lastVoicedAt != null && t - lastVoicedAt > 0) speaking = false;
      }
      return { rms, voiced, speaking, floor };
    },
    /** ms since the last voiced frame, or null if nothing voiced yet this turn. */
    silenceMs() { return lastVoicedAt == null ? null : now() - lastVoicedAt; },
    /** Has any speech been heard this turn? */
    heardSpeech() { return lastVoicedAt != null; },
    /** Clock time of the last voiced frame (the caller's speech end so far). */
    lastVoicedAt() { return lastVoicedAt; },
    speechStartedAt() { return speechStartedAt; },
    noiseFloor() { return floor; },
    stats() { return { frames, voicedFrames, floor, speaking }; },
    /** New listening segment: forget speech, keep the learned floor. */
    resetTurn() { voicedRun = 0; speaking = false; lastVoicedAt = null; speechStartedAt = null; frames = 0; voicedFrames = 0; },
  };
}
