/**
 * Enhanced Azure OpenAI Service
 * Production-ready Azure integration with:
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
  getAzureAPIModel,
  isValidAzureModel,
  isValidTemperature,
  isValidTopP,
  getDefaultGenerationConfig,
  AZURE_CONFIG,
} from "../../constants/azureModels.js";

class AzureService {
  constructor() {
    this.client = null;
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    this.apiKey = process.env.AZURE_OPENAI_KEY;
    this.apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview";

    if (!this.endpoint || !this.apiKey) {
      logger.warn(
        "⚠️ Azure OpenAI credentials not configured. Azure service will not work."
      );
    }
  }

  /**
   * Initialize Azure OpenAI client
   */
  async initializeClient() {
    if (this.client) return;

    try {
      const { AzureOpenAI } = await import("@azure/openai");
      this.client = new AzureOpenAI({
        endpoint: this.endpoint,
        apiKey: this.apiKey,
        apiVersion: this.apiVersion,
      });
      logger.info("✅ Azure OpenAI client initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize Azure OpenAI client", error);
      throw new Error("Azure OpenAI SDK not installed or failed to initialize");
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config) {
    const { model, temperature, topP } = config;

    if (!isValidAzureModel(model)) {
      throw new Error(`Invalid Azure model: "${model}"`);
    }

    if (temperature !== undefined && !isValidTemperature(temperature)) {
      throw new Error(`Invalid temperature: ${temperature}`);
    }

    if (topP !== undefined && !isValidTopP(topP)) {
      throw new Error(`Invalid topP: ${topP}`);
    }
  }

  /**
   * Format messages for Azure OpenAI
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
   * Call Azure OpenAI API with retry logic
   */
  async callAzureAPI(params, retryCount = 0) {
    const { deploymentName, messages, temperature, topP, maxTokens } = params;

    try {
      logger.debug(`📤 Calling Azure OpenAI API (attempt ${retryCount + 1}):`, {
        deploymentName,
        messageCount: messages.length,
      });

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Request timeout")),
          AZURE_CONFIG.timeout
        )
      );

      // Make API call with timeout
      const response = await Promise.race([
        this.client.getChatCompletions(
          deploymentName,
          messages,
          {
            temperature,
            topP,
            maxTokens,
          }
        ),
        timeoutPromise,
      ]);

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("Empty response from Azure OpenAI API");
      }

      const text = response.choices[0].message.content;
      const usage = response.usage;

      logger.debug("✅ Azure OpenAI API response received", { 
        textLength: text.length,
        usage 
      });

      return { text, usage };
    } catch (error) {
      if (retryCount < AZURE_CONFIG.maxRetries) {
        const delay = AZURE_CONFIG.retryDelay * (retryCount + 1);
        logger.warn(
          `⚠️ Azure OpenAI API call failed, retrying in ${delay}ms:`,
          error.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callAzureAPI(params, retryCount + 1);
      }

      logger.error(`❌ Azure OpenAI API call failed after ${AZURE_CONFIG.maxRetries} retries`, error);
      throw new Error(`Azure OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Main entry point for Azure OpenAI API calls
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
      model = "azure-gpt-4o-mini",
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
      logger.info(`[${requestId}] Generating response from Azure OpenAI`, {
        agentId,
        model,
        messageLength: message.length,
      });

      this.validateConfig({ model, temperature, topP });

      // Check rate limit
      if (AZURE_CONFIG.rateLimiting.enabled && userId) {
        const limitCheck = rateLimiter.checkLimit(userId);
        if (!limitCheck.allowed) {
          throw new Error(`Rate limit exceeded. Try again in ${(limitCheck.resetAfterMs / 1000).toFixed(1)}s`);
        }
      }

      // Check cache
      if (AZURE_CONFIG.caching.enabled && !skipCache) {
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

      // For Azure, model in request is used as deployment name
      const deploymentName = getAzureAPIModel(model);

      const { text, usage } = await this.callAzureAPI({
        deploymentName,
        messages,
        temperature: temperature ?? generationConfig.temperature,
        topP: topP ?? generationConfig.topP,
        maxTokens: maxOutputTokens ?? generationConfig.maxTokens,
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
          prompt: usage?.promptTokens,
          completion: usage?.completionTokens,
          total: usage?.totalTokens,
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
          promptTokens: usage?.promptTokens,
          completionTokens: usage?.completionTokens,
          totalTokens: usage?.totalTokens,
        }
      };

      if (AZURE_CONFIG.caching.enabled) {
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
      status: (this.apiKey && this.endpoint) ? "healthy" : "misconfigured",
      redis: redis ? "connected" : "fallback",
      cache: redis ? "redis" : "memory",
      llm: this.client ? "azure-ready" : "not-initialized",
      apiKeyConfigured: !!this.apiKey,
      endpointConfigured: !!this.endpoint,
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

export const azureService = new AzureService();
export default AzureService;

