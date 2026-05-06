/**
 * OpenAI Controller
 * Handles OpenAI-specific API endpoints
 */

import logger from "../lib/logger.js";
import { openaiService } from "../services/llm/openai.service.js";
import { SUPPORTED_OPENAI_MODELS } from "../constants/openaiModels.js";

/**
 * Generate response using OpenAI
 * POST /api/openai/generate
 */
export const generateResponse = async (req, res) => {
  const requestId = req.id || Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();

  try {
    const {
      agentId,
      message,
      model = "gpt-4o-mini",
      chatHistory,
      systemPrompt,
      temperature,
      topP,
      maxOutputTokens,
      skipCache,
    } = req.body;

    // Validate required fields
    if (!agentId) {
      return res.status(400).json({ error: "Missing required field: agentId" });
    }

    if (!message) {
      return res.status(400).json({ error: "Missing required field: message" });
    }

    // Get user ID from JWT if available
    const userId = req.user?.id || req.workspace?.id;

    logger.info(`[${requestId}] Generating OpenAI response`, {
      agentId,
      model,
      userId,
    });

    const response = await openaiService.generateResponse({
      userId,
      agentId,
      message,
      model,
      chatHistory,
      systemPrompt,
      temperature,
      topP,
      maxOutputTokens,
      skipCache,
    });

    if (!response.success) {
      return res.status(500).json({ error: response.error });
    }

    const duration = Date.now() - startTime;
    logger.info(`[${requestId}] OpenAI response sent successfully (${duration}ms)`);

    res.json({
      success: true,
      agentId,
      message: response.message,
      model,
      fromCache: response.fromCache,
      responseTime: response.responseTime,
      timestamp: response.timestamp,
      usage: response.usage,
    });
  } catch (error) {
    logger.error(`[${requestId}] Unexpected error in OpenAI generateResponse`, error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Get supported OpenAI models
 */
export const getModels = (req, res) => {
  res.json({
    models: SUPPORTED_OPENAI_MODELS,
    totalModels: SUPPORTED_OPENAI_MODELS.length,
  });
};

/**
 * Validate OpenAI configuration
 */
export const validateConfig = (req, res) => {
  const { model, temperature, topP } = req.body;
  const errors = [];

  if (!model) {
    errors.push("Model is required");
  } else if (!SUPPORTED_OPENAI_MODELS.includes(model)) {
    errors.push(`Invalid model: ${model}`);
  }

  if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
    errors.push("Temperature must be between 0 and 2");
  }

  if (topP !== undefined && (topP < 0 || topP > 1)) {
    errors.push("TopP must be between 0 and 1");
  }

  if (errors.length > 0) {
    return res.status(400).json({ valid: false, errors });
  }

  res.json({ valid: true });
};

/**
 * Get service health
 */
export const getHealth = (req, res) => {
  const health = openaiService.getHealth();
  res.status(health.status === "healthy" ? 200 : 503).json(health);
};

/**
 * Get service metrics
 */
export const getMetrics = (req, res) => {
  res.json(openaiService.getMetrics());
};

/**
 * Clear cache
 */
export const clearCache = async (req, res) => {
  const { key } = req.body;
  if (key) {
    await openaiService.cacheManager?.clear(key);
  } else {
    await openaiService.cacheManager?.clearAll();
  }
  res.json({ message: "Cache cleared" });
};

/**
 * Reset rate limit
 */
export const resetRateLimit = (req, res) => {
  const { userId } = req.body;
  if (userId) {
    openaiService.rateLimiter?.reset(userId);
  } else {
    openaiService.rateLimiter?.resetAll();
  }
  res.json({ message: "Rate limit reset" });
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
