// What these pin: variables the call itself already knows — the customer's
// number, the call's timing — reach every post-call destination without the
// extraction model having to hear them, never overwrite what the customer
// actually said, and never get mistaken for an appointment by the calendar.

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CALL_FACT_KEYS,
  CALL_FACT_VARIABLES,
  callFactValues,
  formatLocalIso,
  withCallFacts,
} from '../postCallExtraction.utils.js';
import { resolveAppointmentStart } from '../googleCalendar.service.js';

const TZ = 'Asia/Kolkata';

/** A finished outbound call as callFinalizer leaves the row: 4m12s, ended 15:34:12 IST. */
const endedOutbound = () => ({
  id: 'call_1',
  phoneNumber: '+919876543210',
  fromNumber: '+918045678901',
  // Row created at DIAL time, a little before the customer picked up.
  startedAt: new Date('2026-09-13T09:59:40.000Z'),
  endedAt: new Date('2026-09-13T10:04:12.000Z'),
  durationSec: 252,
});

const extracted = (pairs) => Object.entries(pairs).map(([key, value]) => ({
  key, description: `${key} description`, configIds: ['cfg'], value, evidence: value == null ? null : 'said so',
}));

const byKey = (list) => Object.fromEntries(list.map((v) => [v.key, v]));

describe('callFactValues', () => {
  test('reads the customer and business numbers, and times the call in local time', () => {
    assert.deepEqual(callFactValues(endedOutbound(), { timeZone: TZ }), {
      customer_phone: '+919876543210',
      business_phone: '+918045678901',
      // endedAt − durationSec, NOT the dial-time startedAt (15:29:40).
      call_started_at: '2026-09-13T15:30:00',
      call_ended_at: '2026-09-13T15:34:12',
      call_duration_sec: 252,
    });
  });

  test('a call still in progress reports no end and no duration, rather than "0 seconds"', () => {
    const row = { ...endedOutbound(), endedAt: null, durationSec: 0 };
    const facts = callFactValues(row, { timeZone: TZ });
    assert.equal(facts.call_ended_at, null);
    assert.equal(facts.call_duration_sec, null);
    assert.equal(facts.call_started_at, '2026-09-13T15:29:40', 'falls back to the row start');
  });

  test('a web call has no numbers', () => {
    const row = { ...endedOutbound(), phoneNumber: null, fromNumber: '   ' };
    const facts = callFactValues(row, { timeZone: TZ });
    assert.equal(facts.customer_phone, null);
    assert.equal(facts.business_phone, null);
  });
});

describe('withCallFacts', () => {
  test('appends every call fact the agent does not define, marked built-in', () => {
    const out = withCallFacts(extracted({ customer_name: 'Priya' }), endedOutbound(), { timeZone: TZ });
    assert.equal(out.length, 1 + CALL_FACT_VARIABLES.length);
    const v = byKey(out);
    assert.equal(v.customer_name.value, 'Priya');
    assert.equal(v.customer_name.source, undefined, 'extracted values are left alone');
    assert.equal(v.customer_phone.value, '+919876543210');
    assert.equal(v.customer_phone.source, 'call');
    assert.equal(v.customer_phone.builtin, true);
    assert.equal(v.call_duration_sec.value, 252);
  });

  test('a number the customer SAID is kept — the call does not overwrite it', () => {
    const out = withCallFacts(extracted({ customer_phone: '98111 22233' }), endedOutbound(), { timeZone: TZ });
    const v = byKey(out);
    assert.equal(v.customer_phone.value, '98111 22233');
    assert.equal(v.customer_phone.source, undefined);
    assert.equal(v.customer_phone.evidence, 'said so');
  });

  test('"use the number you called me on": an empty defined variable is filled from the call', () => {
    const out = withCallFacts(extracted({ customer_phone: null }), endedOutbound(), { timeZone: TZ });
    const v = byKey(out);
    assert.equal(v.customer_phone.value, '+919876543210');
    assert.equal(v.customer_phone.source, 'call');
    assert.equal(v.customer_phone.builtin, undefined, 'still the agent\'s own variable, so its Sheet column stays');
    assert.deepEqual(v.customer_phone.configIds, ['cfg']);
    assert.equal(out.filter((x) => x.key === 'customer_phone').length, 1, 'no duplicate entry');
  });

  test('a defined variable matched regardless of case', () => {
    const out = withCallFacts(extracted({ Customer_Phone: null }), endedOutbound(), { timeZone: TZ });
    assert.equal(out.filter((x) => x.key.toLowerCase() === 'customer_phone').length, 1);
    assert.equal(out.find((x) => x.key === 'Customer_Phone').value, '+919876543210');
  });

  test('on a web call an empty defined variable is left exactly as extraction returned it', () => {
    const row = { ...endedOutbound(), phoneNumber: null };
    const input = extracted({ customer_phone: null });
    const out = withCallFacts(input, row, { timeZone: TZ });
    assert.deepEqual(out.find((x) => x.key === 'customer_phone'), input[0]);
  });

  test('idempotent, and refreshes what it wrote once the row has ended', () => {
    const live = { ...endedOutbound(), endedAt: null, durationSec: 0 };
    const first = withCallFacts(extracted({ customer_name: 'Priya' }), live, { timeZone: TZ });
    assert.equal(byKey(first).call_duration_sec.value, null);

    const second = withCallFacts(first, endedOutbound(), { timeZone: TZ });
    assert.equal(second.length, first.length, 'a second pass adds nothing');
    assert.equal(byKey(second).call_duration_sec.value, 252);
    assert.equal(byKey(second).call_ended_at.value, '2026-09-13T15:34:12');

    const third = withCallFacts(second, endedOutbound(), { timeZone: TZ });
    assert.deepEqual(third, second);
  });

  test('never mutates the list it was given', () => {
    const input = extracted({ customer_phone: null });
    const snapshot = JSON.parse(JSON.stringify(input));
    withCallFacts(input, endedOutbound(), { timeZone: TZ });
    assert.deepEqual(input, snapshot);
  });

  test('with no row, returns a copy of the variables unchanged', () => {
    const input = extracted({ customer_name: 'Priya' });
    const out = withCallFacts(input, null);
    assert.deepEqual(out, input);
    assert.notEqual(out, input);
  });
});

describe('call facts stay out of the calendar', () => {
  // resolveAppointmentStart books the first variable matching
  // /(date|time|when|slot)/ when no date variable is configured. A call fact
  // caught by that would book a calendar event at the moment of every call.
  test('no call fact name looks like an appointment field', () => {
    for (const key of CALL_FACT_KEYS) {
      assert.doesNotMatch(key, /(date|time|when|slot)/i, `${key} would be picked up as an appointment`);
    }
  });

  test('a call with only call facts has no appointment to book', () => {
    const variables = withCallFacts([], endedOutbound(), { timeZone: TZ });
    assert.equal(resolveAppointmentStart(variables, {}), null);
  });

  test('a real appointment variable still wins alongside them', () => {
    const variables = withCallFacts(extracted({ appointment_date: '2026-09-20T11:00:00' }), endedOutbound(), { timeZone: TZ });
    const resolved = resolveAppointmentStart(variables, {});
    assert.ok(resolved, 'the appointment is still found');
    assert.equal(resolved.from, 'appointment_date');
  });
});

describe('formatLocalIso', () => {
  test('writes wall-clock time in the zone, not UTC', () => {
    // 19:00 UTC is already the next day in India — the off-by-one-day trap the
    // extraction prompt's anchor exists to avoid.
    assert.equal(formatLocalIso('2026-09-13T19:00:00.000Z', TZ), '2026-09-14T00:30:00');
  });

  test('an invalid date is null, not "Invalid Date"', () => {
    assert.equal(formatLocalIso('not a date', TZ), null);
  });
});
