/**
 * LLM Controller
 * Handles LLM-related API endpoints
 */

import logger from "../lib/logger.js";
import { getLLMProvider, getLLMProviderWithFallback } from "../services/llm.factory.js";
import {
  isValidModel,
  isValidTemperature,
  DEFAULT_TEMPERATURE,
  ALLOWED_MODELS,
} from "../constants/llmModels.js";

/**
 * Generate LLM response
 * POST /api/llm/generate
 *
 * Request body:
 * {
 *   agentId: string,
 *   message: string,
 *   provider?: string (optional, uses agent config by default),
 *   model?: string (optional, uses agent config by default),
 *   temperature?: number (optional, uses agent config by default),
 *   systemPrompt?: string (optional),
 *   useFallback?: boolean (optional, default: true)
 * }
 */
export const generateResponse = async (req, res) => {
  const requestId = req.id || Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();

  try {
    const { agentId, message, provider, model, temperature, systemPrompt, useFallback = true } =
      req.body;

    // Validate required fields
    if (!agentId || !message) {
      logger.warn(`[${requestId}] Missing required fields: agentId or message`);
      return res.status(400).json({
        error: "Missing required fields: agentId and message",
      });
    }

    if (typeof message !== "string" || message.trim().length === 0) {
      logger.warn(`[${requestId}] Invalid message: empty or not a string`);
      return res.status(400).json({
        error: "Message must be a non-empty string",
      });
    }

    logger.info(`[${requestId}] Processing LLM request for agent: ${agentId}`);

    // TODO: Fetch agent configuration from database
    // For now, using request parameters
    const agentConfig = {
      provider: provider || process.env.DEFAULT_LLM_PROVIDER || "gemini",

      model: model || process.env.DEFAULT_LLM_MODEL || "gemini-2.5-flash",

      temperature:
        temperature ?? 
        (process.env.DEFAULT_LLM_TEMPERATURE ? parseFloat(process.env.DEFAULT_LLM_TEMPERATURE) : DEFAULT_TEMPERATURE),
    };


    // Validate provider and model configuration
    const { provider: configProvider, model: configModel, temperature: configTemp } = agentConfig;

    if (!isValidModel(configProvider, configModel)) {
      logger.error(
        `[${requestId}] Invalid model configuration: ${configProvider}/${configModel}`
      );
      return res.status(400).json({
        error: `Invalid model '${configModel}' for provider '${configProvider}'. Allowed models: ${ALLOWED_MODELS[configProvider]?.join(", ") || "none"}`,
      });
    }

    if (!isValidTemperature(configTemp)) {
      logger.error(`[${requestId}] Invalid temperature: ${configTemp}`);
      return res.status(400).json({
        error: "Temperature must be a number between 0 and 1",
      });
    }

    logger.debug(
      `[${requestId}] Agent config:`,
      { provider: configProvider, model: configModel, temperature: configTemp }
    );

    // Get LLM provider instance
    let llmProvider;
    try {
      llmProvider = useFallback
        ? getLLMProviderWithFallback(configProvider)
        : getLLMProvider(configProvider);
    } catch (error) {
      logger.error(`[${requestId}] Failed to initialize LLM provider`, error);
      return res.status(500).json({
        error: error.message,
      });
    }

    // Generate response
    let response;
    try {
      response = await llmProvider.generateResponse(
        message,
        {
          model: configModel,
          temperature: configTemp,
          deploymentName: agentConfig.deploymentName, // For Azure
        },
        {
          systemPrompt: systemPrompt || "You are a helpful AI assistant.",
          maxTokens: req.body.maxTokens || 2000,
        }
      );
    } catch (error) {
      logger.error(`[${requestId}] LLM generation failed`, error);
      return res.status(500).json({
        error: error.message || "Failed to generate response from LLM",
      });
    }

    const duration = Date.now() - startTime;
    logger.info(
      `[${requestId}] Successfully generated LLM response (${duration}ms)`,
      {
        agentId,
        provider: configProvider,
        model: configModel,
      }
    );

    res.json({
      success: true,
      agentId,
      message: response,
      provider: configProvider,
      model: configModel,
      timestamp: new Date().toISOString(),
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[${requestId}] Unexpected error in LLM generation (${duration}ms)`, error);
    res.status(500).json({
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get supported models for a provider
 * GET /api/llm/models/:provider
 */
export const getModelsForProvider = (req, res) => {
  try {
    const { provider } = req.params;

    if (!provider) {
      return res.status(400).json({
        error: "Provider is required",
      });
    }

    const models = ALLOWED_MODELS[provider.toLowerCase()];

    if (!models) {
      return res.status(404).json({
        error: `Unknown provider: ${provider}`,
        supportedProviders: Object.keys(ALLOWED_MODELS),
      });
    }

    res.json({
      provider: provider.toLowerCase(),
      models,
    });
  } catch (error) {
    logger.error("Error fetching models for provider", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

/**
 * Get all supported providers
 * GET /api/llm/providers
 */
export const getSupportedProviders = (req, res) => {
  try {
    const providers = Object.keys(ALLOWED_MODELS).map((provider) => ({
      name: provider,
      models: ALLOWED_MODELS[provider],
      modelCount: ALLOWED_MODELS[provider].length,
    }));

    res.json({
      providers,
      totalProviders: providers.length,
      totalModels: providers.reduce((sum, p) => sum + p.modelCount, 0),
    });
  } catch (error) {
    logger.error("Error fetching supported providers", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

/**
 * Validate LLM configuration
 * POST /api/llm/validate
 *
 * Request body:
 * {
 *   provider: string,
 *   model: string,
 *   temperature?: number
 * }
 */
export const validateLLMConfig = (req, res) => {
  try {
    const { provider, model, temperature } = req.body;

    const errors = [];

    // Validate provider
    if (!provider) {
      errors.push("Provider is required");
    } else if (!ALLOWED_MODELS[provider.toLowerCase()]) {
      errors.push(
        `Unknown provider: ${provider}. Supported: ${Object.keys(ALLOWED_MODELS).join(", ")}`
      );
    }

    // Validate model
    if (!model) {
      errors.push("Model is required");
    } else if (provider && !isValidModel(provider.toLowerCase(), model)) {
      errors.push(
        `Invalid model for provider ${provider}. Allowed: ${ALLOWED_MODELS[provider.toLowerCase()]?.join(", ") || "none"}`
      );
    }

    // Validate temperature
    if (temperature !== undefined && !isValidTemperature(temperature)) {
      errors.push("Temperature must be a number between 0 and 1");
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
        provider: provider.toLowerCase(),
        model,
        temperature: temperature ?? DEFAULT_TEMPERATURE,
      },
    });
  } catch (error) {
    logger.error("Error validating LLM config", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

export default {
  generateResponse,
  getModelsForProvider,
  getSupportedProviders,
  validateLLMConfig,
};
