// backend/src/services/googleMeet.service.js
/**
 * Google Meet link generation.
 *
 * There is no separate "Google Meet API" — a Meet video-call link is created
 * by requesting `conferenceData` on a Calendar API event (POST .../events
 * with `?conferenceDataVersion=1` — that query param is mandatory, Google
 * silently drops conferenceData without it) and reading `hangoutLink` /
 * `conferenceData.entryPoints` back from the response.
 *
 * This uses the `google_meet` integration's OWN connected token, not
 * google_calendar's — a workspace can consent to Meet separately from
 * Calendar (they're modeled as distinct Integration/IntegrationToken rows,
 * same as every other provider in this app; a workspace might even connect
 * them under two different Google accounts). Token/refresh plumbing is
 * shared via googleAuth.service.js; the double-booking guard reuses
 * googleCalendar.service.js's findConflicts (parameterized by provider)
 * rather than re-implementing it.
 */

import crypto from 'node:crypto';
import logger from '../lib/logger.js';
import { googleFetch, getValidAccessToken as getValidGoogleToken } from './googleAuth.service.js';
import { findConflicts, parseAppointmentDate, addMinutesToWall, wallToInstant, extractMeetLink } from './googleCalendar.service.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_CALENDAR_ID = 'primary';
const DEFAULT_DURATION_MIN = 30;
const DEFAULT_TIMEZONE = process.env.APPOINTMENT_TIMEZONE || 'Asia/Kolkata';
const PROVIDER = 'google_meet';

/**
 * Return a usable access token for the workspace's Google Meet integration,
 * transparently refreshing an expired one. Bare-string return kept for
 * parity with googleCalendar.service.js/googleSheets.service.js, even though
 * nothing external calls this directly yet — createMeetEvent below resolves
 * its own token per call via googleFetch.
 */
export const getValidAccessToken = (workspaceId) =>
  getValidGoogleToken(workspaceId, PROVIDER).then((r) => r.accessToken);

/**
 * Create a calendar event WITH a Google Meet link.
 *
 * Mirrors googleCalendar.service.js#createEvent's date/timezone handling and
 * double-booking guard exactly (same wall-clock-preserving logic, same
 * allowDoubleBooking escape hatch) — the only difference is the
 * conferenceData request and which integration's token authenticates it.
 *
 * @param {string} workspaceId
 * @param {object} event
 * @param {string|Date} event.start          – meeting start (ISO string or Date)
 * @param {string|Date} [event.end]          – explicit end; defaults to start + durationMin
 * @param {number} [event.durationMin=30]    – used when `end` is absent
 * @param {string} [event.summary]           – event title
 * @param {string} [event.description]       – event body
 * @param {string[]} [event.attendees]       – attendee email addresses (not required for the
 *                                              Meet link itself — only affects who's invited)
 * @param {string} [event.timeZone='UTC']    – IANA timezone for the event
 * @param {string} [event.calendarId=primary]
 * @param {boolean} [event.allowDoubleBooking=false]
 * @returns {Promise<{id, htmlLink, hangoutLink, meetLink, start, end}>}
 *   meetLink is null if Google hadn't finished provisioning the conference
 *   even after one short retry — see the pending-status handling below.
 */
export async function createMeetEvent(workspaceId, event = {}) {
  const start = parseAppointmentDate(event.start);
  const durationMin = Number(event.durationMin) > 0 ? Number(event.durationMin) : DEFAULT_DURATION_MIN;
  const end = event.end ? parseAppointmentDate(event.end) : null;

  const timeZone = start.hasZone ? 'UTC' : (event.timeZone || DEFAULT_TIMEZONE);
  const startWall = start.hasZone ? start.date.toISOString().slice(0, 19) : start.wall;
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

  const body = {
    summary: (event.summary && String(event.summary).slice(0, 1024)) || 'Meeting',
    ...(event.description ? { description: String(event.description).slice(0, 8192) } : {}),
    start: { dateTime: startWall, timeZone },
    end: { dateTime: endWall, timeZone },
    ...(attendees.length ? { attendees } : {}),
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  // Same guard as createEvent, but checked against THIS integration's own
  // calendar — google_meet's token, not google_calendar's, since they may be
  // different Google accounts/consents entirely.
  if (event.allowDoubleBooking !== true) {
    const startInstant = wallToInstant(startWall, timeZone);
    const endInstant = wallToInstant(endWall, timeZone);
    const clashes = await findConflicts(workspaceId, calendarId, startInstant, endInstant, { provider: PROVIDER });
    if (clashes.length) {
      const c = clashes[0];
      const when = new Date(c.start.dateTime).toLocaleString('en-GB', {
        timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
      });
      const err = new Error(
        `That slot is already booked: "${c.summary || 'existing appointment'}" at ${when}`
        + `${clashes.length > 1 ? ` (and ${clashes.length - 1} more)` : ''}. `
        + 'The meeting was NOT scheduled — offer another time.',
      );
      err.statusCode = 409;
      err.conflicts = clashes.map((x) => ({ id: x.id, summary: x.summary, start: x.start.dateTime }));
      throw err;
    }
  }

  const data = await googleFetch(
    workspaceId, PROVIDER,
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
    { method: 'POST', body: JSON.stringify(body) },
  );

  let meetLink = extractMeetLink(data);
  // Conference creation can be asynchronous — the immediate response may
  // still carry conferenceData.createRequest.status.statusCode === 'pending'
  // with no entryPoints yet. One short poll gives Google a moment to finish;
  // if it's still pending we return null rather than block or fail the
  // create over a not-yet-ready Meet link — the event itself was created
  // successfully either way.
  if (!meetLink && data.conferenceData?.createRequest?.status?.statusCode === 'pending') {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const refreshed = await googleFetch(
        workspaceId, PROVIDER,
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

  logger.info(
    { workspaceId, eventId: data.id, calendarId, hasMeetLink: Boolean(meetLink) },
    'Created Google Calendar event with a Meet link',
  );

  return {
    id: data.id,
    htmlLink: data.htmlLink,
    hangoutLink: data.hangoutLink ?? null,
    meetLink,
    start: data.start?.dateTime ?? body.start.dateTime,
    end: data.end?.dateTime ?? body.end.dateTime,
  };
}
