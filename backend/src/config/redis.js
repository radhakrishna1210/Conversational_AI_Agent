import Redis from 'ioredis';
import { env } from './env.js';
import logger from '../lib/logger.js';

let redis = null;

if (env.REDIS_URL) {
  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  });

  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('error', (err) => logger.error({ err }, 'Redis error'));
}

// BullMQ requires a separate connection config object
export const bullConnection = env.REDIS_URL
  ? { connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false }) }
  : null;

export default redis;
