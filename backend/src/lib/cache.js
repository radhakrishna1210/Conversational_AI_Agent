/**
 * Response Caching Layer
 * Supports both in-memory and Redis caching
 */

import logger from "./logger.js";
import { GEMINI_CONFIG } from "../constants/geminiModels.js";

import redis from "../config/redis.js";

class CacheManager {
  constructor() {
    this.memoryCache = new Map();
    this.redisClient = redis;
    this.cacheStats = {
      hits: 0,
      misses: 0,
      errors: 0,
    };
    
    if (this.redisClient) {
      logger.info("✅ Redis cache active");
    } else {
      logger.warn("⚠️ Redis unavailable, cache using memory fallback");
    }
  }

  /**
   * Generate cache key from request parameters
   * @param {string} message - User message
   * @param {string} model - Gemini model name
   * @param {Array} chatHistory - Chat history
   * @returns {string} - Cache key
   */
  generateCacheKey(message, model, chatHistory = []) {
    // Create a simple hash of the request
    const historyStr = chatHistory
      .map((msg) => `${msg.role}:${msg.content}`)
      .join("|");
    const key = `gemini:${model}:${message}:${historyStr}`;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `cache:${Math.abs(hash)}`;
  }

  /**
   * Get cached response
   * @param {string} key - Cache key
   * @returns {Promise<Object|null>} - Cached response or null
   */
  async get(key) {
    try {
      // Try Redis first if available
      if (this.redisClient) {
        try {
          const cached = await this.redisClient.get(key);
          if (cached) {
            this.cacheStats.hits++;
            logger.debug(`Cache HIT (Redis): ${key}`);
            return JSON.parse(cached);
          }
        } catch (error) {
          logger.warn(`Redis cache error: ${error.message}`);
          // Fall through to memory cache
        }
      }

      // Try memory cache
      if (this.memoryCache.has(key)) {
        const entry = this.memoryCache.get(key);
        
        // Check if entry has expired
        if (entry.expiredAt > Date.now()) {
          this.cacheStats.hits++;
          logger.debug(`Cache HIT (Memory): ${key}`);
          return entry.data;
        } else {
          // Remove expired entry
          this.memoryCache.delete(key);
        }
      }

      this.cacheStats.misses++;
      logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      this.cacheStats.errors++;
      logger.error("Cache get error:", error);
      return null;
    }
  }

  /**
   * Set cached response
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} - True if cached successfully
   */
  async set(key, data, ttl = GEMINI_CONFIG.caching.ttl) {
    try {
      const expiresAt = Date.now() + ttl * 1000;

      // Try Redis first if available
      if (this.redisClient) {
        try {
          await this.redisClient.setex(key, ttl, JSON.stringify(data));
          logger.debug(`Cached (Redis): ${key}`);
          return true;
        } catch (error) {
          logger.warn(`Redis cache set error: ${error.message}`);
          // Fall through to memory cache
        }
      }

      // Cache in memory
      if (this.memoryCache.size >= GEMINI_CONFIG.caching.maxSize) {
        // Remove oldest entry
        const firstKey = this.memoryCache.keys().next().value;
        this.memoryCache.delete(firstKey);
        logger.debug(`Removed oldest cache entry: ${firstKey}`);
      }

      this.memoryCache.set(key, {
        data,
        expiredAt: expiresAt,
      });

      logger.debug(`Cached (Memory): ${key}`);
      return true;
    } catch (error) {
      this.cacheStats.errors++;
      logger.error("Cache set error:", error);
      return false;
    }
  }

  /**
   * Clear specific cache entry
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - True if cleared
   */
  async clear(key) {
    try {
      // Clear from Redis
      if (this.redisClient) {
        try {
          await this.redisClient.del(key);
        } catch (error) {
          logger.warn(`Redis cache clear error: ${error.message}`);
        }
      }

      // Clear from memory
      this.memoryCache.delete(key);
      logger.debug(`Cache cleared: ${key}`);
      return true;
    } catch (error) {
      logger.error("Cache clear error:", error);
      return false;
    }
  }

  /**
   * Clear all cache
   * @returns {Promise<boolean>} - True if cleared
   */
  async clearAll() {
    try {
      // Clear Redis (if available)
      if (this.redisClient) {
        try {
          await this.redisClient.flushdb();
        } catch (error) {
          logger.warn(`Redis cache flushdb error: ${error.message}`);
        }
      }

      // Clear memory cache
      this.memoryCache.clear();
      logger.info("All cache cleared");
      return true;
    } catch (error) {
      logger.error("Cache clearAll error:", error);
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getStats() {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? (this.cacheStats.hits / total * 100).toFixed(2) : 0;

    return {
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      errors: this.cacheStats.errors,
      total,
      hitRate: `${hitRate}%`,
      memoryEntries: this.memoryCache.size,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.cacheStats = { hits: 0, misses: 0, errors: 0 };
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
export default CacheManager;
