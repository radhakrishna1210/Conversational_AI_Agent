// backend/src/services/embeddings.service.js
/**
 * Embedding provider for RAG on knowledge base files. Gemini only for now — this
 * deployment's `.env` has no OPENAI_API_KEY configured (checked directly), so an
 * OpenAI-first design would ship inert. `output_dimensionality: 1536` on
 * gemini-embedding-001 keeps the vector column width compatible with OpenAI's
 * text-embedding-3-small too, so adding that provider later needs no schema
 * change — see the `embedding` field comment on KbChunk in schema.prisma.
 *
 * `@google/generative-ai` is a plain-JS-called SDK (this codebase has no
 * TypeScript build step), so `outputDimensionality`/`taskType` reach the wire
 * even though the installed SDK version's own .d.ts doesn't declare them —
 * `embedContent`/`batchEmbedContents` JSON.stringify whatever object they're
 * given (verified against node_modules/@google/generative-ai/dist/index.js)
 * rather than allowlisting fields.
 */

import logger from '../lib/logger.js';

export const EMBEDDING_DIMENSIONS = 1536;

// gemini-embedding-001 caps a single batchEmbedContents call — keep batches
// comfortably under both the request-count and per-request-token limits rather
// than probing the exact ceiling live against a KB upload.
const BATCH_SIZE = 64;

let client = null;
// Lazy import so a deployment with no Gemini key at all never pays the SDK's
// module-init cost for a feature it can't use.
async function loadModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  if (!client) client = new GoogleGenerativeAI(apiKey);
  return client.getGenerativeModel({ model: 'gemini-embedding-001' });
}

export function isEmbeddingConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Embed one piece of text.
 * @param {string} text
 * @param {{ taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' }} [opts]
 * @returns {Promise<number[]|null>} null if embeddings aren't configured.
 */
export async function embedText(text, { taskType = 'RETRIEVAL_DOCUMENT' } = {}) {
  const model = await loadModel();
  if (!model) return null;
  const res = await model.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIMENSIONS,
    taskType,
  });
  return res.embedding.values;
}

/**
 * Embed many chunks, batched to stay well inside Gemini's per-request limits.
 * Order of the returned array matches `texts`. A batch that fails outright
 * throws — the caller (kbChunking.service.js) treats that as the whole file's
 * processing attempt failing, so a partial embed can never leave some chunks
 * silently un-embedded while the file is marked 'ready'.
 * @param {string[]} texts
 * @returns {Promise<number[][]|null>} null if embeddings aren't configured.
 */
export async function embedBatch(texts) {
  const model = await loadModel();
  if (!model) return null;
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const res = await model.batchEmbedContents({
      requests: slice.map((text) => ({
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: 'RETRIEVAL_DOCUMENT',
      })),
    });
    if (!res.embeddings || res.embeddings.length !== slice.length) {
      throw new Error(`Embedding batch returned ${res.embeddings?.length ?? 0} vectors for ${slice.length} inputs`);
    }
    for (const e of res.embeddings) out.push(e.values);
    logger.info(`Embedded ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length} KB chunks`);
  }
  return out;
}
