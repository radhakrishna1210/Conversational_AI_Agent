/**
 * OpenAI Routes
 * Production-ready OpenAI-only routes
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
} from "../controllers/openai.controller.js";

const router = express.Router();

/**
 * POST /api/openai/generate
 */
router.post("/generate", generateResponse);

/**
 * GET /api/openai/models
 */
router.get("/models", getModels);

/**
 * POST /api/openai/validate
 */
router.post("/validate", validateConfig);

/**
 * GET /api/openai/health
 */
router.get("/health", getHealth);

/**
 * GET /api/openai/metrics
 */
router.get("/metrics", getMetrics);

/**
 * POST /api/openai/cache/clear
 */
router.post("/cache/clear", clearCache);

/**
 * POST /api/openai/ratelimit/reset
 */
router.post("/ratelimit/reset", resetRateLimit);

export default router;
