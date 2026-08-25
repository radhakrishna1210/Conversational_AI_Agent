// backend/src/services/billing/__tests__/numberBilling.test.js
//
// A rented number costs us real money every month forever, so the two things
// worth pinning here are the ones that go wrong quietly:
//
//   nextRenewalFrom() — the month-end rollover. A number rented on the 31st
//     must not skip February and get billed twice in March, which is exactly
//     what a bare setUTCMonth(+1) does.
//   the ledger keys — they are the ONLY thing preventing a double charge when
//     two sweeps overlap or an instance restarts mid-run. There is no lock.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const {
  billingMonth,
  nextRenewalFrom,
  rentalKey,
  setupKey,
  GRACE_DAYS,
} = await import('../numberBilling.service.js');

const { inrToCents } = await import('../numberRate.js');
const { TX_TYPES } = await import('../wallet.service.js');
const { VOICE_NUMBER_STATUS } = await import('../../../constants/compliance.js');

const utc = (iso) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d) => d.toISOString().slice(0, 10);

// ── Renewal dates ───────────────────────────────────────────────────────────

describe('nextRenewalFrom', () => {
  test('advances one calendar month on an ordinary date', () => {
    assert.equal(iso(nextRenewalFrom(utc('2026-08-15'))), '2026-09-15');
    assert.equal(iso(nextRenewalFrom(utc('2026-01-01'))), '2026-02-01');
  });

  test('clamps to the last day when the next month is shorter', () => {
    // The bug this exists to prevent: setUTCMonth(+1) on 31 January rolls into
    // 3 March, so February is never billed and March is billed twice.
    assert.equal(iso(nextRenewalFrom(utc('2026-01-31'))), '2026-02-28');
    assert.equal(iso(nextRenewalFrom(utc('2026-01-30'))), '2026-02-28');
    assert.equal(iso(nextRenewalFrom(utc('2026-03-31'))), '2026-04-30');
    assert.equal(iso(nextRenewalFrom(utc('2026-05-31'))), '2026-06-30');
  });

  test('handles a leap February', () => {
    assert.equal(iso(nextRenewalFrom(utc('2028-01-31'))), '2028-02-29');
  });

  test('rolls the year over', () => {
    assert.equal(iso(nextRenewalFrom(utc('2026-12-15'))), '2027-01-15');
    assert.equal(iso(nextRenewalFrom(utc('2026-12-31'))), '2027-01-31');
  });

  test('always moves strictly forward — a date that did not advance would bill in a loop', () => {
    let d = utc('2026-01-31');
    for (let i = 0; i < 24; i += 1) {
      const next = nextRenewalFrom(d);
      assert.ok(next > d, `${iso(next)} did not advance past ${iso(d)}`);
      d = next;
    }
  });

  test('never lands twice in the same billing month', () => {
    // Clamping must not produce two renewals inside one month, which would let
    // the sweep charge a second time in the same month under a different key.
    let d = utc('2026-01-31');
    const seen = new Set();
    for (let i = 0; i < 24; i += 1) {
      d = nextRenewalFrom(d);
      const month = billingMonth(d);
      assert.ok(!seen.has(month), `two renewals fell in ${month}`);
      seen.add(month);
    }
  });
});

describe('billingMonth', () => {
  test('is zero-padded and UTC, so a sweep near midnight cannot straddle months', () => {
    assert.equal(billingMonth(utc('2026-08-01')), '2026-08');
    assert.equal(billingMonth(new Date('2026-01-31T23:59:59.000Z')), '2026-01');
    assert.equal(billingMonth(new Date('2026-02-01T00:00:00.000Z')), '2026-02');
  });
});

// ── Idempotency keys ────────────────────────────────────────────────────────

describe('ledger keys', () => {
  const N = '+912269851741';
  const OTHER = '+918041234567';

  test('a rental key is unique per number per month', () => {
    assert.equal(rentalKey(N, '2026-08'), 'number_rental:+912269851741:2026-08');
    assert.notEqual(rentalKey(N, '2026-08'), rentalKey(N, '2026-09'));
    assert.notEqual(rentalKey(N, '2026-08'), rentalKey(OTHER, '2026-08'));
  });

  test('the same number and month always produce the same key', () => {
    // This IS the double-charge guard: two overlapping sweeps both compute this
    // string, and the unique constraint rejects the second write.
    assert.equal(rentalKey(N, billingMonth(utc('2026-08-15'))), rentalKey(N, billingMonth(utc('2026-08-28'))));
  });

  test('setup is keyed per number, with no month — it can only ever happen once', () => {
    assert.equal(setupKey(N), 'number_setup:+912269851741');
    assert.notEqual(setupKey(N), setupKey(OTHER));
  });

  test('setup and rental keys can never collide', () => {
    assert.notEqual(setupKey(N), rentalKey(N, '2026-08'));
  });
});

// ── Policy constants ────────────────────────────────────────────────────────

describe('non-payment policy', () => {
  test('there is a grace period, and it is more than a day', () => {
    // Product decision 2026-08-24: a client whose top-up is late by a day must
    // not lose a campaign mid-flight.
    assert.ok(Number.isFinite(GRACE_DAYS));
    assert.ok(GRACE_DAYS >= 2, `grace of ${GRACE_DAYS} day(s) is effectively no grace`);
  });

  test('non-payment suspends; there is no released-for-nonpayment state', () => {
    // Releasing would destroy the client's DLT header registration, which they
    // cannot recover. Only a deliberate Super Admin action releases a number.
    assert.equal(VOICE_NUMBER_STATUS.SUSPENDED_NONPAYMENT, 'SUSPENDED_NONPAYMENT');
    const values = Object.values(VOICE_NUMBER_STATUS);
    assert.deepEqual(values.filter((v) => /RELEASE/.test(v)), ['RELEASED']);
  });
});

// ── Ledger types and money ──────────────────────────────────────────────────

describe('ledger types', () => {
  test('setup and rental are distinct types, so an invoice can tell them apart', () => {
    assert.equal(TX_TYPES.NUMBER_SETUP, 'number_setup');
    assert.equal(TX_TYPES.NUMBER_RENTAL, 'number_rental');
    assert.notEqual(TX_TYPES.NUMBER_SETUP, TX_TYPES.NUMBER_RENTAL);
  });

  test('neither collides with an existing type', () => {
    const all = Object.values(TX_TYPES);
    assert.equal(new Set(all).size, all.length);
  });
});

describe('inrToCents', () => {
  test('converts rupees to integer paise', () => {
    assert.equal(inrToCents(500), 50000);
    assert.equal(inrToCents(0), 0);
  });

  test('rounds rather than truncating, so a fractional rupee cannot lose a paisa', () => {
    assert.equal(inrToCents(199.995), 20000);
    assert.equal(inrToCents(12.345), 1235);
    assert.ok(Number.isInteger(inrToCents(33.33)));
  });
});
