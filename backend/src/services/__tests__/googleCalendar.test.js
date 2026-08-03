// backend/src/services/__tests__/googleCalendar.test.js
/**
 * Appointment date handling for Google Calendar delivery.
 *
 * The bug these lock down: extraction emits a NAIVE "YYYY-MM-DDThh:mm:ss" (the
 * wall clock the caller stated), and createEvent used to run it through
 * `new Date()` — which the JS spec parses in the SERVER'S zone — then labelled
 * the result UTC. On a UTC host a 3 PM booking became 3 PM UTC = 8:30 PM IST,
 * while looking perfectly correct on an IST dev machine. Deployment-dependent
 * correctness bugs do not show up in manual testing, so they are pinned here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppointmentDate, combineDateAndTime, resolveAppointmentStart, wallToInstant } from '../googleCalendar.service.js';

describe('parseAppointmentDate', () => {
  it('preserves a naive wall clock without converting it', () => {
    const r = parseAppointmentDate('2026-08-05T15:00:00');
    assert.equal(r.wall, '2026-08-05T15:00:00');
    assert.equal(r.hasZone, false);
    // The whole point: no instant is derived, so no server offset can leak in.
    assert.equal(r.date, null);
  });

  it('gives the same wall clock regardless of the host timezone', () => {
    const saved = process.env.TZ;
    const seen = new Set();
    for (const tz of ['UTC', 'Asia/Kolkata', 'America/New_York']) {
      process.env.TZ = tz;
      seen.add(parseAppointmentDate('2026-08-05T15:00:00').wall);
    }
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
    assert.equal(seen.size, 1, `wall clock drifted with host TZ: ${[...seen]}`);
  });

  it('accepts the looser forms a model may emit', () => {
    assert.equal(parseAppointmentDate('2026-08-05 15:00').wall, '2026-08-05T15:00:00');
    assert.equal(parseAppointmentDate('2026-08-05').wall, '2026-08-05T00:00:00');
    assert.equal(parseAppointmentDate('2026-08-05T09:05:30').wall, '2026-08-05T09:05:30');
  });

  it('treats an explicit offset as a real instant', () => {
    const z = parseAppointmentDate('2026-08-05T15:00:00Z');
    assert.equal(z.hasZone, true);
    assert.equal(z.date.toISOString(), '2026-08-05T15:00:00.000Z');

    const ist = parseAppointmentDate('2026-08-05T15:00:00+05:30');
    assert.equal(ist.hasZone, true);
    assert.equal(ist.date.toISOString(), '2026-08-05T09:30:00.000Z');
  });

  it('rejects an impossible date instead of rolling it over', () => {
    // `new Date('2026-02-31')` silently becomes March 3 — booking the wrong day.
    assert.throws(() => parseAppointmentDate('2026-02-31T10:00:00'), /not a real date/);
    assert.throws(() => parseAppointmentDate('2026-13-01T10:00:00'), /not a real date|not a recognisable/);
    assert.throws(() => parseAppointmentDate('2026-08-05T25:00:00'), /not a real date|not a recognisable/);
  });

  it('rejects ambiguous and unparseable values rather than guessing', () => {
    // 05/08/2026 is May 8 in the US and 5 Aug elsewhere — never guess a day.
    assert.throws(() => parseAppointmentDate('05/08/2026'), /not a recognisable date/);
    assert.throws(() => parseAppointmentDate('next Tuesday at 3pm'), /not a recognisable date/);
    assert.throws(() => parseAppointmentDate('soon'), /not a recognisable date/);
  });

  it('reports an empty extraction distinctly from a bad one', () => {
    for (const empty of ['', '   ', null, undefined]) {
      assert.throws(() => parseAppointmentDate(empty), /No appointment date\/time was extracted/);
    }
  });

  it('accepts a Date instance as an instant', () => {
    const d = new Date('2026-08-05T15:00:00Z');
    const r = parseAppointmentDate(d);
    assert.equal(r.hasZone, true);
    assert.equal(r.date.getTime(), d.getTime());
  });
});

describe('combineDateAndTime', () => {
  it('accepts the time formats a model emits', () => {
    for (const [t, want] of [
      ['3:00 PM', '2026-08-05T15:00:00'], ['15:00', '2026-08-05T15:00:00'],
      ['3 pm', '2026-08-05T15:00:00'], ['3:00 p.m.', '2026-08-05T15:00:00'],
      ['09:05:30', '2026-08-05T09:05:30'], ['12:00 AM', '2026-08-05T00:00:00'],
      ['12:00 PM', '2026-08-05T12:00:00'],
    ]) assert.equal(combineDateAndTime('2026-08-05', t), want, `time "${t}"`);
  });

  it('accepts a full ISO datetime as the time source', () => {
    // Extraction emits ISO 8601 for every date/time value, so the "time"
    // variable is frequently a whole datetime rather than a bare clock time.
    assert.equal(combineDateAndTime('2026-08-03', '2026-08-03T10:00:00'), '2026-08-03T10:00:00');
    assert.equal(combineDateAndTime('2026-08-03T00:00:00', '2026-08-03T16:45:00'), '2026-08-03T16:45:00');
  });

  it('returns null rather than guessing at unusable input', () => {
    for (const t of ['noon', 'afternoon', '', null, '25:00']) {
      assert.equal(combineDateAndTime('2026-08-05', t), null, `time "${t}"`);
    }
    assert.equal(combineDateAndTime('not-a-date', '15:00'), null);
  });
});

describe('resolveAppointmentStart', () => {
  // The shapes onboarding-generated agents actually produce — the reason the
  // feature silently booked midnight (or nothing) before: it only ever looked
  // for ONE combined variable, which none of these agents have.
  const purva = [
    { key: 'patient_name', value: 'Anita' },
    { key: 'appointment_date', value: '2026-08-05' },
    { key: 'appointment_time', value: '3:00 PM' },
  ];
  const hospital = [
    { key: 'date_of_birth', value: '1988-03-11' },
    { key: 'preferred_date', value: '2026-08-06' },
    { key: 'preferred_time', value: '11:30' },
  ];

  it('treats a midnight date stamp as "no time given" and uses the time variable', () => {
    // Real regression from a live call ("कल सुबह दस बजे" = tomorrow at ten):
    // extraction is told to emit T00:00:00 when only a date was mentioned, so
    // appointment_date came back as 2026-08-03T00:00:00 while the real 10:00
    // sat in appointment_time. Treating midnight as a genuine time booked every
    // appointment at 00:00 and ignored the time variable entirely.
    const r = resolveAppointmentStart([
      { key: 'appointment_date', value: '2026-08-03T00:00:00' },
      { key: 'appointment_time', value: '2026-08-03T10:00:00' },
    ], {});
    assert.equal(r.value, '2026-08-03T10:00:00');
  });

  it('keeps a real (non-midnight) time on the date variable', () => {
    const r = resolveAppointmentStart([
      { key: 'appointment_date', value: '2026-08-05T14:00:00' },
      { key: 'appointment_time', value: '2026-08-05T09:00:00' },
    ], {});
    assert.equal(r.value, '2026-08-05T14:00:00');
  });

  it('still books midnight when that is genuinely all that was said', () => {
    const r = resolveAppointmentStart([{ key: 'appointment_date', value: '2026-08-05' }], {});
    assert.equal(r.value, '2026-08-05');
  });

  it('joins a date + time pair with no configuration at all', () => {
    assert.equal(resolveAppointmentStart(purva, {}).value, '2026-08-05T15:00:00');
    assert.equal(resolveAppointmentStart(hospital, {}).value, '2026-08-06T11:30:00');
  });

  it('honours an explicitly configured date variable', () => {
    const r = resolveAppointmentStart(purva, { dateVariable: 'appointment_date' });
    assert.equal(r.value, '2026-08-05T15:00:00');
  });

  it('never books against a date of birth', () => {
    assert.equal(resolveAppointmentStart([{ key: 'date_of_birth', value: '1988-03-11' }], {}), null);
    // and must not pick it even when it is the only "date" alongside a time
    const r = resolveAppointmentStart(
      [{ key: 'date_of_birth', value: '1988-03-11' }, { key: 'call_time', value: '10:00' }], {},
    );
    assert.equal(r, null);
  });

  it('prefers the appointment pair over an unrelated one', () => {
    const r = resolveAppointmentStart([
      { key: 'followup_date', value: '2026-09-01' }, { key: 'followup_time', value: '10:00' },
      { key: 'appointment_date', value: '2026-08-06' }, { key: 'appointment_time', value: '16:45' },
    ], {});
    assert.equal(r.value, '2026-08-06T16:45:00');
  });

  it('passes through an already-combined variable', () => {
    const r = resolveAppointmentStart([{ key: 'appointment_datetime', value: '2026-08-07T09:00:00' }], {});
    assert.equal(r.value, '2026-08-07T09:00:00');
  });

  it('returns null when nothing usable was extracted', () => {
    assert.equal(resolveAppointmentStart([{ key: 'patient_name', value: 'A' }], {}), null);
    assert.equal(resolveAppointmentStart([], {}), null);
  });

  it('reports which variables it used, for diagnosing a wrong booking', () => {
    assert.equal(resolveAppointmentStart(purva, {}).from, 'appointment_date + appointment_time');
  });
});

describe('wallToInstant', () => {
  // Backs the double-booking check: a conflict lookup needs absolute times,
  // while bookings are held as wall clock. Getting this wrong would compare the
  // wrong window and either miss a clash or invent one.
  it('resolves a wall clock in the given zone', () => {
    assert.equal(wallToInstant('2026-08-03T10:00:00', 'Asia/Kolkata').toISOString(), '2026-08-03T04:30:00.000Z');
    assert.equal(wallToInstant('2026-08-03T10:00:00', 'UTC').toISOString(), '2026-08-03T10:00:00.000Z');
  });

  it('is independent of the host timezone', () => {
    const saved = process.env.TZ;
    const seen = new Set();
    for (const tz of ['UTC', 'Asia/Kolkata', 'America/New_York']) {
      process.env.TZ = tz;
      seen.add(wallToInstant('2026-08-03T10:00:00', 'Asia/Kolkata').toISOString());
    }
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
    assert.equal(seen.size, 1, `drifted with host TZ: ${[...seen]}`);
  });

  it('handles a zone with DST', () => {
    // New York is UTC-4 in August, UTC-5 in January.
    assert.equal(wallToInstant('2026-08-03T10:00:00', 'America/New_York').toISOString(), '2026-08-03T14:00:00.000Z');
    assert.equal(wallToInstant('2026-01-03T10:00:00', 'America/New_York').toISOString(), '2026-01-03T15:00:00.000Z');
  });

  it('produces a window whose end is after its start', () => {
    const a = wallToInstant('2026-08-03T10:00:00', 'Asia/Kolkata');
    const b = wallToInstant('2026-08-03T10:30:00', 'Asia/Kolkata');
    assert.equal(b - a, 30 * 60 * 1000);
  });
});
