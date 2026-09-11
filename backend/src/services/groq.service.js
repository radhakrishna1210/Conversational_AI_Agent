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

// Groq decommissioned llama-3.3-70b-versatile — its id now 404s, which on a
// live call is a failed turn rather than a slower one. gpt-oss-20b is the
// current small/fast model on the same account; `GET /openai/v1/models` lists
// what a key can actually reach, and scripts/measure-llm-ttft.js probes it.
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

class GroqService {
  constructor() {
    this.client = null;
    this.supportsChatHistory = true; // see GeminiService.supportsChatHistory
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

  // System prompt first, then prior turns, then the current message. That order
  // is what makes the prefix stable across a conversation, which is the
  // precondition for provider-side prompt caching (see agentRuntime's
  // buildRuntimeMessages) — history must NEVER be folded into systemPrompt.
  _messages(message, options = {}) {
    const messages = [];
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    for (const msg of options.chatHistory ?? []) {
      if (!msg?.role || !msg?.content) continue;
      messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
    }
    messages.push({ role: 'user', content: message });
    return messages;
  }

  /**
   * Extra params this model needs, on top of the OpenAI-compatible basics.
   *
   * gpt-oss is a REASONING model: left to itself it spends its first tokens on
   * hidden reasoning, and `delta.content` — the only thing we can speak — stays
   * empty until that finishes. Measured from this deployment (2026-08-28): with
   * `reasoning_effort: 'low'` the first spoken token lands in ~560ms; without
   * it, three runs produced no content at all inside a 100-token budget. On a
   * voice turn that is the difference between the fastest LLM available here
   * and one that never answers.
   *
   * Sent ONLY to models that accept it. Groq rejects unknown params per-model,
   * so blanket-sending it would break every non-reasoning model on the account.
   */
  _modelParams(model) {
    return /gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {};
  }

  _resolveModel(requestedModel) {
    const raw = requestedModel || process.env.GROQ_MODEL || DEFAULT_MODEL;
    // Map friendly names to actual Groq IDs
    if (/qwen/i.test(raw)) {
      if (raw.includes('3.8')) return 'qwen/qwen3.8-27b';
      return 'qwen/qwen3.6-27b';
    }
    if (/llama-?3\.1-?8b/i.test(raw)) {
      return 'llama-3.1-8b-instant';
    }
    if (/groq.*llama/i.test(raw)) {
      return process.env.GROQ_MODEL || DEFAULT_MODEL;
    }
    return raw;
  }

  _maxTokens(model, requested) {
    if (requested) return Math.min(requested, 1000);
    // Qwen on free tier has strict OTPM limits (1000 tokens/min), keep token budget safe
    if (/qwen/i.test(model)) return 800;
    return 1000;
  }

  /** Buffered generation — returns the full reply string (single-call path). */
  async generateResponse(message, config = {}, options = {}) {
    await this.initializeClient();
    let model = this._resolveModel(config.model);
    const max_tokens = this._maxTokens(model, options.maxTokens);
    try {
      const res = await this.client.chat.completions.create({
        model,
        messages: this._messages(message, options),
        temperature: config.temperature ?? 0.7,
        max_tokens,
        ...this._modelParams(model),
      });
      return res?.choices?.[0]?.message?.content || '';
    } catch (err) {
      const isUnavailable = err?.status === 404 || err?.message?.includes('does not exist');
      const isTokensLimit = err?.code === 'rate_limit_exceeded' || err?.message?.includes('expected output tokens exceed');
      if ((isUnavailable || isTokensLimit) && model !== DEFAULT_MODEL) {
        logger.warn(`Groq model "${model}" issue (${err.message}), falling back to ${DEFAULT_MODEL}`);
        model = DEFAULT_MODEL;
        const res = await this.client.chat.completions.create({
          model,
          messages: this._messages(message, options),
          temperature: config.temperature ?? 0.7,
          max_tokens: Math.min(max_tokens, 800),
          ...this._modelParams(model),
        });
        return res?.choices?.[0]?.message?.content || '';
      }
      throw err;
    }
  }

  /** Streaming generation — yields reply text deltas (overlap path). */
  async *generateResponseStream(message, config = {}, options = {}) {
    await this.initializeClient();
    let model = this._resolveModel(config.model);
    const max_tokens = this._maxTokens(model, options.maxTokens);
    let stream;
    try {
      stream = await this.client.chat.completions.create({
        model,
        messages: this._messages(message, options),
        temperature: config.temperature ?? 0.7,
        max_tokens,
        stream: true,
        ...this._modelParams(model),
      }, options.signal ? { signal: options.signal } : undefined);
    } catch (err) {
      const isUnavailable = err?.status === 404 || err?.message?.includes('does not exist');
      const isTokensLimit = err?.code === 'rate_limit_exceeded' || err?.message?.includes('expected output tokens exceed');
      if ((isUnavailable || isTokensLimit) && model !== DEFAULT_MODEL) {
        logger.warn(`Groq model "${model}" stream issue (${err.message}), falling back to ${DEFAULT_MODEL}`);
        model = DEFAULT_MODEL;
        stream = await this.client.chat.completions.create({
          model,
          messages: this._messages(message, options),
          temperature: config.temperature ?? 0.7,
          max_tokens: Math.min(max_tokens, 800),
          stream: true,
          ...this._modelParams(model),
        }, options.signal ? { signal: options.signal } : undefined);
      } else {
        throw err;
      }
    }
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
