/**
 * Sarvam AI LLM Service Provider
 * Handles interactions with Sarvam AI Chat Completions API (OpenAI-compatible)
 */

import logger from "../../lib/logger.js";
import {
  DEFAULT_TEMPERATURE,
  PROVIDER_CONFIGS,
  LLM_PROVIDERS,
} from "../../constants/llmModels.js";

const DEFAULT_SARVAM_MODEL = "sarvam-105b-conversations";

/** Normalize model names and alias deprecated models to supported ones */
export function normalizeSarvamModel(model) {
  if (!model || typeof model !== "string") return DEFAULT_SARVAM_MODEL;
  const norm = model.trim().toLowerCase();
  if (norm === "sarvam-105b") return "sarvam-105b";
  if (norm.includes("105b-conversations") || norm === "sarvam-105b-conversations") {
    return "sarvam-105b-conversations";
  }
  // Deprecated models or generic alias
  if (norm === "sarvam-30b" || norm === "sarvam-2b" || norm === "sarvam-m" || norm === "sarvam") {
    return DEFAULT_SARVAM_MODEL;
  }
  return norm;
}

class SarvamLLMService {
  constructor() {
    this.provider = LLM_PROVIDERS.SARVAM;
    this.client = null;
    this.supportsChatHistory = true;
    this.apiKey = process.env.SARVAM_API_KEY;
    this.baseURL = process.env.SARVAM_URL 
      ? `${process.env.SARVAM_URL.replace(/\/+$/, '')}/v1`
      : "https://api.sarvam.ai/v1";

    if (!this.apiKey) {
      logger.warn("⚠️ SARVAM_API_KEY not configured. Sarvam LLM service will not work.");
    }
  }

  /**
   * Initialize OpenAI client pointing to Sarvam API
   */
  async initializeClient() {
    if (this.client) return;

    this.apiKey = process.env.SARVAM_API_KEY;
    if (!this.apiKey) {
      throw new Error("SARVAM_API_KEY is not configured");
    }

    try {
      const { default: OpenAI } = await import("openai");
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
      });
      logger.info("✅ Sarvam LLM client initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize Sarvam LLM client", error);
      throw new Error("OpenAI SDK failed to initialize for Sarvam LLM");
    }
  }

  /**
   * Format messages for Sarvam Chat Completion API
   */
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

  /**
   * Main entry point for buffered generation
   */
  async generateResponse(arg1, arg2, arg3) {
    let message;
    let config = {};
    let options = {};

    if (typeof arg1 === "object" && arg1 !== null && !arg2) {
      // Called with request object
      message = arg1.message;
      config = { model: arg1.model, temperature: arg1.temperature };
      options = {
        systemPrompt: arg1.systemPrompt,
        chatHistory: arg1.chatHistory,
        maxTokens: arg1.maxTokens || arg1.maxOutputTokens,
      };
    } else {
      message = arg1;
      config = arg2 || {};
      options = arg3 || {};
    }

    await this.initializeClient();
    const model = normalizeSarvamModel(config.model || process.env.SARVAM_MODEL);
    const messages = this.formatMessages(message, options.chatHistory, options.systemPrompt);

    logger.debug({ model, messageCount: messages.length }, "Calling Sarvam LLM");

    const res = await this.client.chat.completions.create({
      model,
      messages,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: options.maxTokens || 2000,
    });

    const choice = res?.choices?.[0];
    let reply = choice?.message?.content?.trim() || "";

    // If content is null/empty, check reasoning_content (for reasoning models)
    if (!reply && choice?.message?.reasoning_content) {
      reply = choice.message.reasoning_content.trim();
    }

    if (typeof arg1 === "object" && arg1 !== null && !arg2) {
      return {
        success: true,
        message: reply,
        model,
        provider: "sarvam",
        usage: res?.usage,
      };
    }

    return reply;
  }

  /**
   * Streaming generation yielding reply text deltas
   */
  async *generateResponseStream(message, config = {}, options = {}) {
    await this.initializeClient();
    const model = normalizeSarvamModel(config.model || process.env.SARVAM_MODEL);
    const messages = this.formatMessages(message, options.chatHistory, options.systemPrompt);

    const stream = await this.client.chat.completions.create({
      model,
      messages,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: options.maxTokens || 2000,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  getHealth() {
    return {
      status: process.env.SARVAM_API_KEY ? "healthy" : "misconfigured",
      apiKeyConfigured: Boolean(process.env.SARVAM_API_KEY),
      baseURL: this.baseURL,
      provider: "sarvam",
    };
  }

  getMetrics() {
    return {
      provider: "sarvam",
      activeModel: DEFAULT_SARVAM_MODEL,
    };
  }
}

export const sarvamLLMService = new SarvamLLMService();
export default SarvamLLMService;
