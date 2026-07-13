// Unified Files / Knowledge-Base storage — ONE store backing both the sidebar
// Files page and Edit Agent → Knowledge Base. Workspace-scoped, uploader
// tracked, text extracted best-effort for LLM grounding.
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { env } from '../config/env.js';

const FILES_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'kb-files');
fs.mkdirSync(FILES_DIR, { recursive: true });

const ALLOWED = new Set([
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const storage = multer.diskStorage({
  destination: (_r, _f, cb) => cb(null, FILES_DIR),
  filename: (_r, f, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(f.originalname || '')}`),
});

export const uploadKbFile = multer({
  storage,
  fileFilter: (_r, f, cb) => ALLOWED.has(f.mimetype) ? cb(null, true)
    : cb(new Error('Allowed types: PDF, TXT, MD, CSV, JSON, DOCX')),
  limits: { fileSize: (env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024 },
}).single('file');

/**
 * Best-effort text extraction without extra dependencies:
 * plain text formats are read directly; PDFs get a lightweight scan of text
 * operators (covers most digitally-authored PDFs; scanned PDFs yield nothing
 * and are stored file-only). Swap in pdf-parse for full fidelity later.
 */
const extractText = (filePath, mime) => {
  try {
    if (['text/plain', 'text/markdown', 'text/csv', 'application/json'].includes(mime)) {
      return fs.readFileSync(filePath, 'utf8').slice(0, 200_000);
    }
    if (mime === 'application/pdf') {
      const raw = fs.readFileSync(filePath).toString('latin1');
      const chunks = [];
      // Tj / TJ show-text operators
      const tj = raw.match(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g) || [];
      for (const m of tj) chunks.push(m.replace(/\)\s*Tj$/, '').slice(1));
      const tjArr = raw.match(/\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/g) || [];
      for (const m of tjArr) {
        const inner = m.match(/\(((?:[^()\\]|\\.)*)\)/g) || [];
        for (const p of inner) chunks.push(p.slice(1, -1));
      }
      const text = chunks.join(' ')
        .replace(/\\([nrt()\\])/g, (_s, c) => (c === 'n' || c === 'r' ? '\n' : c === 't' ? ' ' : c))
        .replace(/\s+/g, ' ').trim();
      return text.length > 40 ? text.slice(0, 200_000) : null;
    }
  } catch (e) {
    logger.warn(`KB text extraction failed: ${e.message}`);
  }
  return null;
};

// POST /workspaces/:workspaceId/files   (multipart: file, optional agentId)
export const upload = async (req, res) => {
  const { workspaceId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'A file is required' });
  try {
    const textContent = extractText(req.file.path, req.file.mimetype);
    const record = await prisma.kbFile.create({
      data: {
        workspaceId,
        uploadedById: req.user.userId,
        agentId: req.body.agentId || null,
        fileName: req.file.originalname || path.basename(req.file.path),
        storedPath: path.basename(req.file.path),
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        textContent,
      },
    });
    res.status(201).json({ file: toDto(record), textExtracted: Boolean(textContent) });
  } catch (err) {
    logger.error('KB upload failed', err);
    fs.unlink(req.file.path, (e) => { if (e) logger.warn(`Orphaned upload not cleaned: ${e.message}`); });
    res.status(500).json({
      error: 'Failed to save file. If this happens for every file, the database schema is likely not migrated — run `npx prisma migrate deploy` in backend/ (npm run dev now does this automatically).',
    });
  }
};

// GET /workspaces/:workspaceId/files?agentId=…
export const list = async (req, res) => {
  const { workspaceId } = req.params;
  const { agentId } = req.query;
  try {
    const rows = await prisma.kbFile.findMany({
      where: { workspaceId, ...(agentId ? { agentId: String(agentId) } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ files: rows.map(toDto) });
  } catch (err) {
    logger.error('KB list failed', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
};

// GET /workspaces/:workspaceId/files/:id/download
export const download = async (req, res) => {
  const { workspaceId, id } = req.params;
  const f = await prisma.kbFile.findUnique({ where: { id } }).catch(() => null);
  if (!f || f.workspaceId !== workspaceId) return res.status(404).json({ error: 'File not found' });
  const p = path.join(FILES_DIR, path.basename(f.storedPath));
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'File missing from storage' });
  res.setHeader('Content-Type', f.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(f.fileName)}"`);
  fs.createReadStream(p).pipe(res);
};

// DELETE /workspaces/:workspaceId/files/:id
export const remove = async (req, res) => {
  const { workspaceId, id } = req.params;
  // Look up first so the physical file can be removed too (previously every
  // deleted KB file left a permanent orphan on disk).
  const record = await prisma.kbFile.findUnique({ where: { id } }).catch(() => null);
  const del = await prisma.kbFile.deleteMany({ where: { id, workspaceId } });
  if (del.count === 0) return res.status(404).json({ error: 'File not found' });
  if (record?.storedPath) {
    fs.unlink(path.join(FILES_DIR, path.basename(record.storedPath)), (e) => {
      if (e) logger.warn(`Could not remove stored file ${record.storedPath}: ${e.message}`);
    });
  }
  res.json({ success: true });
};

// GET /workspaces/:workspaceId/agents/:agentId/kb-text — grounding text for
// chat test / live agent prompts (agent-linked files + workspace-wide files).
export const agentKbText = async (req, res) => {
  const { workspaceId, agentId } = req.params;
  try {
    const rows = await prisma.kbFile.findMany({
      where: { workspaceId, OR: [{ agentId }, { agentId: null }], textContent: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const budget = 24_000; // chars of grounding context
    let used = 0;
    const sections = [];
    for (const f of rows) {
      if (used >= budget) break;
      const slice = (f.textContent || '').slice(0, Math.min(6000, budget - used));
      used += slice.length;
      sections.push(`### Source: ${f.fileName}\n${slice}`);
    }
    res.json({ kbText: sections.join('\n\n'), fileCount: rows.length });
  } catch (err) {
    logger.error('agentKbText failed', err);
    res.status(500).json({ error: 'Failed to load knowledge base' });
  }
};

const toDto = (f) => ({
  id: f.id, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes,
  agentId: f.agentId, hasText: Boolean(f.textContent), createdAt: f.createdAt,
});
