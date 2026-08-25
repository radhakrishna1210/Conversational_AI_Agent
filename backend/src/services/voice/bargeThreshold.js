// backend/src/services/voice/bargeThreshold.js
/**
 * How loud the caller has to be, on THIS line, to be believed over the agent.
 *
 * ── WHY THIS IS ITS OWN FILE ────────────────────────────────────────────────
 *
 * It used to be three constants and a `Math.max` inline in the phone bridge,
 * and the numbers were wrong for four months without anything being able to say
 * so. They are the only part of barge-in that can be checked against a
 * published standard rather than against a live call, so they are worth having
 * somewhere a test can reach without opening a socket.
 *
 * ── THE LEVELS THIS HAS TO SIT AMONG ────────────────────────────────────────
 *
 * All figures RMS over one 20ms frame of PCM16, and dBFS relative to 32768:
 *
 *   ITU-T P.56 nominal telephony speech       -26.0 dBFS   rms 1642
 *   telephony VAD "candidate for speech"      > -35  dBFS   rms  583
 *   telephony VAD tuning band               -50..-30 dBFS   rms 104-1036
 *   telephony VAD "this is silence"           < -45  dBFS   rms  184
 *
 * P.56's figure is the ACTIVE speech level — measured across the speaking
 * parts only, with pauses excluded — so an ordinary caller's per-frame RMS is
 * distributed around 1642 and spends a good deal of its time below it. Any
 * fixed bar set near or above that number is not a floor under a detector, it
 * IS the detector, and it rejects most of what a person says.
 *
 * ── WHAT WENT WRONG ─────────────────────────────────────────────────────────
 *
 * The floor was 2500 (-22.4 dBFS): 3.6dB above P.56 nominal, 7.6dB above the
 * loud end of the band telephony VADs are tuned within. Two consequences, and
 * the second is the one that hid the first:
 *
 *   1. a caller at an entirely normal level could not clear it — and had to
 *      clear it five frames running to interrupt anything;
 *   2. because the effective threshold is `max(floor, noiseFloor * margin)`,
 *      the measured term could only win once the LINE'S OWN NOISE exceeded
 *      2500/3 = 833 (-31.9 dBFS). A noise floor louder than most people's
 *      speech. So the adaptive design never ran, every call used the constant,
 *      and "we measure this line" was true only in the comments.
 *
 * The floor exists for a real case — an unnaturally quiet line, where three
 * times almost-nothing is still almost-nothing — so it is kept, at a level
 * taken from the VAD band instead of from above it.
 */

/**
 * Absolute floor for BARGE-IN, which cuts the agent off mid-word.
 *
 * -34.8 dBFS, the "candidate for speech" level. Safe to sit this low only
 * because barge-in is guarded four other ways downstream: the adaptive term
 * below, a run of consecutive frames, an echo grace window after the agent
 * starts speaking, and the echo canceller's own verdict on whether a frame is
 * the agent coming back up the line. The energy is also measured after echo
 * subtraction. Raise this first if false barges appear on live traffic.
 */
export const BARGE_RMS_MIN = Number(process.env.PHONE_BARGE_RMS) || 600;

/**
 * Absolute floor for OVERLAP RECOVERY, which only decides whether words already
 * transcribed are worth keeping.
 *
 * Deliberately lower than the barge floor. A false barge is a caller cut off
 * for nothing; a false overlap is a few words that then have to survive
 * stripOverlapEcho() and isEchoOfAgent() before anyone acts on them. Sharing
 * one constant applied the expensive decision's caution to the cheap one, and
 * the cheap one is where a quiet caller's answer was being dropped.
 *
 * -40.8 dBFS: above the level at which a telephony VAD stops calling anything
 * speech, below anything a person says on purpose.
 */
export const OVERLAP_RMS_MIN = Number(process.env.PHONE_OVERLAP_RMS) || 300;

/**
 * How far above the line's measured noise floor speech has to sit.
 *
 * This is the term that is supposed to do the work — a threshold derived from
 * what THIS call's line actually sounds like, rather than a number guessed in
 * advance for every line at once.
 */
export const BARGE_MARGIN = Number(process.env.PHONE_BARGE_MARGIN) || 3;

/**
 * The two thresholds for a line whose noise floor has been measured at
 * `noiseFloor` (RMS, PCM16).
 *
 * @param {number} noiseFloor
 * @returns {{ barge: number, overlap: number }}
 */
export function bargeThresholds(noiseFloor) {
  const measured = (Number.isFinite(noiseFloor) ? noiseFloor : 0) * BARGE_MARGIN;
  return {
    barge: Math.max(BARGE_RMS_MIN, measured),
    overlap: Math.max(OVERLAP_RMS_MIN, measured),
  };
}

/** Full-scale for PCM16, so the dBFS helpers below read as arithmetic. */
const FULL_SCALE = 32768;

/** RMS (PCM16) → dBFS. Exported because every judgement about these numbers is
 *  made in dB and made against published levels, not in raw counts. */
export const rmsToDbfs = (rms) => 20 * Math.log10(rms / FULL_SCALE);

/** dBFS → RMS (PCM16). */
export const dbfsToRms = (dbfs) => FULL_SCALE * 10 ** (dbfs / 20);

/** ITU-T P.56 nominal active speech level for telephony. The number every
 *  threshold here has to be judged against. */
export const NOMINAL_SPEECH_DBFS = -26;
