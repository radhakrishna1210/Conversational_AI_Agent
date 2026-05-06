/**
 * Rate Limiter for Gemini API
 * Prevents excessive API calls per user/workspace
 */

import logger from "./logger.js";
import { GEMINI_CONFIG } from "../constants/geminiModels.js";

class RateLimiter {
  constructor() {
    this.userLimits = new Map(); // Map<userId, RequestWindow>
    this.stats = {
      totalRequests: 0,
      rejectedRequests: 0,
    };
  }

  /**
   * Check if user can make a request
   * @param {string} userId - User identifier
   * @param {number} maxRequests - Max requests allowed
   * @param {number} windowMs - Time window in milliseconds
   * @returns {Object} - { allowed: boolean, remaining: number, resetAt: timestamp }
   */
  checkLimit(
    userId,
    maxRequests = GEMINI_CONFIG.rateLimiting.maxRequests,
    windowMs = GEMINI_CONFIG.rateLimiting.windowMs
  ) {
    const now = Date.now();

    // Initialize or get user limits
    if (!this.userLimits.has(userId)) {
      this.userLimits.set(userId, {
        requests: [],
        windowMs,
        maxRequests,
      });
    }

    const userLimit = this.userLimits.get(userId);

    // Clean old requests outside the window
    userLimit.requests = userLimit.requests.filter((time) => now - time < windowMs);

    // Check if limit exceeded
    const allowed = userLimit.requests.length < maxRequests;
    const remaining = Math.max(0, maxRequests - userLimit.requests.length);
    const resetAt = userLimit.requests.length > 0
      ? userLimit.requests[0] + windowMs
      : now + windowMs;

    // Log the request if allowed
    if (allowed) {
      userLimit.requests.push(now);
      this.stats.totalRequests++;
      logger.debug(
        `Rate limit check PASSED for user ${userId}: ${remaining} requests remaining`
      );
    } else {
      this.stats.rejectedRequests++;
      logger.warn(
        `Rate limit EXCEEDED for user ${userId}. Will reset at ${new Date(resetAt).toISOString()}`
      );
    }

    return {
      allowed,
      remaining,
      resetAt,
      resetAfterMs: resetAt - now,
    };
  }

  /**
   * Get remaining requests for user
   * @param {string} userId - User identifier
   * @returns {number} - Remaining requests
   */
  getRemaining(userId) {
    const now = Date.now();

    if (!this.userLimits.has(userId)) {
      return GEMINI_CONFIG.rateLimiting.maxRequests;
    }

    const userLimit = this.userLimits.get(userId);
    
    // Clean old requests
    userLimit.requests = userLimit.requests.filter(
      (time) => now - time < userLimit.windowMs
    );

    return Math.max(0, userLimit.maxRequests - userLimit.requests.length);
  }

  /**
   * Reset limits for a user
   * @param {string} userId - User identifier
   */
  reset(userId) {
    if (this.userLimits.has(userId)) {
      this.userLimits.delete(userId);
      logger.info(`Rate limit reset for user ${userId}`);
    }
  }

  /**
   * Reset all limits
   */
  resetAll() {
    this.userLimits.clear();
    logger.info("All rate limits reset");
  }

  /**
   * Get rate limiter statistics
   * @returns {Object} - Statistics
   */
  getStats() {
    const rejectRate = this.stats.totalRequests > 0
      ? (this.stats.rejectedRequests / this.stats.totalRequests * 100).toFixed(2)
      : 0;

    return {
      totalRequests: this.stats.totalRequests,
      rejectedRequests: this.stats.rejectedRequests,
      rejectRate: `${rejectRate}%`,
      activeUsers: this.userLimits.size,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = { totalRequests: 0, rejectedRequests: 0 };
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();
export default RateLimiter;
