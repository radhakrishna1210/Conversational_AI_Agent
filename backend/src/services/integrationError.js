// backend/src/services/integrationError.js
/**
 * Turn whatever a provider threw into a string a human can act on.
 *
 * WHY THIS EXISTS — it is the reason a 41-day outage went unnoticed.
 *
 * `runSyncJob` stored `err.message` into SyncJob.error, which is correct right
 * up until something throws `new Error(someObject)`. Several provider paths do
 * exactly that: Google's REST APIs answer a failure with
 *
 *   { "error": { "code": 401, "message": "Invalid Credentials",
 *                "status": "UNAUTHENTICATED" } }
 *
 * and the call sites read `data.error` — an OBJECT — straight into the Error
 * constructor. JavaScript stringifies it, `message` becomes the literal text
 * "[object Object]", and that is what got written. All 241,776 failed rows on
 * this deployment say "[object Object]" and nothing else, so the one field that
 * existed to explain the failure destroyed the explanation instead.
 *
 * The rule here is simple: never let an object reach String() unexamined. Prefer
 * the shapes real APIs actually use, fall back to JSON, and never return an
 * empty string — a blank error column reads as "no error" and hides the row.
 */

/** Longest message we will store. Keeps one runaway payload out of the column. */
const MAX_LEN = 500;

const clip = (s) => (s.length > MAX_LEN ? `${s.slice(0, MAX_LEN - 1)}…` : s);

/**
 * Best available human-readable text for any thrown value.
 *
 * @param {unknown} err
 * @param {string} [fallback] used when nothing usable can be extracted
 * @returns {string} never empty
 */
export function errorMessage(err, fallback = 'Unknown error') {
  const text = extract(err);
  return clip(text && text.trim() ? text.trim() : fallback);
}

function extract(err) {
  // Every falsy value at once: null, undefined, '', 0, false, NaN. A thrown 0
  // is not an error message, and writing "0" into the column is the same
  // failure as "[object Object]" — technically a string, useless to read.
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (typeof err !== 'object') return String(err);

  // An Error whose message is itself an object — the exact bug above. Unwrap it
  // rather than trusting `.message`, which is already the useless string.
  if (err instanceof Error) {
    const m = err.message;
    if (m && m !== '[object Object]') return m;
    // `cause` is where the real thing usually is once the message is ruined.
    if (err.cause) return extract(err.cause);
    return err.name || '';
  }

  // Google / Microsoft / many REST APIs: { error: { code, message, status } }
  if (err.error && typeof err.error === 'object') {
    const inner = extract(err.error);
    if (inner) return inner;
  }
  // OAuth2 error responses: { error, error_description }
  if (typeof err.error_description === 'string' && err.error_description) return err.error_description;
  if (typeof err.error === 'string' && err.error) return err.error;
  // Common single-field shapes.
  for (const key of ['message', 'detail', 'description', 'reason', 'statusText']) {
    if (typeof err[key] === 'string' && err[key]) return err[key];
  }

  // Nothing recognised — JSON beats "[object Object]" every time.
  try {
    const json = JSON.stringify(err);
    if (json && json !== '{}') return json;
  } catch { /* circular — fall through */ }
  return '';
}

/**
 * Build an Error from an API response body, without the object-into-Error trap.
 *
 * @param {unknown} body parsed response body
 * @param {string} fallback used when the body says nothing useful
 * @param {number} [statusCode] attached for the HTTP layer
 */
export function apiError(body, fallback, statusCode) {
  const err = new Error(errorMessage(body, fallback));
  if (statusCode) err.statusCode = statusCode;
  return err;
}
