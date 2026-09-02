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
import { settleCall, assertCanStartCall } from '../services/billing/settlement.service.js';
import { env } from '../config/env.js';
import { extractAndStoreCallVariables } from '../services/postCallExtraction.service.js';

const RECORDINGS_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'call-recordings');
fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

const TYPES = new Set(['CHAT', 'WEB_CALL', 'PHONE_CALL']);
const STATUSES = new Set(['IN_PROGRESS', 'COMPLETED', 'INITIATED', 'FAILED']);

const sendError = (res, err, fallbackMsg) => {
  const status = err.statusCode || 500;
  if (status >= 500) logger.error(fallbackMsg, err);
  // Some handlers respond first and keep working (see runPostCallPipeline), so
  // a later throw must not try to send a second set of headers.
  if (res.headersSent) return;
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
  const extracted = (() => { try { return JSON.parse(row.extractedData); } catch { return {}; } })();
  const transcript = (() => { try { return JSON.parse(row.transcript); } catch { return []; } })();
  const postCallPayload = {
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
  };

  try {
    const { executePostCall } = await import('./platform.controller.js');
    const out = await executePostCall(agentId, workspaceId, postCallPayload);
    const failures = (out.results ?? []).filter((r) => !r.ok);
    if (failures.length) logger.warn({ agentId, callId: row.id, failures }, 'Post-call delivery had failures');
  } catch (err) {
    logger.warn({ agentId, callId: row.id, err: err.message }, 'Post-call delivery failed');
  }

  // Zoho CRM and Notion push directly via their stored OAuth token — no
  // webhook URL, unlike the block above. "Active integration" here means
  // simply connected: true, matching how the Integrations page shows it;
  // there is no separate enable/disable toggle for these two yet.
  try {
    const zohoIntegration = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider: 'zoho' } } });
    if (zohoIntegration?.connected) {
      const { pushCallAsLead } = await import('../services/zoho.service.js');
      await pushCallAsLead(workspaceId, agentId, postCallPayload);
    }
  } catch (err) {
    logger.warn({ agentId, callId: row.id, err: err.message }, 'Zoho Lead push failed');
  }

  try {
    const notionIntegration = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider: 'notion' } } });
    if (notionIntegration?.connected) {
      const { createPostCallPage } = await import('../services/notion.service.js');
      await createPostCallPage(workspaceId, agentId, postCallPayload);
    }
  } catch (err) {
    logger.warn({ agentId, callId: row.id, err: err.message }, 'Notion page push failed');
  }
};

/**
 * Everything a finished call needs AFTER its log row is final: billing
 * settlement, LLM variable extraction, and Post-Call delivery.
 *
 * Deliberately NOT awaited by the request that ends a call. Extraction is a
 * model round-trip and delivery talks to third parties (webhook / email /
 * Google Sheets), so awaiting them held the PATCH response open for seconds —
 * long enough that anything ending the page in that window (navigating away,
 * closing the tab, a slow webhook) killed the client's follow-up requests. The
 * end-of-call recording upload was the visible casualty: it queued behind this
 * work and never ran, so calls landed in Recent Calls with no audio.
 *
 * The client learns the outcome by re-reading the call (extractionStatus goes
 * PROCESSING → COMPLETED/FAILED, and the Recent Calls tab already renders it),
 * so nothing here needs to be in the response. Each step is independently
 * guarded: a failing webhook must not stop billing, and a failing extraction
 * must not stop the rest.
 */
const runPostCallPipeline = async (workspaceId, agentId, callId) => {
  // BUG-002: charge the wallet for the minutes used. Runs FIRST so a slow or
  // failing Post-Call destination cannot stop usage from being billed.
  // settleCall() is idempotent per call, so a replayed PATCH (this endpoint is
  // client-driven and retryable) cannot double-charge.
  try {
    await settleCall(callId);
  } catch (err) {
    logger.error({ workspaceId, agentId, callId, err: err.message }, 'Call settlement failed');
  }
  try {
    await extractAndStoreCallVariables(workspaceId, agentId, callId);
  } catch (err) {
    logger.error({ workspaceId, agentId, callId, err: err.message }, 'Post-call extraction failed');
  }
  // The call is over and its variables are extracted — hand the result to the
  // configured Post-Call destinations. deliverPostCall swallows its own errors.
  try {
    const row = await findCall(workspaceId, agentId, callId);
    await deliverPostCall(workspaceId, agentId, row);
  } catch (err) {
    logger.error({ workspaceId, agentId, callId, err: err.message }, 'Post-call delivery step failed');
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

    // BUG-002: plan + balance gate. The verdict is REPORTED, never used to
    // suppress the record.
    //
    // This endpoint cannot prevent a web call: the browser opens the mic and the
    // socket first and only then POSTs here, ignoring the result. Refusing the
    // record therefore stopped nothing — it just made the platform forget a call
    // it had actually served, so the call vanished from Recent Calls AND became
    // unbillable, which is the worst of both. A call log is a record of what
    // happened; whether a call was *permitted* is a separate question from
    // whether it is *remembered*.
    //
    // Real prevention lives where a call can still be stopped: phone calls are
    // gated before dialling (agent.controller.js testCall). The equivalent for
    // web calls belongs in the WebSocket handler, which is where the audio
    // actually starts — see the note in the response below.
    const gate = await assertCanStartCall(workspaceId, { type });
    if (!gate.allowed) {
      logger.warn(
        { workspaceId, agentId, code: gate.code },
        `Call exceeded a plan limit but is still being recorded: ${gate.code}`,
      );
    }

    const row = await prisma.agentCallLog.create({
      data: {
        workspaceId,
        agentId,
        type,
        status: STATUSES.has(status) ? status : 'IN_PROGRESS',
        transcript: sanitizeTranscript(transcript),
        phoneNumber: typeof phoneNumber === 'string' ? phoneNumber.slice(0, 32) : null,
      },
    });
    // The call is always recorded; `limit` tells the client it went over a plan
    // limit so it can warn the user, without the record being the casualty.
    res.status(201).json({
      success: true,
      call: toApi(row),
      ...(gate.allowed ? {} : { limit: { code: gate.code, message: gate.message } }),
    });

    // Extraction only, and after the response. Post-Call delivery deliberately
    // does NOT run here: chat sessions are created already-COMPLETED and then
    // grow message by message, so delivering now would send a one-line
    // transcript. Delivery happens when a session is explicitly ended (see
    // updateCallLog). The client polls extractionStatus, so holding the
    // response open for a model round-trip bought nothing — it just made
    // opening a chat session wait on the extractor.
    if (isTerminalStatus(row.status)) {
      extractAndStoreCallVariables(workspaceId, agentId, row.id).catch((err) => {
        logger.error({ workspaceId, agentId, callId: row.id, err: err.message }, 'Post-call extraction failed');
      });
    }
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

    const endedAt = new Date();
    // Every update refreshes the running duration so sessions that are never
    // explicitly ended (tab closed mid-chat) still show how long they ran — but
    // only WHILE the call is still open. Once it has an endedAt the duration is
    // settled history: a later PATCH (the recording upload finishing, a retry)
    // must not stretch it, or the customer pays for the upload as talk time.
    if (!row.endedAt) {
      data.durationSec = Math.max(0, Math.round((endedAt - row.startedAt) / 1000));
    }

    /*
     * WHO GETS TO END THIS CALL
     * -------------------------
     * Two writers can now finalize a web call: this endpoint, and the socket's
     * closed-tab backstop (ws/callFinalizer.js finalizeAbandonedCall). Exactly
     * one of them must run the post-call pipeline, because Post-Call delivery is
     * not idempotent — a second pass posts the webhook again, appends a second
     * Google Sheets row and sends a second email for one call.
     *
     * `endedAt` is the claim, moved off null by a conditional UPDATE so the two
     * writers cannot both win. Reading `row.endedAt` above and trusting it would
     * be a read-then-write race; it is only used to decide the SHAPE of the
     * write, never as the guard.
     */
    const finalizing = ended === true || isTerminalStatus(status);
    let finalized = false;
    let updated;

    if (finalizing && !row.endedAt) {
      const claimed = await prisma.agentCallLog.updateMany({
        where: { id: row.id, endedAt: null },
        data: { ...data, endedAt },
      });
      finalized = claimed.count === 1;
      if (finalized) {
        // Already know every field: the row as read, plus what was just written.
        updated = { ...row, ...data, endedAt };
      } else {
        // Lost the race — the backstop finalized it in the last few
        // milliseconds. Its duration and endedAt stand; still apply the
        // transcript, which is the one thing this request has and it does not.
        delete data.durationSec;
        updated = await prisma.agentCallLog.update({ where: { id: row.id }, data });
      }
    } else {
      updated = await prisma.agentCallLog.update({ where: { id: row.id }, data });
    }

    // Answer as soon as the row itself is durable. Billing, extraction and
    // Post-Call delivery run after the response — see runPostCallPipeline.
    res.json({ success: true, call: toApi(updated) });

    if (finalized) {
      runPostCallPipeline(workspaceId, agentId, row.id).catch((err) => {
        logger.error({ workspaceId, agentId, callId: row.id, err: err.message }, 'Post-call pipeline failed');
      });
    }
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
    // A manual re-extract must also re-run the configured Post-Call
    // deliveries (webhook / email / Google Sheets) so the freshly extracted
    // variables reach their destinations, just like the end-of-call path does.
    await deliverPostCall(workspaceId, agentId, updated);
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
