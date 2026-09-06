/**
 * Together AI LLM Service Provider
 * Direct integration with Together AI API (https://api.together.xyz/v1)
 * Provides fast open-source models with high token throughput and low latency.
 */

import logger from "../../lib/logger.js";
import {
  DEFAULT_TEMPERATURE,
  LLM_PROVIDERS,
} from "../../constants/llmModels.js";

export const DEFAULT_TOGETHER_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo";

class TogetherService {
  constructor() {
    this.provider = LLM_PROVIDERS.TOGETHER || "together";
    this.client = null;
    this.supportsChatHistory = true;
    this.apiKey = process.env.TOGETHER_API_KEY;
    this.baseURL = process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1";

    if (!this.apiKey) {
      logger.warn("⚠️ TOGETHER_API_KEY not configured. Together AI service will not work.");
    }
  }

  async initializeClient() {
    if (this.client) return;

    this.apiKey = process.env.TOGETHER_API_KEY;
    if (!this.apiKey) {
      throw new Error("TOGETHER_API_KEY is not configured");
    }

    try {
      const { default: OpenAI } = await import("openai");
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
      });
      logger.info("✅ Together AI LLM client initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize Together AI client", error);
      throw new Error("OpenAI SDK failed to initialize for Together AI");
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

    const model = config.model || process.env.TOGETHER_MODEL || DEFAULT_TOGETHER_MODEL;
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
      logger.error("Together AI generation error:", error);
      throw error;
    }
  }

  async *generateResponseStream(message, config = {}, options = {}) {
    await this.initializeClient();

    const model = config.model || process.env.TOGETHER_MODEL || DEFAULT_TOGETHER_MODEL;
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
      logger.error("Together AI streaming error:", error);
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
      provider: "together",
      configured: !!process.env.TOGETHER_API_KEY,
      status: process.env.TOGETHER_API_KEY ? "ready" : "unconfigured",
    };
  }
}

export const togetherService = new TogetherService();
export default TogetherService;
