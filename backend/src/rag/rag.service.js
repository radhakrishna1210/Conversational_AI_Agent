/**
 * RAG Service — Orchestrator
 * ==========================
 * Singleton that ties together document loading, chunking, embedding,
 * vector storage, retrieval, and LLM generation.
 *
 * Index lifecycle
 * ---------------
 * 1. initializeIndex() is called once at server startup (server.js).
 * 2. A Promise guard (this._initPromise) ensures concurrent callers wait
 *    for the same initialisation — the index is never built twice.
 * 3. On startup: checks for a valid disk cache (rag-index.json).
 *    - Cache hit  → restore entries into vectorStore, done in <100ms.
 *    - Cache miss → load docs → chunk → embed → store → persist to disk.
 * 4. Cache is invalidated when any knowledge-base file's mtime changes
 *    or the embedding model name changes.
 * 5. chat() calls initializeIndex() as a safety net (lazy init) in case
 *    a request arrives before server startup has finished.
 *
 * Environment variables (all optional, with defaults):
 *   GEMINI_API_KEY              — required for embeddings + generation
 *   RAG_EMBEDDING_MODEL         — embedding model (default: text-embedding-004)
 *   RAG_TOP_K                   — chunks to retrieve per query (default: 5)
 *   RAG_SIMILARITY_THRESHOLD    — minimum cosine score (default: 0.45)
 *   RAG_CHUNK_SIZE              — max chars per chunk (default: 800)
 *   RAG_CHUNK_OVERLAP           — overlap chars (default: 100)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import logger             from '../lib/logger.js';
import { geminiService }  from '../services/gemini.service.js';
import { loadDocuments, buildMtimeMap } from './documentLoader.js';
import { chunkDocuments }               from './chunker.js';
import { embeddingService }             from './embeddingService.js';
import { vectorStore }                  from './vectorStore.js';
import { retrieve }                     from './retriever.js';
import { buildSystemPrompt, buildRefusalPrompt, REFUSAL_PHRASE } from './promptBuilder.js';
import { classifyIntent }               from './intentClassifier.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
// Disk cache lives at backend/rag-index.json (two directories up from src/rag/)
const INDEX_PATH  = path.resolve(__dirname, '../../rag-index.json');
const CACHE_VERSION = 1;

class RagService {
  constructor() {
    this._ready       = false;
    this._initPromise = null;   // Concurrency guard — one init at a time
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Build (or restore from disk) the document index.
   * Safe to call multiple times — subsequent calls are no-ops.
   *
   * @returns {Promise<void>}
   */
  async initializeIndex() {
    if (this._ready) return;

    // If an initialisation is already in flight, wait for it
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = this._buildIndex();
    await this._initPromise;
  }

  /**
   * Answer a user question using strict RAG.
   *
   * @param {string} userMessage
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async chat(userMessage) {
    // Ensure the index is ready (lazy-init safety net)
    await this.initializeIndex();

    const query = (userMessage || '').trim();

    // ── Step 1: Intent pre-check ──────────────────────────────────────────
    // Intercept greetings, thanks, farewells, and empty input BEFORE retrieval.
    // UNKNOWN intent falls through to the full strict RAG pipeline below.
    const { intent, response: intentResponse } = classifyIntent(query);
    if (intent !== 'UNKNOWN') {
      logger.debug(`[RAG] Intent short-circuit: ${intent}`);
      return { success: true, message: intentResponse };
    }

    // ── Step 2: Strict RAG pipeline ───────────────────────────────────────
    try {
      // 1. Retrieve relevant chunks
      const relevantChunks = await retrieve(query);

      logger.debug(`[RAG] Retrieved ${relevantChunks.length} chunks for: "${query.slice(0, 60)}..."`);

      // 2. If nothing relevant found — return refusal without LLM call
      if (relevantChunks.length === 0) {
        logger.info(`[RAG] No relevant context found — returning refusal`);
        return { success: true, message: REFUSAL_PHRASE };
      }

      // 3. Build strict system prompt
      const systemPrompt = buildSystemPrompt(relevantChunks);

      // 4. Call Gemini with low temperature to reduce hallucination
      const llmResponse = await geminiService.generateResponse(
        query,
        { model: 'gemini-2.5-flash', temperature: 0.1 },
        { systemPrompt, maxTokens: 1500 },
      );

      // geminiService returns a string when called with legacy signature
      const message = typeof llmResponse === 'string'
        ? llmResponse
        : (llmResponse?.message ?? REFUSAL_PHRASE);

      return { success: true, message };

    } catch (err) {
      logger.error({ err }, '[RAG] chat() error');
      return {
        success: false,
        message: "I'm having trouble right now. Please try again in a moment.",
      };
    }
  }


  /**
   * Force a full re-index (clears the disk cache first).
   * Useful for CI pipelines or admin tooling after knowledge-base updates.
   *
   * @returns {Promise<void>}
   */
  async reindex() {
    logger.info('[RAG] Manual re-index requested — clearing cache');
    this._ready       = false;
    this._initPromise = null;

    // Delete disk cache
    try { fs.unlinkSync(INDEX_PATH); } catch { /* ignore if not present */ }

    await vectorStore.clear();
    await this.initializeIndex();
  }

  /** @returns {{ ready: boolean, entries: number, indexPath: string }} */
  getStatus() {
    return {
      ready:     this._ready,
      entries:   vectorStore.size(),
      indexPath: INDEX_PATH,
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  async _buildIndex() {
    logger.info('[RAG] Initialising document index…');
    const startMs = Date.now();

    try {
      // Try disk cache first
      const restored = await this._tryRestoreFromDisk();
      if (restored) {
        this._ready = true;
        logger.info(`[RAG] Index restored from disk cache in ${Date.now() - startMs}ms ` +
                    `(${vectorStore.size()} entries)`);
        return;
      }

      // Cache miss or invalid — build from scratch
      logger.info('[RAG] Building index from scratch…');

      // Load documents
      const docs = loadDocuments();
      if (docs.length === 0) {
        logger.warn('[RAG] No documents found — RAG will always refuse');
        this._ready = true;
        return;
      }

      // Chunk
      const chunks = chunkDocuments(docs);
      logger.info(`[RAG] Chunking complete — ${chunks.length} chunks`);

      // Embed (can take 10-120s depending on corpus size and API latency)
      logger.info('[RAG] Embedding chunks — this may take a moment on first run…');
      const texts      = chunks.map(c => `${c.source}\n\n${c.text}`);
      const embeddings = await embeddingService.embedBatch(texts, {
        onProgress: (done, total) => {
          if (done % 10 === 0 || done === total) {
            logger.info(`[RAG] Embedding progress: ${done}/${total}`);
          }
        },
      });

      // Store
      await vectorStore.clear();
      for (let i = 0; i < chunks.length; i++) {
        await vectorStore.add(chunks[i], embeddings[i]);
      }

      // Persist to disk
      await this._persistToDisk(docs);

      this._ready = true;
      logger.info(
        `[RAG] Index built in ${((Date.now() - startMs) / 1000).toFixed(1)}s — ` +
        `${vectorStore.size()} entries`
      );

    } catch (err) {
      // Don't crash the server — just mark not-ready so chat() returns a friendly error
      logger.error({ err }, '[RAG] Failed to build index');
      this._ready = true; // Allow chat() to proceed (will return refusal)
    }
  }

  /** Attempt to load a valid index from disk. Returns true if succeeded. */
  async _tryRestoreFromDisk() {
    try {
      if (!fs.existsSync(INDEX_PATH)) return false;

      const raw  = fs.readFileSync(INDEX_PATH, 'utf-8');
      const data = JSON.parse(raw);

      // Version check
      if (data.version !== CACHE_VERSION) {
        logger.info('[RAG] Disk cache version mismatch — rebuilding');
        return false;
      }

      // Embedding model check
      if (data.embeddingModel !== embeddingService.modelName) {
        logger.info('[RAG] Embedding model changed — rebuilding');
        return false;
      }

      // Mtime check — any new/changed/deleted file invalidates the cache
      const currentMtimes = buildMtimeMap();
      const cachedMtimes  = data.mtimes ?? {};

      const currentKeys = Object.keys(currentMtimes).sort();
      const cachedKeys  = Object.keys(cachedMtimes).sort();

      if (JSON.stringify(currentKeys) !== JSON.stringify(cachedKeys)) {
        logger.info('[RAG] Knowledge-base file list changed — rebuilding');
        return false;
      }

      for (const key of currentKeys) {
        if (currentMtimes[key] !== cachedMtimes[key]) {
          logger.info(`[RAG] File changed: ${key} — rebuilding`);
          return false;
        }
      }

      // All checks passed — restore
      const entries = data.entries ?? [];
      if (entries.length === 0) return false;

      vectorStore.loadEntries(entries);
      return true;

    } catch (err) {
      logger.warn(`[RAG] Could not read disk cache: ${err.message}`);
      return false;
    }
  }

  /** Write the current vectorStore entries + metadata to rag-index.json */
  async _persistToDisk(docs) {
    try {
      // Build mtime map from the docs we just loaded
      const mtimes = {};
      for (const doc of docs) {
        mtimes[doc.relativePath] = doc.mtimeMs;
      }

      const payload = {
        version:        CACHE_VERSION,
        builtAt:        new Date().toISOString(),
        embeddingModel: embeddingService.modelName,
        mtimes,
        entries:        vectorStore.exportEntries(),
      };

      fs.writeFileSync(INDEX_PATH, JSON.stringify(payload), 'utf-8');
      logger.info(`[RAG] Index persisted to ${INDEX_PATH}`);

    } catch (err) {
      // Not fatal — the in-memory index is still usable
      logger.warn(`[RAG] Could not write disk cache: ${err.message}`);
    }
  }
}

// Singleton — created once at module import time
export const ragService = new RagService();
export default RagService;
