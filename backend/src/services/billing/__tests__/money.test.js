// backend/src/services/billing/__tests__/money.test.js
/**
 * BUG-002 — money arithmetic. Pure functions, no DB, so these run anywhere.
 * The ledger's integrity guarantees are only as good as the numbers fed into
 * it, so this covers the rounding and rate rules directly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toMinorUnits, usdToBillingMinor, billableMinutes, resolveCallRate,
  calculateCallCharge, calculateProration, DEFAULT_USD_TO_INR,
  affordableSeconds,
} from '../money.js';

// Pin the environment so tests do not depend on local .env values.
process.env.FX_USD_TO_INR = '96';
delete process.env.BILLING_INCREMENT_SEC;

test('FX default matches the rate card doc', () => {
  assert.equal(DEFAULT_USD_TO_INR, 96);
});

test('minor units round half-up symmetrically across zero', () => {
  // Math.round(-0.5) is -0 in JS (rounds toward +Infinity). If that leaked in,
  // a debit and its mirror-image refund would differ by one paisa and refunds
  // would not net to zero.
  assert.equal(toMinorUnits(0.5), 1);
  assert.equal(toMinorUnits(-0.5), -1);
  assert.equal(toMinorUnits(1.4), 1);
  assert.equal(toMinorUnits(-1.4), -1);
  assert.equal(toMinorUnits(2.5), 3);
  assert.equal(toMinorUnits(-2.5), -3);
});

test('a debit and its mirror refund net to exactly zero', () => {
  for (const usd of [0.085, 0.075, 0.12, 0.0033, 1 / 3]) {
    const debit = -usdToBillingMinor(usd);
    const refund = usdToBillingMinor(usd);
    assert.equal(debit + refund, 0, `did not net to zero for ${usd}`);
  }
});

test('minor units are always integers', () => {
  for (const usd of [0.085, 0.07, 0.0052, 199, 0.1 + 0.2]) {
    const v = usdToBillingMinor(usd);
    assert.equal(Number.isInteger(v), true, `${usd} -> ${v} is not an integer`);
  }
});

test('degenerate inputs never produce NaN money', () => {
  for (const bad of [NaN, undefined, null, Infinity, -Infinity, 'abc']) {
    assert.equal(toMinorUnits(bad), 0);
    assert.equal(Number.isInteger(usdToBillingMinor(bad)), true);
  }
});

test('USD converts to paise at the configured rate', () => {
  // $0.085/min (Starter) x 96 = ₹8.16 = 816 paise
  assert.equal(usdToBillingMinor(0.085), 816);
  assert.equal(usdToBillingMinor(1), 9600);
});

test('billing is per SECOND by default, not per whole minute', () => {
  // The regression this file exists to prevent: 61 seconds used to bill as two
  // full minutes, so one extra second doubled the price of a call.
  assert.equal(billableMinutes(60), 1);
  assert.equal(billableMinutes(61), 61 / 60);
  assert.equal(billableMinutes(30), 0.5);
  assert.equal(billableMinutes(1), 1 / 60);
  assert.equal(billableMinutes(150), 2.5);
});

test('one extra second costs one extra second, not one extra minute', () => {
  const rate = { perMinuteInr: 11.52 };  // 1152 paise/min = 19.2 paise/sec
  const oneMinute = calculateCallCharge(60, rate).amountCents;
  const andOneSecond = calculateCallCharge(61, rate).amountCents;
  assert.equal(oneMinute, 1152);
  assert.equal(andOneSecond, 1171);            // 1152 + 19.2, to the paisa
  assert.ok(andOneSecond - oneMinute < 25, 'a second must not cost a minute');
});

test('a call that never connected is free', () => {
  // Must be free, not rounded up to one minute — charging for a failed call is
  // the kind of thing that produces chargebacks.
  assert.equal(billableMinutes(0), 0);
  assert.equal(calculateCallCharge(0, { perMinuteUsd: 0.085 }).amountCents, 0);
});

test('a negative duration fails closed, never a negative charge', () => {
  // A negative duration means a clock problem. It must not become a credit.
  assert.equal(billableMinutes(-30), 0);
  assert.equal(calculateCallCharge(-30, { perMinuteUsd: 0.085 }).amountCents, 0);
  for (const bad of [NaN, undefined, null, 'x']) {
    assert.equal(billableMinutes(bad), 0);
  }
});

test('a coarser billing increment is honoured when configured', () => {
  process.env.BILLING_INCREMENT_SEC = '60';
  assert.equal(billableMinutes(61), 2);
  process.env.BILLING_INCREMENT_SEC = '6';   // the other common convention
  assert.equal(billableMinutes(61), 66 / 60);
  delete process.env.BILLING_INCREMENT_SEC;
});

test('affordable seconds never exceed what the balance covers', () => {
  // ₹11.52/min = 19.2 paise/sec. ₹10 (1000 paise) buys 52.08s -> 52 whole
  // seconds, and 52s must cost no more than the balance. Rounding the other way
  // is exactly how a wallet ends a call in the negative.
  const rate = 1152;
  const seconds = affordableSeconds(1000, rate);
  assert.equal(seconds, 52);
  assert.ok(calculateCallCharge(seconds, { perMinuteInr: 11.52 }).amountCents <= 1000);

  assert.equal(affordableSeconds(0, rate), 0);
  assert.equal(affordableSeconds(-500, rate), 0);
  assert.equal(affordableSeconds(10, rate), 0, 'a few paise buys nothing');
});

test('a missing plan falls back to the most expensive rate, never to free', () => {
  // Failing OPEN on price would let an unsubscribed workspace run unlimited
  // free minutes — the one failure here that is actively exploitable.
  for (const plan of [null, undefined, {}, { perMinuteUsd: 0 }, { perMinuteUsd: -1 }]) {
    const { ratePerMinuteCents } = resolveCallRate(plan);
    assert.ok(ratePerMinuteCents > 0, `fell back to free for ${JSON.stringify(plan)}`);
    assert.equal(ratePerMinuteCents, usdToBillingMinor(0.12));
  }
});

test('call charge uses the customer rate card, and records the rate applied', () => {
  const c = calculateCallCharge(150, { perMinuteUsd: 0.085 }); // 2.5 billed minutes
  assert.equal(c.minutes, 2.5);
  assert.equal(c.ratePerMinuteCents, 816);
  assert.equal(c.amountCents, 2040);      // 2.5 x 816
  assert.equal(c.fxRate, 96);             // snapshotted for reproducibility
  assert.equal(c.perMinuteUsd, 0.085);
});

test('charges are always non-negative', () => {
  for (const sec of [0, -1, 1, 3600]) {
    assert.ok(calculateCallCharge(sec, { perMinuteUsd: 0.085 }).amountCents >= 0);
  }
});

// ── Proration ───────────────────────────────────────────────────────────────
const PERIOD = {
  periodStart: new Date('2026-01-01T00:00:00Z'),
  periodEnd: new Date('2026-01-31T00:00:00Z'), // 30 days
};
const STARTER = { priceUsd: 36 };
const GROWTH = { priceUsd: 399 };

test('upgrade at the exact midpoint charges half the difference', () => {
  const p = calculateProration({
    oldPlan: STARTER, newPlan: GROWTH, ...PERIOD,
    now: new Date('2026-01-16T00:00:00Z'), // 15 of 30 days used
  });
  assert.ok(Math.abs(p.unusedFraction - 0.5) < 1e-9);
  assert.equal(p.creditCents, usdToBillingMinor(18));    // half of $36
  assert.equal(p.chargeCents, usdToBillingMinor(199.5)); // half of $399
  assert.equal(p.amountCents, p.chargeCents - p.creditCents);
  assert.ok(p.amountCents > 0, 'upgrade should owe money');
});

test('downgrade at the midpoint yields a credit (negative amount)', () => {
  const p = calculateProration({
    oldPlan: GROWTH, newPlan: STARTER, ...PERIOD,
    now: new Date('2026-01-16T00:00:00Z'),
  });
  assert.ok(p.amountCents < 0, 'downgrade should be owed a credit');
});

test('a change on the first instant prorates the full period', () => {
  const p = calculateProration({ oldPlan: STARTER, newPlan: GROWTH, ...PERIOD, now: PERIOD.periodStart });
  assert.equal(p.unusedFraction, 1);
  assert.equal(p.chargeCents, usdToBillingMinor(399));
});

test('a change at the very end prorates to nothing', () => {
  const p = calculateProration({ oldPlan: STARTER, newPlan: GROWTH, ...PERIOD, now: PERIOD.periodEnd });
  assert.equal(p.unusedFraction, 0);
  assert.equal(p.amountCents, 0);
});

test('proration clamps outside the period instead of extrapolating', () => {
  // A clock skew or a late job must not manufacture a >100% credit.
  const before = calculateProration({ oldPlan: STARTER, newPlan: GROWTH, ...PERIOD, now: new Date('2025-06-01') });
  assert.equal(before.unusedFraction, 1);
  const after = calculateProration({ oldPlan: STARTER, newPlan: GROWTH, ...PERIOD, now: new Date('2027-06-01') });
  assert.equal(after.unusedFraction, 0);
});

test('proration uses real period length, not an assumed 30-day month', () => {
  // February is shorter; the same elapsed days must prorate differently.
  const feb = calculateProration({
    oldPlan: STARTER, newPlan: GROWTH,
    periodStart: new Date('2026-02-01T00:00:00Z'),
    periodEnd: new Date('2026-03-01T00:00:00Z'), // 28 days
    now: new Date('2026-02-15T00:00:00Z'),
  });
  assert.ok(Math.abs(feb.unusedFraction - 14 / 28) < 1e-9);
});

test('a zero-length period does not divide by zero', () => {
  const p = calculateProration({
    oldPlan: STARTER, newPlan: GROWTH,
    periodStart: PERIOD.periodStart, periodEnd: PERIOD.periodStart,
    now: PERIOD.periodStart,
  });
  assert.equal(p.amountCents, 0);
  assert.equal(Number.isFinite(p.amountCents), true);
});

// ── INR-native plan pricing ─────────────────────────────────────────────────
// Plans were priced only in USD and converted at charge time, so the page
// advertised "$89/month" while the wallet was debited 8,544 — and changing
// FX_USD_TO_INR silently repriced the whole catalogue.

test('a native INR price is used verbatim, not re-derived from USD', async () => {
  const { planPriceMinor } = await import('../money.js');
  const p = planPriceMinor({ priceInr: 7999, priceUsd: 89 });
  assert.equal(p.amountCents, 799_900, 'must charge the INR price, not 89 x 96');
  assert.equal(p.native, true);
  assert.equal(p.fxRate, null, 'no conversion happened, so no rate may be recorded');
});

test('a plan without an INR price still falls back to USD x FX', async () => {
  const { planPriceMinor } = await import('../money.js');
  const p = planPriceMinor({ priceInr: null, priceUsd: 36 });
  assert.equal(p.amountCents, usdToBillingMinor(36));
  assert.equal(p.native, false);
  assert.equal(p.fxRate, 96);
});

test('a native INR price is immune to an FX change', async () => {
  const { planPriceMinor } = await import('../money.js');
  const before = planPriceMinor({ priceInr: 7999, priceUsd: 89 }).amountCents;
  process.env.FX_USD_TO_INR = '120';
  const after = planPriceMinor({ priceInr: 7999, priceUsd: 89 }).amountCents;
  const derived = planPriceMinor({ priceInr: null, priceUsd: 89 }).amountCents;
  process.env.FX_USD_TO_INR = '96';
  assert.equal(before, after, 'an FX move must not reprice a native INR plan');
  assert.notEqual(derived, after, 'a USD-derived plan DOES move — that is the problem INR pricing solves');
});

test('a zero INR price is honoured, not treated as missing', async () => {
  // The Free plan. `priceInr: 0` is falsy, so a `||` fallback would price it
  // at priceUsd x FX and start charging for the free tier.
  const { planPriceMinor } = await import('../money.js');
  assert.equal(planPriceMinor({ priceInr: 0, priceUsd: 0 }).amountCents, 0);
  assert.equal(planPriceMinor({ priceInr: 0, priceUsd: 50 }).amountCents, 0);
});

test('the per-minute rate prefers the native INR figure', () => {
  const native = resolveCallRate({ perMinuteInr: 7.68, perMinuteUsd: 0.08 });
  assert.equal(native.ratePerMinuteCents, 768);
  assert.equal(native.native, true);
  assert.equal(native.fxRate, null);

  const derived = resolveCallRate({ perMinuteInr: null, perMinuteUsd: 0.085 });
  assert.equal(derived.ratePerMinuteCents, 816);
  assert.equal(derived.native, false);
});

test('a call is charged at the native INR rate', () => {
  const c = calculateCallCharge(150, { perMinuteInr: 7.68, perMinuteUsd: 0.08 });
  assert.equal(c.minutes, 2.5);
  assert.equal(c.amountCents, 2.5 * 768);
});

test('proration works on native INR plans', () => {
  const p = calculateProration({
    oldPlan: { priceInr: 3456 }, newPlan: { priceInr: 38304 },
    periodStart: new Date('2026-01-01T00:00:00Z'),
    periodEnd: new Date('2026-01-31T00:00:00Z'),
    now: new Date('2026-01-16T00:00:00Z'),
  });
  assert.equal(p.creditCents, Math.round(345_600 * 0.5));
  assert.equal(p.chargeCents, Math.round(3_830_400 * 0.5));
  assert.ok(p.amountCents > 0);
});

test('a null/undefined INR price must NOT be coerced to free', async () => {
  // Number(null) === 0, and planPriceMinor accepts >= 0 so the Free plan works.
  // Together those made a paid plan with no INR price resolve to 0 — free.
  const { planPriceMinor } = await import('../money.js');
  for (const priceInr of [null, undefined, '']) {
    const p = planPriceMinor({ priceInr, priceUsd: 399 });
    assert.equal(p.native, false, `treated ${String(priceInr)} as a native price`);
    assert.equal(p.amountCents, usdToBillingMinor(399));
    assert.ok(p.amountCents > 0, 'a paid plan must never resolve to free');
  }
});

test('a null per-minute INR rate falls back rather than billing nothing', async () => {
  for (const perMinuteInr of [null, undefined, '']) {
    const r = resolveCallRate({ perMinuteInr, perMinuteUsd: 0.085 });
    assert.equal(r.native, false);
    assert.equal(r.ratePerMinuteCents, 816);
  }
});
