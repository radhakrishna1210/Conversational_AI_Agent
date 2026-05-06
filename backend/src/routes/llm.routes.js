/**
 * LLM Routes
 * Defines all LLM-related API endpoints
 */

import express from "express";
import {
  generateResponse,
  getModelsForProvider,
  getSupportedProviders,
  validateLLMConfig,
} from "../controllers/llm.controller.js";

const router = express.Router();

/**
 * Generate LLM Response
 * POST /api/llm/generate
 */
router.post("/generate", generateResponse);

/**
 * Get Models for a Specific Provider
 * GET /api/llm/models/:provider
 */
router.get("/models/:provider", getModelsForProvider);

/**
 * Get All Supported Providers and Models
 * GET /api/llm/providers
 */
router.get("/providers", getSupportedProviders);

/**
 * Validate LLM Configuration
 * POST /api/llm/validate
 */
router.post("/validate", validateLLMConfig);

export default router;
