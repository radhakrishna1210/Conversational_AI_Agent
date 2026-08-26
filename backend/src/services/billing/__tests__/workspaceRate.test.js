// backend/src/services/billing/__tests__/workspaceRate.test.js
/**
 * The three-level pricing precedence: override -> bucket -> platform default.
 *
 * Pure, and deliberately so. The other billing suites run against the LIVE
 * database, where fabricating pricing states to satisfy a test would change
 * what real customers are charged for the length of the run. `pickRate` is the
 * part with the billing consequences, so it is the part that gets exercised
 * exhaustively here — no DATABASE_URL, no skip, always runs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickRate } from '../workspaceRate.js';

/** Stands in for Super Admin -> Wallet Rate. */
const PLATFORM = { perMinuteInr: 12, perMinuteUsd: 0.125 };

const bucket = (perMinuteInr, label = '5,000 minutes') => ({
  id: 'bkt_1', label, perMinuteInr,
});

describe('pickRate — precedence', () => {
  it('falls back to the platform rate when nothing is set', () => {
    const r = pickRate({ rateOverrideInr: null, pricingBucket: null }, PLATFORM);
    assert.equal(r.perMinuteInr, 12);
    assert.equal(r.source, 'platform');
    assert.equal(r.bucketId, null);
  });

  it('uses the assigned bucket when there is no override', () => {
    const r = pickRate({ rateOverrideInr: null, pricingBucket: bucket(10) }, PLATFORM);
    assert.equal(r.perMinuteInr, 10);
    assert.equal(r.source, 'bucket');
    assert.equal(r.bucketId, 'bkt_1');
    assert.equal(r.bucketLabel, '5,000 minutes');
  });

  it('lets the override beat the bucket — the whole reason it exists', () => {
    const r = pickRate({ rateOverrideInr: 7.5, pricingBucket: bucket(10) }, PLATFORM);
    assert.equal(r.perMinuteInr, 7.5);
    assert.equal(r.source, 'override');
    // A bespoke rate is not "the bucket, adjusted" — it replaces the tier
    // outright, so nothing downstream should attribute the price to a bucket.
    assert.equal(r.bucketId, null);
  });

  it('lets the override beat the platform rate with no bucket assigned', () => {
    const r = pickRate({ rateOverrideInr: 4, pricingBucket: null }, PLATFORM);
    assert.equal(r.perMinuteInr, 4);
    assert.equal(r.source, 'override');
  });

  it('treats a null workspace as the platform rate rather than throwing', () => {
    // Settlement calls this after a call has already happened. Throwing would
    // strand the call in PENDING forever; billing the default is recoverable.
    const r = pickRate(null, PLATFORM);
    assert.equal(r.perMinuteInr, 12);
    assert.equal(r.source, 'platform');
  });
});

describe('pickRate — refuses to make calls free by accident', () => {
  // Each of these is a value that could plausibly reach the column, and every
  // one of them must fall THROUGH to the next rule rather than bill at zero.
  for (const bad of [0, -5, Number.NaN, null, undefined, '']) {
    it(`ignores an override of ${JSON.stringify(bad)} and uses the bucket`, () => {
      const r = pickRate({ rateOverrideInr: bad, pricingBucket: bucket(10) }, PLATFORM);
      assert.equal(r.perMinuteInr, 10);
      assert.equal(r.source, 'bucket');
    });

    it(`ignores a bucket rate of ${JSON.stringify(bad)} and uses the platform rate`, () => {
      const r = pickRate({ rateOverrideInr: null, pricingBucket: bucket(bad) }, PLATFORM);
      assert.equal(r.perMinuteInr, 12);
      assert.equal(r.source, 'platform');
    });
  }
});

describe('pickRate — the seeded tiers', () => {
  // The three buckets this platform sells, cheapest per minute at the top end.
  for (const [minutes, rate] of [[2000, 12], [5000, 10], [15000, 6]]) {
    it(`charges ₹${rate}/min on the ${minutes} bucket`, () => {
      const r = pickRate(
        { rateOverrideInr: null, pricingBucket: bucket(rate, `${minutes} minutes`) },
        PLATFORM,
      );
      assert.equal(r.perMinuteInr, rate);
      assert.equal(r.source, 'bucket');
    });
  }

  it('an unassigned workspace pays the same as the entry tier', () => {
    // The platform default is set to the 2,000-bucket rate, so "no bucket" and
    // "entry bucket" cost the same. If these ever diverge it is a pricing
    // decision, not an accident — this asserts the intent.
    const unassigned = pickRate({ rateOverrideInr: null, pricingBucket: null }, PLATFORM);
    const entry = pickRate({ rateOverrideInr: null, pricingBucket: bucket(12, '2,000 minutes') }, PLATFORM);
    assert.equal(unassigned.perMinuteInr, entry.perMinuteInr);
  });

  it('carries the platform USD fallback through every branch', () => {
    // money.js falls back to USD if perMinuteInr is ever cleared; that fallback
    // must survive regardless of which rule produced the INR figure.
    for (const ws of [
      { rateOverrideInr: 7.5, pricingBucket: null },
      { rateOverrideInr: null, pricingBucket: bucket(10) },
      { rateOverrideInr: null, pricingBucket: null },
    ]) {
      assert.equal(pickRate(ws, PLATFORM).perMinuteUsd, 0.125);
    }
  });
});
