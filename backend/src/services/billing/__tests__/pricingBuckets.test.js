// backend/src/services/billing/__tests__/pricingBuckets.test.js
/**
 * The guards on tier create and update.
 *
 * DELIBERATELY ONLY THE REJECTION PATHS. The other billing suites run against
 * the LIVE database, so a test that successfully created or repriced a tier
 * would be editing real pricing — and a tier is not a throwaway row: workspaces
 * point at it and `ensureBucketsSeeded` recognises it by name. Every case here
 * is one that throws before `createBucket`/`updateBucket` issues a query, so
 * this file needs no DATABASE_URL, never connects, and always runs.
 *
 * The guards are worth pinning even so: they are the only thing standing
 * between a typo and a tier that bills every client on it at zero, and now that
 * the admin UI can create tiers rather than just reprice three seeded ones,
 * they are reachable with arbitrary input.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBucket, updateBucket } from '../pricingBuckets.js';

/** Assert a rejection carries both the message and the HTTP status the API returns. */
const rejects = (promise, status, match) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.status, status, `expected status ${status}, got ${err.status}`);
    assert.match(err.message, match);
    return true;
  });

const RATE_ERR = /greater than zero/;
const MINUTES_ERR = /whole number greater than zero/;

describe('createBucket — minutes', () => {
  for (const minutes of [0, -1, 1.5, 'abc', null, undefined, '']) {
    it(`rejects ${JSON.stringify(minutes)}`, async () => {
      await rejects(createBucket({ minutes, perMinuteInr: 10 }), 400, MINUTES_ERR);
    });
  }

  it('rejects Infinity, which Number() accepts but no tier can quote', async () => {
    await rejects(createBucket({ minutes: Infinity, perMinuteInr: 10 }), 400, MINUTES_ERR);
  });
});

describe('createBucket — rate', () => {
  // Zero is the case with teeth: it would make every call on the tier free,
  // and NaN would fall through money.js to the USD path and bill something else
  // entirely. Both must fail loudly rather than be stored.
  for (const rate of [0, -5, 'abc', null, undefined, '']) {
    it(`rejects ${JSON.stringify(rate)}`, async () => {
      await rejects(createBucket({ minutes: 5000, perMinuteInr: rate }), 400, RATE_ERR);
    });
  }

  it('rejects a rate before it ever looks the tier up', async () => {
    // Minutes are checked first, so a bad rate on a plausible tier still fails
    // on the rate — proving the guard runs ahead of the uniqueness query.
    await rejects(createBucket({ minutes: 2000, perMinuteInr: 0 }), 400, RATE_ERR);
  });
});

describe('updateBucket — nothing to update', () => {
  it('rejects an empty patch', async () => {
    await rejects(updateBucket('bkt_1', {}), 400, /Nothing to update/);
  });

  it('rejects a patch of only undefined fields', async () => {
    // The admin UI sends only the fields that actually changed, so an unchanged
    // save arrives looking exactly like this rather than as a no-op write.
    await rejects(
      updateBucket('bkt_1', { label: undefined, minutes: undefined, perMinuteInr: undefined, active: undefined }),
      400,
      /Nothing to update/,
    );
  });
});

describe('updateBucket — field guards match create', () => {
  it('rejects a zero rate', async () => {
    await rejects(updateBucket('bkt_1', { perMinuteInr: 0 }), 400, RATE_ERR);
  });

  it('rejects a fractional minutes figure', async () => {
    await rejects(updateBucket('bkt_1', { minutes: 2.5 }), 400, MINUTES_ERR);
  });

  it('rejects a blank label, which create instead defaults', async () => {
    // The asymmetry is deliberate: creating a tier without a label gets the
    // minutes as one, but blanking an existing tier's label is a mistake.
    await rejects(updateBucket('bkt_1', { label: '   ' }), 400, /Label cannot be empty/);
  });
});
