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
import { sarvamLLMService } from "./llm/sarvam.service.js";
import { openrouterService } from "./llm/openrouter.service.js";
import { groqService } from "./groq.service.js";
import { mockLLMService } from "./llm/mock.service.js";

/**
 * Factory function to get LLM provider instance
 * @param {string} provider - The provider type (openai, azure, gemini, custom, sarvam, groq, openrouter)
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

    case LLM_PROVIDERS.SARVAM:
      return sarvamLLMService;

    case LLM_PROVIDERS.GROQ:
      return groqService;

    case LLM_PROVIDERS.OPENROUTER:
      return openrouterService;

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
 * If primary provider fails, attempts to use available configured provider
 * @param {string} primaryProvider - The primary provider type
 * @returns {Object} - Provider service instance with fallback
 */
export const getLLMProviderWithFallback = (primaryProvider) => {
  // If no API keys are configured at all, fallback to mock service immediately
  if (
    !process.env.OPENAI_API_KEY &&
    !process.env.GEMINI_API_KEY &&
    !process.env.AZURE_OPENAI_API_KEY &&
    !process.env.SARVAM_API_KEY &&
    !process.env.GROQ_API_KEY &&
    !process.env.OPENROUTER_API_KEY
  ) {
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
    if (primaryProvider.toLowerCase() === LLM_PROVIDERS.SARVAM && !process.env.SARVAM_API_KEY) {
      throw new Error("Sarvam API key is missing");
    }
    if (primaryProvider.toLowerCase() === LLM_PROVIDERS.GROQ && !process.env.GROQ_API_KEY) {
      throw new Error("Groq API key is missing");
    }
    if (primaryProvider.toLowerCase() === LLM_PROVIDERS.OPENROUTER && !process.env.OPENROUTER_API_KEY) {
      throw new Error("OpenRouter API key is missing");
    }
    return provider;
  } catch (error) {
    logger.warn(
      `Failed to initialize or missing key for primary provider ${primaryProvider}, falling back: ${error.message}`
    );
    // Fallback order: Gemini -> OpenRouter -> Groq -> OpenAI -> Sarvam -> Mock
    if (process.env.GEMINI_API_KEY) {
      return geminiService;
    }
    if (process.env.OPENROUTER_API_KEY) {
      return openrouterService;
    }
    if (process.env.GROQ_API_KEY) {
      return groqService;
    }
    if (process.env.OPENAI_API_KEY) {
      return openaiService;
    }
    if (process.env.SARVAM_API_KEY) {
      return sarvamLLMService;
    }
    return mockLLMService;
  }
};

export default getLLMProvider;
