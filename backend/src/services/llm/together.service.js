/**
 * Together AI LLM Service
 * Provides ultra-fast open-source model inference via Together AI's OpenAI-compatible API.
 */

import logger from '../../lib/logger.js';

const DEFAULT_MODEL = 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';

class TogetherLLMService {
  constructor() {
    this.client = null;
    this.supportsChatHistory = true;
    this.baseURL = process.env.TOGETHER_BASE_URL || 'https://api.together.xyz/v1';
  }

  async initializeClient() {
    if (this.client) return;
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) throw new Error('TOGETHER_API_KEY is not configured');
    const { default: OpenAI } = await import('openai');
    this.client = new OpenAI({ apiKey, baseURL: this.baseURL });
    logger.info('✅ Together AI client initialized');
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

  _resolveModel(requestedModel) {
    const raw = requestedModel || DEFAULT_MODEL;
    if (/qwen/i.test(raw)) {
      return 'Qwen/Qwen2.5-72B-Instruct-Turbo';
    }
    if (/llama-?3\.3-?70b/i.test(raw)) {
      return 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
    }
    if (/llama-?3\.1-?8b/i.test(raw)) {
      return 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';
    }
    return raw;
  }

  /** Buffered generation — returns the full reply string */
  async generateResponse(message, config = {}, options = {}) {
    await this.initializeClient();
    const model = this._resolveModel(config.model);
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
    const model = this._resolveModel(config.model);
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
      status: process.env.TOGETHER_API_KEY ? 'healthy' : 'misconfigured',
      apiKeyConfigured: Boolean(process.env.TOGETHER_API_KEY),
      baseURL: this.baseURL,
    };
  }
}

export const togetherLLMService = new TogetherLLMService();
export default TogetherLLMService;
