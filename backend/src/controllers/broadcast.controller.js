// Voice broadcast — HTTP surface.
//
// Three audiences in one file, because they are one feature and splitting them
// would hide how they connect:
//
//   workspace   the console: recordings, broadcasts, launch/pause/cancel, cost.
//   carrier     two public endpoints. The audio file a carrier fetches when a
//               call is answered, and the status webhook it posts when the call
//               ends. Neither can hold a session, so both are authorised by a
//               signed token in the URL (services/broadcast/signedToken.js).
//   admin       the platform ₹/min for broadcast calls lives in
//               platform.controller.js alongside the wallet rate.

import fs from 'fs';
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import * as broadcastService from '../services/broadcast/broadcast.service.js';
import * as recordingService from '../services/broadcast/broadcastRecording.service.js';
import { settleBroadcastCall, currentBroadcastRate } from '../services/broadcast/broadcastSettlement.service.js';
import { verifyToken } from '../services/broadcast/signedToken.js';
import { syncProgress } from '../services/broadcast/broadcastRunner.service.js';

const parseJsonArray = (value, field) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed.filter(Boolean).map(String);
  } catch {
    throw Object.assign(new Error(`${field} must be a JSON array of ids`), { statusCode: 400 });
  }
};

// ── Recordings ──────────────────────────────────────────────────────────────

export const listRecordings = async (req, res) => {
  res.json(await recordingService.listRecordings(req.params.workspaceId));
};

/** POST /broadcast-recordings/upload — multipart, an MP3 or WAV. */
export const uploadRecording = async (req, res) => {
  const recording = await recordingService.createFromUpload(req.params.workspaceId, req.file, {
    name: req.body?.name,
    // The browser measures the file when it is picked; the server parses the
    // header itself and takes whichever is longer. See audioDuration.js.
    durationSec: Number(req.body?.durationSec) || 0,
    createdById: req.user?.userId ?? null,
  });
  res.status(201).json(recording);
};

/** POST /broadcast-recordings/synthesize — render a script once, keep the audio. */
export const synthesizeRecording = async (req, res) => {
  const recording = await recordingService.createFromText(req.params.workspaceId, {
    name: req.body?.name,
    text: req.body?.text,
    voiceId: req.body?.voiceId,
    createdById: req.user?.userId ?? null,
  });
  res.status(201).json(recording);
};

/**
 * GET /broadcast-recordings/:recordingId/audio — authenticated preview.
 *
 * Separate from the public endpoint on purpose. This one is for the operator
 * listening back in the console and is protected by their session; the public
 * one is for carriers and is protected by a signed token. Collapsing them would
 * mean either the console needs a token or the carrier needs a login.
 */
export const streamRecording = async (req, res) => {
  const recording = await recordingService.getRecording(req.params.workspaceId, req.params.recordingId);
  if (!recording) return res.status(404).json({ error: 'Recording not found' });
  return sendAudio(res, recording);
};

export const deleteRecording = async (req, res) => {
  res.json(await recordingService.deleteRecording(req.params.workspaceId, req.params.recordingId));
};

/** The shared file response. Express handles Range and conditional requests. */
function sendAudio(res, recording) {
  const filePath = recordingService.recordingFilePath(recording);
  if (!fs.existsSync(filePath)) {
    logger.error({ recordingId: recording.id, filePath }, 'Broadcast recording row has no file on disk');
    return res.status(410).json({ error: 'The audio for this recording is missing from storage' });
  }
  res.type(recording.mimeType || 'audio/mpeg');
  return res.sendFile(filePath);
}

// ── Broadcasts ──────────────────────────────────────────────────────────────

export const listBroadcasts = async (req, res) => {
  res.json(await broadcastService.listBroadcasts(req.params.workspaceId));
};

export const getBroadcast = async (req, res) => {
  res.json(await broadcastService.getBroadcast(req.params.workspaceId, req.params.broadcastId));
};

export const createBroadcast = async (req, res) => {
  const broadcast = await broadcastService.createBroadcast(req.params.workspaceId, {
    name: req.body?.name,
    recordingId: req.body?.recordingId,
    clusterIds: parseJsonArray(req.body?.clusterIds, 'clusterIds'),
    fromNumbers: parseJsonArray(req.body?.fromNumbers, 'fromNumbers'),
    repeatCount: req.body?.repeatCount,
    createdById: req.user?.userId ?? null,
  });
  res.status(201).json(broadcast);
};

export const updateBroadcast = async (req, res) => {
  res.json(await broadcastService.updateBroadcast(req.params.workspaceId, req.params.broadcastId, req.body));
};

export const deleteBroadcast = async (req, res) => {
  res.json(await broadcastService.deleteBroadcast(req.params.workspaceId, req.params.broadcastId));
};

export const syncBroadcastList = async (req, res) => {
  res.json(await broadcastService.syncBroadcastList(req.params.workspaceId, req.params.broadcastId));
};

export const startBroadcast = async (req, res) => {
  res.json(await broadcastService.startBroadcast(req.params.workspaceId, req.params.broadcastId));
};

export const launchBroadcast = async (req, res) => {
  res.json(await broadcastService.launchBroadcast(
    req.params.workspaceId, req.params.broadcastId, req.body?.scheduledAt,
  ));
};

export const pauseBroadcast = async (req, res) => {
  res.json(await broadcastService.pauseBroadcast(req.params.workspaceId, req.params.broadcastId));
};

export const cancelBroadcast = async (req, res) => {
  res.json(await broadcastService.cancelBroadcast(req.params.workspaceId, req.params.broadcastId));
};

export const getBroadcastStats = async (req, res) => {
  res.json(await broadcastService.getBroadcastStats(req.params.workspaceId, req.params.broadcastId));
};

export const listRecipients = async (req, res) => {
  res.json(await broadcastService.listRecipients(req.params.workspaceId, req.params.broadcastId, {
    status: req.query.status,
    take: req.query.take,
    skip: req.query.skip,
  }));
};

/** GET /broadcasts/estimate — what a send would cost, before it exists. */
export const estimate = async (req, res) => {
  res.json(await broadcastService.previewBroadcastCost(req.params.workspaceId, {
    recordingId: req.query.recordingId,
    clusterIds: parseJsonArray(req.query.clusterIds, 'clusterIds'),
    repeatCount: Number(req.query.repeatCount) || 1,
  }));
};

/** GET /broadcasts/caller-readiness — can these numbers broadcast at all? */
export const callerReadiness = async (req, res) => {
  res.json(await broadcastService.checkCallerReadiness(parseJsonArray(req.query.fromNumbers, 'fromNumbers')));
};

/** GET /broadcasts/rate — the ₹/min a broadcast call is charged at. */
export const broadcastRate = async (_req, res) => {
  res.json(await currentBroadcastRate());
};

// ── Carrier-facing (public) ─────────────────────────────────────────────────

/**
 * GET /broadcast-audio/:recordingId?token=… — the file the carrier plays.
 *
 * Public because a carrier cannot authenticate, and every answered call in a
 * broadcast fetches it. The HMAC is what stops the id space being enumerable:
 * without it, guessing cuids would hand a stranger every customer's audio.
 */
export const publicAudio = async (req, res) => {
  const { recordingId } = req.params;
  if (!verifyToken('audio', recordingId, req.query.token)) {
    logger.warn({ recordingId }, 'Broadcast audio requested with a bad token');
    return res.status(403).json({ error: 'Invalid token' });
  }

  const recording = await recordingService.getRecordingUnscoped(recordingId);
  if (!recording) return res.status(404).json({ error: 'Recording not found' });
  return sendAudio(res, recording);
};

/** Twilio's vocabulary for a call that actually reached a person. */
const TWILIO_ANSWERED = new Set(['completed']);

/**
 * POST /broadcast/twilio/status?rid=…&token=… — the completed-call webhook.
 *
 * A broadcast opens no media socket and writes no call log, so this is the ONLY
 * place a Twilio broadcast's duration — and therefore its charge — comes from.
 * Signed rather than validated against Twilio's own signature because the same
 * endpoint shape has to work for a carrier that has no signature scheme, and one
 * mechanism that always holds beats two that each half-cover.
 */
export const twilioStatus = async (req, res) => {
  const recipientId = String(req.query.rid || '');
  if (!verifyToken('status', recipientId, req.query.token)) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  // Answer first, work after: a carrier webhook kept waiting is a carrier
  // webhook that retries, and everything below is idempotent anyway.
  res.json({ ok: true });

  const status = String(req.body?.CallStatus ?? '').toLowerCase();
  const duration = Number(req.body?.CallDuration ?? 0);

  await settleBroadcastCall(recipientId, {
    durationSec: duration,
    answered: TWILIO_ANSWERED.has(status) && duration > 0,
    failureReason: TWILIO_ANSWERED.has(status) ? null : status || 'unknown',
    providerCallId: req.body?.CallSid ?? null,
  }).catch((e) => logger.warn(`Twilio broadcast status could not settle ${recipientId}: ${e.message}`));

  // Keep the broadcast's own counters moving as outcomes land, rather than only
  // when the dispatcher next comes round — a finished send whose last calls are
  // still resolving would otherwise sit at 98%.
  const recipient = await prisma.broadcastRecipient.findUnique({
    where: { id: recipientId },
    select: { broadcastId: true },
  }).catch(() => null);
  if (recipient) await syncProgress(recipient.broadcastId).catch(() => {});
};
