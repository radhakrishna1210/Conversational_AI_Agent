import { readFile } from 'fs/promises';
import { pathToFileURL } from 'url';
import path from 'path';
import zlib from 'zlib';

const PDFJS_PATH = pathToFileURL(
  'C:/Users/athar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
).href;

const normalizeText = (text) =>
  String(text || '')
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const extractPdfText = (buffer) => {
  const raw = buffer.toString('latin1');
  const literalStrings = raw.match(/\((?:\\.|[^\\)]){1,}\)/g) || [];
  const hexStrings = raw.match(/<([0-9A-Fa-f\s]{4,})>/g) || [];
  const streamBlocks = raw.match(/stream[\r\n]+([\s\S]*?)endstream/g) || [];

  const decodeLiteral = (value) =>
    value
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')');

  const decodeHex = (value) => {
    const hex = value.replace(/[<>\s]/g, '');
    let out = '';
    for (let i = 0; i < hex.length - 1; i += 2) {
      const code = parseInt(hex.slice(i, i + 2), 16);
      if (Number.isFinite(code) && code > 0) out += String.fromCharCode(code);
    }
    return out;
  };

  const streamTexts = streamBlocks.flatMap((block) => {
    const texts = [];
    const textMatches = block.match(/\((?:\\.|[^\\)]){1,}\)|<([0-9A-Fa-f\s]{4,})>/g) || [];
    for (const match of textMatches) {
      if (match.startsWith('(')) texts.push(decodeLiteral(match));
      else if (match.startsWith('<')) texts.push(decodeHex(match));
    }
    return texts;
  });

  const parts = [
    ...literalStrings.map(decodeLiteral),
    ...hexStrings.map(decodeHex),
    ...streamTexts,
  ];

  return normalizeText(parts.join(' '));
};

const extractStringsFromPdfContent = (content) => {
  const textParts = [];
  const literalStrings = content.match(/\((?:\\.|[^\\)]){1,}\)/g) || [];
  const hexStrings = content.match(/<([0-9A-Fa-f\s]{4,})>/g) || [];
  const textArrays = content.match(/\[((?:.|\n)*?)\]\s*TJ/g) || [];
  const textOps = content.match(/\((?:\\.|[^\\)]){1,}\)\s*T[Jj]/g) || [];

  const decodeLiteral = (value) =>
    value
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')');

  const decodeHex = (value) => {
    const hex = value.replace(/[<>\s]/g, '');
    let out = '';
    for (let i = 0; i < hex.length - 1; i += 2) {
      const code = parseInt(hex.slice(i, i + 2), 16);
      if (Number.isFinite(code) && code > 0) out += String.fromCharCode(code);
    }
    return out;
  };

  for (const match of literalStrings) textParts.push(decodeLiteral(match));
  for (const match of hexStrings) textParts.push(decodeHex(match));
  for (const match of textOps) textParts.push(decodeLiteral(match));
  for (const block of textArrays) {
    const inner = block.replace(/^\[/, '').replace(/\]\s*TJ$/, '');
    const arrayMatches = inner.match(/\((?:\\.|[^\\)]){1,}\)|<([0-9A-Fa-f\s]{4,})>/g) || [];
    for (const match of arrayMatches) {
      if (match.startsWith('(')) textParts.push(decodeLiteral(match));
      else if (match.startsWith('<')) textParts.push(decodeHex(match));
    }
  }

  return textParts;
};

const decodeAscii85 = (input) => {
  const source = String(input || '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/~>$/g, '');
  const bytes = [];
  let chunk = [];

  for (const char of source) {
    if (/\s/.test(char)) continue;
    if (char === 'z' && chunk.length === 0) {
      bytes.push(0, 0, 0, 0);
      continue;
    }
    const code = char.charCodeAt(0);
    if (code < 33 || code > 117) continue;
    chunk.push(code - 33);
    if (chunk.length === 5) {
      let value = 0;
      for (const digit of chunk) {
        value = value * 85 + digit;
      }
      bytes.push(
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff
      );
      chunk = [];
    }
  }

  if (chunk.length > 1) {
    while (chunk.length < 5) chunk.push(84);
    let value = 0;
    for (const digit of chunk) {
      value = value * 85 + digit;
    }
    const outLen = chunk.length - 1;
    bytes.push(
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff
    );
    return Buffer.from(bytes).subarray(0, bytes.length - (4 - outLen));
  }

  return Buffer.from(bytes);
};

const extractCompressedPdfText = (buffer) => {
  const raw = buffer.toString('latin1');
  const streamRegex = /<<[\s\S]{0,1000}?\/Length\s+\d+[\s\S]{0,1000}?>>\s*stream\r?\n([\s\S]*?)endstream/g;
  const extracted = [];
  let match;

  while ((match = streamRegex.exec(raw)) !== null) {
    const streamText = match[1];
    try {
      const ascii85Decoded = decodeAscii85(streamText);
      const inflated = zlib.inflateSync(ascii85Decoded).toString('latin1');
      extracted.push(...extractStringsFromPdfContent(inflated));
    } catch {
      try {
        const streamBuffer = Buffer.from(streamText, 'latin1');
        const inflated = zlib.inflateSync(streamBuffer).toString('latin1');
        extracted.push(...extractStringsFromPdfContent(inflated));
      } catch {
        extracted.push(...extractStringsFromPdfContent(streamText));
      }
    }
  }

  return normalizeText(extracted.join(' '));
};

const extractPdfTextWithPdfJs = async (buffer) => {
  try {
    const pdfjs = await import(PDFJS_PATH);
    const data = new Uint8Array(buffer);
    const doc = await pdfjs.getDocument({ data }).promise;
    const pages = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = (textContent.items || [])
        .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean)
        .join(' ');
      if (pageText.trim()) pages.push(pageText);
    }
    const text = normalizeText(pages.join('\n\n'));
    if (text && text.length > 20) return text;
  } catch {
    // fall through to raw parsing
  }
  return '';
};

export const extractDocumentText = async (filePath, mimeType = '', originalName = '') => {
  const lowerName = String(originalName || filePath).toLowerCase();
  const buffer = await readFile(filePath);

  if (mimeType.includes('pdf') || lowerName.endsWith('.pdf')) {
    const pdfJsText = await extractPdfTextWithPdfJs(buffer);
    if (pdfJsText) return pdfJsText;
    const compressedText = extractCompressedPdfText(buffer);
    if (compressedText) return compressedText;
    return extractPdfText(buffer);
  }

  if (
    mimeType.startsWith('text/') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.json') ||
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.htm')
  ) {
    return normalizeText(buffer.toString('utf8'));
  }

  return normalizeText(buffer.toString('utf8'));
};

export const chunkText = (text, size = 1200) => {
  const source = normalizeText(text);
  if (!source) return [];

  const chunks = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(source.length, start + size);
    if (end < source.length) {
      const breakAt = source.lastIndexOf('\n\n', end);
      const spaceAt = source.lastIndexOf(' ', end);
      const splitAt = Math.max(breakAt, spaceAt);
      if (splitAt > start + Math.floor(size * 0.5)) {
        end = splitAt;
      }
    }
    const chunk = source.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end;
  }

  return chunks;
};
