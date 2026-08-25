// backend/src/services/plivo/__tests__/number.test.js
//
// Renting is the step that spends money and binds a caller ID to a customer for
// good. The decisions worth pinning are the ones that are silent when wrong:
//
//   searchPatternFor()      — showing a promotional workspace a landline means
//                             it picks one, rents it, and dials illegally.
//   seriesForRentedNumber() — classifyNumberSeries() returns UNKNOWN for every
//                             Indian landline, so storing its answer verbatim
//                             would make every transactional number fail the
//                             compliance checklist forever.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const {
  normalizeSearchResult,
  searchPatternFor,
  seriesForRentedNumber,
} = await import('../number.service.js');

const { NUMBER_SERIES, USE_CASE } = await import('../../../constants/compliance.js');

/** Mumbai landline, Bengaluru landline, a 140, a 1600, a mobile. */
const MUMBAI = '+912269851741';
const BENGALURU = '+918041234567';
const PROMO = '+911402345678';
const BFSI = '+911600123456';
const MOBILE = '+919876543210';

// ── Search patterns ─────────────────────────────────────────────────────────

describe('searchPatternFor', () => {
  test('forces 140 for a promotional workspace even with no pattern given', () => {
    assert.equal(searchPatternFor(USE_CASE.PROMOTIONAL, undefined).pattern, '140');
    assert.equal(searchPatternFor(USE_CASE.PROMOTIONAL, '').pattern, '140');
  });

  test('refuses a promotional search that would surface non-140 numbers', () => {
    // The whole point: a caller-supplied pattern must not be able to put a
    // landline in front of a workspace that may only dial from 140.
    const out = searchPatternFor(USE_CASE.PROMOTIONAL, '22');
    assert.ok(out.error);
    assert.equal(out.pattern, undefined);
  });

  test('allows a narrower 140 pattern', () => {
    assert.equal(searchPatternFor(USE_CASE.PROMOTIONAL, '14023').pattern, '14023');
  });

  test('refuses a 140 search for a transactional workspace', () => {
    const out = searchPatternFor(USE_CASE.TRANSACTIONAL, '140');
    assert.ok(out.error);
    assert.match(out.error, /promotional/i);
  });

  test('passes an STD code through for a transactional workspace', () => {
    assert.equal(searchPatternFor(USE_CASE.TRANSACTIONAL, '22').pattern, '22');
    // No pattern is legitimate: landline ranges have no single prefix, so the
    // city filter narrows instead.
    assert.equal(searchPatternFor(USE_CASE.TRANSACTIONAL, undefined).pattern, undefined);
  });

  test('strips non-digits rather than passing them to the carrier', () => {
    assert.equal(searchPatternFor(USE_CASE.TRANSACTIONAL, '0 22-').pattern, '022');
  });

  test('refuses entirely when no use case is declared', () => {
    assert.ok(searchPatternFor(null, '22').error);
    assert.ok(searchPatternFor(undefined, undefined).error);
  });
});

// ── Series resolution ───────────────────────────────────────────────────────

describe('seriesForRentedNumber', () => {
  test('records a transactional landline as TRANSACTIONAL_LANDLINE, not UNKNOWN', () => {
    // classifyNumberSeries() cannot tell a Mumbai landline from anything else
    // and returns UNKNOWN. Storing that would fail seriesPermitsUseCase() for
    // the life of the number.
    for (const n of [MUMBAI, BENGALURU]) {
      const out = seriesForRentedNumber(n, USE_CASE.TRANSACTIONAL);
      assert.equal(out.error, undefined, `${n}: ${out.error}`);
      assert.equal(out.series, NUMBER_SERIES.TRANSACTIONAL_LANDLINE);
    }
  });

  test('lets the digits win where they are decidable', () => {
    assert.equal(seriesForRentedNumber(PROMO, USE_CASE.PROMOTIONAL).series, NUMBER_SERIES.PROMOTIONAL_140);
    assert.equal(seriesForRentedNumber(BFSI, USE_CASE.TRANSACTIONAL).series, NUMBER_SERIES.BFSI_1600);
  });

  test('refuses a landline for a promotional workspace', () => {
    const out = seriesForRentedNumber(MUMBAI, USE_CASE.PROMOTIONAL);
    assert.ok(out.error);
    assert.equal(out.series, undefined);
  });

  test('refuses a 140 for a transactional workspace', () => {
    const out = seriesForRentedNumber(PROMO, USE_CASE.TRANSACTIONAL);
    assert.ok(out.error);
    assert.match(out.error, /140-series/);
  });

  test('refuses a mobile number for either use case, by name', () => {
    for (const useCase of [USE_CASE.PROMOTIONAL, USE_CASE.TRANSACTIONAL]) {
      const out = seriesForRentedNumber(MOBILE, useCase);
      assert.ok(out.error);
      assert.match(out.error, /mobile/i);
    }
  });

  test('refuses a non-Indian number', () => {
    assert.ok(seriesForRentedNumber('+14155550100', USE_CASE.TRANSACTIONAL).error);
    assert.ok(seriesForRentedNumber('', USE_CASE.TRANSACTIONAL).error);
  });

  test('never returns a series the use case does not permit', () => {
    // The invariant, stated directly: whatever comes back must pass the gate
    // the compliance checklist applies later.
    const cases = [
      [MUMBAI, USE_CASE.TRANSACTIONAL], [BENGALURU, USE_CASE.TRANSACTIONAL],
      [BFSI, USE_CASE.TRANSACTIONAL], [PROMO, USE_CASE.PROMOTIONAL],
      [MUMBAI, USE_CASE.PROMOTIONAL], [PROMO, USE_CASE.TRANSACTIONAL], [MOBILE, USE_CASE.PROMOTIONAL],
    ];
    for (const [number, useCase] of cases) {
      const out = seriesForRentedNumber(number, useCase);
      if (out.series) {
        assert.ok(
          (useCase === USE_CASE.PROMOTIONAL && out.series === NUMBER_SERIES.PROMOTIONAL_140)
          || (useCase === USE_CASE.TRANSACTIONAL
            && [NUMBER_SERIES.TRANSACTIONAL_LANDLINE, NUMBER_SERIES.BFSI_1600].includes(out.series)),
          `${number} under ${useCase} yielded ${out.series}`,
        );
      }
    }
  });
});

// ── Search result shaping ───────────────────────────────────────────────────

describe('normalizeSearchResult', () => {
  const raw = {
    number: '912269851741',
    city: 'Mumbai',
    region: 'Maharashtra',
    type: 'local',
    monthly_rental_rate: '200.00',
    voice_enabled: true,
  };

  test('puts the plus back on — Plivo returns bare digits, VoiceNumber stores E.164', () => {
    // The two formats must never be confused: resolveProviderIdForNumber
    // matches the caller ID by exact string, so a number stored bare would
    // silently route to the wrong carrier.
    const out = normalizeSearchResult(raw, USE_CASE.TRANSACTIONAL);
    assert.equal(out.phoneNumber, '+912269851741');
  });

  test('carries the series it would be recorded under', () => {
    assert.equal(
      normalizeSearchResult(raw, USE_CASE.TRANSACTIONAL).series,
      NUMBER_SERIES.TRANSACTIONAL_LANDLINE,
    );
  });

  test('marks an unusable number with its reason rather than dropping it silently', () => {
    const out = normalizeSearchResult(raw, USE_CASE.PROMOTIONAL);
    assert.ok(out.unusableReason);
    assert.equal(out.series, null);
  });

  test('exposes the carrier rental as carrier cost, not as a client price', () => {
    // Named so nothing renders it to a customer by accident: the client's price
    // comes from our rate card, which phase D owns.
    const out = normalizeSearchResult(raw, USE_CASE.TRANSACTIONAL);
    assert.equal(out.carrierMonthlyRental, '200.00');
    assert.equal('monthlyRental' in out, false);
    assert.equal('price' in out, false);
  });

  test('survives a response missing every optional field', () => {
    const out = normalizeSearchResult({ number: '912269851741' }, USE_CASE.TRANSACTIONAL);
    assert.equal(out.phoneNumber, '+912269851741');
    assert.equal(out.city, null);
    assert.equal(out.carrierMonthlyRental, null);
  });

  test('an empty response object yields no phone number, so the caller filters it out', () => {
    assert.equal(normalizeSearchResult({}, USE_CASE.TRANSACTIONAL).phoneNumber, '');
  });
});
