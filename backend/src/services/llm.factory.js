/**
 * LLM Factory Pattern
 * Creates provider instances based on provider type
 */

import logger from "../lib/logger.js";
import { LLM_PROVIDERS } from "../constants/llmModels.js";
import { openaiService } from "./llm/openai.service.js";
import { azureService } from "./llm/azure.service.js";
import { geminiService } from "./gemini.service.js";
import CustomLLMService from "./llm/custom.service.js";
import { mockLLMService } from "./llm/mock.service.js";

/**
 * Factory function to get LLM provider instance
 * @param {string} provider - The provider type (openai, azure, gemini, custom)
 * @returns {Object} - Provider service instance
 * @throws {Error} - If provider is invalid
 */
export const getLLMProvider = (provider) => {
  logger.debug(`Creating LLM provider: ${provider}`);

  switch (provider.toLowerCase()) {
    case LLM_PROVIDERS.OPENAI:
      return openaiService;

    case LLM_PROVIDERS.AZURE:
      return azureService;

    case LLM_PROVIDERS.GEMINI:
      return geminiService;

    case LLM_PROVIDERS.CUSTOM:
      return new CustomLLMService();

    default:
      const error = new Error(
        `Invalid LLM provider: ${provider}. Supported providers: ${Object.values(LLM_PROVIDERS).join(", ")}`
      );
      logger.error(error);
      throw error;
  }
};

/**
 * Factory function with fallback mechanism
 * If primary provider fails, attempts to use OpenAI as fallback
 * @param {string} primaryProvider - The primary provider type
 * @returns {Object} - Provider service instance with fallback
 */
export const getLLMProviderWithFallback = (primaryProvider) => {
  // If no API keys are configured at all, fallback to mock service immediately
  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY && !process.env.AZURE_OPENAI_API_KEY) {
    logger.info("No LLM API keys configured. Using Mock LLM Service.");
    return mockLLMService;
  }

  try {
    const provider = getLLMProvider(primaryProvider);
    // Check if the selected provider has its API key configured
    if (primaryProvider.toLowerCase() === LLM_PROVIDERS.OPENAI && !process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key is missing");
    }
    if (primaryProvider.toLowerCase() === LLM_PROVIDERS.GEMINI && !process.env.GEMINI_API_KEY) {
      throw new Error("Gemini API key is missing");
    }
    return provider;
  } catch (error) {
    logger.warn(
      `Failed to initialize or missing key for primary provider ${primaryProvider}, falling back: ${error.message}`
    );
    // Fallback order: Gemini -> OpenAI -> Mock
    if (process.env.GEMINI_API_KEY) {
      return geminiService;
    }
    if (process.env.OPENAI_API_KEY) {
      return openaiService;
    }
    return mockLLMService;
  }
};


export default getLLMProvider;
