/**
 * Azure OpenAI Routes
 * Production-ready Azure-only routes
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
} from "../controllers/azure.controller.js";

const router = express.Router();

/**
 * POST /api/azure/generate
 */
router.post("/generate", generateResponse);

/**
 * GET /api/azure/models
 */
router.get("/models", getModels);

/**
 * POST /api/azure/validate
 */
router.post("/validate", validateConfig);

/**
 * GET /api/azure/health
 */
router.get("/health", getHealth);

/**
 * GET /api/azure/metrics
 */
router.get("/metrics", getMetrics);

/**
 * POST /api/azure/cache/clear
 */
router.post("/cache/clear", clearCache);

/**
 * POST /api/azure/ratelimit/reset
 */
router.post("/ratelimit/reset", resetRateLimit);

export default router;
