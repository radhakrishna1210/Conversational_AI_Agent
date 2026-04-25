import Redis from 'ioredis';
import { env } from './env.js';
import logger from '../lib/logger.js';

let redis = null;
let bullConnection = null;

if (env.REDIS_URL) {
  try {
    const redisOptions = {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy(times) {
        // If we've tried 3 times and keep failing, give up to avoid blocking the event loop
        if (times > 3) {
          logger.warn(`Redis connection failed after ${times} attempts. Falling back to memory mode.`);
          return null; 
        }
        return Math.min(times * 100, 3000);
      },
    };

    redis = new Redis(env.REDIS_URL, redisOptions);

    redis.on('connect', () => logger.info('✅ Redis connected'));
    
    redis.on('error', (err) => {
      if (err.message.includes('max requests limit exceeded')) {
        logger.error('❌ Redis quota exceeded (Upstash). Switching to fallback mode.');
        redis.disconnect();
        redis = null;
        bullConnection = null;
      } else {
        logger.error({ err: err.message }, '⚠️ Redis error');
      }
    });

    // BullMQ requires a separate connection config object
    bullConnection = { 
      connection: new Redis(env.REDIS_URL, redisOptions) 
    };
    
    // Also handle errors for the bull connection
    bullConnection.connection.on('error', () => {
      bullConnection = null;
    });

  } catch (error) {
    logger.error({ error: error.message }, '❌ Failed to initialize Redis');
    redis = null;
    bullConnection = null;
  }
}

export { bullConnection };
export default redis;

