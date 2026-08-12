// backend/src/controllers/exotel.controller.js
/**
 * The two HTTP endpoints Exotel itself calls.
 *
 * Neither can carry a session token — Exotel is a carrier, not a browser — so
 * both are public and both authenticate the only way available: an optional
 * shared secret on the URL (EXOTEL_WEBHOOK_TOKEN). They are deliberately thin;
 * anything expensive here is a per-call cost on the dial path.
 *
 *   GET|POST /api/v1/exotel/voicebot-stream
 *       Only used in EXOTEL_DIAL_MODE=app. A Voicebot applet pointed at an
 *       http(s) URL expects a JSON body with a `url` key holding the wss://
 *       address for THIS call — that indirection is the only way one dashboard
 *       flow can serve many agents, because an Exotel flow has no per-call
 *       document to put a stream URL in. In stream mode nothing calls this: the
 *       URL rides on the dial request instead.
 *
 *   POST /api/v1/exotel/status
 *       Terminal call events. Its real job is the calls the media bridge NEVER
 *       SAW — busy, no-answer, rejected, failed-to-connect. HTTP 200 from
 *       connect.json means accepted, not connected, so without this a call that
 *       was never answered sits at INITIATED forever and its billing state is
 *       never closed out.
 */

import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';
import { exotelProvider } from '../services/telephony/exotel.provider.js';

/** Exotel posts form-encoded on some paths and JSON on others; read both. */
const field = (req, ...names) => {
  for (const n of names) {
    const v = req.body?.[n] ?? req.query?.[n];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

/**
 * CustomField is whatever we put in it at dial time — but Exotel hands it back
 * as a raw string here and (per its own sample bridges) occasionally as an
 * already-parsed object. Anything unparseable is treated as absent rather than
 * throwing: a malformed field must not 500 a carrier webhook.
 */
const readCustomField = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * Shared-secret gate. Optional by design: an operator who has not set
 * EXOTEL_WEBHOOK_TOKEN gets a working integration and a warning, not a silent
 * failure at 2am. Once set, it is enforced.
 */
const tokenOk = (req) => {
  const expected = process.env.EXOTEL_WEBHOOK_TOKEN;
  if (!expected) return true;
  return String(req.query?.token || req.body?.token || '') === expected;
};

export async function voicebotStream(req, res) {
  if (!tokenOk(req)) return res.status(403).json({ error: 'Invalid token' });

  const custom = readCustomField(field(req, 'CustomField', 'custom_field'));
  const workspaceId = custom.workspaceId;
  const agentId = custom.agentId;
  const callSid = field(req, 'CallSid');

  if (!workspaceId || !agentId) {
    // The applet cannot proceed without an agent, and a 200 with no url would
    // leave Exotel to fail the call with a much less useful message.
    logger.warn({ callSid }, 'Exotel voicebot-stream called without workspaceId/agentId in CustomField');
    return res.status(400).json({
      error: 'CustomField must carry workspaceId and agentId. Calls placed through this platform '
        + 'always set it; a call started from the Exotel dashboard will not.',
    });
  }

  if (!env.PUBLIC_BACKEND_WS_URL) {
    logger.error('Exotel voicebot-stream cannot answer: PUBLIC_BACKEND_WS_URL is not set');
    return res.status(500).json({ error: 'PUBLIC_BACKEND_WS_URL is not configured on this server.' });
  }

  // Refuse here rather than letting the socket open and fail: the applet's
  // error path is the only place this is visible to the operator, and a call
  // that connects to a bridge which immediately closes just sounds broken.
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId },
    select: { settings: true },
  });
  if (!agent) {
    logger.warn({ workspaceId, agentId, callSid }, 'Exotel voicebot-stream: agent not found');
    return res.status(404).json({ error: 'Agent not found in this workspace' });
  }
  let engine = '';
  try { engine = JSON.parse(agent.settings || '{}').voiceEngine || ''; } catch { /* default */ }
  if (engine !== 'xai' && engine !== 'elevenlabs') {
    logger.warn({ workspaceId, agentId, engine }, 'Exotel voicebot-stream: agent is not on a bundled engine');
    return res.status(409).json({
      error: 'Exotel calls require a bundled Conversational Agent (xAI or ElevenLabs); the modular '
        + 'speech pipeline has no Exotel bridge.',
    });
  }

  let url = exotelProvider.mediaStreamUrl({
    baseWsUrl: env.PUBLIC_BACKEND_WS_URL,
    workspaceId,
    agentId,
  });
  if (custom.callLogId) url += `&callLogId=${encodeURIComponent(custom.callLogId)}`;

  logger.info({ workspaceId, agentId, callSid }, 'Exotel voicebot-stream issued a per-call stream URL');
  // `url` is the whole contract — the applet reads that key and nothing else.
  return res.json({ url });
}

/**
 * Exotel's own vocabulary for how a call ended. Only `completed` means the
 * callee actually answered.
 */
const TERMINAL_FAILURES = new Set(['failed', 'busy', 'no-answer', 'canceled', 'cancelled']);

export async function statusCallback(req, res) {
  if (!tokenOk(req)) return res.status(403).json({ error: 'Invalid token' });

  // Answer first. A carrier webhook that waits on our database is a carrier
  // webhook that retries, and every branch below is best effort by nature.
  res.status(200).json({ ok: true });

  try {
    const custom = readCustomField(field(req, 'CustomField', 'custom_field'));
    const callLogId = custom.callLogId;
    const status = String(field(req, 'Status', 'CallStatus', 'status') || '').toLowerCase();
    const callSid = field(req, 'CallSid');
    const durationRaw = Number(field(req, 'ConversationDuration', 'DialCallDuration') || 0);

    if (!callLogId) {
      logger.info({ callSid, status }, 'Exotel status callback carried no callLogId; ignored');
      return;
    }

    const log = await prisma.agentCallLog.findFirst({
      where: { id: callLogId },
      select: { id: true, status: true },
    });
    if (!log) {
      logger.warn({ callSid, callLogId }, 'Exotel status callback referenced an unknown call log');
      return;
    }

    // The media bridge owns any call it handled: it has the transcript, the
    // real duration and the settlement. Overwriting that from here would
    // replace a finished call with a carrier's summary of it.
    if (log.status !== 'INITIATED') {
      logger.info({ callLogId, status, current: log.status }, 'Exotel status callback: bridge already owns this call');
      return;
    }

    const failed = TERMINAL_FAILURES.has(status);
    await prisma.agentCallLog.update({
      where: { id: callLogId },
      data: {
        status: failed ? 'FAILED' : 'COMPLETED',
        durationSec: Number.isFinite(durationRaw) ? Math.max(0, Math.round(durationRaw)) : 0,
        endedAt: new Date(),
        // Never billed. Either nobody answered, or the call was answered and
        // our bridge never received it — in both cases the customer got no
        // conversation, and a PENDING row would otherwise sit unsettled
        // forever because no other path revisits it.
        billingStatus: 'SKIPPED',
      },
    });

    if (!failed) {
      // Answered, but the media bridge never ran: the flow, the stream URL or
      // the socket is misconfigured. This is the line that says so.
      logger.error(
        { callLogId, callSid, status },
        'Exotel call completed without ever reaching the media bridge — check the Voicebot applet / StreamUrl',
      );
    } else {
      logger.info({ callLogId, callSid, status }, 'Exotel call ended before answer');
    }
  } catch (err) {
    logger.warn(`Exotel status callback failed: ${err.message}`);
  }
}
