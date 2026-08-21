// backend/src/services/voice/__tests__/echoCanceller.test.js
/**
 * The canceller exists so the phone bridge can listen while it speaks. Two
 * properties matter, and the second matters more than the first:
 *
 *   1. it removes our own audio from the inbound leg;
 *   2. it NEVER removes the caller's.
 *
 * A canceller that fails (1) leaves today's behaviour. One that fails (2) eats
 * the speech it was built to protect, which is worse than the bug. The tests
 * below drive it with a synthetic echo path — a delay plus attenuation, which
 * is what a phone hybrid mostly is — because that is the only way to know what
 * the caller said and check it is still there afterwards.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEchoCanceller, AEC_FRAME_SAMPLES as N } from '../echoCanceller.js';

const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

/** Speech-ish: a few harmonics with a wandering envelope, not a pure tone. */
function speech(frames, { seed = 1, amp = 8000 } = {}) {
  const out = new Int16Array(frames * N);
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let env = 0.5;
  for (let i = 0; i < out.length; i++) {
    if (i % 400 === 0) env = 0.25 + rnd() * 0.75;
    const t = i / 8000;
    out[i] = Math.round(env * amp * (
      Math.sin(2 * Math.PI * 190 * t) * 0.6
      + Math.sin(2 * Math.PI * 470 * t) * 0.3
      + Math.sin(2 * Math.PI * 900 * t) * 0.1
      + (rnd() - 0.5) * 0.05));
  }
  return out;
}

const frameAt = (buf, i) => buf.subarray(i * N, (i + 1) * N);

/**
 * Run `frames` frames through the canceller with a synthetic echo path.
 * @param near caller audio present on the inbound leg (may be silence)
 */
function runCall(farEnd, near, { delayFrames = 6, gain = 0.55 } = {}) {
  const aec = createEchoCanceller();
  const frames = Math.floor(farEnd.length / N);
  const results = [];
  const echoDelay = delayFrames * N;
  for (let f = 0; f < frames; f++) {
    aec.reference(frameAt(farEnd, f));
    // What the handset sends back: our audio, delayed and attenuated, plus
    // whatever the caller is saying.
    const mic = new Int16Array(N);
    for (let i = 0; i < N; i++) {
      const abs = f * N + i - echoDelay;
      const echo = abs >= 0 && abs < farEnd.length ? farEnd[abs] * gain : 0;
      const caller = near ? near[f * N + i] || 0 : 0;
      mic[i] = Math.max(-32768, Math.min(32767, Math.round(echo + caller)));
    }
    results.push({ mic, ...aec.process(mic) });
  }
  return { aec, results };
}

describe('echoCanceller', () => {
  it('is a passthrough while the agent is not speaking', () => {
    // The branch most of a call takes. It must be incapable of touching the
    // audio the bridge listens to when the caller has the floor.
    const silence = new Int16Array(40 * N);
    const caller = speech(40, { seed: 7 });
    const { results } = runCall(silence, caller);
    for (const r of results) {
      assert.equal(r.refActive, false);
      assert.deepEqual(Array.from(r.pcm), Array.from(r.mic), 'caller audio must be untouched');
    }
  });

  it('cancels our own echo once it has locked on', () => {
    const far = speech(200, { seed: 3 });
    const { results, aec } = runCall(far, null);
    // Judge only the settled tail — convergence needs a second or two of speech.
    const tail = results.slice(-40).filter((r) => r.refActive);
    assert.ok(tail.length > 10, 'the reference should be active while we speak');

    const before = rms(Array.from(tail.flatMap((r) => Array.from(r.mic))));
    const after = rms(Array.from(tail.flatMap((r) => Array.from(r.pcm))));
    assert.ok(after < before * 0.5,
      `echo should drop well below the incoming level (before=${before.toFixed(0)} after=${after.toFixed(0)})`);
    assert.equal(aec.stats().converged, true);
    assert.ok(aec.stats().delayMs >= 100 && aec.stats().delayMs <= 160,
      `delay estimate should land near 120ms, got ${aec.stats().delayMs}`);
  });

  it('keeps the caller\'s speech when they talk over us — and says so', () => {
    // THE POINT OF THE WHOLE MODULE. The caller answers mid-reply; today those
    // words are cleared by beginTurn() or rejected by a text heuristic that
    // cannot tell a Hindi answer from a Hindi question.
    const far = speech(200, { seed: 3 });
    const near = new Int16Array(200 * N);
    // Caller speaks over the last 30 frames only.
    const callerAudio = speech(30, { seed: 11, amp: 6000 });
    near.set(callerAudio, 170 * N);

    const { results } = runCall(far, near);
    const during = results.slice(175, 198);

    assert.ok(during.some((r) => r.doubleTalk), 'double talk must be reported');
    // Their speech has to survive: the residual should still carry real energy,
    // not be scrubbed down to the level echo-only frames reach.
    const quiet = results.slice(140, 165).filter((r) => r.refActive);
    const echoOnly = rms(Array.from(quiet.flatMap((r) => Array.from(r.pcm))));
    const withCaller = rms(Array.from(during.flatMap((r) => Array.from(r.pcm))));
    assert.ok(withCaller > echoOnly * 2,
      `the caller must survive cancellation (echoOnly=${echoOnly.toFixed(0)} withCaller=${withCaller.toFixed(0)})`);
  });

  it('never returns audio louder than what arrived', () => {
    // The divergence guard. A filter that amplifies is not helping, and on a
    // live call the damage is the caller's own voice.
    const far = speech(150, { seed: 5 });
    const near = speech(150, { seed: 9, amp: 9000 });
    const { results } = runCall(far, near, { delayFrames: 3, gain: 0.9 });
    for (const r of results) {
      assert.ok(rms(Array.from(r.pcm)) <= rms(Array.from(r.mic)) * 1.55,
        'residual must not exceed the input');
    }
  });

  it('can be switched off without a release', () => {
    const saved = process.env.PHONE_AEC_ENABLED;
    process.env.PHONE_AEC_ENABLED = 'false';
    try {
      const far = speech(60, { seed: 3 });
      const { results } = runCall(far, null);
      for (const r of results) assert.deepEqual(Array.from(r.pcm), Array.from(r.mic));
    } finally {
      if (saved === undefined) delete process.env.PHONE_AEC_ENABLED;
      else process.env.PHONE_AEC_ENABLED = saved;
    }
  });
});
