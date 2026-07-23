// backend/src/controllers/agentCallLog.controller.js
/**
 * Per-agent interaction history (Edit Agent → Recent Calls).
 *
 *   GET    .../agents/:agentId/calls                     – list sessions
 *   POST   .../agents/:agentId/calls                     – start/log a session
 *   PATCH  .../agents/:agentId/calls/:callId             – update transcript/status
 *   POST   .../agents/:agentId/calls/:callId/recording   – attach web-call audio
 *   GET    .../agents/:agentId/calls/:callId/recording   – stream the audio back
 *
 * Chat tests, web calls and phone test calls all land here so the Recent
 * Calls tab shows every interaction with its transcript (and, for web calls,
 * the full-call recording).
 */

import path from 'path';
import fs from 'fs';
import multer from 'multer';
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { env } from '../config/env.js';
import { extractAndStoreCallVariables } from '../services/postCallExtraction.service.js';

const RECORDINGS_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'call-recordings');
fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

const TYPES = new Set(['CHAT', 'WEB_CALL', 'PHONE_CALL']);
const STATUSES = new Set(['IN_PROGRESS', 'COMPLETED', 'INITIATED', 'FAILED']);

const sendError = (res, err, fallbackMsg) => {
  const status = err.statusCode || 500;
  if (status >= 500) logger.error(fallbackMsg, err);
  res.status(status).json({ error: err.message || fallbackMsg });
};

/** Keep only well-formed {role, content} turns and cap the stored size. */
const sanitizeTranscript = (transcript) => {
  const turns = (Array.isArray(transcript) ? transcript : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
    .slice(-200);
  return JSON.stringify(turns);
};

const toApi = (row) => ({
  id: row.id,
  type: row.type,
  status: row.status,
  durationSec: row.durationSec,
  phoneNumber: row.phoneNumber,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  hasRecording: Boolean(row.recordingPath),
  transcript: (() => { try { return JSON.parse(row.transcript); } catch { return []; } })(),
  extractionStatus: row.extractionStatus,
  extractionError: row.extractionError,
  extractedAt: row.extractedAt,
  extractedData: (() => { try { return JSON.parse(row.extractedData); } catch { return {}; } })(),
});

const isTerminalStatus = (status) => status === 'COMPLETED' || status === 'FAILED';

/**
 * Run the agent's Post-Call deliveries for a finished call.
 *
 * Called once per call, immediately after extraction, so the configured
 * destinations (webhook / email / Google Sheets) receive the extracted
 * variables. Delivery is best-effort: a failing webhook must never make the
 * call-logging request fail, since the call itself already succeeded.
 */
export const deliverPostCall = async (workspaceId, agentId, row) => {
  try {
    const { executePostCall } = await import('./platform.controller.js');
    const extracted = (() => { try { return JSON.parse(row.extractedData); } catch { return {}; } })();
    const transcript = (() => { try { return JSON.parse(row.transcript); } catch { return []; } })();
    const out = await executePostCall(agentId, workspaceId, {
      callId: row.id,
      callType: row.type,
      // Post-Call configs express triggers in the UI's vocabulary ("Completed"),
      // not the stored enum ("COMPLETED").
      outcome: row.status === 'COMPLETED' ? 'Completed' : row.status === 'FAILED' ? 'Failed' : row.status,
      durationSec: row.durationSec,
      phoneNumber: row.phoneNumber ?? '',
      variables: Array.isArray(extracted.variables) ? extracted.variables : [],
      transcript: transcript.map((m) => `${m.role === 'user' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n'),
      endedAt: (row.endedAt ?? new Date()).toISOString(),
    });
    const failures = (out.results ?? []).filter((r) => !r.ok);
    if (failures.length) logger.warn({ agentId, callId: row.id, failures }, 'Post-call delivery had failures');
  } catch (err) {
    logger.warn({ agentId, callId: row.id, err: err.message }, 'Post-call delivery failed');
  }
};

const findCall = async (workspaceId, agentId, callId) => {
  const row = await prisma.agentCallLog.findFirst({ where: { id: callId, workspaceId, agentId } });
  if (!row) {
    const err = new Error('Call log not found');
    err.statusCode = 404;
    throw err;
  }
  return row;
};

// GET .../calls?limit=50
export const listCallLogs = async (req, res) => {
  try {
    const { workspaceId, agentId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const rows = await prisma.agentCallLog.findMany({
      where: { workspaceId, agentId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    res.json({ success: true, calls: rows.map(toApi) });
  } catch (err) {
    sendError(res, err, 'Failed to list call logs');
  }
};

// POST .../calls  { type, transcript?, status?, phoneNumber? }
export const createCallLog = async (req, res) => {
  try {
    const { workspaceId, agentId } = req.params;
    const { type, transcript, status, phoneNumber } = req.body || {};
    if (!TYPES.has(type)) {
      return res.status(400).json({ error: `type must be one of ${[...TYPES].join(', ')}` });
    }
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
    if (!agent) return res.status(404).json({ error: 'Agent not found in this workspace' });

    let row = await prisma.agentCallLog.create({
      data: {
        workspaceId,
        agentId,
        type,
        status: STATUSES.has(status) ? status : 'IN_PROGRESS',
        transcript: sanitizeTranscript(transcript),
        phoneNumber: typeof phoneNumber === 'string' ? phoneNumber.slice(0, 32) : null,
      },
    });
    // Extraction only. Post-Call delivery deliberately does NOT run here: chat
    // sessions are created already-COMPLETED and then grow message by message,
    // so delivering now would send a one-line transcript. Delivery happens when
    // a session is explicitly ended (see updateCallLog).
    if (isTerminalStatus(row.status)) {
      await extractAndStoreCallVariables(workspaceId, agentId, row.id);
      row = await findCall(workspaceId, agentId, row.id);
    }
    res.status(201).json({ success: true, call: toApi(row) });
  } catch (err) {
    sendError(res, err, 'Failed to create call log');
  }
};

// PATCH .../calls/:callId  { transcript?, status?, ended? }
export const updateCallLog = async (req, res) => {
  try {
    const { workspaceId, agentId, callId } = req.params;
    const { transcript, status, ended } = req.body || {};
    const row = await findCall(workspaceId, agentId, callId);

    const data = {};
    if (transcript !== undefined) data.transcript = sanitizeTranscript(transcript);
    if (STATUSES.has(status)) data.status = status;
    // Every update refreshes the running duration so sessions that are never
    // explicitly ended (tab closed mid-chat) still show how long they ran.
    const endedAt = new Date();
    data.durationSec = Math.max(0, Math.round((endedAt - row.startedAt) / 1000));
    if (ended === true || isTerminalStatus(status)) data.endedAt = endedAt;

    let updated = await prisma.agentCallLog.update({ where: { id: row.id }, data });
    if (ended === true || isTerminalStatus(status)) {
      await extractAndStoreCallVariables(workspaceId, agentId, row.id);
      updated = await findCall(workspaceId, agentId, row.id);
      // The call is over and its variables are extracted — hand the result to
      // the configured Post-Call destinations.
      await deliverPostCall(workspaceId, agentId, updated);
    }
    res.json({ success: true, call: toApi(updated) });
  } catch (err) {
    sendError(res, err, 'Failed to update call log');
  }
};

// POST .../calls/:callId/extract
// Manual/retry path for an already stored transcript. Useful for historical
// calls and for retrying a temporary model-provider failure.
export const extractCallVariables = async (req, res) => {
  try {
    const { workspaceId, agentId, callId } = req.params;
    await findCall(workspaceId, agentId, callId);
    await extractAndStoreCallVariables(workspaceId, agentId, callId, {
      force: req.body?.force === true,
    });
    const updated = await findCall(workspaceId, agentId, callId);
    res.json({ success: true, call: toApi(updated) });
  } catch (err) {
    sendError(res, err, 'Failed to extract conversation variables');
  }
};

// ─── Recording (web calls) ────────────────────────────────────────────────────

const recordingStorage = multer.diskStorage({
  destination: (_r, _f, cb) => cb(null, RECORDINGS_DIR),
  filename: (_r, f, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(f.originalname || '') || '.webm'}`),
});

export const uploadCallRecording = multer({
  storage: recordingStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // a long web call in webm/opus
}).single('recording');

// POST .../calls/:callId/recording  multipart: recording (blob)
export const saveCallRecording = async (req, res) => {
  try {
    const { workspaceId, agentId, callId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'An audio file is required (field "recording")' });
    const row = await findCall(workspaceId, agentId, callId).catch((err) => {
      // Orphaned upload — remove the file before failing.
      fs.unlink(req.file.path, () => {});
      throw err;
    });

    // Replace any previous recording for this call.
    if (row.recordingPath) {
      fs.unlink(path.join(RECORDINGS_DIR, path.basename(row.recordingPath)), () => {});
    }
    const updated = await prisma.agentCallLog.update({
      where: { id: row.id },
      data: {
        recordingPath: path.basename(req.file.path),
        recordingMime: req.file.mimetype || 'audio/webm',
      },
    });
    res.json({ success: true, call: toApi(updated) });
  } catch (err) {
    sendError(res, err, 'Failed to save call recording');
  }
};

// GET .../calls/:callId/recording
export const getCallRecording = async (req, res) => {
  try {
    const { workspaceId, agentId, callId } = req.params;
    const row = await findCall(workspaceId, agentId, callId);
    if (!row.recordingPath) return res.status(404).json({ error: 'This call has no recording' });
    const filePath = path.join(RECORDINGS_DIR, path.basename(row.recordingPath));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Recording file is missing from storage' });
    res.setHeader('Content-Type', row.recordingMime || 'audio/webm');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    sendError(res, err, 'Failed to stream call recording');
  }
};
