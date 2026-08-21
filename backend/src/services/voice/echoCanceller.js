// backend/src/services/voice/echoCanceller.js
/**
 * Acoustic echo cancellation for a carrier leg.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * A browser hands us a microphone feed with the page's own audio already
 * subtracted — getUserMedia does AEC for free — so the web bridge can listen
 * continuously and never has to wonder whether what it heard was the caller or
 * itself. A phone line has nothing of the sort: the handset feeds our own reply
 * straight back up the inbound leg, at a level comparable to the caller.
 *
 * Everything the phone bridge does differently from the web bridge follows from
 * that one fact, and all of it costs the caller words:
 *
 *   - it goes DEAF for the whole tail of every reply (armNextTurn waits for
 *     playout to drain before beginTurn(), which clears Deepgram's buffer);
 *   - what the caller said in that window survives only if harvestOverlap()
 *     rescues it, which it decides with a TEXT heuristic — strip the agent's
 *     own words and see what is left. A caller answering a Hindi question in
 *     Hindi looks like the agent, so their answer is discarded as echo and all
 *     that survives is a fragment;
 *   - barge-in has to use a high energy threshold and a 500ms grace window,
 *     because during playout the inbound leg is dominated by echo, so raw RMS
 *     cannot tell a caller from ourselves.
 *
 * Subtracting our own signal is what removes the need for every one of those
 * compromises, and it is available to us: we hold the exact bytes we wrote to
 * the wire, and the inbound frames arrive on the same socket.
 *
 * ── HOW ─────────────────────────────────────────────────────────────────────
 *
 * Two stages, because the echo path is a long delay followed by a short smear:
 *
 *   1. BULK DELAY. Round trip to the far handset and back is 100-400ms and
 *      varies per call, which is far too long to cover with filter taps. It is
 *      found by cross-correlating the per-frame ENERGY ENVELOPES of the
 *      reference and the inbound leg — 20ms resolution, a few thousand
 *      operations every half second, rather than a sample-level search.
 *   2. SHORT ADAPTIVE FILTER. Whatever dispersion is left after aligning —
 *      handset acoustics, codec ringing, the ±10ms the envelope search cannot
 *      resolve — is handled by a 128-tap NLMS filter centred on the estimated
 *      delay. 16ms of span at 8kHz.
 *
 * ── WHY THIS IS SAFE TO PUT ON A LIVE CALL ──────────────────────────────────
 *
 * The failure mode of a bad canceller is chewing up the caller's speech, which
 * is worse than the problem it solves. Four things bound that:
 *
 *   - IT ONLY RUNS WHILE WE ARE SPEAKING. With no reference energy there is no
 *     echo to cancel, so the frame is returned untouched. For the majority of a
 *     call — the part where the bridge is listening and the caller is talking —
 *     this module is a passthrough and cannot affect anything.
 *   - ADAPTATION FREEZES DURING DOUBLE TALK. Updating the filter while the
 *     caller is speaking is what makes an NLMS filter diverge and start
 *     subtracting the caller. Standard practice, and the reason the residual
 *     ratio is computed before the coefficients are touched.
 *   - THE OUTPUT IS CLAMPED. If the "cancelled" frame is louder than what came
 *     in, the filter is not helping, so the input is returned unchanged and the
 *     filter is reset.
 *   - IT CAN BE TURNED OFF WITHOUT A RELEASE. PHONE_AEC_ENABLED=false makes
 *     every call a passthrough.
 *
 * Cost is bounded too: ~2 x 128 multiply-accumulates per sample at 8kHz, and
 * only while the agent is audible, so roughly 2M ops/second on a speaking call
 * and nothing on a listening one. That matters because one Node process carries
 * every live call (see B1 in docs/PHONE_VS_WEB_LATENCY_ROOT_CAUSE.md).
 */

/** Carrier legs are 8kHz G.711, always. */
const SAMPLE_RATE = 8000;
/** 160 samples = 20ms, one carrier frame. */
const FRAME_SAMPLES = 160;

/**
 * Longest echo round trip we will hunt for.
 *
 * PSTN gives us network transit to the carrier, carrier to handset, the
 * acoustic path at the far end, and all of it back. 500ms is generous; the cost
 * of searching further is a bigger ring buffer, and the cost of searching too
 * little is never finding the echo at all.
 */
const MAX_DELAY_MS = Number(process.env.PHONE_AEC_MAX_DELAY_MS) || 500;
const MAX_DELAY_SAMPLES = Math.round((MAX_DELAY_MS / 1000) * SAMPLE_RATE);

/** Adaptive filter span. 128 taps = 16ms at 8kHz. */
const TAPS = Number(process.env.PHONE_AEC_TAPS) || 128;

/**
 * NLMS step size. Below 1 for stability; 0.3 converges in a second or two of
 * speech without the coefficient noise that a step near 1 produces.
 */
const MU = Number(process.env.PHONE_AEC_MU) || 0.3;

/** Frames of envelope history kept for the delay search. 150 x 20ms = 3s. */
const ENVELOPE_FRAMES = 150;
/** Re-run the delay search this often (in frames). 25 x 20ms = every 500ms. */
const DELAY_SEARCH_EVERY = 25;
/** Lags searched, in FRAMES. 25 x 20ms = 500ms, matching MAX_DELAY_MS. */
const MAX_LAG_FRAMES = Math.ceil(MAX_DELAY_SAMPLES / FRAME_SAMPLES);

/**
 * Reference RMS below which we are, for practical purposes, not speaking.
 *
 * mu-law silence still decodes to a small non-zero value, and an ambience bed
 * sits well under this. Deliberately low enough that quiet speech still counts
 * as reference — a missed cancellation is recoverable, a frame processed
 * against a silent reference is not useful.
 */
const REF_ACTIVE_RMS = Number(process.env.PHONE_AEC_REF_FLOOR) || 180;

/**
 * Residual-to-input RMS ratio above which we call it double talk.
 *
 * Pure echo cancels down to a small fraction of what arrived. When the caller
 * is talking at the same time, most of the frame is theirs and survives the
 * subtraction, so the ratio stays high. 0.5 is deliberately permissive: the
 * cost of a false "double talk" is one frozen filter update, and the cost of a
 * missed one is the filter adapting to the caller's voice.
 */
const DOUBLE_TALK_RATIO = Number(process.env.PHONE_AEC_DT_RATIO) || 0.5;

const enabled = () => process.env.PHONE_AEC_ENABLED !== 'false';

const rmsOf = (buf, from = 0, len = buf.length - from) => {
  if (len <= 0) return 0;
  let sum = 0;
  for (let i = from; i < from + len; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / len);
};

/**
 * @typedef {object} AecResult
 * @property {Int16Array} pcm        echo-reduced inbound audio, or the input untouched
 * @property {boolean} refActive     were we audible on this frame?
 * @property {boolean} doubleTalk    is the caller talking over us right now?
 * @property {number} residualRatio  residual RMS / input RMS (1 = nothing removed)
 * @property {number} delayMs        currently estimated echo round trip
 * @property {boolean} converged     has the filter locked onto an echo path?
 */

/**
 * @param {object} [opts]
 * @param {number} [opts.taps]
 * @returns {{ reference(pcm: Int16Array): void,
 *             process(pcm: Int16Array): AecResult,
 *             reset(): void, stats(): object }}
 */
export function createEchoCanceller({ taps = TAPS } = {}) {
  // Ring of everything we have written to the wire, as floats. Sized to hold
  // the longest delay we search for plus the filter span, rounded to a power of
  // two so the index wrap is a mask rather than a modulo.
  const ringSize = 1 << Math.ceil(Math.log2(MAX_DELAY_SAMPLES + taps + FRAME_SAMPLES * 4));
  const ringMask = ringSize - 1;
  const ring = new Float32Array(ringSize);
  let ringWrite = 0;          // next write index
  let refWritten = 0;         // total samples ever written, for absolute positions

  const w = new Float32Array(taps);
  let micTotal = 0;           // total inbound samples ever seen

  // Per-frame RMS envelopes, as ring buffers, for the bulk-delay search.
  const refEnv = new Float32Array(ENVELOPE_FRAMES);
  const micEnv = new Float32Array(ENVELOPE_FRAMES);
  let envIdx = 0;
  let envFilled = 0;
  let framesSinceSearch = 0;

  let delaySamples = 0;
  let haveDelay = false;
  let converged = false;
  let diverged = 0;

  // Reference window. Scratch is fine here: it never leaves this module.
  const x = new Float32Array(FRAME_SAMPLES + taps);

  /**
   * Consecutive double-talk frames while we were audible.
   *
   * A converged filter that suddenly stops cancelling is ambiguous: either the
   * caller is talking (freeze, correctly) or the echo path moved and the
   * coefficients are now wrong (freeze, and never recover — the filter is
   * frozen precisely because it is broken). Long runs mean the second, so
   * convergence is dropped and adaptation is allowed to find the new path.
   */
  let dtStreak = 0;

  /** Previous frame's residual ratio — the double-talk detector's one-frame memory. */
  let lastRatio = 1;

  /**
   * Cross-correlate the two energy envelopes to find the bulk echo delay.
   *
   * Envelopes rather than samples because the echo of speech is speech-shaped:
   * its loud and quiet stretches line up with ours even when the waveform does
   * not survive the codec. It is also three orders of magnitude cheaper than a
   * sample-level search over 4000 lags, which is what makes it affordable to
   * re-run while the call is live.
   */
  function searchDelay() {
    if (envFilled < MAX_LAG_FRAMES + 10) return;

    const at = (buf, i) => buf[(envIdx - 1 - i + ENVELOPE_FRAMES * 2) % ENVELOPE_FRAMES];
    const n = Math.min(envFilled - MAX_LAG_FRAMES, ENVELOPE_FRAMES - MAX_LAG_FRAMES);

    let bestLag = -1;
    let bestScore = 0;
    for (let lag = 0; lag <= MAX_LAG_FRAMES; lag++) {
      let dot = 0;
      let em = 0;
      let er = 0;
      for (let i = 0; i < n; i++) {
        const m = at(micEnv, i);
        const r = at(refEnv, i + lag);
        dot += m * r;
        em += m * m;
        er += r * r;
      }
      if (em <= 0 || er <= 0) continue;
      const score = dot / Math.sqrt(em * er);
      if (score > bestScore) { bestScore = score; bestLag = lag; }
    }

    // A weak best is no answer at all. Correlated speech envelopes score high;
    // noise against noise does not, and locking onto noise would point the
    // filter at a stretch of reference that has nothing to do with this frame.
    if (bestLag < 0 || bestScore < 0.6) return;

    const found = bestLag * FRAME_SAMPLES;
    if (!haveDelay || Math.abs(found - delaySamples) > FRAME_SAMPLES) {
      // The path moved (or this is the first lock): the old coefficients
      // describe a delay that no longer applies, so they are worse than none.
      w.fill(0);
      converged = false;
    }
    delaySamples = found;
    haveDelay = true;
  }

  return {
    /** One frame of what we just handed the carrier. */
    reference(pcm) {
      if (!pcm?.length) return;
      for (let i = 0; i < pcm.length; i++) {
        ring[(ringWrite + i) & ringMask] = pcm[i];
      }
      ringWrite = (ringWrite + pcm.length) & ringMask;
      refWritten += pcm.length;
    },

    /**
     * One inbound frame. Returns it with our own audio subtracted when we were
     * audible, and untouched when we were not.
     */
    process(pcm) {
      const passthrough = {
        pcm, refActive: false, doubleTalk: false, residualRatio: 1,
        delayMs: haveDelay ? (delaySamples / SAMPLE_RATE) * 1000 : 0, converged,
      };
      if (!enabled() || !pcm?.length || pcm.length !== FRAME_SAMPLES) return passthrough;

      micTotal += pcm.length;

      // ── envelopes, always, so the delay search has history the moment the
      // agent starts speaking rather than a second afterwards ──────────────
      const micRms = rmsOf(pcm);
      // The reference frame for THIS moment is the one written `delaySamples`
      // ago; for the envelope we just want "were we speaking recently", so the
      // most recent frame is the right thing to record.
      const refRecentStart = (ringWrite - FRAME_SAMPLES + ringSize) & ringMask;
      let refRecent = 0;
      for (let i = 0; i < FRAME_SAMPLES; i++) {
        const v = ring[(refRecentStart + i) & ringMask];
        refRecent += v * v;
      }
      refRecent = Math.sqrt(refRecent / FRAME_SAMPLES);

      micEnv[envIdx] = micRms;
      refEnv[envIdx] = refRecent;
      envIdx = (envIdx + 1) % ENVELOPE_FRAMES;
      if (envFilled < ENVELOPE_FRAMES) envFilled += 1;

      if (++framesSinceSearch >= DELAY_SEARCH_EVERY) {
        framesSinceSearch = 0;
        searchDelay();
      }

      // ── Not speaking: nothing to cancel, and nothing to risk ─────────────
      //
      // This is the branch the majority of a call takes. Returning the input
      // untouched means the canceller cannot degrade the audio the bridge
      // listens to while the caller has the floor.
      //
      // `refRecent` is only a cheap pre-filter — it asks "were we speaking a
      // moment ago", which is enough to skip the work when we are plainly
      // silent. The decision that matters uses the ALIGNED reference below,
      // because the echo landing on this frame was emitted `delaySamples` ago,
      // not now.
      if (!haveDelay || refRecent < REF_ACTIVE_RMS) return passthrough;

      // Reference window aligned to the estimated delay, centred so the taps
      // span the ±10ms the envelope search cannot resolve.
      //
      // Absolute position of this frame's first sample in the reference stream,
      // stepped back by the echo delay and half the filter.
      const startAbs = micTotal - FRAME_SAMPLES - delaySamples - (taps >> 1);
      if (startAbs < 0 || refWritten - startAbs > ringSize - FRAME_SAMPLES) return passthrough;

      const startIdx = (ringWrite - (refWritten - startAbs) + ringSize * 2) & ringMask;
      for (let i = 0; i < FRAME_SAMPLES + taps; i++) x[i] = ring[(startIdx + i) & ringMask];

      // The reference that actually produced this frame's echo. `refRecent`
      // above cannot answer this: at the start of an utterance it is loud while
      // no echo has arrived yet, and at the end it is silent while the tail is
      // still coming back.
      const refAlignedRms = rmsOf(x, taps >> 1, FRAME_SAMPLES);
      if (refAlignedRms < REF_ACTIVE_RMS) return passthrough;

      // A fresh buffer per frame, deliberately. Reusing one scratch array made
      // every returned frame alias the same memory, so anything that held a
      // frame for later — a turn-audio buffer, a test — saw whatever the most
      // recent frame happened to contain. 320 bytes at 50Hz is not worth the
      // class of bug it buys.
      const out = new Int16Array(FRAME_SAMPLES);

      const inRms = rmsOf(pcm);

      // ── Should this frame adapt the filter? ───────────────────────────────
      //
      // Decided BEFORE filtering, because the update is interleaved with it and
      // cannot wait for a whole-frame verdict. The level test needs no filter
      // at all; the residual test uses the PREVIOUS frame's ratio, which is the
      // ordinary one-frame latency every double-talk detector carries.
      const muchLouderThanReference = inRms > refAlignedRms * 1.6;
      const suspectDoubleTalk = converged
        ? (lastRatio > DOUBLE_TALK_RATIO || muchLouderThanReference)
        : muchLouderThanReference;

      // ── filter ────────────────────────────────────────────────────────────
      //
      // ONE INTERLEAVED PASS, not "filter the frame, then update the frame".
      //
      // NLMS is a per-sample algorithm: each update must be computed from the
      // error the CURRENT coefficients produced. Filtering all 160 samples with
      // a stale w and then applying 160 updates derived from it overshoots by
      // roughly the block length — the first cut of this file did exactly that
      // and the filter diverged on three frames out of four, tripping the
      // safety clamp and cancelling nothing at all.
      //
      // `energy` slides rather than being recomputed per sample: one add and
      // one subtract instead of `taps` multiplies, which is what keeps this
      // affordable with every live call in one process.
      let resSum = 0;
      let energy = 1e-6;
      for (let k = 0; k < taps; k++) energy += x[k] * x[k];

      for (let n = 0; n < FRAME_SAMPLES; n++) {
        let y = 0;
        for (let k = 0; k < taps; k++) y += w[k] * x[n + k];
        const e = pcm[n] - y;
        out[n] = e < -32768 ? -32768 : e > 32767 ? 32767 : (e | 0);
        resSum += e * e;

        if (!suspectDoubleTalk) {
          const step = (MU * e) / energy;
          for (let k = 0; k < taps; k++) w[k] += step * x[n + k];
        }

        // Slide the window energy on to the next sample.
        energy += x[n + taps] * x[n + taps] - x[n] * x[n];
        if (energy < 1e-6) energy = 1e-6;
      }

      const resRms = Math.sqrt(resSum / FRAME_SAMPLES);
      const ratio = inRms > 0 ? resRms / inRms : 1;
      lastRatio = ratio;

      // ── Is the caller talking over us? ───────────────────────────────────
      //
      // TWO TESTS, because neither works alone.
      //
      // The residual ratio is the good signal, but it is only meaningful once
      // the filter has something to say. Before convergence w is all zeros, so
      // the residual IS the input, the ratio is 1.0, and a ratio-only detector
      // declares double talk on the very first frame and freezes adaptation
      // forever — the filter can never converge because it is frozen, and it is
      // frozen because it never converged. That deadlock is why an earlier cut
      // of this file cancelled nothing at all.
      //
      // So before convergence the ratio is ignored and a Geigel-style level
      // test stands in: echo cannot be much louder than the signal that caused
      // it, so a frame far louder than the aligned reference is somebody else.
      // It is coarse, which is exactly right for a bootstrap — it only has to
      // stop the filter modelling a caller who talks through the greeting.
      const doubleTalk = converged
        ? (ratio > DOUBLE_TALK_RATIO || muchLouderThanReference)
        : muchLouderThanReference;

      // ── Diverged? Give up on this path rather than eat the caller ────────
      if (!Number.isFinite(ratio) || ratio > 1.5) {
        diverged += 1;
        w.fill(0);
        converged = false;
        dtStreak = 0;
        lastRatio = 1;
        return { ...passthrough, refActive: true, doubleTalk: true, residualRatio: 1 };
      }

      // ── adapt, unless the caller is talking ──────────────────────────────
      //
      // Freezing during double talk is the single thing that keeps an NLMS
      // filter from modelling the CALLER as if they were echo — which is how a
      // canceller ends up deleting the speech it exists to protect.
      if (doubleTalk) {
        dtStreak += 1;
        // Sustained double talk on a converged filter is far more likely to be
        // a moved echo path than a caller who has been talking for two seconds
        // straight without a gap. Let it re-adapt rather than stay frozen and
        // useless for the rest of the call.
        if (converged && dtStreak > 100) { converged = false; dtStreak = 0; }
      } else {
        dtStreak = 0;
        for (let n = 0; n < FRAME_SAMPLES; n++) {
          let energy = 1e-6;
          for (let k = 0; k < taps; k++) energy += x[n + k] * x[n + k];
          const e = out[n];
          const step = (MU * e) / energy;
          for (let k = 0; k < taps; k++) w[k] += step * x[n + k];
        }
        if (ratio < 0.35) converged = true;
      }

      return {
        pcm: out,
        refActive: true,
        doubleTalk,
        residualRatio: ratio,
        delayMs: (delaySamples / SAMPLE_RATE) * 1000,
        converged,
      };
    },

    reset() {
      w.fill(0);
      haveDelay = false;
      converged = false;
      dtStreak = 0;
      lastRatio = 1;
      envFilled = 0;
      envIdx = 0;
      framesSinceSearch = 0;
    },

    stats() {
      return {
        delayMs: haveDelay ? Math.round((delaySamples / SAMPLE_RATE) * 1000) : null,
        converged,
        diverged,
        taps,
      };
    },
  };
}

export const AEC_FRAME_SAMPLES = FRAME_SAMPLES;
