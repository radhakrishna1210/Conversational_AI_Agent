/**
 * Minimal in-memory sliding-window rate limiter (no external deps).
 * Suitable for single-instance deployments; swap for a Redis-backed limiter
 * (e.g. rate-limiter-flexible) when running multiple backend instances.
 */
const buckets = new Map();

// Periodic cleanup so the map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();

/**
 * @param {object} opts
 * @param {number} opts.windowMs - window size in ms
 * @param {number} opts.max - max requests per window per IP
 * @param {string} [opts.keyPrefix] - separates limits per route group
 */
export const rateLimit = ({ windowMs = 60_000, max = 30, keyPrefix = '' } = {}) => {
  return (req, res, next) => {
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
  };
};
