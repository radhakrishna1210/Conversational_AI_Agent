/**
 * Usage & Performance Tracking for Gemini
 * Tracks tokens, response times, and costs
 */

import logger from "./logger.js";

class UsageTracker {
  constructor() {
    this.requests = [];
    this.stats = {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalResponseTimeMs: 0,
      totalErrors: 0,
    };
  }

  /**
   * Estimate tokens in text (rough approximation)
   * ~4 characters = 1 token
   * @param {string} text - Text to estimate tokens for
   * @returns {number} - Estimated token count
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Rough estimation: 1 token per 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Record a request
   * @param {Object} request - Request details
   * @returns {Object} - Recorded request with metadata
   */
  recordRequest(request) {
    const {
      userId,
      model,
      message,
      chatHistory = [],
      responseTime,
      responseText,
      success,
      error,
    } = request;

    // Calculate token usage
    const inputTokens = this.estimateTokens(message) +
      chatHistory.reduce((sum, msg) => sum + this.estimateTokens(msg.content || ""), 0);
    const outputTokens = success ? this.estimateTokens(responseText || "") : 0;

    const record = {
      timestamp: new Date().toISOString(),
      userId,
      model,
      inputTokens,
      outputTokens,
      responseTimeMs: responseTime || 0,
      success,
      error: error ? error.message : null,
    };

    // Store record
    this.requests.push(record);

    // Update statistics
    this.stats.totalRequests++;
    this.stats.totalInputTokens += inputTokens;
    this.stats.totalOutputTokens += outputTokens;
    this.stats.totalResponseTimeMs += responseTime || 0;
    if (!success) this.stats.totalErrors++;

    // Keep only last 1000 requests
    if (this.requests.length > 1000) {
      this.requests.shift();
    }

    logger.info("Usage recorded", {
      model,
      inputTokens,
      outputTokens,
      responseTimeMs: responseTime,
      success,
    });

    return record;
  }

  /**
   * Get statistics
   * @returns {Object} - Usage statistics
   */
  getStats() {
    const avgResponseTime =
      this.stats.totalRequests > 0
        ? (this.stats.totalResponseTimeMs / this.stats.totalRequests).toFixed(2)
        : 0;

    const successRate =
      this.stats.totalRequests > 0
        ? (((this.stats.totalRequests - this.stats.totalErrors) / this.stats.totalRequests) * 100).toFixed(2)
        : 100;

    return {
      totalRequests: this.stats.totalRequests,
      totalInputTokens: this.stats.totalInputTokens,
      totalOutputTokens: this.stats.totalOutputTokens,
      totalTokens: this.stats.totalInputTokens + this.stats.totalOutputTokens,
      avgResponseTimeMs: parseFloat(avgResponseTime),
      totalResponseTimeMs: this.stats.totalResponseTimeMs,
      totalErrors: this.stats.totalErrors,
      successRate: `${successRate}%`,
      recentRequests: this.requests.slice(-10),
    };
  }

  /**
   * Get per-user statistics
   * @param {string} userId - User identifier
   * @returns {Object} - User statistics
   */
  getUserStats(userId) {
    const userRequests = this.requests.filter((req) => req.userId === userId);

    if (userRequests.length === 0) {
      return {
        totalRequests: 0,
        totalTokens: 0,
      };
    }

    const totalTokens = userRequests.reduce(
      (sum, req) => sum + req.inputTokens + req.outputTokens,
      0
    );

    const avgResponseTime = userRequests.reduce(
      (sum, req) => sum + req.responseTimeMs,
      0
    ) / userRequests.length;

    return {
      totalRequests: userRequests.length,
      totalTokens,
      avgResponseTimeMs: parseFloat(avgResponseTime.toFixed(2)),
      successRate: `${(((userRequests.filter((r) => r.success).length / userRequests.length) * 100).toFixed(2))}%`,
    };
  }

  /**
   * Get requests in time range
   * @param {number} lastNMinutes - Get requests from last N minutes
   * @returns {Array} - Requests in time range
   */
  getRequestsInRange(lastNMinutes = 60) {
    const cutoffTime = Date.now() - lastNMinutes * 60 * 1000;
    return this.requests.filter(
      (req) => new Date(req.timestamp).getTime() > cutoffTime
    );
  }

  /**
   * Reset all statistics
   */
  reset() {
    this.requests = [];
    this.stats = {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalResponseTimeMs: 0,
      totalErrors: 0,
    };
    logger.info("Usage tracker reset");
  }

  /**
   * Export statistics as JSON
   * @returns {string} - JSON export of all data
   */
  export() {
    return JSON.stringify({
      stats: this.stats,
      requests: this.requests,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }
}

// Export singleton instance
export const usageTracker = new UsageTracker();
export default UsageTracker;
