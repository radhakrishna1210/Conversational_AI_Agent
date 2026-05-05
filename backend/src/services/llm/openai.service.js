/**
 * Enhanced OpenAI Service
 * Production-ready OpenAI integration with:
 * - Proper message formatting
 * - Retry logic and timeouts
 * - Token tracking
 * - Caching (Redis/Memory)
 * - Rate limiting
 * - Health and metrics
 */

import logger from "../../lib/logger.js";
import { cacheManager } from "../../lib/cache.js";
import { rateLimiter } from "../../lib/rateLimiter.js";
import { usageTracker } from "../../lib/usageTracker.js";
import redis from "../../config/redis.js";
import {
  getOpenAIAPIModel,
  isValidOpenAIModel,
  isValidTemperature,
  isValidTopP,
  getDefaultGenerationConfig,
  OPENAI_CONFIG,
} from "../../constants/openaiModels.js";

class OpenAIService {
  constructor() {
    this.client = null;
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    if (!this.apiKey) {
      logger.warn(
        "⚠️ OPENAI_API_KEY not configured. OpenAI service will not work."
      );
    }
  }

  /**
   * Initialize OpenAI client
   */
  async initializeClient() {
    if (this.client) return;

    try {
      const { default: OpenAI } = await import("openai");
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
      });
      logger.info("✅ OpenAI client initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize OpenAI client", error);
      throw new Error("OpenAI SDK not installed or failed to initialize");
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config) {
    const { model, temperature, topP } = config;

    if (!isValidOpenAIModel(model)) {
      throw new Error(`Invalid OpenAI model: "${model}"`);
    }

    if (temperature !== undefined && !isValidTemperature(temperature)) {
      throw new Error(`Invalid temperature: ${temperature}`);
    }

    if (topP !== undefined && !isValidTopP(topP)) {
      throw new Error(`Invalid topP: ${topP}`);
    }
  }

  /**
   * Format messages for OpenAI API
   */
  formatMessages(message, chatHistory = [], systemPrompt) {
    const messages = [];

    // Add system prompt
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    } else {
      messages.push({ role: "system", content: "You are a helpful AI assistant." });
    }

    // Add chat history
    if (chatHistory && Array.isArray(chatHistory)) {
      for (const msg of chatHistory) {
        if (!msg.role || !msg.content) continue;
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add current message
    messages.push({ role: "user", content: message });

    return messages;
  }

  /**
   * Call OpenAI API with retry logic
   */
  async callOpenAIAPI(params, retryCount = 0) {
    const { model, messages, temperature, topP, max_tokens } = params;

    try {
      logger.debug(`📤 Calling OpenAI API (attempt ${retryCount + 1}):`, {
        model,
        messageCount: messages.length,
      });

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Request timeout")),
          OPENAI_CONFIG.timeout
        )
      );

      // Make API call with timeout
      const response = await Promise.race([
        this.client.chat.completions.create({
          model: getOpenAIAPIModel(model),
          messages,
          temperature,
          top_p: topP,
          max_tokens,
        }),
        timeoutPromise,
      ]);

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("Empty response from OpenAI API");
      }

      const text = response.choices[0].message.content;
      const usage = response.usage;

      logger.debug("✅ OpenAI API response received", { 
        textLength: text.length,
        usage 
      });

      return { text, usage };
    } catch (error) {
      if (retryCount < OPENAI_CONFIG.maxRetries) {
        const delay = OPENAI_CONFIG.retryDelay * (retryCount + 1);
        logger.warn(
          `⚠️ OpenAI API call failed, retrying in ${delay}ms:`,
          error.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callOpenAIAPI(params, retryCount + 1);
      }

      logger.error(`❌ OpenAI API call failed after ${OPENAI_CONFIG.maxRetries} retries`, error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Main entry point for OpenAI API calls
   */
  async generateResponse(arg1, arg2, arg3) {
    let request;

    if (typeof arg1 === "object" && arg1 !== null && !arg2) {
      request = arg1;
    } else {
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

    if (typeof arg1 === "string") {
      if (!result.success) throw new Error(result.error);
      return result.message;
    }

    return result;
  }

  /**
   * Internal generation logic
   */
  async _generateResponseInternal(request) {
    const {
      userId,
      agentId,
      message,
      model = "gpt-4o-mini",
      chatHistory,
      systemPrompt,
      temperature,
      topP,
      maxOutputTokens,
      skipCache = false,
    } = request;

    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);

    try {
      logger.info(`[${requestId}] Generating response from OpenAI`, {
        agentId,
        model,
        messageLength: message.length,
      });

      this.validateConfig({ model, temperature, topP });

      // Check rate limit
      if (OPENAI_CONFIG.rateLimiting.enabled && userId) {
        const limitCheck = rateLimiter.checkLimit(userId);
        if (!limitCheck.allowed) {
          throw new Error(`Rate limit exceeded. Try again in ${(limitCheck.resetAfterMs / 1000).toFixed(1)}s`);
        }
      }

      // Check cache
      if (OPENAI_CONFIG.caching.enabled && !skipCache) {
        const cacheKey = cacheManager.generateCacheKey(message, model, chatHistory);
        const cached = await cacheManager.get(cacheKey);
        if (cached) {
          logger.info(`[${requestId}] ✅ Cache HIT`, { cacheKey });
          return { ...cached, fromCache: true, responseTime: Date.now() - startTime };
        }
      }

      await this.initializeClient();

      const messages = this.formatMessages(message, chatHistory, systemPrompt);
      const generationConfig = getDefaultGenerationConfig();

      const { text, usage } = await this.callOpenAIAPI({
        model,
        messages,
        temperature: temperature ?? generationConfig.temperature,
        topP: topP ?? generationConfig.topP,
        max_tokens: maxOutputTokens ?? generationConfig.max_tokens,
      });

      const responseTime = Date.now() - startTime;

      usageTracker.recordRequest({
        userId,
        model,
        message,
        chatHistory,
        responseTime,
        responseText: text,
        success: true,
        tokens: {
          prompt: usage?.prompt_tokens,
          completion: usage?.completion_tokens,
          total: usage?.total_tokens,
        }
      });

      const response = {
        success: true,
        message: text,
        model,
        responseTime,
        fromCache: false,
        timestamp: new Date().toISOString(),
        usage: {
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
        }
      };

      if (OPENAI_CONFIG.caching.enabled) {
        const cacheKey = cacheManager.generateCacheKey(message, model, chatHistory);
        await cacheManager.set(cacheKey, response);
      }

      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(`[${requestId}] ❌ Error generating response`, { error: error.message });

      usageTracker.recordRequest({
        userId,
        model,
        message,
        responseTime,
        success: false,
        error,
      });

      return {
        success: false,
        error: error.message,
        model,
        responseTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  getHealth() {
    return {
      status: this.apiKey ? "healthy" : "misconfigured",
      redis: redis ? "connected" : "fallback",
      cache: redis ? "redis" : "memory",
      llm: this.client ? "openai-ready" : "not-initialized",
      apiKeyConfigured: !!this.apiKey,
      clientInitialized: !!this.client,
      cacheStats: cacheManager.getStats(),
      rateLimitStats: rateLimiter.getStats(),
      usageStats: usageTracker.getStats(),
    };
  }

  getMetrics() {
    return {
      cache: cacheManager.getStats(),
      rateLimit: rateLimiter.getStats(),
      usage: usageTracker.getStats(),
    };
  }
}

export const openaiService = new OpenAIService();
export default OpenAIService;

