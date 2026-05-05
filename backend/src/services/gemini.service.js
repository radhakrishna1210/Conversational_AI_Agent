/**
 * Enhanced Google Gemini Service
 * Production-ready Gemini integration with:
 * - Correct message formatting
 * - Multi-turn conversation support
 * - Retry logic
 * - Token tracking
 * - Error handling
 */

import logger from "../lib/logger.js";
import { cacheManager } from "../lib/cache.js";
import { rateLimiter } from "../lib/rateLimiter.js";
import { usageTracker } from "../lib/usageTracker.js";
import redis from "../config/redis.js";
import {
  getGeminiAPIModel,
  isValidGeminiModel,
  isValidTemperature,
  isValidTopP,
  isValidTopK,
  getDefaultGenerationConfig,
  GEMINI_CONFIG,
} from "../constants/geminiModels.js";

class GeminiService {
  constructor() {
    this.client = null;
    this.apiKey = process.env.GEMINI_API_KEY;

    if (!this.apiKey) {
      logger.warn(
        "⚠️ GEMINI_API_KEY not configured. Gemini service will not work."
      );
    }
  }

  /**
   * Initialize Gemini client
   * @throws {Error} - If SDK not available
   */
  async initializeClient() {
    if (this.client) return;

    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      this.client = new GoogleGenerativeAI(this.apiKey);
      logger.info("✅ Gemini client initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize Gemini client", error);
      throw new Error(
        "Google Generative AI SDK not installed or failed to initialize"
      );
    }
  }

  /**
   * Validate request configuration
   * @param {Object} config - Configuration object
   * @throws {Error} - If configuration is invalid
   */
  validateConfig(config) {
    const { model, temperature, topP, topK } = config;

    // Validate model
    if (!isValidGeminiModel(model)) {
      throw new Error(
        `Invalid Gemini model: "${model}". Supported models: gemini-2.5-flash, gemini-2.5-flash-lite`
      );

    }

    // Validate temperature
    if (temperature !== undefined && !isValidTemperature(temperature)) {
      throw new Error(
        `Invalid temperature: ${temperature}. Must be between 0 and 2`
      );
    }

    // Validate topP
    if (topP !== undefined && !isValidTopP(topP)) {
      throw new Error(
        `Invalid topP: ${topP}. Must be between 0 and 1`
      );
    }

    // Validate topK
    if (topK !== undefined && !isValidTopK(topK)) {
      throw new Error(
        `Invalid topK: ${topK}. Must be between 0 and 100`
      );
    }
  }

  /**
   * Format messages for Gemini API
   * Converts chat history to Gemini's required format
   * @param {string} userMessage - Current user message
   * @param {Array} chatHistory - Previous messages [{ role, content }]
   * @returns {Array} - Formatted contents array
   */
  formatMessages(userMessage, chatHistory = []) {
    const contents = [];

    // Add previous messages from chat history
    if (chatHistory && Array.isArray(chatHistory)) {
      for (const msg of chatHistory) {
        if (!msg.role || !msg.content) continue;

        // Convert role format (user/assistant → user/model)
        const geminiRole = msg.role === "assistant" ? "model" : "user";

        contents.push({
          role: geminiRole,
          parts: [{ text: msg.content }],
        });
      }
    }

    // Add current user message
    contents.push({
      role: "user",
      parts: [{ text: userMessage }],
    });

    return contents;
  }

  /**
   * Get generation config for API call
   * @param {Object} params - Configuration parameters
   * @returns {Object} - Generation config for API
   */
  getGenerationConfig(params = {}) {
    const config = getDefaultGenerationConfig();

    // Override with provided parameters
    if (params.temperature !== undefined) {
      config.temperature = params.temperature;
    }
    if (params.topP !== undefined) {
      config.topP = params.topP;
    }
    if (params.topK !== undefined) {
      config.topK = params.topK;
    }
    if (params.maxOutputTokens !== undefined) {
      config.maxOutputTokens = params.maxOutputTokens;
    }

    return config;
  }

  /**
   * Call Gemini API with retry logic
   * @param {Object} params - API call parameters
   * @returns {Promise<string>} - Generated response
   * @throws {Error} - If API call fails after retries
   */
  async callGeminiAPI(params, retryCount = 0) {
    const { model, contents, generationConfig, systemPrompt } = params;

    try {
      const geminiModel = this.client.getGenerativeModel({
        model: getGeminiAPIModel(model),
        systemInstruction: systemPrompt,
      });

      logger.debug(`📤 Calling Gemini API (attempt ${retryCount + 1}):`, {
        model,
        messageCount: contents.length,
      });

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Request timeout")),
          GEMINI_CONFIG.timeout
        )
      );

      // Make API call with timeout
      const response = await Promise.race([
        geminiModel.generateContent({
          contents,
          generationConfig,
        }),
        timeoutPromise,
      ]);

      // Extract and validate response
      if (!response || !response.response) {
        throw new Error("Empty response from Gemini API");
      }

      const text = response.response.text();

      if (!text) {
        throw new Error("No text in Gemini response");
      }

      logger.debug("✅ Gemini API response received", { textLength: text.length });

      return text;
    } catch (error) {
      // Retry logic
      if (retryCount < GEMINI_CONFIG.maxRetries) {
        const delay = GEMINI_CONFIG.retryDelay * (retryCount + 1);
        logger.warn(
          `⚠️ API call failed (attempt ${retryCount + 1}/${GEMINI_CONFIG.maxRetries}), retrying in ${delay}ms:`,
          error.message
        );

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry
        return this.callGeminiAPI(params, retryCount + 1);
      }

      // All retries exhausted
      logger.error(
        `❌ Gemini API call failed after ${GEMINI_CONFIG.maxRetries} retries`,
        { message: error.message, stack: error.stack, details: error }
      );


      // Classify error
      if (error.message.includes("timeout")) {
        throw new Error("Gemini request timed out. Please try again.");
      } else if (error.message.includes("429")) {
        throw new Error("Rate limit exceeded. Please wait before retrying.");
      } else if (error.message.includes("401") || error.message.includes("403")) {
        throw new Error("Invalid API key or permissions. Please check your configuration.");
      } else {
        throw new Error(`Gemini API error: ${error.message}`);
      }
    }
  }

  /**
   * Main entry point for Gemini API calls
   * Supports both new object-based signature and legacy signature
   * 
   * New: generateResponse({ message, model, ... })
   * Legacy: generateResponse(message, config, options)
   */
  async generateResponse(arg1, arg2, arg3) {
    let request;

    if (typeof arg1 === "object" && arg1 !== null && !arg2) {
      // New object-based signature
      request = arg1;
    } else {
      // Legacy signature (message, config, options)
      request = {
        message: arg1,
        model: arg2?.model,
        temperature: arg2?.temperature,
        systemPrompt: arg3?.systemPrompt,
        maxOutputTokens: arg3?.maxTokens,
        chatHistory: arg3?.chatHistory || [],
        userId: arg3?.userId,
        agentId: arg3?.agentId || "legacy-llm-factory",
      };
    }

    const result = await this._generateResponseInternal(request);

    // If it was a legacy call, return just the message string or throw error
    if (typeof arg1 === "string") {
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.message;
    }

    return result;
  }

  /**
   * Internal generation logic
   * @param {Object} request - Prepared request parameters
   * @returns {Promise<Object>} - Response with metadata
   */
  async _generateResponseInternal(request) {
    const {
      userId,
      agentId,
      message,
      model,
      chatHistory,
      systemPrompt = "You are a helpful AI assistant.",
      temperature,
      topP,
      topK,
      maxOutputTokens,
      skipCache = false,
    } = request;

    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);

    try {
      logger.info(`[${requestId}] Generating response from Gemini`, {
        agentId,
        model,
        messageLength: message.length,
      });

      // Validate configuration
      this.validateConfig({ model, temperature, topP, topK });

      // Check rate limit
      if (GEMINI_CONFIG.rateLimiting.enabled && userId) {
        const limitCheck = rateLimiter.checkLimit(userId);
        if (!limitCheck.allowed) {
          throw new Error(
            `Rate limit exceeded. Try again in ${(limitCheck.resetAfterMs / 1000).toFixed(1)}s`
          );
        }
      }

      // Check cache
      if (GEMINI_CONFIG.caching.enabled && !skipCache) {
        const cacheKey = cacheManager.generateCacheKey(message, model, chatHistory);
        const cached = await cacheManager.get(cacheKey);

        if (cached) {
          logger.info(`[${requestId}] ✅ Cache HIT`, { cacheKey });
          return {
            ...cached,
            fromCache: true,
            responseTime: Date.now() - startTime,
          };
        }
      }

      // Initialize client if needed
      await this.initializeClient();

      // Format messages for Gemini API
      const contents = this.formatMessages(message, chatHistory);

      // Get generation config
      const generationConfig = this.getGenerationConfig({
        temperature,
        topP,
        topK,
        maxOutputTokens,
      });

      // Call API
      const responseText = await this.callGeminiAPI({
        model,
        contents,
        generationConfig,
        systemPrompt,
      });

      const responseTime = Date.now() - startTime;

      logger.info(`[${requestId}] ✅ Response generated successfully`, {
        responseTime,
        responseLength: responseText.length,
      });

      // Track usage
      usageTracker.recordRequest({
        userId,
        model,
        message,
        chatHistory,
        responseTime,
        responseText,
        success: true,
      });

      const response = {
        success: true,
        message: responseText,
        model,
        responseTime,
        fromCache: false,
        timestamp: new Date().toISOString(),
      };

      // Cache response
      if (GEMINI_CONFIG.caching.enabled) {
        const cacheKey = cacheManager.generateCacheKey(message, model, chatHistory);
        await cacheManager.set(cacheKey, response);
      }

      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      logger.error(`[${requestId}] ❌ Error generating response`, {
        error: error.message,
        responseTime,
      });

      // Track error
      usageTracker.recordRequest({
        userId,
        model,
        message,
        responseTime,
        success: false,
        error,
      });

      // Return error response
      return {
        success: false,
        error: error.message,
        model,
        responseTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get service health status
   * @returns {Object} - Health status
   */
  getHealth() {
    return {
      status: this.apiKey ? "healthy" : "misconfigured",
      redis: redis ? "connected" : "fallback",
      cache: redis ? "redis" : "memory",
      llm: this.client ? "gemini-ready" : "not-initialized",
      apiKeyConfigured: !!this.apiKey,
      clientInitialized: !!this.client,
      cacheStats: cacheManager.getStats(),
      rateLimitStats: rateLimiter.getStats(),
      usageStats: usageTracker.getStats(),
    };
  }

  /**
   * Get metrics and statistics
   * @returns {Object} - Service metrics
   */
  getMetrics() {
    return {
      cache: cacheManager.getStats(),
      rateLimit: rateLimiter.getStats(),
      usage: usageTracker.getStats(),
    };
  }
}

// Export singleton instance
export const geminiService = new GeminiService();
export default GeminiService;
