// Call window, pacing, warm-up and retry scheduling — pure functions.
//
// No database, no clock reads except through an injected `now`, so every rule
// here is directly testable. dialGuard.service.js is the layer that loads state
// and applies these.
//
// Everything is computed in IST. India is UTC+5:30 year-round with no daylight
// saving, so the conversion is a constant offset rather than a timezone
// database lookup — which is why this file has no dependencies.

import {
  DEFAULT_WINDOW_END_MIN,
  DEFAULT_WINDOW_START_MIN,
  IST_OFFSET_MIN,
  MAX_ATTEMPTS_PER_DAY,
  WARMUP_DAYS,
  WARMUP_FLOOR_FRACTION,
} from '../../constants/dialing.js';

const MS_PER_MIN = 60_000;

// ─── IST clock ──────────────────────────────────────────────────────────────

/** Wall-clock IST for an instant, as a plain object. */
export function istParts(now = new Date()) {
  const shifted = new Date(now.getTime() + IST_OFFSET_MIN * MS_PER_MIN);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    minutesFromMidnight: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/**
 * IST calendar date as YYYY-MM-DD.
 *
 * This is the bucket key for daily dial caps. Using the IST date rather than
 * UTC matters: a UTC day boundary falls at 05:30 IST, in the middle of a
 * campaign, which would hand a number a fresh allowance halfway through the
 * morning.
 */
export function istDateKey(now = new Date()) {
  const { year, month, day } = istParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The instant corresponding to a given IST minutes-from-midnight, on the IST day of `now`. */
function istInstantAt(now, minutesFromMidnight) {
  const { minutesFromMidnight: current } = istParts(now);
  return new Date(now.getTime() + (minutesFromMidnight - current) * MS_PER_MIN);
}

// ─── Call window ────────────────────────────────────────────────────────────

/** Resolve a campaign's window, falling back to the platform default. */
export function resolveWindow(campaign = {}, defaults = {}) {
  const start = Number.isInteger(campaign.windowStartMin)
    ? campaign.windowStartMin
    : (defaults.startMin ?? DEFAULT_WINDOW_START_MIN);
  const end = Number.isInteger(campaign.windowEndMin)
    ? campaign.windowEndMin
    : (defaults.endMin ?? DEFAULT_WINDOW_END_MIN);
  return { start, end };
}

/**
 * Is `now` inside the permitted calling window, and if not, when does it open?
 *
 * Returns `resumeAt` rather than a bare boolean because the dispatcher's
 * correct response to "too early" is to sleep until the window opens, not to
 * fail the campaign. A campaign launched at 10pm should dial at 9am, not burn
 * its list against a closed window.
 *
 * A window whose end is not after its start is treated as always-open. That
 * only happens through misconfiguration, and refusing to ever dial is a worse
 * failure than ignoring a nonsensical window — the DLT gate is what actually
 * enforces legality.
 */
export function callWindowState(now, window) {
  const { start, end } = window;
  if (!(end > start)) return { open: true, resumeAt: null };

  const { minutesFromMidnight } = istParts(now);
  if (minutesFromMidnight >= start && minutesFromMidnight < end) {
    return { open: true, resumeAt: null };
  }

  // Before the window opens today, or after it closed — in which case the next
  // opening is tomorrow's start.
  const resumeAt = minutesFromMidnight < start
    ? istInstantAt(now, start)
    : new Date(istInstantAt(now, start).getTime() + 24 * 60 * MS_PER_MIN);

  return { open: false, resumeAt };
}

/** Minutes left in the window from `now`, floored at zero. */
export function minutesLeftInWindow(now, window) {
  const { start, end } = window;
  if (!(end > start)) return Infinity;
  const { minutesFromMidnight } = istParts(now);
  if (minutesFromMidnight < start) return end - start;
  return Math.max(0, end - minutesFromMidnight);
}

// ─── Pacing ─────────────────────────────────────────────────────────────────

/**
 * Gap between dials, so the remaining work spreads across the remaining window
 * instead of going out as a burst.
 *
 * Bursting is the clearest bot signature a carrier has: 5,000 calls in ten
 * minutes and nothing for the rest of the day is not a pattern any human sales
 * floor produces. Spreading the same volume over twelve hours costs nothing —
 * the calls still all go out — and looks entirely different in the carrier's
 * traffic profile.
 *
 * Clamped to `minMs` so a nearly-empty campaign does not dial flat out, and to
 * `maxMs` so a huge list in a narrow window does not compute a gap so small it
 * is meaningless.
 */
export function paceIntervalMs(remaining, minutesLeft, { minMs = 1_000, maxMs = 60_000 } = {}) {
  if (!Number.isFinite(minutesLeft)) return minMs;
  if (remaining <= 0) return minMs;
  if (minutesLeft <= 0) return minMs;
  const idealMs = (minutesLeft * MS_PER_MIN) / remaining;
  return Math.max(minMs, Math.min(maxMs, Math.round(idealMs)));
}

// ─── Warm-up ────────────────────────────────────────────────────────────────

/**
 * The cap a number may actually use today, given its warm-up progress.
 *
 * Ramps linearly from WARMUP_FLOOR_FRACTION of the full cap on day one to the
 * full cap at WARMUP_DAYS. A number with no warmupStartedAt is treated as
 * already warm — existing numbers must not be throttled retroactively by
 * deploying this.
 */
export function effectiveDailyCap(number = {}, now = new Date()) {
  const cap = Number.isInteger(number.dailyDialCap) ? number.dailyDialCap : 0;
  if (cap <= 0) return 0;
  if (!number.warmupStartedAt) return cap;

  const started = new Date(number.warmupStartedAt).getTime();
  if (!Number.isFinite(started)) return cap;

  const daysIn = (now.getTime() - started) / (24 * 60 * MS_PER_MIN);
  if (daysIn >= WARMUP_DAYS) return cap;
  if (daysIn < 0) return Math.max(1, Math.floor(cap * WARMUP_FLOOR_FRACTION));

  const progress = daysIn / WARMUP_DAYS;
  const fraction = WARMUP_FLOOR_FRACTION + (1 - WARMUP_FLOOR_FRACTION) * progress;
  return Math.max(1, Math.floor(cap * fraction));
}

// ─── Retry policy ───────────────────────────────────────────────────────────

/**
 * Should this recipient be tried again, and when?
 *
 * Two independent ceilings. `maxAttempts` is the campaign's own budget across
 * its whole life. MAX_ATTEMPTS_PER_DAY is the hygiene rule that matters to
 * carriers: repeatedly redialling an unanswered number within one day is the
 * behaviour complaints are made about, whatever the campaign's total budget
 * says.
 *
 * @returns {{retry: boolean, nextEligibleAt: Date|null, reason: string|null}}
 */
export function scheduleRetry({
  attempts,
  attemptsToday = 0,
  maxAttempts,
  backoffMin,
  now = new Date(),
  window,
}) {
  const budget = Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : 1;
  if (attempts >= budget) {
    return { retry: false, nextEligibleAt: null, reason: 'attempts-exhausted' };
  }

  const gapMin = Number.isInteger(backoffMin) && backoffMin > 0 ? backoffMin : 240;
  let next = new Date(now.getTime() + gapMin * MS_PER_MIN);

  // Already at the daily ceiling: the next attempt is tomorrow, regardless of
  // how short the configured backoff is.
  if (attemptsToday + 1 >= MAX_ATTEMPTS_PER_DAY) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * MS_PER_MIN);
    if (next < tomorrow) next = tomorrow;
  }

  // Never schedule a retry into a closed window — it would be picked up and
  // immediately held, churning the batch query until the window reopened.
  if (window) {
    const state = callWindowState(next, window);
    if (!state.open && state.resumeAt) next = state.resumeAt;
  }

  return { retry: true, nextEligibleAt: next, reason: null };
}
