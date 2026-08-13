// backend/src/services/kb/textExtraction.service.js
/**
 * Text extraction for KB files. Moved out of kbFile.controller.js so it can be
 * imported by kbExtract.worker.js — extraction now runs inside a Node
 * worker_thread (see kbChunking.service.js), not on the main event loop, since
 * this backend also handles live phone-call WebSocket audio in the same
 * process and a multi-second PDF parse on a large file must not add jitter to
 * a concurrent call.
 *
 * Logic is unchanged from before the RAG work; only the cap at the bottom of
 * extractText() was raised (200,000 -> 20,000,000 chars). That cap used to be
 * the effective ceiling on how much of a document the agent could ever see —
 * now that large files are chunked and embedded rather than pasted whole into
 * the prompt, it's just a sanity bound against a pathological file, not a
 * meaningful truncation point.
 */
import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import logger from '../../lib/logger.js';

const EXTRACT_CHAR_CAP = 20_000_000;

/** Extract the text layer of a PDF buffer via pdf-parse v2. */
const pdfParse = async (buffer) => {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { text: result.text || '' };
  } finally {
    await parser.destroy().catch(() => {});
  }
};

/**
 * Make extracted text storable in a Postgres `text` column.
 *
 * Postgres rejects NUL (0x00) outright — `22021: invalid byte sequence for
 * encoding "UTF8"` — and it is exactly what PDF text layers hand back: fonts
 * with no ToUnicode mapping decode unmapped glyphs to U+0000, so any PDF built
 * from such a font killed the INSERT and the upload failed for the whole file.
 * Lone surrogates are stripped for the same reason: they are not valid UTF-8
 * either, and PDF/CID decoding can produce them.
 *
 * The characters removed carry no meaning for LLM grounding, so dropping them
 * costs nothing and keeps a file usable instead of rejecting it wholesale.
 */
export const toStorableText = (text) => {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\u0000/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
};

/**
 * Best-effort text extraction:
 * plain text formats are read directly; PDFs go through pdf-parse (real text
 * layer extraction — handles compressed/flate streams the old regex scan
 * missed), with the lightweight text-operator scan kept as a fallback.
 * Scanned/image-only PDFs still yield nothing and are stored file-only.
 */
export const extractText = async (filePath, mime) => {
  try {
    if (['text/plain', 'text/markdown', 'text/csv', 'application/json'].includes(mime)) {
      return toStorableText(fs.readFileSync(filePath, 'utf8')).slice(0, EXTRACT_CHAR_CAP);
    }
    if (mime === 'application/pdf') {
      const buffer = fs.readFileSync(filePath);
      try {
        const parsed = await pdfParse(buffer);
        // Sanitized BEFORE the length test: a text layer that is mostly
        // unmapped glyphs is mostly NULs, and counting those as content let a
        // file through that had nothing usable in it.
        const text = toStorableText(parsed.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        if (text.length > 40) return text.slice(0, EXTRACT_CHAR_CAP);
      } catch (pdfErr) {
        logger.warn(`pdf-parse failed, using fallback scan: ${pdfErr.message}`);
      }
      // Fallback: naive Tj/TJ text-operator scan (uncompressed PDFs only)
      const raw = buffer.toString('latin1');
      const chunks = [];
      const tj = raw.match(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g) || [];
      for (const m of tj) chunks.push(m.replace(/\)\s*Tj$/, '').slice(1));
      const tjArr = raw.match(/\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/g) || [];
      for (const m of tjArr) {
        const inner = m.match(/\(((?:[^()\\]|\\.)*)\)/g) || [];
        for (const p of inner) chunks.push(p.slice(1, -1));
      }
      const text = toStorableText(chunks.join(' '))
        .replace(/\\([nrt()\\])/g, (_s, c) => (c === 'n' || c === 'r' ? '\n' : c === 't' ? ' ' : c))
        .replace(/\s+/g, ' ').trim();
      return text.length > 40 ? text.slice(0, EXTRACT_CHAR_CAP) : null;
    }
  } catch (e) {
    logger.warn(`KB text extraction failed: ${e.message}`);
  }
  return null;
};
