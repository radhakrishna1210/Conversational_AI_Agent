// Unified Files / Knowledge-Base storage — ONE store backing both the sidebar
// Files page and Edit Agent → Knowledge Base. Workspace-scoped, uploader
// tracked, text extracted best-effort for LLM grounding.
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { env } from '../config/env.js';
import { invalidateKbCaches } from '../services/agentRuntime.service.js';
import { triggerKbProcessing, deleteKbChunks } from '../services/kbChunking.service.js';

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
  // env.js defaults this to 25MB (raised from 10 — see the comment there) to
  // comfortably cover the 1-20MB range RAG is meant for: extraction and
  // embedding both run in the background now (kbChunking.service.js), so a
  // bigger file no longer blocks this request or any concurrent live call.
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
}).single('file');

// Text extraction (extractText/toStorableText) moved to
// services/kb/textExtraction.service.js so it can run inside
// kbExtract.worker.js, off the main event loop — this process also serves
// live phone-call WebSocket audio, and a synchronous multi-second PDF parse
// on a large file must not be able to add jitter to a concurrent call.

// POST /workspaces/:workspaceId/files   (multipart: file, optional agentId)
//
// Responds as soon as the file is saved — extraction, chunking and embedding
// all happen in the background (kbChunking.service.js's triggerKbProcessing),
// never inside this request. A file this size can take a while to process
// (worker-thread PDF parse + a background embedding pass), and this process
// also serves live phone-call audio; nothing about that can be allowed to
// block on an upload.
export const upload = async (req, res) => {
  const { workspaceId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'A file is required' });
  try {
    const record = await prisma.kbFile.create({
      data: {
        workspaceId,
        uploadedById: req.user.userId,
        agentId: req.body.agentId || null,
        fileName: req.file.originalname || path.basename(req.file.path),
        storedPath: path.basename(req.file.path),
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        textContent: null,
        status: 'pending',
      },
    });
    // The runtime caches grounding text for 5 minutes; without this the agent
    // would keep answering from the pre-upload knowledge base for that long.
    invalidateKbCaches(workspaceId, record.agentId);
    // Fire-and-forget: the caller gets the file record back immediately, and
    // polls list()/status for when it's actually ready.
    triggerKbProcessing(record.id);
    res.status(201).json({ file: toDto(record), textExtracted: false });
  } catch (err) {
    logger.error(
      { err, workspaceId, agentId: req.body.agentId || null, fileName: req.file.originalname, mimeType: req.file.mimetype },
      'KB upload failed',
    );
    fs.unlink(req.file.path, (e) => { if (e) logger.warn(`Orphaned upload not cleaned: ${e.message}`); });
    // The old response asserted "the schema is likely not migrated" for EVERY
    // failure. When the schema is in fact migrated that sends you chasing a
    // non-existent problem, and the real cause was never visible because the
    // log line above dropped the error object. Only the Prisma codes that
    // genuinely mean "missing table/column" get the migrate hint now; anything
    // else reports what actually went wrong.
    const schemaDrift = err?.code === 'P2021' || err?.code === 'P2022';
    res.status(500).json({
      error: schemaDrift
        ? 'Failed to save file: the database schema is out of date — run `npx prisma migrate deploy` in backend/.'
        : `Failed to save file: ${err?.message || 'unknown error'}`,
      ...(err?.code ? { code: err.code } : {}),
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
    logger.error({ err, workspaceId, agentId }, 'KB list failed');
    res.status(500).json({ error: `Failed to list files: ${err?.message || 'unknown error'}` });
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
  // Same reason as upload: a document removed for being wrong must stop
  // grounding answers now, not in five minutes.
  invalidateKbCaches(workspaceId, record?.agentId ?? null);
  // Orphaned chunks would otherwise keep surfacing in retrieval forever — a
  // KbChunk row has no FK/cascade back to KbFile since Prisma can't declare
  // one through an Unsupported() column.
  await deleteKbChunks(id).catch((e) => logger.warn(`Could not remove KB chunks for ${id}: ${e.message}`));
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
    logger.error({ err, workspaceId, agentId }, 'agentKbText failed');
    res.status(500).json({ error: 'Failed to load knowledge base' });
  }
};

const toDto = (f) => ({
  id: f.id, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes,
  agentId: f.agentId, hasText: Boolean(f.textContent), createdAt: f.createdAt,
  // status/chunked expose RAG processing progress ('pending' -> 'processing'
  // -> 'ready'/'failed', chunked true once retrieval has taken over from the
  // flat-text path) — not consumed by any frontend yet, added so one can be
  // built without another backend round trip.
  status: f.status, chunked: f.chunked, embeddingError: f.embeddingError ?? null,
});
