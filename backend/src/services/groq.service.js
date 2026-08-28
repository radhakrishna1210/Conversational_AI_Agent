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

  /** Buffered generation — returns the full reply string (single-call path). */
  async generateResponse(message, config = {}, options = {}) {
    await this.initializeClient();
    const model = config.model || process.env.GROQ_MODEL || DEFAULT_MODEL;
    const res = await this.client.chat.completions.create({
      model,
      messages: this._messages(message, options),
      temperature: config.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      ...this._modelParams(model),
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
      ...this._modelParams(model),
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
