// backend/src/services/groq.service.js
/**
 * Groq LLM provider — ultra-low-latency inference (LPU hardware) used for VOICE
 * turns to cut LLM time and eliminate the Gemini flash-lite latency spikes.
 *
 * Groq's API is OpenAI-compatible, so this is a thin wrapper over the openai SDK
 * pointed at Groq's base URL. It exposes the same (message, config, options)
 * interface that converse()/converseStream() already use — generateResponse
 * (buffered, single-call path) and generateResponseStream (overlap path).
 *
 * Activated in resolveLlmForAgent() whenever GROQ_API_KEY is set and the turn is
 * a live voice turn; chat/other paths are unaffected. Falls back to the normal
 * provider when the key is absent.
 */

import logger from '../lib/logger.js';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

class GroqService {
  constructor() {
    this.client = null;
    this.baseURL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
  }

  async initializeClient() {
    if (this.client) return;
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
    const { default: OpenAI } = await import('openai');
    this.client = new OpenAI({ apiKey, baseURL: this.baseURL });
    logger.info('✅ Groq client initialized');
  }

  _messages(message, options = {}) {
    const messages = [];
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: message });
    return messages;
  }

  /** Buffered generation — returns the full reply string (single-call path). */
  async generateResponse(message, config = {}, options = {}) {
    await this.initializeClient();
    const model = config.model || process.env.GROQ_MODEL || DEFAULT_MODEL;
    const res = await this.client.chat.completions.create({
      model,
      messages: this._messages(message, options),
      temperature: config.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    });
    return res?.choices?.[0]?.message?.content || '';
  }

  /** Streaming generation — yields reply text deltas (overlap path). */
  async *generateResponseStream(message, config = {}, options = {}) {
    await this.initializeClient();
    const model = config.model || process.env.GROQ_MODEL || DEFAULT_MODEL;
    const stream = await this.client.chat.completions.create({
      model,
      messages: this._messages(message, options),
      temperature: config.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  getHealth() {
    return {
      status: process.env.GROQ_API_KEY ? 'healthy' : 'misconfigured',
      apiKeyConfigured: Boolean(process.env.GROQ_API_KEY),
      baseURL: this.baseURL,
    };
  }
}

export const groqService = new GroqService();
export default GroqService;
