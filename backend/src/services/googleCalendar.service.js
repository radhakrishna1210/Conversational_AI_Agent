// backend/src/services/googleCalendar.service.js
/**
 * Google Calendar delivery for Post-Call results, plus a small CRUD surface
 * (list/get/update/delete/availability) for verifying and using the
 * integration beyond the one-shot post-call create.
 *
 * Uses the workspace's connected `google_calendar` integration to create an
 * event on the user's calendar from the appointment date/time that Post-Call
 * extraction pulled out of the conversation.
 *
 * The OAuth grant carries the `calendar` scope (see constants/integrations.js),
 * so writing events needs no additional consent.
 *
 * Token/refresh plumbing lives in googleAuth.service.js, shared with
 * googleSheets.service.js and googleMeet.service.js — see that file for the
 * per-workspace credential override and reactive refresh-and-retry logic.
 */

import crypto from 'node:crypto';
import logger from '../lib/logger.js';
import { googleFetch, googleRequest, getValidAccessToken as getValidGoogleToken } from './googleAuth.service.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_CALENDAR_ID = 'primary';
const DEFAULT_DURATION_MIN = 30;

/**
 * Timezone an appointment is booked in when the extracted value carries no
 * offset of its own — which is the normal case, because extraction asks the
 * model for a bare "YYYY-MM-DDThh:mm:ss" (see postCallExtraction.service.js).
 *
 * This MUST NOT be UTC and MUST NOT be the server's local zone. A caller who
 * says "three in the afternoon" means three in THEIR afternoon; deriving the
 * zone from wherever the process happens to run makes the same call book
 * different times in dev and in production. Configure APPOINTMENT_TIMEZONE per
 * deployment; the default matches this product's market (Hindi/en-IN agents,
 * INR billing) rather than pretending there is a neutral choice.
 */
const DEFAULT_TIMEZONE = process.env.APPOINTMENT_TIMEZONE || 'Asia/Kolkata';

/**
 * Return a usable access token for the workspace's Google Calendar integration,
 * transparently refreshing an expired one. Bare-string return kept for
 * backward compatibility with any existing caller — new code should prefer
 * calling googleFetch/googleRequest directly, which resolve their own token
 * per call (and can therefore retry after a refresh).
 */
export const getValidAccessToken = (workspaceId) =>
  getValidGoogleToken(workspaceId, 'google_calendar').then((r) => r.accessToken);

// "2026-08-05T15:00:00" / "2026-08-05 15:00" / "2026-08-05" — no zone attached.
const NAIVE_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
// A trailing Z or ±hh:mm means the model gave us a real instant.
const HAS_ZONE_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

const pad = (n) => String(n).padStart(2, '0');

/**
 * Parse an extracted appointment date/time.
 *
 * Returns BOTH interpretations because they are not interchangeable:
 *  - `wall`  the naive "YYYY-MM-DDTHH:mm:ss" the caller actually meant, to be
 *            sent to Google alongside an explicit timeZone;
 *  - `hasZone` whether the source already pinned an instant.
 *
 * Why not just `new Date(raw)`: for a string with no offset the JS spec parses
 * in the SERVER'S local zone. Calling .toISOString() on that and labelling the
 * result "UTC" shifted every appointment by the server's offset — booking 3 PM
 * as 8:30 PM for an IST clinic on a UTC host, while looking correct on an IST
 * dev machine. The wall-clock string must survive to Google untouched.
 *
 * @param {string|Date} value
 * @returns {{ wall: string, hasZone: boolean, date: Date|null }}
 */
export function parseAppointmentDate(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw Object.assign(new Error('No appointment date/time was extracted from the conversation'), { statusCode: 400 });
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw Object.assign(new Error('Appointment date is an invalid Date'), { statusCode: 400 });
    }
    return { wall: value.toISOString().slice(0, 19), hasZone: true, date: value };
  }

  const raw = String(value).trim();

  const naive = raw.match(NAIVE_DATETIME_RE);
  if (naive) {
    const [, y, mo, d, h = '00', mi = '00', s = '00'] = naive;
    // Validate via UTC so an impossible date ("2026-02-31") is rejected rather
    // than silently rolling over into March.
    const probe = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    if (
      probe.getUTCFullYear() !== +y || probe.getUTCMonth() !== +mo - 1 || probe.getUTCDate() !== +d
      || +h > 23 || +mi > 59 || +s > 59
    ) {
      throw Object.assign(new Error(`Extracted appointment date/time "${raw}" is not a real date`), { statusCode: 400 });
    }
    return { wall: `${y}-${mo}-${d}T${pad(+h)}:${pad(+mi)}:${pad(+s)}`, hasZone: false, date: null };
  }

  // Anything else: only trust it when it carries an explicit zone, so a format
  // we don't recognise can't be silently reinterpreted in the server's zone.
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime()) && HAS_ZONE_RE.test(raw)) {
    return { wall: date.toISOString().slice(0, 19), hasZone: true, date };
  }

  throw Object.assign(
    new Error(
      `Extracted appointment date/time "${raw}" is not a recognisable date — the agent should output ISO 8601 `
      + '(e.g. 2026-07-28T15:00:00). Check the Post-Call variable description.',
    ),
    { statusCode: 400 },
  );
}

// "15:00" | "3:00 PM" | "3 pm" | "15:00:00" — the shapes a model emits for a
// standalone time variable.
const TIME_RE = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i;

/**
 * Combine a date-only value with a separate time value.
 *
 * Agents generated by onboarding routinely extract `appointment_date` and
 * `appointment_time` as TWO variables, because that is how a receptionist
 * actually confirms a booking. Calendar delivery needs one instant, and using
 * the date alone silently books everyone at midnight — so pair them here rather
 * than forcing every agent to be reconfigured around a single combined field.
 *
 * @returns {string|null} naive "YYYY-MM-DDThh:mm:ss", or null if unusable
 */
export function combineDateAndTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  const dateStr = String(dateValue).trim();
  const dateOnly = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateOnly) return null;

  // The "time" variable is often a FULL datetime rather than a bare time,
  // because extraction is asked to emit ISO 8601 for every date/time value —
  // e.g. appointment_time = "2026-08-03T10:00:00". Take its clock portion.
  const raw = String(timeValue).trim();
  const asDateTime = raw.match(/^\d{4}-\d{2}-\d{2}[T ](\d{2}:\d{2}(?::\d{2})?)/);
  const timeStr = asDateTime ? asDateTime[1] : raw;

  const m = timeStr.match(TIME_RE);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const second = Number(m[3] ?? 0);
  const meridiem = m[4]?.toLowerCase().replace(/\./g, '');
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;

  return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/**
 * Does this value lack a real time-of-day?
 *
 * True for a bare "2026-08-03" AND for "2026-08-03T00:00:00" — extraction is
 * explicitly told to emit midnight when only a date was mentioned ("If only a
 * date is given with no time, use T00:00:00"), so a midnight stamp means "time
 * unknown", not "book at midnight". Treating it as a real time booked every
 * appointment at 00:00 while a perfectly good time sat in the time variable.
 */
const isDateOnly = (v) => /^\d{4}-\d{2}-\d{2}(?:[T ]00:00(?::00(?:\.0+)?)?)?$/.test(String(v ?? '').trim());

/**
 * Work out the appointment start from a call's extracted variables.
 *
 * Order: the explicitly configured variable, then a date+time pair, then a
 * best-effort guess at an appointment-ish variable — because the configured
 * name is frequently absent (the default `appointment_datetime` matches nothing
 * an onboarding-generated agent actually produces) and failing outright there
 * would mean the feature never works without hand-editing every agent.
 *
 * @param {Array<{key: string, value: any}>} variables
 * @param {{dateVariable?: string, dateTimeVariable?: string, timeVariable?: string}} cfg
 * @returns {{ value: string, from: string }|null}
 */
export function resolveAppointmentStart(variables = [], cfg = {}) {
  const get = (key) => {
    if (!key) return undefined;
    const hit = variables.find((v) => String(v?.key).toLowerCase() === String(key).toLowerCase());
    const val = hit?.value;
    return val === null || val === undefined || String(val).trim() === '' ? undefined : String(val).trim();
  };

  const dateKey = cfg.dateVariable || cfg.dateTimeVariable || '';
  const timeKey = cfg.timeVariable
    // "appointment_date" -> "appointment_time" is the convention onboarding uses.
    || (dateKey ? dateKey.replace(/date(time)?$/i, 'time') : '');

  const tryPair = (dKey, tKey) => {
    const d = get(dKey);
    if (!d) return null;
    if (!isDateOnly(d)) return { value: d, from: dKey };
    const t = get(tKey);
    const combined = combineDateAndTime(d, t);
    // A bare date with no time would book at midnight; say so instead.
    return combined ? { value: combined, from: `${dKey} + ${tKey}` } : { value: d, from: dKey };
  };

  if (dateKey) {
    const explicit = tryPair(dateKey, timeKey);
    if (explicit) return explicit;
  }

  // Nothing configured, or the configured key produced nothing: find a
  // plausible pair. Agents name these inconsistently — appointment_date,
  // preferred_date, visit_datetime — because the wording comes from whatever
  // the onboarding model chose for that use case.
  //
  // `date_of_birth` also contains "date", so birth/age keys are excluded
  // outright: booking every patient on their birthday would be a memorable bug.
  const keys = variables
    .map((v) => String(v?.key ?? ''))
    .filter((k) => k && /(date|time|when|slot)/i.test(k))
    .filter((k) => !/(birth|dob|age)/i.test(k));
  if (!keys.length) return null;

  // Prefer keys that clearly refer to the booking over incidental ones like
  // "call_time" or "followup_date".
  const preferred = /(appointment|booking|schedul|visit|slot|preferred|desired|requested)/i;
  const rank = (k) => (preferred.test(k) ? 0 : 1);
  const dateKeys = keys.filter((k) => /date|when/i.test(k)).sort((a, b) => rank(a) - rank(b));
  const timeKeys = keys.filter((k) => /time/i.test(k) && !/date/i.test(k)).sort((a, b) => rank(a) - rank(b));

  // A time with no date is unusable, so never fall back to a time-only key —
  // that produced starts like "10:00" with no day attached.
  const dateish = dateKeys[0];
  if (!dateish) return null;
  // Pair by shared prefix first ("preferred_date" -> "preferred_time"), so an
  // agent with several date/time pairs doesn't cross-match them.
  const stem = dateish.replace(/[_-]?(date|when)(time)?$/i, '').toLowerCase();
  const partner = timeKeys.find((k) => k.toLowerCase().startsWith(stem)) ?? timeKeys[0] ?? '';
  return tryPair(dateish, partner);
}

/** Offset (ms) of `timeZone` from UTC at a given instant. */
function offsetMsAt(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const m = {};
  for (const part of dtf.formatToParts(date)) m[part.type] = part.value;
  return Date.UTC(+m.year, +m.month - 1, +m.day, (+m.hour) % 24, +m.minute, +m.second) - date.getTime();
}

/**
 * Turn a naive wall clock ("2026-08-03T10:00:00") in `timeZone` into a real
 * instant. Needed because conflict lookups take absolute times, while the rest
 * of this module deliberately works in wall clock. Iterates twice so a DST
 * transition resolves correctly (the first offset guess can be the wrong side
 * of the change).
 */
export function wallToInstant(wall, timeZone) {
  const naive = new Date(`${wall}Z`).getTime();
  let d = new Date(naive);
  for (let i = 0; i < 2; i++) d = new Date(naive - offsetMsAt(d, timeZone));
  return d;
}

/**
 * Existing TIMED events overlapping [start, end) on this calendar.
 *
 * Only timed events count. An all-day entry (a public holiday, someone's
 * birthday, an "on leave" marker) reports as busy for the entire day, so
 * treating those as clashes would block every appointment on any day with one —
 * which is why this uses events.list and filters on `start.dateTime` rather than
 * the freeBusy API, which cannot make that distinction.
 *
 * Back-to-back slots do NOT clash: Google's timeMin/timeMax bounds are
 * exclusive on the far edge, so an event ending exactly at `start` is excluded.
 *
 * Exported so googleMeet.service.js can run the same double-booking guard
 * against its own (google_meet-connected) calendar.
 *
 * @param {string} workspaceId
 * @param {string} calendarId
 * @param {Date} startInstant
 * @param {Date} endInstant
 * @param {{ excludeEventId?: string, provider?: string }} [opts]
 *   excludeEventId — leave out this event id from the clash list, so
 *   rescheduling an event never reports it as conflicting with its own
 *   current slot. provider — which Google integration's token to check
 *   against; defaults to 'google_calendar', but googleMeet.service.js passes
 *   'google_meet' since that's a separate connection (its own OAuth consent,
 *   possibly a different Google account entirely) with its own calendar.
 */
export async function findConflicts(workspaceId, calendarId, startInstant, endInstant, { excludeEventId, provider = 'google_calendar' } = {}) {
  const params = new URLSearchParams({
    timeMin: startInstant.toISOString(),
    timeMax: endInstant.toISOString(),
    singleEvents: 'true',      // expand recurring series into real occurrences
    orderBy: 'startTime',
    maxResults: '50',
  });
  const data = await googleFetch(
    workspaceId, provider,
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { method: 'GET' },
  );
  return (data.items || []).filter((e) =>
    e.status !== 'cancelled' && e.start?.dateTime && (!excludeEventId || e.id !== excludeEventId));
}

// Calendar timezones change rarely; one lookup per calendar per process is
// plenty, and this must never add latency or a failure mode to a booking.
const calendarTzCache = new Map();

function warnOnCalendarTimezoneMismatch(workspaceId, calendarId, bookedTz) {
  if (calendarTzCache.has(calendarId)) {
    const tz = calendarTzCache.get(calendarId);
    if (tz && tz !== bookedTz) {
      logger.warn(
        { workspaceId, calendarId, calendarTimeZone: tz, bookedTimeZone: bookedTz },
        `Google Calendar "${calendarId}" displays in ${tz} but appointments are booked in ${bookedTz} — `
        + 'the event time is correct but will LOOK wrong to the calendar owner. '
        + `Set the calendar's timezone to ${bookedTz}, or set APPOINTMENT_TIMEZONE to ${tz}.`,
      );
    }
    return;
  }
  googleFetch(workspaceId, 'google_calendar', `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}`, { method: 'GET' })
    .then((d) => {
      if (!d?.timeZone) return;
      calendarTzCache.set(calendarId, d.timeZone);
      warnOnCalendarTimezoneMismatch(workspaceId, calendarId, bookedTz);
    })
    .catch(() => { /* diagnostics only — never affect a booking */ });
}

/** Add minutes to a naive wall-clock string, staying on the wall clock. */
export function addMinutesToWall(wall, minutes) {
  const [datePart, timePart] = wall.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi, s] = timePart.split(':').map(Number);
  // Arithmetic in a "fake UTC" space: no real zone is involved, so no DST rule
  // can distort a duration that is meant to be wall-clock minutes.
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s) + minutes * 60_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
    + `T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}

/**
 * Create a calendar event.
 *
 * @param {string} workspaceId
 * @param {object} event
 * @param {string|Date} event.start          – appointment start (ISO string or Date)
 * @param {string|Date} [event.end]          – explicit end; defaults to start + durationMin
 * @param {number} [event.durationMin=30]    – used when `end` is absent
 * @param {string} [event.summary]           – event title
 * @param {string} [event.description]       – event body (e.g. call summary / variables)
 * @param {string[]} [event.attendees]       – attendee email addresses
 * @param {string} [event.timeZone='UTC']    – IANA timezone for the event
 * @param {string} [event.calendarId=primary]
 * @param {boolean} [event.createMeetLink=true] – attach a Google Meet video
 *   link to the event. On by default: a booked appointment with no way to
 *   actually join it is rarely what anyone wants. Set false to skip it (e.g.
 *   an in-person appointment).
 */
export async function createEvent(workspaceId, event = {}) {
  const start = parseAppointmentDate(event.start);
  const durationMin = Number(event.durationMin) > 0 ? Number(event.durationMin) : DEFAULT_DURATION_MIN;
  const end = event.end ? parseAppointmentDate(event.end) : null;

  // A value that already pinned an instant is unambiguous, so send it as UTC.
  // A naive value is a WALL CLOCK the caller stated — hand it to Google as-is
  // with the zone it belongs to and let Google resolve it. Converting here is
  // what shifted appointments by the host's offset.
  const timeZone = start.hasZone ? 'UTC' : (event.timeZone || DEFAULT_TIMEZONE);
  const startWall = start.hasZone ? `${start.date.toISOString().slice(0, 19)}` : start.wall;
  const endWall = end
    ? (end.hasZone ? end.date.toISOString().slice(0, 19) : end.wall)
    : addMinutesToWall(startWall, durationMin);

  const calendarId = event.calendarId || DEFAULT_CALENDAR_ID;

  const attendees = Array.isArray(event.attendees)
    ? event.attendees
        .map((e) => String(e).trim())
        .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
        .map((email) => ({ email }))
    : [];

  const wantsMeetLink = event.createMeetLink !== false;

  const body = {
    summary: (event.summary && String(event.summary).slice(0, 1024)) || 'Appointment',
    ...(event.description ? { description: String(event.description).slice(0, 8192) } : {}),
    start: { dateTime: startWall, timeZone },
    end: { dateTime: endWall, timeZone },
    ...(attendees.length ? { attendees } : {}),
    // conferenceDataVersion=1 on the request (below) is what makes Google
    // honour this — Google silently drops conferenceData without it. There
    // is no separate "Meet API": a Meet link is just this field on a
    // Calendar event, created under the SAME google_calendar connection —
    // no extra OAuth consent needed beyond the `calendar` scope already
    // granted.
    ...(wantsMeetLink ? {
      conferenceData: {
        createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    } : {}),
  };

  // ── Double-booking guard ───────────────────────────────────────────────────
  // Two callers asking for the same slot on different calls would otherwise
  // both be "booked", stacking overlapping appointments that nobody can honour.
  // Refuse the second one and say what it clashed with, rather than silently
  // creating the overlap. Opt out per destination with allowDoubleBooking when
  // a resource can genuinely take concurrent bookings.
  if (event.allowDoubleBooking !== true) {
    const startInstant = wallToInstant(startWall, timeZone);
    const endInstant = wallToInstant(endWall, timeZone);
    const clashes = await findConflicts(workspaceId, calendarId, startInstant, endInstant);
    if (clashes.length) {
      const c = clashes[0];
      const when = new Date(c.start.dateTime).toLocaleString('en-GB', {
        timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
      });
      const err = new Error(
        `That slot is already booked: "${c.summary || 'existing appointment'}" at ${when}`
        + `${clashes.length > 1 ? ` (and ${clashes.length - 1} more)` : ''}. `
        + 'The appointment was NOT added — offer the caller another time.',
      );
      err.statusCode = 409;
      err.conflicts = clashes.map((x) => ({ id: x.id, summary: x.summary, start: x.start.dateTime }));
      throw err;
    }
  }

  const createUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`
    + (wantsMeetLink ? '?conferenceDataVersion=1' : '');
  const data = await googleFetch(workspaceId, 'google_calendar', createUrl, {
    method: 'POST', body: JSON.stringify(body),
  });

  logger.info({ workspaceId, eventId: data.id, calendarId }, 'Created Google Calendar event for post-call delivery');
  // The instant is correct, but if the calendar RENDERS in a different zone the
  // owner sees a different clock time and reasonably concludes the booking is
  // broken (a 10:00 Asia/Kolkata appointment shows as 04:30 on a UTC calendar).
  // Nothing here can fix that — it is the calendar's own setting — so say so.
  warnOnCalendarTimezoneMismatch(workspaceId, calendarId, timeZone);

  let meetLink = wantsMeetLink ? extractMeetLink(data) : null;
  // Conference creation can be asynchronous — the immediate response may still
  // carry conferenceData.createRequest.status.statusCode === 'pending' with no
  // entryPoints yet. One short poll gives Google a moment to finish; if it's
  // still pending we return null rather than block or fail a booking that
  // already succeeded over a not-yet-ready Meet link.
  if (wantsMeetLink && !meetLink && data.conferenceData?.createRequest?.status?.statusCode === 'pending') {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const refreshed = await googleFetch(
        workspaceId, 'google_calendar',
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(data.id)}`,
        { method: 'GET' },
      );
      meetLink = extractMeetLink(refreshed);
    } catch (err) {
      logger.warn({ workspaceId, eventId: data.id, err: err.message }, 'Could not re-check pending Google Meet link status');
    }
    if (!meetLink) {
      logger.warn({ workspaceId, eventId: data.id }, 'Google Meet link is still pending after one retry — returning the event without it');
    }
  }

  return {
    id: data.id,
    htmlLink: data.htmlLink,
    start: data.start?.dateTime ?? body.start.dateTime,
    end: data.end?.dateTime ?? body.end.dateTime,
    hangoutLink: data.hangoutLink ?? null,
    meetLink,
  };
}

/** Pull the actual video-join URL out of a Calendar event's conferenceData. */
export function extractMeetLink(data) {
  const videoEntry = data?.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video');
  return videoEntry?.uri ?? data?.hangoutLink ?? null;
}

/**
 * Read a single event.
 *
 * @param {string} workspaceId
 * @param {string} eventId
 * @param {{ calendarId?: string }} [opts]
 */
export async function getEvent(workspaceId, eventId, { calendarId = DEFAULT_CALENDAR_ID } = {}) {
  const { res, data } = await googleRequest(
    workspaceId, 'google_calendar',
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'GET' },
  );
  if (res.status === 404) {
    throw Object.assign(new Error('Event not found or already deleted'), { statusCode: 404 });
  }
  if (!res.ok) throw new Error(data?.error?.message || `Google Calendar API ${res.status}`);
  // Google keeps a deleted event fetchable by id for a while afterward (for
  // sync protocols), returning it with status:'cancelled' on a 200 rather
  // than a 404 — confirmed live: a GET right after a successful DELETE
  // returned the full event body, just cancelled. Treat that the same as
  // "not found", matching listEvents' own status!=='cancelled' filtering,
  // rather than handing back a stale object the caller has to know to check.
  if (data?.status === 'cancelled') {
    throw Object.assign(new Error('Event not found or already deleted'), { statusCode: 404 });
  }
  return data;
}

/**
 * List upcoming events on a calendar.
 *
 * @param {string} workspaceId
 * @param {{ calendarId?: string, timeMin?: string|Date, timeMax?: string|Date,
 *           maxResults?: number, query?: string }} [opts] timeMin defaults to
 *   now — this lists UPCOMING events, matching the common "what's on the
 *   calendar next" use case rather than a full history dump.
 */
export async function listEvents(workspaceId, {
  calendarId = DEFAULT_CALENDAR_ID, timeMin, timeMax, maxResults = 50, query,
} = {}) {
  const params = new URLSearchParams({
    singleEvents: 'true', // expand recurring series into real occurrences, same as findConflicts
    orderBy: 'startTime',
    maxResults: String(Math.min(Math.max(Number(maxResults) || 50, 1), 250)),
    timeMin: (timeMin ? new Date(timeMin) : new Date()).toISOString(),
  });
  if (timeMax) params.set('timeMax', new Date(timeMax).toISOString());
  if (query) params.set('q', String(query));

  const data = await googleFetch(
    workspaceId, 'google_calendar',
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { method: 'GET' },
  );
  const items = (data.items ?? []).filter((e) => e.status !== 'cancelled');
  return { items, nextPageToken: data.nextPageToken ?? null };
}

/**
 * Partially update an event — reschedule, rename, change attendees, etc.
 * Only the fields present in `patch` are sent, so leaving `start`/`end`
 * unset keeps the event's current time untouched.
 *
 * @param {string} workspaceId
 * @param {string} eventId
 * @param {object} [patch]
 * @param {string|Date} [patch.start]
 * @param {string|Date} [patch.end]
 * @param {number} [patch.durationMin]  used to derive `end` when only `start`
 *   and no explicit `end` are given
 * @param {string} [patch.timeZone]
 * @param {string} [patch.summary]
 * @param {string} [patch.description]
 * @param {string[]} [patch.attendees]
 * @param {boolean} [patch.allowDoubleBooking=false]
 * @param {{ calendarId?: string }} [opts]
 */
export async function updateEvent(workspaceId, eventId, patch = {}, { calendarId = DEFAULT_CALENDAR_ID } = {}) {
  const body = {};
  if (patch.summary !== undefined) body.summary = String(patch.summary).slice(0, 1024);
  if (patch.description !== undefined) body.description = String(patch.description).slice(0, 8192);
  if (Array.isArray(patch.attendees)) {
    body.attendees = patch.attendees
      .map((e) => String(e).trim())
      .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
      .map((email) => ({ email }));
  }

  if (patch.start !== undefined) {
    const start = parseAppointmentDate(patch.start);
    const timeZone = start.hasZone ? 'UTC' : (patch.timeZone || DEFAULT_TIMEZONE);
    const startWall = start.hasZone ? start.date.toISOString().slice(0, 19) : start.wall;
    body.start = { dateTime: startWall, timeZone };
  }
  if (patch.end !== undefined) {
    const end = parseAppointmentDate(patch.end);
    const timeZone = end.hasZone ? 'UTC' : (patch.timeZone || DEFAULT_TIMEZONE);
    const endWall = end.hasZone ? end.date.toISOString().slice(0, 19) : end.wall;
    body.end = { dateTime: endWall, timeZone };
  } else if (body.start && patch.durationMin) {
    const durationMin = Number(patch.durationMin) > 0 ? Number(patch.durationMin) : DEFAULT_DURATION_MIN;
    body.end = { dateTime: addMinutesToWall(body.start.dateTime, durationMin), timeZone: body.start.timeZone };
  }

  // Only guard against double-booking when the slot itself is actually
  // moving — a rename or attendee change touches neither start nor end.
  if (body.start && body.end && patch.allowDoubleBooking !== true) {
    const startInstant = wallToInstant(body.start.dateTime, body.start.timeZone);
    const endInstant = wallToInstant(body.end.dateTime, body.end.timeZone);
    const clashes = await findConflicts(workspaceId, calendarId, startInstant, endInstant, { excludeEventId: eventId });
    if (clashes.length) {
      const c = clashes[0];
      const when = new Date(c.start.dateTime).toLocaleString('en-GB', {
        timeZone: body.start.timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
      });
      const err = new Error(
        `That slot is already booked: "${c.summary || 'existing appointment'}" at ${when}`
        + `${clashes.length > 1 ? ` (and ${clashes.length - 1} more)` : ''}. `
        + 'The event was NOT rescheduled — offer the caller another time.',
      );
      err.statusCode = 409;
      err.conflicts = clashes.map((x) => ({ id: x.id, summary: x.summary, start: x.start.dateTime }));
      throw err;
    }
  }

  const data = await googleFetch(
    workspaceId, 'google_calendar',
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  logger.info({ workspaceId, eventId, calendarId }, 'Updated Google Calendar event');
  return {
    id: data.id,
    htmlLink: data.htmlLink,
    start: data.start?.dateTime ?? data.start?.date,
    end: data.end?.dateTime ?? data.end?.date,
  };
}

/**
 * Delete (cancel) an event.
 *
 * @param {string} workspaceId
 * @param {string} eventId
 * @param {{ calendarId?: string, sendUpdates?: 'all'|'externalOnly'|'none' }} [opts]
 *   sendUpdates defaults to 'none' so a post-call/automated action never
 *   silently emails attendees a cancellation notice unless opted in.
 */
export async function deleteEvent(workspaceId, eventId, { calendarId = DEFAULT_CALENDAR_ID, sendUpdates = 'none' } = {}) {
  const params = new URLSearchParams({ sendUpdates });
  const { res, data } = await googleRequest(
    workspaceId, 'google_calendar',
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${params}`,
    { method: 'DELETE' },
  );
  if (res.status === 204) {
    logger.info({ workspaceId, eventId, calendarId }, 'Deleted Google Calendar event');
    return { deleted: true, id: eventId };
  }
  // Google answers an already-deleted event with 410 Gone, not 404 — the
  // caller's intent ("this event should not exist") is already satisfied,
  // so treat it as success rather than an error to surface.
  if (res.status === 410) {
    return { deleted: true, id: eventId, alreadyDeleted: true };
  }
  if (!res.ok) throw new Error(data?.error?.message || `Google Calendar API ${res.status}`);
  return { deleted: true, id: eventId };
}

/**
 * Standalone availability check — independent of attempting a booking.
 *
 * Deliberately DOES use Google's freeBusy endpoint, unlike createEvent's
 * double-booking guard (findConflicts), which avoids it because freeBusy
 * can't distinguish an all-day marker from a real conflict. That distinction
 * only matters when deciding whether to REFUSE a specific booking; a general
 * "is this calendar free in this window" query correctly wants an all-day
 * event to count as busy too.
 *
 * @param {string} workspaceId
 * @param {object} opts
 * @param {string[]} [opts.calendarIds=[primary]]
 * @param {string|Date} opts.timeMin
 * @param {string|Date} opts.timeMax
 * @param {string} [opts.timeZone] used only when timeMin/timeMax are naive
 *   wall-clock strings with no zone of their own
 * @returns {Promise<{ calendars: object, isFree: (calendarId?: string) => boolean }>}
 */
export async function checkAvailability(workspaceId, {
  calendarIds = [DEFAULT_CALENDAR_ID], timeMin, timeMax, timeZone = DEFAULT_TIMEZONE,
} = {}) {
  if (!timeMin || !timeMax) {
    throw Object.assign(new Error('checkAvailability requires both timeMin and timeMax'), { statusCode: 400 });
  }
  const toInstant = (value) => {
    const parsed = parseAppointmentDate(value);
    return parsed.hasZone ? parsed.date : wallToInstant(parsed.wall, timeZone);
  };
  const startInstant = toInstant(timeMin);
  const endInstant = toInstant(timeMax);

  const data = await googleFetch(workspaceId, 'google_calendar', `${CALENDAR_API}/freeBusy`, {
    method: 'POST',
    body: JSON.stringify({
      timeMin: startInstant.toISOString(),
      timeMax: endInstant.toISOString(),
      timeZone,
      items: calendarIds.map((id) => ({ id })),
    }),
  });

  const calendars = data.calendars ?? {};
  return {
    calendars,
    isFree: (calendarId = DEFAULT_CALENDAR_ID) => {
      const entry = calendars[calendarId];
      return Boolean(entry) && !entry.error && (entry.busy ?? []).length === 0;
    },
  };
}
