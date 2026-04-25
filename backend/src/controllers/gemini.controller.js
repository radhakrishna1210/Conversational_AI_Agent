/**
 * Gemini Controller
 * Handles Gemini-specific API endpoints
 */

import logger from "../lib/logger.js";
import { geminiService } from "../services/gemini.service.js";
import { SUPPORTED_GEMINI_MODELS } from "../constants/geminiModels.js";

/**
 * Generate response using Gemini
 * POST /api/gemini/generate
 */
export const generateResponse = async (req, res) => {
  const requestId = req.id || Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();

  try {
    const {
      agentId,
      message,
      model = "gemini-2.5-flash",
      chatHistory,
      systemPrompt,
      temperature,
      topP,
      topK,
      maxOutputTokens,
      skipCache,
    } = req.body;

    // Validate required fields
    if (!agentId) {
      logger.warn(`[${requestId}] Missing required field: agentId`);
      return res.status(400).json({
        error: "Missing required field: agentId",
      });
    }

    if (!message) {
      logger.warn(`[${requestId}] Missing required field: message`);
      return res.status(400).json({
        error: "Missing required field: message",
      });
    }

    if (typeof message !== "string" || message.trim().length === 0) {
      logger.warn(`[${requestId}] Invalid message format`);
      return res.status(400).json({
        error: "Message must be a non-empty string",
      });
    }

    // Get user ID from JWT if available
    const userId = req.user?.id || req.workspace?.id;

    logger.info(`[${requestId}] Generating response`, {
      agentId,
      model,
      userId,
    });

    // Call Gemini service
    const response = await geminiService.generateResponse({
      userId,
      agentId,
      message,
      model,
      chatHistory,
      systemPrompt,
      temperature,
      topP,
      topK,
      maxOutputTokens,
      skipCache,
    });

    // Handle service errors
    if (!response.success) {
      logger.error(`[${requestId}] Service error: ${response.error}`);
      return res.status(500).json({
        error: response.error,
        details: response.error,
      });
    }

    const duration = Date.now() - startTime;

    logger.info(`[${requestId}] Response sent successfully (${duration}ms)`, {
      fromCache: response.fromCache,
      responseLength: response.message.length,
    });

    res.json({
      success: true,
      agentId,
      message: response.message,
      model,
      fromCache: response.fromCache,
      responseTime: response.responseTime,
      timestamp: response.timestamp,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      `[${requestId}] Unexpected error in generateResponse (${duration}ms)`,
      error
    );

    res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get supported Gemini models
 * GET /api/gemini/models
 */
export const getModels = (req, res) => {
  try {
    res.json({
      models: SUPPORTED_GEMINI_MODELS,
      totalModels: SUPPORTED_GEMINI_MODELS.length,
    });
  } catch (error) {
    logger.error("Error fetching models", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

/**
 * Validate Gemini configuration
 * POST /api/gemini/validate
 */
export const validateConfig = (req, res) => {
  try {
    const { model, temperature, topP, topK } = req.body;

    const errors = [];

    // Validate model
    if (!model) {
      errors.push("Model is required");
    } else if (!SUPPORTED_GEMINI_MODELS.includes(model)) {
      errors.push(
        `Invalid model: ${model}. Supported models: ${SUPPORTED_GEMINI_MODELS.join(", ")}`
      );
    }

    // Validate temperature
    if (temperature !== undefined) {
      if (typeof temperature !== "number" || temperature < 0 || temperature > 2) {
        errors.push("Temperature must be a number between 0 and 2");
      }
    }

    // Validate topP
    if (topP !== undefined) {
      if (typeof topP !== "number" || topP < 0 || topP > 1) {
        errors.push("TopP must be a number between 0 and 1");
      }
    }

    // Validate topK
    if (topK !== undefined) {
      if (typeof topK !== "number" || topK < 0 || topK > 100) {
        errors.push("TopK must be a number between 0 and 100");
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        valid: false,
        errors,
      });
    }

    res.json({
      valid: true,
      config: {
        model,
        temperature: temperature ?? 1,
        topP: topP ?? 0.95,
        topK: topK ?? 40,
      },
    });
  } catch (error) {
    logger.error("Error validating config", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

/**
 * Get service health and metrics
 * GET /api/gemini/health
 */
export const getHealth = (req, res) => {
  try {
    const health = geminiService.getHealth();
    const statusCode = health.status === "healthy" ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    logger.error("Error getting health", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

/**
 * Get service metrics and statistics
 * GET /api/gemini/metrics
 */
export const getMetrics = (req, res) => {
  try {
    const metrics = geminiService.getMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error("Error getting metrics", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

/**
 * Clear cache
 * POST /api/gemini/cache/clear
 */
export const clearCache = async (req, res) => {
  try {
    const { key } = req.body;

    if (key) {
      // Clear specific cache entry
      await geminiService.cacheManager?.clear(key);
      res.json({ message: `Cache entry cleared: ${key}` });
    } else {
      // Clear all cache
      await geminiService.cacheManager?.clearAll();
      res.json({ message: "All cache cleared" });
    }
  } catch (error) {
    logger.error("Error clearing cache", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

/**
 * Reset rate limiter
 * POST /api/gemini/ratelimit/reset
 */
export const resetRateLimit = (req, res) => {
  try {
    const { userId } = req.body;

    if (userId) {
      // Reset specific user
      geminiService.rateLimiter?.reset(userId);
      res.json({ message: `Rate limit reset for user: ${userId}` });
    } else {
      // Reset all
      geminiService.rateLimiter?.resetAll();
      res.json({ message: "All rate limits reset" });
    }
  } catch (error) {
    logger.error("Error resetting rate limit", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

export default {
  generateResponse,
  getModels,
  validateConfig,
  getHealth,
  getMetrics,
  clearCache,
  resetRateLimit,
};
