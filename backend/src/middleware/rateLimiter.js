import redis from '../config/redis.js';

/**
 * Redis sliding-window rate limiter.
 * Falls back to no-op if Redis is not configured.
 * @param {number} maxRequests per window
 * @param {number} windowSecs window size in seconds
 */
export const rateLimiter = (maxRequests = 100, windowSecs = 60) => async (req, res, next) => {
  if (!redis) return next();

  const identifier = req.user?.apiKeyId ?? req.user?.userId ?? req.ip;
  const key = `rl:${identifier}`;
  const now = Date.now();
  const windowMs = windowSecs * 1000;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, now - windowMs);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.zcard(key);
    pipeline.expire(key, windowSecs + 1);

    const results = await pipeline.exec();
    const count = results[2][1];

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));

    if (count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Slow down.' });
    }

    next();
  } catch {
    // Redis failure should not block requests
    next();
  }
};
