// backend/src/services/plivo/__tests__/reconciliation.test.js
//
// Reconciliation only earns its keep if a finding means something. A false
// "carrier billed a call we never logged" sends someone hunting a bridge crash
// that never happened; a missed one is money quietly gone. So the tests pin the
// matching rules and the classification, not the plumbing.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const {
  diffCarrierUsage,
  formatCarrierTime,
  normalizeCdr,
  parseCarrierTime,
  windowProblem,
  MAX_WINDOW_MS,
} = await import('../reconciliation.service.js');

const T = (iso) => new Date(iso);
const WINDOW = { start: T('2026-09-10T00:00:00Z'), end: T('2026-09-11T00:00:00Z') };

const cdr = (over = {}) => ({
  callUuid: 'uuid-1',
  direction: 'outbound',
  from: '912269851741',
  to: '919876543210',
  endTime: T('2026-09-10T10:01:00Z'),
  startTime: T('2026-09-10T10:00:00Z'),
  billSec: 60,
  amount: 0.85,
  hangupCause: 'NORMAL_CLEARING',
  authId: 'SA1',
  workspaceId: 'w1',
  ...over,
});

const leg = (over = {}) => ({
  kind: 'call',
  id: 'log-1',
  workspaceId: 'w1',
  provider: 'PLIVO',
  providerCallId: 'uuid-1',
  number: '919876543210',
  startedAt: T('2026-09-10T10:00:00Z'),
  durationSec: 60,
  billedCents: 120,
  ...over,
});

// ── Parsing ─────────────────────────────────────────────────────────────────

describe('parseCarrierTime', () => {
  test('reads a bare Plivo timestamp as UTC', () => {
    assert.equal(parseCarrierTime('2026-09-10 10:01:00').toISOString(), '2026-09-10T10:01:00.000Z');
  });

  test('honours an explicit offset rather than assuming UTC', () => {
    // An India-region account may report +05:30; treating that as UTC would
    // shift every record five and a half hours and match nothing.
    assert.equal(parseCarrierTime('2026-09-10 15:31:00+05:30').toISOString(), '2026-09-10T10:01:00.000Z');
  });

  test('tolerates microseconds', () => {
    assert.equal(parseCarrierTime('2026-09-10 10:01:00.123456').toISOString(), '2026-09-10T10:01:00.123Z');
  });

  test('returns null rather than an Invalid Date', () => {
    assert.equal(parseCarrierTime(''), null);
    assert.equal(parseCarrierTime('not a time'), null);
    assert.equal(parseCarrierTime(undefined), null);
  });
});

describe('formatCarrierTime', () => {
  test('emits the shape Plivo end_time filters take', () => {
    assert.equal(formatCarrierTime(T('2026-09-10T10:01:00.500Z')), '2026-09-10 10:01:00');
  });
});

describe('normalizeCdr', () => {
  test('derives the start time from the end time and duration', () => {
    // Plivo reports when a call ENDED; our legs record when they started, so one
    // of the two has to be converted before they can be compared.
    const out = normalizeCdr({
      call_uuid: 'u1', call_direction: 'Outbound', from_number: '+91 22 6985 1741',
      to_number: '919876543210', end_time: '2026-09-10 10:01:30', call_duration: 90,
      bill_duration: 90, total_amount: '0.85',
    }, { authId: 'SA1', workspaceId: 'w1' });

    assert.equal(out.startTime.toISOString(), '2026-09-10T10:00:00.000Z');
    assert.equal(out.direction, 'outbound');
    assert.equal(out.from, '912269851741', 'numbers compare as digits, not as formatting');
    assert.equal(out.amount, 0.85);
    assert.equal(out.workspaceId, 'w1');
  });

  test('falls back to billed_duration and survives missing fields', () => {
    const out = normalizeCdr({ billed_duration: 30 });
    assert.equal(out.billSec, 30);
    assert.equal(out.callUuid, null);
    assert.equal(out.endTime, null);
    assert.equal(out.amount, 0);
  });
});

// ── Window guards ───────────────────────────────────────────────────────────

describe('windowProblem', () => {
  const now = T('2026-09-12T00:00:00Z').getTime();

  test('accepts an ordinary recent window', () => {
    assert.equal(windowProblem(T('2026-09-10T00:00:00Z'), T('2026-09-11T00:00:00Z'), now), null);
  });

  test('refuses a backwards or future window', () => {
    assert.match(windowProblem(T('2026-09-11T00:00:00Z'), T('2026-09-10T00:00:00Z'), now), /before it ends/);
    assert.match(windowProblem(T('2026-09-11T00:00:00Z'), T('2026-09-13T00:00:00Z'), now), /future/);
  });

  test('refuses a window past what Plivo will answer for', () => {
    // 90 days of retention, 30 days per search — both are the carrier's limits,
    // and hitting them returns a 400 rather than fewer records.
    assert.match(windowProblem(T('2026-01-01T00:00:00Z'), T('2026-01-05T00:00:00Z'), now), /90 days/);
    const end = T('2026-09-11T00:00:00Z');
    const tooWide = new Date(end.getTime() - MAX_WINDOW_MS - 1000);
    assert.match(windowProblem(tooWide, end, now), /at most/);
  });

  test('refuses a date it cannot read', () => {
    assert.match(windowProblem(new Date('nope'), T('2026-09-11T00:00:00Z'), now), /not a valid date/);
  });
});

// ── The comparison ──────────────────────────────────────────────────────────

describe('diffCarrierUsage', () => {
  test('matches on the carrier call id and reports nothing', () => {
    const out = diffCarrierUsage({ cdrs: [cdr()], legs: [leg()], window: WINDOW });
    assert.equal(out.totals.matched, 1);
    assert.deepEqual(out.discrepancies, []);
    assert.equal(out.totals.carrierCalls, 1);
    assert.equal(out.totals.carrierBilledSec, 60);
  });

  test('falls back to the other party and the clock when the id is missing', () => {
    // A leg placed before providerCallId existed, or whose hangup callback never
    // arrived. Without this fallback every one of them reads as two findings:
    // a carrier-only call AND an ours-only call, for the same conversation.
    const out = diffCarrierUsage({
      cdrs: [cdr()],
      legs: [leg({ providerCallId: null, startedAt: T('2026-09-10T10:00:20Z') })],
      window: WINDOW,
    });
    assert.equal(out.totals.matched, 1);
    assert.equal(out.totals.matchedByTime, 1);
    assert.deepEqual(out.discrepancies, []);
  });

  test('does not match a different call to the same number hours later', () => {
    const out = diffCarrierUsage({
      cdrs: [cdr()],
      legs: [leg({ providerCallId: null, startedAt: T('2026-09-10T18:00:00Z') })],
      window: WINDOW,
    });
    assert.equal(out.totals.matched, 0);
    assert.equal(out.totals.carrierOnly, 1);
    assert.equal(out.totals.oursOnly, 1);
  });

  test('matches an inbound record on the CALLER, not the callee', () => {
    // On an inbound call the other party is `from`; keying on `to` would match
    // our own rented number against every leg that dialled it.
    const out = diffCarrierUsage({
      cdrs: [cdr({ direction: 'inbound', from: '919876543210', to: '912269851741', callUuid: null })],
      legs: [leg({ providerCallId: null })],
      window: WINDOW,
    });
    assert.equal(out.totals.matched, 1);
  });

  test('flags a billed carrier call we have no leg for', () => {
    const out = diffCarrierUsage({ cdrs: [cdr()], legs: [], window: WINDOW });
    assert.equal(out.totals.carrierOnly, 1);
    assert.equal(out.discrepancies[0].kind, 'carrier_only');
    assert.equal(out.discrepancies[0].carrierAmount, 0.85);
  });

  test('ignores an unbilled carrier record with no leg', () => {
    // A ring nobody answered costs nothing and is not evidence of anything.
    const out = diffCarrierUsage({ cdrs: [cdr({ billSec: 0, amount: 0 })], legs: [], window: WINDOW });
    assert.equal(out.totals.carrierOnly, 0);
    assert.equal(out.totals.carrierOnlyUnbilled, 1);
    assert.deepEqual(out.discrepancies, []);
  });

  test('flags a billed Plivo leg the carrier has no record of', () => {
    const out = diffCarrierUsage({ cdrs: [], legs: [leg()], window: WINDOW });
    assert.equal(out.totals.oursOnly, 1);
    assert.equal(out.discrepancies[0].kind, 'ours_only');
  });

  test('never accuses a leg whose carrier is unknown or not Plivo', () => {
    // A null provider is a leg placed before the column existed. Fine to match
    // on, wrong to report as missing from Plivo's books.
    const out = diffCarrierUsage({
      cdrs: [],
      legs: [leg({ provider: null }), leg({ id: 'log-2', provider: 'TWILIO', providerCallId: 'CA1' })],
      window: WINDOW,
    });
    assert.equal(out.totals.oursOnly, 0);
  });

  test('ignores a leg that never connected', () => {
    const out = diffCarrierUsage({
      cdrs: [], legs: [leg({ durationSec: 0, billedCents: 0 })], window: WINDOW,
    });
    assert.equal(out.totals.oursOnly, 0);
  });

  test('flags a duration drift beyond the tolerance, and not within it', () => {
    const close = diffCarrierUsage({
      cdrs: [cdr({ billSec: 100 })], legs: [leg({ durationSec: 60 })], window: WINDOW,
    });
    assert.equal(close.totals.durationMismatch, 0, 'rounding and ring time are not drift');

    const far = diffCarrierUsage({
      cdrs: [cdr({ billSec: 600 })], legs: [leg({ durationSec: 60 })], window: WINDOW,
    });
    assert.equal(far.totals.durationMismatch, 1);
    assert.equal(far.discrepancies[0].driftSec, 540);
  });

  test('flags a call the carrier billed and the wallet never paid for', () => {
    const out = diffCarrierUsage({ cdrs: [cdr()], legs: [leg({ billedCents: 0 })], window: WINDOW });
    assert.equal(out.totals.unbilled, 1);
    assert.equal(out.discrepancies[0].kind, 'unbilled');
  });

  test('does not flag records outside the window that only exist to match edges', () => {
    // A call spanning midnight is fetched with a margin so its partner is found;
    // it must not then be counted or reported as a finding of its own.
    const out = diffCarrierUsage({
      cdrs: [cdr({ callUuid: 'edge', endTime: T('2026-09-09T23:30:00Z'), startTime: T('2026-09-09T23:29:00Z') })],
      legs: [],
      window: WINDOW,
    });
    assert.equal(out.totals.carrierCalls, 0);
    assert.deepEqual(out.discrepancies, []);
  });

  test('never matches two carrier records to one leg', () => {
    const out = diffCarrierUsage({
      cdrs: [cdr({ callUuid: null }), cdr({ callUuid: null, endTime: T('2026-09-10T10:01:30Z'), startTime: T('2026-09-10T10:00:30Z') })],
      legs: [leg({ providerCallId: null })],
      window: WINDOW,
    });
    assert.equal(out.totals.matched, 1);
    assert.equal(out.totals.carrierOnly, 1);
  });

  test('totals usage per workspace so one client can be reconciled alone', () => {
    const out = diffCarrierUsage({
      cdrs: [cdr(), cdr({ callUuid: 'uuid-2', workspaceId: 'w2', billSec: 30, amount: 0.4 })],
      legs: [leg()],
      window: WINDOW,
    });
    assert.equal(out.perWorkspace.w1.carrierCalls, 1);
    assert.equal(out.perWorkspace.w2.carrierBilledSec, 30);
    assert.equal(out.perWorkspace.w2.discrepancies, 1, 'w2 billed a call we have no leg for');
  });

  test('caps the discrepancy list and says it did', () => {
    const many = Array.from({ length: 12 }, (_, i) => cdr({ callUuid: `u${i}` }));
    const out = diffCarrierUsage({ cdrs: many, legs: [], window: WINDOW, maxDiscrepancies: 5 });
    assert.equal(out.discrepancies.length, 5);
    assert.equal(out.truncated, true);
    assert.equal(out.totals.carrierOnly, 12, 'the counts stay complete even when the list is cut');
  });
});
