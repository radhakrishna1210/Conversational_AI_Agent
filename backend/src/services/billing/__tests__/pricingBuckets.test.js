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
import { createBucket, updateBucket, assertDeletable } from '../pricingBuckets.js';

/** Assert a rejection carries both the message and the HTTP status the API returns. */
const rejects = (promise, status, match) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.status, status, `expected status ${status}, got ${err.status}`);
    assert.match(err.message, match);
    return true;
  });

const RATE_ERR = /greater than zero/;
const MIN_ERR = /must start at a whole number/;
const MAX_ERR = /must end at a whole number/;
const BAND_ERR = /contains no minutes/;

/** A band that would pass validation, so a single bad field is the only cause. */
const OK = { minMinutes: 200, maxMinutes: 1500, perMinuteInr: 10 };

describe('createBucket — where the band starts', () => {
  for (const minMinutes of [-1, 1.5, 'abc', null, undefined, '', Infinity]) {
    it(`rejects ${JSON.stringify(minMinutes)}`, async () => {
      await rejects(createBucket({ ...OK, minMinutes }), 400, MIN_ERR);
    });
  }

  it('accepts zero, which is the bottom band floor', async () => {
    // Not a rejection test: it must get PAST the floor guard and fail on the
    // rate instead, proving zero is a legal floor rather than a missing value.
    await rejects(createBucket({ minMinutes: 0, maxMinutes: 200, perMinuteInr: 0 }), 400, RATE_ERR);
  });
});

describe('createBucket — where the band ends', () => {
  for (const maxMinutes of [0, -1, 1.5, 'abc']) {
    it(`rejects ${JSON.stringify(maxMinutes)}`, async () => {
      await rejects(createBucket({ ...OK, maxMinutes }), 400, MAX_ERR);
    });
  }

  it('treats an omitted ceiling as the open-ended top band', async () => {
    // Must fall through to the rate guard, not the ceiling guard — an absent
    // maximum is a real choice here, not a missing field.
    await rejects(createBucket({ minMinutes: 5000, perMinuteInr: 0 }), 400, RATE_ERR);
  });

  it('treats an empty-string ceiling the same way, since that is what the form sends', async () => {
    await rejects(createBucket({ minMinutes: 5000, maxMinutes: '', perMinuteInr: 0 }), 400, RATE_ERR);
  });
});

describe('createBucket — the band has to contain something', () => {
  it('rejects a ceiling below the floor', async () => {
    await rejects(createBucket({ ...OK, minMinutes: 1500, maxMinutes: 200 }), 400, BAND_ERR);
  });

  it('rejects equal bounds, because the ceiling is exclusive', async () => {
    // [200, 200) is empty. Worth pinning: it is the boundary case the
    // half-open convention exists to make unambiguous.
    await rejects(createBucket({ ...OK, minMinutes: 200, maxMinutes: 200 }), 400, BAND_ERR);
  });
});

describe('createBucket — rate', () => {
  // Zero is the case with teeth: it would make every call on the tier free,
  // and NaN would fall through money.js to the USD path and bill something else
  // entirely. Both must fail loudly rather than be stored.
  for (const rate of [0, -5, 'abc', null, undefined, '']) {
    it(`rejects ${JSON.stringify(rate)}`, async () => {
      await rejects(createBucket({ ...OK, perMinuteInr: rate }), 400, RATE_ERR);
    });
  }
});

describe('updateBucket — nothing to update', () => {
  it('rejects an empty patch', async () => {
    await rejects(updateBucket('bkt_1', {}), 400, /Nothing to update/);
  });

  it('rejects a patch of only undefined fields', async () => {
    // The admin UI sends only the fields that actually changed, so an unchanged
    // save arrives looking exactly like this rather than as a no-op write.
    await rejects(
      updateBucket('bkt_1', { label: undefined, minMinutes: undefined, perMinuteInr: undefined, active: undefined }),
      400,
      /Nothing to update/,
    );
  });
});

describe('updateBucket — field guards match create', () => {
  it('rejects a zero rate', async () => {
    await rejects(updateBucket('bkt_1', { perMinuteInr: 0 }), 400, RATE_ERR);
  });

  it('rejects a fractional floor', async () => {
    await rejects(updateBucket('bkt_1', { minMinutes: 2.5 }), 400, MIN_ERR);
  });

  it('rejects a blank label, which create instead defaults', async () => {
    // The asymmetry is deliberate: creating a tier without a label gets the
    // band as one, but blanking an existing tier's label is a mistake.
    await rejects(updateBucket('bkt_1', { label: '   ' }), 400, /Label cannot be empty/);
  });

  it('rejects an inverted band given in one patch', async () => {
    // Both edges present, so this fails on the pure ordering check without ever
    // reading the row — the read-before-write path is only for a one-edge move.
    await rejects(updateBucket('bkt_1', { minMinutes: 1500, maxMinutes: 200 }), 400, BAND_ERR);
  });
});

describe('assertDeletable — the refusal is the feature', () => {
  // `Workspace.pricingBucketId` is ON DELETE SET NULL, so deleting an occupied
  // tier does NOT error at the database: it silently nulls every assignment and
  // drops those clients to the platform default on their next call. Postgres
  // will not stop that, so this guard is the only thing that does.
  it('refuses a tier with clients on it', () => {
    assert.throws(
      () => assertDeletable({ label: '200-1,500 min', workspaceCount: 3 }),
      (err) => {
        assert.equal(err.status, 409);
        assert.match(err.message, /still has 3 clients/);
        // The message has to name the way out, or the admin is just stuck.
        assert.match(err.message, /Move them to another tier first, or retire/);
        return true;
      },
    );
  });

  it('says "1 client", not "1 clients"', () => {
    assert.throws(
      () => assertDeletable({ label: 'Under 200 min', workspaceCount: 1 }),
      (err) => {
        assert.ok(err.message.includes('still has 1 client on it'), err.message);
        return true;
      },
    );
  });

  it('allows a tier nobody is on', () => {
    assert.doesNotThrow(() => assertDeletable({ label: 'Over 5,000 min', workspaceCount: 0 }));
  });

  it('treats an absent count as empty rather than throwing on it', () => {
    // A caller that forgot the _count include should not get a TypeError out of
    // a guard whose whole job is to produce a clear refusal.
    assert.doesNotThrow(() => assertDeletable({ label: 'x' }));
    assert.doesNotThrow(() => assertDeletable({ label: 'x', workspaceCount: null }));
  });
});
