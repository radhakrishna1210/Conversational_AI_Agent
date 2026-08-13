// backend/src/services/kbChunking.service.js
/**
 * RAG pipeline for knowledge base files: chunk + embed a file ONCE in the
 * background after upload, then retrieve only the relevant chunks per query
 * instead of pasting the whole (capped) document into every LLM prompt.
 *
 * Only files whose extracted text exceeds CHUNK_THRESHOLD_CHARS get chunked at
 * all — a small KB keeps using the existing flat-text path in
 * agentRuntime.service.js's getAgentKbText() unchanged (no embedding cost, no
 * retrieval latency, and it keeps whatever benefit it already got from
 * Gemini's implicit prompt caching, which small prompts never cleared the
 * threshold for anyway).
 */
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { env } from '../config/env.js';
import { embedBatch, embedText, isEmbeddingConfigured } from './embeddings.service.js';
import { invalidateKbCaches } from './agentRuntime.service.js';

const CHUNK_THRESHOLD_CHARS = 10_000;
const CHUNK_SIZE = 1_000;
const CHUNK_OVERLAP = 150;
// How many KbChunk rows go into a single multi-row INSERT — keeps each
// statement's parameter count and the pgvector literal payload reasonable
// while still cutting a 20,000-chunk file down to ~100 round trips instead of
// one per chunk.
const INSERT_BATCH_SIZE = 200;
// A KbFile stuck in 'pending'/'processing' past this age is treated as
// abandoned by a crashed/restarted process, not still legitimately running —
// see the startup sweep in server.js.
export const STUCK_JOB_AGE_MS = 30 * 60_000;

const FILES_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'kb-files');
const WORKER_PATH = fileURLToPath(new URL('../workers/kbExtract.worker.js', import.meta.url));

function extractInWorker(filePath, mimeType) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, { workerData: { filePath, mimeType } });
    let settled = false;
    worker.once('message', (msg) => {
      settled = true;
      worker.terminate();
      if (msg.ok) resolve(msg.text);
      else reject(new Error(msg.error));
    });
    worker.once('error', (err) => {
      if (settled) return;
      worker.terminate();
      reject(err);
    });
    worker.once('exit', (code) => {
      if (!settled && code !== 0) reject(new Error(`Extraction worker exited with code ${code}`));
    });
  });
}

/**
 * Split text into overlapping, paragraph-aware chunks. Hand-rolled rather than
 * a library — the strategy is simple on purpose: pack whole paragraphs up to
 * chunkSize, carry the tail of the previous chunk forward as overlap so a
 * fact split across a chunk boundary still appears whole in at least one
 * chunk, and hard-slice any single paragraph that's bigger than chunkSize on
 * its own (a wall-of-text PDF with no real paragraph breaks).
 */
export function splitIntoChunks(text, { chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const para of paragraphs) {
    if (para.length > chunkSize) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < para.length; i += chunkSize - overlap) {
        chunks.push(para.slice(i, i + chunkSize));
      }
      continue;
    }
    if (current && current.length + para.length + 2 > chunkSize) {
      chunks.push(current);
      current = current.slice(Math.max(0, current.length - overlap));
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

const vectorLiteral = (embedding) => `[${embedding.join(',')}]`;

/** Remove any existing chunks for a file — always run before inserting fresh
 *  ones, so a retried/re-run job can never leave duplicate or stale rows. */
async function deleteChunksForFile(tx, kbFileId) {
  await tx.$executeRaw`DELETE FROM "KbChunk" WHERE "kbFileId" = ${kbFileId}`;
}

async function insertChunks(tx, rows) {
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
    const values = Prisma.join(
      batch.map((r) => Prisma.sql`(${r.id}, ${r.kbFileId}, ${r.workspaceId}, ${r.agentId}, ${r.chunkIndex}, ${r.content}, ${vectorLiteral(r.embedding)}::vector, NOW())`),
    );
    await tx.$executeRaw`
      INSERT INTO "KbChunk" ("id", "kbFileId", "workspaceId", "agentId", "chunkIndex", "content", "embedding", "createdAt")
      VALUES ${values}
    `;
  }
}

/**
 * Process one KbFile: extract (off-thread) -> chunk -> embed -> store.
 * Idempotent and safe to re-run (e.g. by the startup sweep) — always deletes
 * any existing chunks for this file before inserting fresh ones, inside the
 * same transaction, so a re-run can never leave duplicates or a half-written
 * set of chunks visible to a concurrent query.
 */
export async function processKbFile(kbFileId) {
  const file = await prisma.kbFile.findUnique({ where: { id: kbFileId } });
  if (!file) return;

  await prisma.kbFile.update({ where: { id: kbFileId }, data: { status: 'processing', embeddingError: null } });

  try {
    const filePath = path.join(FILES_DIR, path.basename(file.storedPath));
    const text = await extractInWorker(filePath, file.mimeType);

    if (!text || text.length < CHUNK_THRESHOLD_CHARS || !isEmbeddingConfigured()) {
      // Too small to be worth chunking (or no embedding provider configured at
      // all) — store the extracted text and leave it on the existing flat-text
      // path. Not a failure: `chunked` simply stays false.
      await prisma.kbFile.update({
        where: { id: kbFileId },
        data: { textContent: text, status: 'ready', chunked: false },
      });
      invalidateKbCaches(file.workspaceId, file.agentId);
      return;
    }

    const pieces = splitIntoChunks(text);
    const embeddings = await embedBatch(pieces);
    if (!embeddings || embeddings.length !== pieces.length) {
      throw new Error(`Embedding count (${embeddings?.length ?? 0}) did not match chunk count (${pieces.length})`);
    }

    const rows = pieces.map((content, i) => ({
      id: crypto.randomUUID(),
      kbFileId: file.id,
      workspaceId: file.workspaceId,
      agentId: file.agentId,
      chunkIndex: i,
      content,
      embedding: embeddings[i],
    }));

    await prisma.$transaction(async (tx) => {
      await deleteChunksForFile(tx, kbFileId);
      await insertChunks(tx, rows);
    });

    await prisma.kbFile.update({
      where: { id: kbFileId },
      data: { textContent: text, status: 'ready', chunked: true },
    });
    // The flat-text cache must stop serving this file's (now truncated, now
    // redundant) full text the instant retrieval takes over.
    invalidateKbCaches(file.workspaceId, file.agentId);
    logger.info(`KB file ${kbFileId}: chunked into ${rows.length} pieces and embedded`);
  } catch (err) {
    logger.error({ err, kbFileId }, 'KB chunking/embedding failed');
    await prisma.kbFile.update({
      where: { id: kbFileId },
      data: { status: 'failed', embeddingError: err?.message || 'unknown error' },
    }).catch(() => {});
  }
}

/** Fire-and-forget trigger — same shape as agentRuntime.service.js's
 *  warmVoiceTurn: callers never await this, a failure is logged, not thrown. */
export function triggerKbProcessing(kbFileId) {
  processKbFile(kbFileId).catch((err) => {
    logger.error({ err, kbFileId }, 'KB processing trigger failed');
  });
}

/** Delete a file's chunks — called from kbFile.controller.js's remove(). */
export async function deleteKbChunks(kbFileId) {
  await prisma.$executeRaw`DELETE FROM "KbChunk" WHERE "kbFileId" = ${kbFileId}`;
}

/** Cheap existence check: does this agent have ANY RAG chunks at all? Decides
 *  whether _prepareConverse() should attempt retrieval, independent of
 *  whether a given query's top-k search happens to come back empty (a
 *  legitimate "no close match" outcome, not a reason to fall back to
 *  flat-text). */
export async function hasKbChunks(workspaceId, agentId) {
  const rows = await prisma.$queryRaw`
    SELECT 1 FROM "KbChunk"
    WHERE "workspaceId" = ${workspaceId} AND ("agentId" = ${agentId} OR "agentId" IS NULL)
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Top-k relevant chunks for a question, scoped exactly like
 * getAgentKbText()'s flat-text sourcing rule (agent-linked files OR
 * workspace-wide files). Returns [] if embeddings aren't configured or
 * nothing matches — never throws for "no results", only for a genuine
 * provider/DB error, which the caller (agentRuntime.service.js) lets fall
 * through to the flat-text path.
 */
export async function retrieveKbChunks(workspaceId, agentId, queryText, k = 5) {
  const embedding = await embedText(queryText, { taskType: 'RETRIEVAL_QUERY' });
  if (!embedding) return [];
  const rows = await prisma.$queryRaw`
    SELECT kc."content" AS content, kf."fileName" AS "fileName"
    FROM "KbChunk" kc
    JOIN "KbFile" kf ON kf."id" = kc."kbFileId"
    WHERE kc."workspaceId" = ${workspaceId} AND (kc."agentId" = ${agentId} OR kc."agentId" IS NULL)
    ORDER BY kc."embedding" <=> ${vectorLiteral(embedding)}::vector
    LIMIT ${k}
  `;
  return rows;
}

/**
 * Startup sweep: a KbFile left in 'pending'/'processing' past STUCK_JOB_AGE_MS
 * means the process that was handling it died (deploy, crash) mid-job — retry
 * it rather than leaving it stuck forever. Called once from server.js on boot,
 * next to the existing integrationScheduler/voiceSyncScheduler startups.
 */
export async function resumeStuckKbJobs() {
  const cutoff = new Date(Date.now() - STUCK_JOB_AGE_MS);
  const stuck = await prisma.kbFile.findMany({
    where: { status: { in: ['pending', 'processing'] }, updatedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (!stuck.length) return;
  logger.warn(`Resuming ${stuck.length} KB file(s) stuck in pending/processing from a previous run`);
  for (const { id } of stuck) triggerKbProcessing(id);
}
