// backend/src/services/voice/__tests__/bargeThreshold.test.js
/**
 * These thresholds decide whether a caller can be heard over the agent, and
 * they shipped for months set above the level at which people speak on a
 * telephone. Nothing could catch that, because every test of barge-in used
 * synthetic audio scaled to whatever the test happened to pick.
 *
 * So the assertions here are against PUBLISHED LEVELS rather than against
 * behaviour: ITU-T P.56's nominal active speech level for telephony (-26 dBFS)
 * and the band telephony VADs are tuned within (-50..-30 dBFS). Those do not
 * move, which is what makes them a fixture worth testing against.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bargeThresholds,
  BARGE_RMS_MIN,
  OVERLAP_RMS_MIN,
  BARGE_MARGIN,
  rmsToDbfs,
  dbfsToRms,
  NOMINAL_SPEECH_DBFS,
} from '../bargeThreshold.js';

/** The loud end of the range telephony VADs are tuned within. */
const VAD_BAND_TOP_DBFS = -30;
/** Below this, a telephony VAD calls it silence. */
const VAD_SILENCE_DBFS = -45;

describe('bargeThreshold levels', () => {
  it('lets a caller at nominal telephony level be heard over the agent', () => {
    // THE REGRESSION. At the shipped 2500 (-22.4 dBFS) this failed: a caller
    // speaking at the standard level for a telephone could not clear the bar to
    // interrupt, on any line, ever.
    const nominal = dbfsToRms(NOMINAL_SPEECH_DBFS);
    const { barge, overlap } = bargeThresholds(0);
    assert.ok(nominal > barge,
      `speech at ${NOMINAL_SPEECH_DBFS} dBFS (rms ${nominal.toFixed(0)}) must clear the barge floor `
      + `(rms ${barge}, ${rmsToDbfs(barge).toFixed(1)} dBFS)`);
    assert.ok(nominal > overlap, 'and the overlap floor');
  });

  it('keeps both floors inside the telephony VAD band', () => {
    // A floor above the band is not a floor, it is the detector — and one below
    // the band's silence line would fire on comfort noise.
    for (const [name, floor] of [['barge', BARGE_RMS_MIN], ['overlap', OVERLAP_RMS_MIN]]) {
      const db = rmsToDbfs(floor);
      assert.ok(db <= VAD_BAND_TOP_DBFS,
        `${name} floor ${db.toFixed(1)} dBFS must not exceed the band top ${VAD_BAND_TOP_DBFS}`);
      assert.ok(db >= VAD_SILENCE_DBFS,
        `${name} floor ${db.toFixed(1)} dBFS must stay above the silence line ${VAD_SILENCE_DBFS}`);
    }
  });

  it('asks less of overlap recovery than of barge-in', () => {
    // Barge-in cuts the agent off; overlap only decides whether to keep words
    // that face two more checks afterwards. They were one constant, and it was
    // the strict one.
    assert.ok(OVERLAP_RMS_MIN < BARGE_RMS_MIN,
      'the cheap decision must not inherit the expensive decision\'s caution');
    const { barge, overlap } = bargeThresholds(0);
    assert.ok(overlap < barge);
  });

  it('lets the measured line win on a noisy line — the whole point', () => {
    // The adaptive term is supposed to be what decides. With the old floor it
    // could only win once the line's own NOISE was louder than most speech, so
    // it never did and every call ran on the constant.
    const noisy = 400;                    // -38 dBFS of line noise
    const { barge } = bargeThresholds(noisy);
    assert.equal(barge, noisy * BARGE_MARGIN,
      'a line noisier than the floor must raise the bar above the floor');

    // And the floor still protects an unnaturally quiet line, which is the case
    // it exists for: three times almost nothing is still almost nothing.
    assert.equal(bargeThresholds(1).barge, BARGE_RMS_MIN);
    assert.equal(bargeThresholds(0).barge, BARGE_RMS_MIN);
  });

  it('crosses over from floor to measured somewhere a real line reaches', () => {
    // The number that made the old design dead code: with floor 2500 and margin
    // 3, the measured term needed a noise floor of 833 (-31.9 dBFS) to matter.
    // Whatever the floor is, the crossover must sit down in the range a line's
    // noise actually occupies, not up where speech lives.
    const crossover = BARGE_RMS_MIN / BARGE_MARGIN;
    assert.ok(rmsToDbfs(crossover) < NOMINAL_SPEECH_DBFS,
      `the adaptive term must take over below speech level, not above it `
      + `(crossover ${rmsToDbfs(crossover).toFixed(1)} dBFS)`);
  });

  it('survives a nonsense noise floor without dropping its guard', () => {
    for (const bad of [NaN, undefined, null, -1]) {
      assert.equal(bargeThresholds(bad).barge, BARGE_RMS_MIN);
      assert.equal(bargeThresholds(bad).overlap, OVERLAP_RMS_MIN);
    }
  });

  it('round-trips its own dB helpers', () => {
    for (const db of [-26, -30, -35, -45]) {
      assert.ok(Math.abs(rmsToDbfs(dbfsToRms(db)) - db) < 1e-9);
    }
  });
});
