/**
 * Custom LLM Service Provider
 * Handles interactions with custom/external LLM APIs (e.g., LLaMA)
 */

import fetch from "node-fetch";
import logger from "../../lib/logger.js";
import {
  isValidModel,
  isValidTemperature,
  DEFAULT_TEMPERATURE,
  PROVIDER_CONFIGS,
  LLM_PROVIDERS,
} from "../../constants/llmModels.js";

class CustomLLMService {
  constructor() {
    this.provider = LLM_PROVIDERS.CUSTOM;
    this.config = PROVIDER_CONFIGS.custom;
    this.baseUrl = process.env.CUSTOM_LLM_BASE_URL;

    if (!this.baseUrl) {
      logger.warn("Custom LLM base URL not configured (CUSTOM_LLM_BASE_URL)");
    }
  }

  /**
   * Validate configuration
   * @param {Object} config - LLM configuration
   * @throws {Error} - If configuration is invalid
   */
  validateConfig(config) {
    const { model, temperature } = config;

    // Validate model
    if (!isValidModel(this.provider, model)) {
      throw new Error(
        `Invalid model for Custom LLM: ${model}. Allowed models: ${this.getAllowedModels().join(", ")}`
      );
    }

    // Validate temperature
    const temp = temperature ?? DEFAULT_TEMPERATURE;
    if (!isValidTemperature(temp)) {
      throw new Error(
        `Invalid temperature: ${temp}. Must be between 0 and 1`
      );
    }
  }

  /**
   * Generate response from Custom LLM
   * @param {string} message - User message
   * @param {Object} config - LLM configuration { model, temperature }
   * @param {Object} options - Additional options
   * @returns {Promise<string>} - Generated response
   */
  async generateResponse(message, config, options = {}) {
    const startTime = Date.now();

    try {
      // Validate base URL is configured
      if (!this.baseUrl) {
        throw new Error("Custom LLM base URL not configured");
      }

      // Validate configuration
      this.validateConfig(config);

      const { model, temperature = DEFAULT_TEMPERATURE } = config;
      const { systemPrompt = "You are a helpful AI assistant." } = options;

      logger.debug(`Custom LLM: Generating response for model: ${model}`);

      // Prepare request payload
      const payload = {
        model,
        message,
        system_prompt: systemPrompt,
        temperature,
        max_tokens: options.maxTokens || 2000,
      };

      // Make HTTP POST request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      try {
        const response = await fetch(`${this.baseUrl}/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CUSTOM_LLM_API_KEY || ""}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const data = await response.json();

        // Extract content from response
        const content =
          data.response ||
          data.text ||
          data.content ||
          "No response generated from Custom LLM";

        const duration = Date.now() - startTime;
        logger.info(
          `Custom LLM response generated successfully (${duration}ms)`,
          {
            model,
            provider: this.baseUrl,
          }
        );

        return content;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Custom LLM error after ${duration}ms`, error);

      if (error.name === "AbortError" || error.message.includes("timeout")) {
        throw new Error("Custom LLM request timed out");
      }

      throw new Error(`Custom LLM error: ${error.message}`);
    }
  }

  /**
   * Get allowed models for this provider
   * @returns {Array<string>} - List of allowed models
   */
  getAllowedModels() {
    return ["llama-3.3-70b-versatile"];
  }
}

export default CustomLLMService;
