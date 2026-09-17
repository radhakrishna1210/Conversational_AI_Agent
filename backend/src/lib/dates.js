// backend/src/lib/dates.js

/**
 * Resolve a possibly-absent, possibly-malformed timestamp to a real Date,
 * falling back to now.
 *
 * A plain `new Date(timestamp ?? Date.now())` only falls back on null/
 * undefined — an empty string (or any other unparseable value) survives the
 * `??` and produces an Invalid Date, which throws a RangeError the moment
 * something calls .toISOString() on it, rather than degrading gracefully.
 */
export function resolveTimestamp(value) {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
