/**
 * RAG — Embedding Service
 * =======================
 * Wraps the Google Generative AI embedding API.
 *
 * Design decisions:
 *   - Model is read from RAG_EMBEDDING_MODEL env var so it can be changed
 *     without code modifications (default: text-embedding-004).
 *   - The SDK client is initialised lazily on first use (same pattern
 *     as the existing geminiService).
 *   - Batch embedding is rate-limited to avoid hitting API quotas:
 *     a configurable delay is inserted between individual embed calls.
 *   - Exponential back-off on 429/503 responses (up to MAX_RETRIES).
 *   - Returns plain number[] so results are JSON-serialisable for the
 *     disk index cache.
 *
 * Environment variables:
 *   GEMINI_API_KEY         — required (shared with geminiService)
 *   RAG_EMBEDDING_MODEL    — optional (default: text-embedding-004)
 *   RAG_EMBED_DELAY_MS     — delay between batch calls in ms (default: 100)
 */

import logger from '../lib/logger.js';

// Model configured via RAG_EMBEDDING_MODEL env var.
// Default: gemini-embedding-001 (3072-dim, compatible with @google/generative-ai v0.21 / v1beta API)
const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL ?? 'gemini-embedding-001';
const EMBED_DELAY_MS  = parseInt(process.env.RAG_EMBED_DELAY_MS ?? '100', 10);
const MAX_RETRIES     = 3;

class EmbeddingService {
  constructor() {
    this._client = null;
    this._model  = null;
    this._apiKey = process.env.GEMINI_API_KEY;

    if (!this._apiKey) {
      logger.warn('[RAG] GEMINI_API_KEY not set — embedding service will fail');
    }
  }

  /** Lazily initialise the Google GenerativeAI client */
  async _init() {
    if (this._model) return;

    if (!this._apiKey) {
      throw new Error('GEMINI_API_KEY is required for RAG embeddings');
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    this._client = new GoogleGenerativeAI(this._apiKey);
    this._model  = this._client.getGenerativeModel({ model: EMBEDDING_MODEL });

    logger.info(`[RAG] Embedding service ready — model: ${EMBEDDING_MODEL}`);
  }

  /**
   * Embed a single text string.
   *
   * @param {string} text
   * @returns {Promise<number[]>} - Embedding vector (768 dimensions for text-embedding-004)
   */
  async embedText(text, retryCount = 0) {
    await this._init();

    try {
      const result = await this._model.embedContent(text);
      return result.embedding.values;   // number[]
    } catch (err) {
      const isRetryable =
        err.message?.includes('429') ||
        err.message?.includes('503') ||
        err.message?.includes('quota') ||
        err.message?.includes('overloaded');

      if (isRetryable && retryCount < MAX_RETRIES) {
        const delay = EMBED_DELAY_MS * Math.pow(2, retryCount);   // exponential back-off
        logger.warn(`[RAG] Embed rate-limited — retrying in ${delay}ms (attempt ${retryCount + 1})`);
        await sleep(delay);
        return this.embedText(text, retryCount + 1);
      }

      logger.error(`[RAG] embedText failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Embed an array of texts, inserting a small delay between calls
   * to stay within API rate limits.
   *
   * @param {string[]} texts
   * @param {{ onProgress?: (done: number, total: number) => void }} opts
   * @returns {Promise<number[][]>}
   */
  async embedBatch(texts, opts = {}) {
    await this._init();

    const results = [];

    for (let i = 0; i < texts.length; i++) {
      results.push(await this.embedText(texts[i]));

      if (opts.onProgress) opts.onProgress(i + 1, texts.length);

      // Rate-limit delay between calls (skip after the last one)
      if (i < texts.length - 1 && EMBED_DELAY_MS > 0) {
        await sleep(EMBED_DELAY_MS);
      }
    }

    return results;
  }

  /** Configured embedding model name (useful for cache validation) */
  get modelName() {
    return EMBEDDING_MODEL;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Singleton — mirrors the pattern used by geminiService
export const embeddingService = new EmbeddingService();
export default EmbeddingService;
