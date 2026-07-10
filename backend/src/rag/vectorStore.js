/**
 * RAG — Vector Store Abstraction
 * ================================
 * Defines the BaseVectorStore interface and ships InMemoryVectorStore
 * as the default implementation.
 *
 * Swapping to an external store (ChromaDB, Qdrant, Pinecone, pgvector …)
 * only requires:
 *   1. Create a new class that extends BaseVectorStore.
 *   2. Implement add(), search(), clear(), and size().
 *   3. Pass the new instance to the retriever / rag.service.
 *
 * The BaseVectorStore enforces the contract at runtime — any unimplemented
 * method throws a clear "not implemented" error rather than failing silently.
 *
 * ┌──────────────────────────────────────────────┐
 * │              BaseVectorStore                 │
 * │  + add(chunk, embedding): Promise<void>      │
 * │  + search(embedding, topK): Promise<Result>  │
 * │  + clear(): Promise<void>                    │
 * │  + size(): number                            │
 * └─────────────────────┬────────────────────────┘
 *                        │ extends
 *            ┌───────────┴──────────┐
 *   InMemoryVectorStore       <future: ChromaVectorStore,
 *   (shipped now)              QdrantVectorStore, …>
 */

// ─── Abstract base ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} SearchResult
 * @property {import('./chunker.js').Chunk} chunk    - The source chunk
 * @property {number}                       score    - Cosine similarity [0, 1]
 */

export class BaseVectorStore {
  /**
   * Add a chunk and its embedding vector to the store.
   *
   * @param {import('./chunker.js').Chunk} chunk
   * @param {number[]} embedding
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async add(chunk, embedding) {
    throw new Error(`${this.constructor.name}.add() is not implemented`);
  }

  /**
   * Search for the top-k most similar chunks.
   *
   * @param {number[]} queryEmbedding
   * @param {number}   topK
   * @returns {Promise<SearchResult[]>} - Sorted descending by score
   */
  // eslint-disable-next-line no-unused-vars
  async search(queryEmbedding, topK) {
    throw new Error(`${this.constructor.name}.search() is not implemented`);
  }

  /**
   * Remove all stored entries.
   * @returns {Promise<void>}
   */
  async clear() {
    throw new Error(`${this.constructor.name}.clear() is not implemented`);
  }

  /**
   * Return the number of indexed entries.
   * @returns {number}
   */
  size() {
    throw new Error(`${this.constructor.name}.size() is not implemented`);
  }
}

// ─── In-Memory implementation ────────────────────────────────────────────────

/**
 * Pure in-memory vector store using cosine similarity.
 *
 * Performance:
 *   - O(n·d) per search (n entries, d dimensions)
 *   - Adequate for up to ~50k chunks without noticeable latency.
 *   - For larger corpora, replace with an ANN (approximate nearest-neighbour)
 *     store such as Qdrant or Pinecone via the BaseVectorStore interface.
 *
 * Storage:
 *   - All embeddings are kept in plain JavaScript arrays.
 *   - For bulk serialisation / deserialisation (disk cache in rag.service),
 *     convert to/from JSON-safe number[].
 */
export class InMemoryVectorStore extends BaseVectorStore {
  constructor() {
    super();
    /** @type {{ chunk: import('./chunker.js').Chunk, embedding: number[] }[]} */
    this._entries = [];
  }

  /** @override */
  async add(chunk, embedding) {
    this._entries.push({ chunk, embedding });
  }

  /**
   * Bulk-load pre-computed entries (used when restoring from disk cache).
   *
   * @param {{ chunk: object, embedding: number[] }[]} entries
   */
  loadEntries(entries) {
    this._entries = entries;
  }

  /**
   * Export all entries for disk serialisation.
   *
   * @returns {{ chunk: object, embedding: number[] }[]}
   */
  exportEntries() {
    return this._entries;
  }

  /** @override */
  async search(queryEmbedding, topK = 5) {
    if (this._entries.length === 0) return [];

    const scored = this._entries.map(({ chunk, embedding }) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, embedding),
    }));

    // Sort descending by score, return top-k
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** @override */
  async clear() {
    this._entries = [];
  }

  /** @override */
  size() {
    return this._entries.length;
  }
}

// ─── Cosine similarity ──────────────────────────────────────────────────────

/**
 * Compute the cosine similarity between two equal-length vectors.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} - Value in [-1, 1]; higher is more similar
 */
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Default export ─────────────────────────────────────────────────────────

// Export a ready-to-use InMemoryVectorStore singleton.
// rag.service.js will call loadEntries() on it after restoring the disk cache,
// or clear() + add() when rebuilding the index from scratch.
export const vectorStore = new InMemoryVectorStore();
