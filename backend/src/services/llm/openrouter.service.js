/**
 * OpenRouter LLM Service Provider
 * Handles interactions with OpenRouter API (OpenAI-compatible)
 * Gives access to free-tier models (Llama, Qwen, Gemini Exp, Mistral, DeepSeek)
 * and low-latency conversational models (Claude Haiku, GPT-4o-mini).
 */

import logger from "../../lib/logger.js";
import {
  DEFAULT_TEMPERATURE,
  LLM_PROVIDERS,
} from "../../constants/llmModels.js";

export const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

/**
 * Strips reasoning / internal monologue tokens (e.g. <think>...</think>)
 * so TTS engines never speak internal model reasoning aloud on voice turns.
 */
export function stripThinkingTokens(text) {
  if (!text || typeof text !== "string") return "";
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/**
 * Normalizes OpenRouter model string (removes leading "openrouter/" if present)
 */
export function normalizeOpenRouterModel(model) {
  if (!model || typeof model !== "string") return DEFAULT_OPENROUTER_MODEL;
  let m = model.trim();
  if (m.toLowerCase().startsWith("openrouter/")) {
    m = m.slice("openrouter/".length);
  }
  return m || DEFAULT_OPENROUTER_MODEL;
}

class OpenRouterService {
  constructor() {
    this.provider = LLM_PROVIDERS.OPENROUTER;
    this.client = null;
    this.supportsChatHistory = true;
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    this.siteUrl = process.env.OPENROUTER_HTTP_REFERER || "https://conversational-ai-agent.local";
    this.siteTitle = process.env.OPENROUTER_TITLE || "Conversational AI Voice Agent";

    if (!this.apiKey) {
      logger.warn("⚠️ OPENROUTER_API_KEY not configured. OpenRouter service will not work.");
    }
  }

  /**
   * Initialize OpenAI client configured for OpenRouter
   */
  async initializeClient() {
    if (this.client) return;

    this.apiKey = process.env.OPENROUTER_API_KEY;
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    try {
      const { default: OpenAI } = await import("openai");
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
        defaultHeaders: {
          "HTTP-Referer": this.siteUrl,
          "X-Title": this.siteTitle,
        },
      });
      logger.info("✅ OpenRouter LLM client initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize OpenRouter LLM client", error);
      throw new Error("OpenAI SDK failed to initialize for OpenRouter");
    }
  }

  /**
   * Format messages for Chat Completion API
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
    const model = normalizeOpenRouterModel(config.model || process.env.OPENROUTER_MODEL);
    const messages = this.formatMessages(message, options.chatHistory, options.systemPrompt);

    logger.debug({ model, messageCount: messages.length }, "Calling OpenRouter LLM");

    const res = await this.client.chat.completions.create({
      model,
      messages,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: options.maxTokens || 2000,
    });

    const choice = res?.choices?.[0];
    let reply = choice?.message?.content || "";

    // If content is null or empty, check reasoning_content (for reasoning models)
    if (!reply && choice?.message?.reasoning_content) {
      reply = choice.message.reasoning_content;
    }

    reply = stripThinkingTokens(reply);

    if (typeof arg1 === "object" && arg1 !== null && !arg2) {
      return {
        success: true,
        message: reply,
        model,
        provider: "openrouter",
        usage: res?.usage,
      };
    }

    return reply;
  }

  /**
   * Streaming generation yielding reply text deltas
   * Supports live voice pipelines (converseStream)
   */
  async *generateResponseStream(message, config = {}, options = {}) {
    await this.initializeClient();
    const model = normalizeOpenRouterModel(config.model || process.env.OPENROUTER_MODEL);
    const messages = this.formatMessages(message, options.chatHistory, options.systemPrompt);

    const stream = await this.client.chat.completions.create({
      model,
      messages,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: options.maxTokens || 2000,
      stream: true,
    });

    let insideThinkTag = false;
    let pendingBuffer = "";

    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (!delta) continue;

      pendingBuffer += delta;

      // Filter <think> ... </think> tags on the fly during streaming
      while (pendingBuffer.length > 0) {
        if (insideThinkTag) {
          const endIdx = pendingBuffer.indexOf("</think>");
          if (endIdx !== -1) {
            insideThinkTag = false;
            pendingBuffer = pendingBuffer.slice(endIdx + "</think>".length);
          } else {
            // Still inside think block; clear buffer
            pendingBuffer = "";
            break;
          }
        } else {
          const startIdx = pendingBuffer.indexOf("<think>");
          if (startIdx !== -1) {
            const before = pendingBuffer.slice(0, startIdx);
            if (before) yield before;
            insideThinkTag = true;
            pendingBuffer = pendingBuffer.slice(startIdx + "<think>".length);
          } else {
            // Check if buffer might be starting a <think> tag at the tail
            const partialMatch = pendingBuffer.match(/<t?(h?(i?(n?(k?)?)?)?)?$/);
            if (partialMatch && partialMatch[0].length > 0 && partialMatch.index > 0) {
              const safe = pendingBuffer.slice(0, partialMatch.index);
              yield safe;
              pendingBuffer = pendingBuffer.slice(partialMatch.index);
              break;
            } else if (!partialMatch) {
              yield pendingBuffer;
              pendingBuffer = "";
            } else {
              break; // wait for more tokens to disambiguate tag
            }
          }
        }
      }
    }

    // Flush any remaining non-think buffer
    if (!insideThinkTag && pendingBuffer) {
      yield pendingBuffer;
    }
  }

  getHealth() {
    return {
      status: process.env.OPENROUTER_API_KEY ? "healthy" : "misconfigured",
      apiKeyConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      baseURL: this.baseURL,
      provider: "openrouter",
    };
  }

  getMetrics() {
    return {
      provider: "openrouter",
      activeModel: DEFAULT_OPENROUTER_MODEL,
    };
  }
}

export const openrouterService = new OpenRouterService();
export default OpenRouterService;
