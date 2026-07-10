/**
 * RAG — Document Loader
 * =====================
 * Recursively discovers every Markdown file under the project's
 * knowledge-base directory and returns structured document objects.
 *
 * Skipped files:
 *   - README.md            (pipeline instructions, not content)
 *   - *REPORT*.md          (crawl reports, not product docs)
 *   - scripts/ directory   (Python pipeline code)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// knowledge-base/ lives at the project root, which is 3 levels up from backend/src/rag/
//   backend/src/rag/  →  backend/src/  →  backend/  →  project-root/  →  knowledge-base/
const KB_ROOT = path.resolve(__dirname, '../../../knowledge-base');

/** Files and directories to skip entirely */
const SKIP_PATTERNS = [
  /README\.md$/i,
  /REPORT.*\.md$/i,
  /[/\\]scripts[/\\]/,
];

/**
 * Parse YAML-like front-matter block at the top of a Markdown file.
 * We only need: title, route, category.
 *
 * @param {string} content - Raw file content
 * @returns {{ title: string, route: string, category: string, body: string }}
 */
function parseFrontMatter(content) {
  const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = content.match(FM_RE);

  const meta = { title: '', route: '', category: '' };

  if (match) {
    for (const line of match[1].split('\n')) {
      const [key, ...rest] = line.split(':');
      if (!key) continue;
      const val = rest.join(':').trim().replace(/^"|"$/g, '');
      const k = key.trim().toLowerCase();
      if (k === 'title')    meta.title    = val;
      if (k === 'route')    meta.route    = val;
      if (k === 'category') meta.category = val;
    }
  }

  const body = match ? content.slice(match[0].length) : content;
  return { ...meta, body };
}

/**
 * Recursively walk a directory and collect all .md files.
 *
 * @param {string} dir - Absolute directory path
 * @param {string[]} results - Accumulator
 * @returns {string[]} - Absolute paths to .md files
 */
function walkDir(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip the scripts folder
      if (SKIP_PATTERNS.some(p => p.test(fullPath + path.sep))) continue;
      walkDir(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      if (!SKIP_PATTERNS.some(p => p.test(fullPath))) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Load all knowledge-base documents.
 *
 * @returns {{ filePath, relativePath, title, route, category, content, mtimeMs }[]}
 */
export function loadDocuments() {
  if (!fs.existsSync(KB_ROOT)) {
    logger.warn(`[RAG] knowledge-base directory not found at: ${KB_ROOT}`);
    return [];
  }

  const files = walkDir(KB_ROOT);
  const docs = [];

  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const stat = fs.statSync(filePath);
      const { title, route, category, body } = parseFrontMatter(raw);
      const relativePath = path.relative(KB_ROOT, filePath).replace(/\\/g, '/');

      // Use filename stem as fallback title
      const resolvedTitle = title || path.basename(filePath, '.md')
        .replace(/_/g, ' ')
        .replace(/-/g, ' ');

      docs.push({
        filePath,
        relativePath,
        title:    resolvedTitle,
        route:    route    || `/${relativePath}`,
        category: category || 'General',
        content:  body,
        mtimeMs:  stat.mtimeMs,
      });
    } catch (err) {
      logger.warn(`[RAG] Could not load ${filePath}: ${err.message}`);
    }
  }

  logger.info(`[RAG] Loaded ${docs.length} documents from ${KB_ROOT}`);
  return docs;
}

/**
 * Build a map of { relativePath → mtimeMs } for all current .md files.
 * Used to detect knowledge-base changes and invalidate the cached index.
 *
 * @returns {Record<string, number>}
 */
export function buildMtimeMap() {
  if (!fs.existsSync(KB_ROOT)) return {};
  const files = walkDir(KB_ROOT);
  const map = {};
  for (const f of files) {
    try {
      const rel = path.relative(KB_ROOT, f).replace(/\\/g, '/');
      map[rel] = fs.statSync(f).mtimeMs;
    } catch { /* ignore */ }
  }
  return map;
}

export { KB_ROOT };
