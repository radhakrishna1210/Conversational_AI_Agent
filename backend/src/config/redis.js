import Redis from 'ioredis';
import { env } from './env.js';
import logger from '../lib/logger.js';

let redis = null;
let bullConnection = null;

// Track quota exhaustion to stop all retry attempts immediately
let _quotaExceeded = false;

const makeRetryStrategy = () => (times) => {
  if (_quotaExceeded) return null; // Stop immediately on quota error
  if (times > 3) {
    logger.warn(`Redis connection failed after ${times} attempts. Falling back to memory mode.`);
    return null;
  }
  return Math.min(times * 100, 3000);
};

const isQuotaError = (err) =>
  err?.message?.includes('max requests limit exceeded') ||
  err?.message?.includes('ERR max requests');

if (env.REDIS_URL) {
  try {
    const redisOptions = {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy: makeRetryStrategy(),
    };

    redis = new Redis(env.REDIS_URL, redisOptions);

    redis.on('connect', () => logger.info('✅ Redis connected'));

    redis.on('error', (err) => {
      if (isQuotaError(err)) {
        if (!_quotaExceeded) {
          _quotaExceeded = true;
          logger.error('❌ Upstash Redis quota exhausted (500k request limit). Switching to in-memory fallback. Redis features (rate limiting, BullMQ) will be disabled until the quota resets.');
        }
        try { redis.disconnect(); } catch (_) {}
        redis = null;
        // Also tear down the bull connection
        if (bullConnection?.connection) {
          try { bullConnection.connection.disconnect(); } catch (_) {}
          bullConnection = null;
        }
      } else {
        logger.error({ err: err.message }, '⚠️ Redis error');
      }
    });

    // BullMQ requires a separate connection instance
    const bullRedis = new Redis(env.REDIS_URL, { ...redisOptions, retryStrategy: makeRetryStrategy() });

    bullConnection = { connection: bullRedis };

    bullRedis.on('error', (err) => {
      if (isQuotaError(err)) {
        if (!_quotaExceeded) {
          _quotaExceeded = true;
          logger.error('❌ Upstash Redis quota exhausted (BullMQ connection). Switching to in-memory fallback.');
        }
        try { bullRedis.disconnect(); } catch (_) {}
        bullConnection = null;
        // Also tear down the main connection
        if (redis) {
          try { redis.disconnect(); } catch (_) {}
          redis = null;
        }
      } else {
        logger.warn({ err: err.message }, '⚠️ BullMQ Redis error');
      }
    });

  } catch (error) {
    logger.error({ error: error.message }, '❌ Failed to initialize Redis');
    redis = null;
    bullConnection = null;
  }
}

export { bullConnection };
export default redis;

