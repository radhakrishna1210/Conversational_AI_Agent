/**
 * Mistral AI LLM Service Provider
 * Direct integration with Mistral AI API (https://api.mistral.ai/v1)
 * Offers fast instruction-tuned models with free/trial tier access.
 */

import logger from "../../lib/logger.js";
import {
  DEFAULT_TEMPERATURE,
  LLM_PROVIDERS,
} from "../../constants/llmModels.js";

export const DEFAULT_MISTRAL_MODEL = "mistral-small-latest";

class MistralService {
  constructor() {
    this.provider = LLM_PROVIDERS.MISTRAL || "mistral";
    this.client = null;
    this.supportsChatHistory = true;
    this.apiKey = process.env.MISTRAL_API_KEY;
    this.baseURL = process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1";

    if (!this.apiKey) {
      logger.warn("⚠️ MISTRAL_API_KEY not configured. Mistral service will not work.");
    }
  }

  async initializeClient() {
    if (this.client) return;

    this.apiKey = process.env.MISTRAL_API_KEY;
    if (!this.apiKey) {
      throw new Error("MISTRAL_API_KEY is not configured");
    }

    try {
      const { default: OpenAI } = await import("openai");
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
      });
      logger.info("✅ Mistral AI LLM client initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize Mistral AI client", error);
      throw new Error("OpenAI SDK failed to initialize for Mistral AI");
    }
  }

  formatMessages(message, chatHistory = [], systemPrompt) {
    const messages = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    if (chatHistory && Array.isArray(chatHistory)) {
      for (const msg of chatHistory) {
        if (!msg?.role || !msg?.content) continue;
        messages.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content,
        });
      }
    }

    if (message) {
      messages.push({ role: "user", content: message });
    }

    return messages;
  }

  async generateResponse(message, config = {}, options = {}) {
    await this.initializeClient();

    const model = config.model || process.env.MISTRAL_MODEL || DEFAULT_MISTRAL_MODEL;
    const temperature = config.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = config.maxTokens || 2000;

    const messages = this.formatMessages(
      message,
      options.chatHistory || [],
      options.systemPrompt
    );

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      logger.error("Mistral generation error:", error);
      throw error;
    }
  }

  async *generateResponseStream(message, config = {}, options = {}) {
    await this.initializeClient();

    const model = config.model || process.env.MISTRAL_MODEL || DEFAULT_MISTRAL_MODEL;
    const temperature = config.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = config.maxTokens || 2000;

    const messages = this.formatMessages(
      message,
      options.chatHistory || [],
      options.systemPrompt
    );

    try {
      const stream = await this.client.chat.completions.create(
        {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        },
        options.signal ? { signal: options.signal } : undefined
      );

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      logger.error("Mistral streaming error:", error);
      throw error;
    }
  }

  async testConnection() {
    try {
      await this.initializeClient();
      return true;
    } catch (error) {
      return false;
    }
  }

  getHealth() {
    return {
      provider: "mistral",
      configured: !!process.env.MISTRAL_API_KEY,
      status: process.env.MISTRAL_API_KEY ? "ready" : "unconfigured",
    };
  }
}

export const mistralService = new MistralService();
export default MistralService;
