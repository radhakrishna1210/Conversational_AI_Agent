/**
 * RAG — Retriever
 * ===============
 * Orchestrates the retrieval pipeline:
 *
 *   user query
 *     → embedText(query)
 *     → vectorStore.search(queryEmbedding, topK * 2)   ← over-fetch for dedup
 *     → deduplicate by (relativePath + heading)
 *     → filter out chunks below similarity threshold
 *     → return top-k results
 *
 * Configuration (env vars with defaults):
 *   RAG_TOP_K                 — number of chunks to return (default 5)
 *   RAG_SIMILARITY_THRESHOLD  — minimum cosine score to include (default 0.45)
 */

import logger from '../lib/logger.js';
import { embeddingService } from './embeddingService.js';
import { vectorStore }      from './vectorStore.js';

const TOP_K     = parseInt(process.env.RAG_TOP_K                ?? '5',    10);
const THRESHOLD = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD ?? '0.45');

/**
 * @typedef {Object} RelevantChunk
 * @property {import('./chunker.js').Chunk} chunk
 * @property {number} score - Cosine similarity score
 */

/**
 * Retrieve the most relevant chunks for a user query.
 *
 * @param {string} query
 * @param {object} [opts]
 * @param {number} [opts.topK]      - Override RAG_TOP_K for this call
 * @param {number} [opts.threshold] - Override RAG_SIMILARITY_THRESHOLD
 * @param {import('./vectorStore.js').BaseVectorStore} [opts.store] - Injectable store (for tests)
 * @returns {Promise<RelevantChunk[]>} - Ordered descending by score, empty if nothing passes threshold
 */
export async function retrieve(query, opts = {}) {
  const topK      = opts.topK      ?? TOP_K;
  const threshold = opts.threshold ?? THRESHOLD;
  const store     = opts.store     ?? vectorStore;

  if (!query || !query.trim()) return [];

  // 1. Embed the query
  let queryEmbedding;
  try {
    queryEmbedding = await embeddingService.embedText(query);
  } catch (err) {
    logger.error(`[RAG] Failed to embed query: ${err.message}`);
    return [];
  }

  // 2. Fetch more than topK so deduplication still leaves enough
  const candidates = await store.search(queryEmbedding, topK * 3);

  // 3. Deduplicate: keep only the highest-scoring chunk per (source, heading)
  const seen    = new Set();
  const deduped = [];

  for (const result of candidates) {
    const key = `${result.chunk.relativePath}::${result.chunk.heading}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(result);
    }
  }

  // 4. Filter by similarity threshold
  const relevant = deduped.filter(r => r.score >= threshold);

  // 5. Trim to topK
  const final = relevant.slice(0, topK);

  logger.debug(
    `[RAG] Retrieval: "${query.slice(0, 60)}..." → ` +
    `${candidates.length} candidates, ${deduped.length} deduped, ` +
    `${final.length} above threshold (${threshold})`
  );

  return final;
}

export { TOP_K, THRESHOLD };
