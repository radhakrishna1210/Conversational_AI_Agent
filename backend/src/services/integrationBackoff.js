// backend/src/services/integrationBackoff.js
/**
 * How long to leave a failing integration alone before trying it again.
 *
 * Lives in its own module for one practical reason: both the scheduler (which
 * records failures) and the connect flow (which must forgive them the moment a
 * human fixes the credentials) need it, and having the scheduler import the
 * integrations service while the integrations service imports the scheduler is
 * a cycle.
 *
 * ── WHAT THIS PREVENTS ──────────────────────────────────────────────────────
 *
 * A failed sync never advances `lastSyncAt`, so the 60-second scheduler sweep
 * re-queued every broken integration on every tick, forever. Measured on this
 * deployment: 241,776 failed jobs, oldest 41 days back, several new failures a
 * second — enough to saturate the Prisma connection pool and take `/auth/refresh`
 * down with it, logging users out mid-session.
 *
 * State is IN MEMORY on purpose. It needs no migration, and losing it on
 * restart is correct: a redeploy is usually the moment someone has just fixed
 * whatever was broken.
 */

/** First retry delay after a failure. Doubles from here. */
const BASE_MS = Number(process.env.INTEGRATION_BACKOFF_BASE_MS) || 5 * 60 * 1000;

/**
 * Ceiling on the retry delay.
 *
 * Six hours rather than "give up permanently": an expired token usually gets
 * re-authorised by a person eventually, and an integration that never retries
 * is just a quieter outage. Four attempts a day costs nothing and still
 * recovers on its own.
 */
const MAX_MS = Number(process.env.INTEGRATION_BACKOFF_MAX_MS) || 6 * 60 * 60 * 1000;

/** @type {Map<string, { failures: number, nextAttemptAt: number, lastError?: string }>} */
const state = new Map();

/** Delay after `failures` consecutive failures. Exported for tests. */
export const backoffDelay = (failures) =>
  Math.min(BASE_MS * 2 ** Math.max(0, failures - 1), MAX_MS);

/**
 * Record a failed sync and push the next attempt out.
 * @returns {{ failures: number, delayMs: number }} the new state
 */
export function noteIntegrationFailure(integrationId, error) {
  if (!integrationId) return { failures: 0, delayMs: 0 };
  const failures = (state.get(integrationId)?.failures ?? 0) + 1;
  const delayMs = backoffDelay(failures);
  state.set(integrationId, { failures, nextAttemptAt: Date.now() + delayMs, lastError: error });
  return { failures, delayMs };
}

/** A sync worked: forgive the integration completely. */
export function noteIntegrationSuccess(integrationId) {
  if (integrationId) state.delete(integrationId);
}

/** Is this integration currently waiting out a backoff? */
export function isBackingOff(integrationId, nowMs = Date.now()) {
  const s = state.get(integrationId);
  return Boolean(s && s.nextAttemptAt > nowMs);
}

/** Every integration whose next attempt is still in the future. */
export function backingOffIds(nowMs = Date.now()) {
  const ids = new Set();
  for (const [id, s] of state) if (s.nextAttemptAt > nowMs) ids.add(id);
  return ids;
}

/**
 * Clear the backoff for one integration, or all of them.
 *
 * Called when an integration is (re)connected: someone has just supplied fresh
 * credentials, so making them wait out a six-hour penalty for the old ones
 * would be absurd.
 */
export function resetIntegrationBackoff(integrationId = null) {
  if (integrationId) state.delete(integrationId);
  else state.clear();
}

/** Current state — for tests, and for answering "why is this not syncing?". */
export const integrationBackoffState = () =>
  [...state].map(([integrationId, s]) => ({ integrationId, ...s }));
