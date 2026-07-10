/**
 * RAG — Heading-Aware Markdown Chunker
 * =====================================
 * Splits documents into semantic chunks that:
 *   - Always start at a heading boundary (# / ## / ###)
 *   - Never split inside fenced code blocks (``` ... ```)
 *   - Never split inside Markdown tables (| ... |)
 *   - Carry full source metadata on every chunk
 *   - Support configurable max size and overlap
 *
 * Configuration (via environment variables, with defaults):
 *   RAG_CHUNK_SIZE    — max characters per chunk  (default 800)
 *   RAG_CHUNK_OVERLAP — overlap characters        (default 100)
 */

import logger from '../lib/logger.js';

const CHUNK_SIZE    = parseInt(process.env.RAG_CHUNK_SIZE    ?? '800',  10);
const CHUNK_OVERLAP = parseInt(process.env.RAG_CHUNK_OVERLAP ?? '100',  10);

// Matches any ATX heading line (# Heading, ## Heading, ### Heading)
const HEADING_RE   = /^#{1,3}\s+\S/;

// Detect fenced code-block delimiters
const FENCE_RE     = /^```/;

// Detect table rows
const TABLE_ROW_RE = /^\|/;

/**
 * @typedef {Object} Chunk
 * @property {string} text         - Raw text of this chunk
 * @property {string} heading      - Nearest heading above this chunk
 * @property {string} title        - Document title
 * @property {string} route        - Page route (from front-matter)
 * @property {string} category     - Document category
 * @property {string} relativePath - Path relative to knowledge-base root
 * @property {string} source       - Human-readable "title > heading" label
 * @property {number} chunkIndex   - Position of this chunk within the document
 */

/**
 * Split a single document's content into semantic chunks.
 *
 * @param {Object} doc - Document object from documentLoader
 * @param {string} doc.content
 * @param {string} doc.title
 * @param {string} doc.route
 * @param {string} doc.category
 * @param {string} doc.relativePath
 * @returns {Chunk[]}
 */
function chunkDocument(doc) {
  const { content, title, route, category, relativePath } = doc;
  const lines   = content.split('\n');
  const chunks  = [];

  let currentHeading = title;
  let buffer         = [];       // accumulated lines for the current chunk
  let bufferLen      = 0;        // character count of buffer
  let inCodeFence    = false;
  let inTable        = false;
  let chunkIndex     = 0;

  /** Flush the current buffer as a new Chunk */
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text.length < 20) {
      // Too short to be useful — absorb into next chunk via overlap
      return;
    }

    chunks.push({
      text,
      heading:      currentHeading,
      title,
      route,
      category,
      relativePath,
      source: currentHeading !== title
        ? `${title} > ${currentHeading}`
        : title,
      chunkIndex: chunkIndex++,
    });
  };

  /** Carry overlap lines into the next chunk's buffer */
  const applyOverlap = () => {
    if (!chunks.length || CHUNK_OVERLAP <= 0) {
      buffer    = [];
      bufferLen = 0;
      return;
    }

    const last = chunks[chunks.length - 1].text;
    // Take the tail of the last chunk up to CHUNK_OVERLAP chars
    const tail = last.slice(-CHUNK_OVERLAP);
    buffer    = tail ? [tail] : [];
    bufferLen = tail.length;
  };

  for (const line of lines) {
    const isFence    = FENCE_RE.test(line);
    const isTableRow = TABLE_ROW_RE.test(line);
    const isHeading  = HEADING_RE.test(line);

    // Track fenced code block state
    if (isFence) inCodeFence = !inCodeFence;

    // Track table state (table ends when a non-table, non-empty line appears)
    if (!inCodeFence) {
      if (isTableRow)          inTable = true;
      else if (inTable && line.trim() !== '') inTable = false;
    }

    // Heading: flush + start new chunk with new heading label
    if (isHeading && !inCodeFence && !inTable) {
      if (bufferLen > 0) {
        flush();
        applyOverlap();
      }
      currentHeading = line.replace(/^#+\s+/, '').trim();
      // Include the heading line itself in the new chunk
      buffer.push(line);
      bufferLen += line.length + 1;
      continue;
    }

    // Size overflow: flush before appending (but only outside protected blocks)
    if (bufferLen + line.length + 1 > CHUNK_SIZE && !inCodeFence && !inTable) {
      flush();
      applyOverlap();
    }

    buffer.push(line);
    bufferLen += line.length + 1;
  }

  // Flush any remaining content
  if (bufferLen > 0) flush();

  return chunks;
}

/**
 * Chunk all documents and return a flat Chunk array.
 *
 * @param {Object[]} docs - Documents from documentLoader.loadDocuments()
 * @returns {Chunk[]}
 */
export function chunkDocuments(docs) {
  const allChunks = [];

  for (const doc of docs) {
    try {
      const docChunks = chunkDocument(doc);
      allChunks.push(...docChunks);
    } catch (err) {
      logger.warn(`[RAG] Failed to chunk "${doc.relativePath}": ${err.message}`);
    }
  }

  logger.info(`[RAG] Produced ${allChunks.length} chunks from ${docs.length} documents`);
  return allChunks;
}

export { CHUNK_SIZE, CHUNK_OVERLAP };
