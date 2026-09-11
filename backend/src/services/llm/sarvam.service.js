/**
 * Sarvam AI LLM Service
 * Provides OpenAI-compatible chat completions and streaming using Sarvam's API.
 */

import logger from '../../lib/logger.js';

const DEFAULT_MODEL = 'sarvam-105b-conversations';

class SarvamLLMService {
  constructor() {
    this.client = null;
    this.supportsChatHistory = true;
    this.baseURL = process.env.SARVAM_URL
      ? `${process.env.SARVAM_URL.replace(/\/+$/, '')}/v1`
      : 'https://api.sarvam.ai/v1';
  }

  async initializeClient() {
    if (this.client) return;
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) throw new Error('SARVAM_API_KEY is not configured');
    const { default: OpenAI } = await import('openai');
    this.client = new OpenAI({ apiKey, baseURL: this.baseURL });
    logger.info('✅ Sarvam LLM client initialized');
  }

  _messages(message, options = {}) {
    const messages = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    for (const msg of options.chatHistory ?? []) {
      if (!msg?.role || !msg?.content) continue;
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
    messages.push({ role: 'user', content: message });
    return messages;
  }

  /** Buffered generation — returns the full reply string */
  async generateResponse(message, config = {}, options = {}) {
    await this.initializeClient();
    const model = config.model || DEFAULT_MODEL;
    const res = await this.client.chat.completions.create({
      model,
      messages: this._messages(message, options),
      temperature: config.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    });
    return res?.choices?.[0]?.message?.content || '';
  }

  /** Streaming generation — yields reply text deltas */
  async *generateResponseStream(message, config = {}, options = {}) {
    await this.initializeClient();
    const model = config.model || DEFAULT_MODEL;
    const stream = await this.client.chat.completions.create(
      {
        model,
        messages: this._messages(message, options),
        temperature: config.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000,
        stream: true,
      },
      options.signal ? { signal: options.signal } : undefined
    );
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  getHealth() {
    return {
      status: process.env.SARVAM_API_KEY ? 'healthy' : 'misconfigured',
      apiKeyConfigured: Boolean(process.env.SARVAM_API_KEY),
      baseURL: this.baseURL,
    };
  }
}

export const sarvamLLMService = new SarvamLLMService();
export default SarvamLLMService;
