/**
 * Gemini Routes
 * Production-ready Gemini-only routes
 */

import express from "express";
import {
  generateResponse,
  getModels,
  validateConfig,
  getHealth,
  getMetrics,
  clearCache,
  resetRateLimit,
} from "../controllers/gemini.controller.js";

const router = express.Router();

/**
 * POST /api/gemini/generate
 * Generate response from Gemini
 * Body: { agentId, message, model?, chatHistory?, systemPrompt?, temperature?, topP?, topK?, skipCache? }
 */
router.post("/generate", generateResponse);

/**
 * GET /api/gemini/models
 * Get list of supported Gemini models
 */
router.get("/models", getModels);

/**
 * POST /api/gemini/validate
 * Validate Gemini configuration
 * Body: { model, temperature?, topP?, topK? }
 */
router.post("/validate", validateConfig);

/**
 * GET /api/gemini/health
 * Get service health and configuration status
 */
router.get("/health", getHealth);

/**
 * GET /api/gemini/metrics
 * Get service metrics and statistics
 */
router.get("/metrics", getMetrics);

/**
 * POST /api/gemini/cache/clear
 * Clear cache (all or specific key)
 * Body: { key?: string }
 */
router.post("/cache/clear", clearCache);

/**
 * POST /api/gemini/ratelimit/reset
 * Reset rate limits (all or specific user)
 * Body: { userId?: string }
 */
router.post("/ratelimit/reset", resetRateLimit);

export default router;
