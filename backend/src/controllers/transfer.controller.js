// backend/src/controllers/transfer.controller.js
/**
 * Carrier callbacks for a live human transfer. Three endpoints per carrier,
 * all public (carriers call them), all gated by the HMAC token minted in
 * transfer.service.js; Plivo requests additionally carry Plivo's signature,
 * which the Plivo answer/hangup controller verifies for its own routes — the
 * token here is the equivalent for both carriers.
 *
 *   POST /telephony/transfer/:carrier/xml     (Plivo only) the <Dial> document
 *                                              the Transfer API pointed the
 *                                              A-leg at
 *   POST /telephony/transfer/:carrier/dial    the <Dial> ended — answer with
 *                                              <Hangup/> on success, or with a
 *                                              document that reconnects the
 *                                              agent on failure
 *   POST /telephony/transfer/:carrier/status  (Twilio) call-level status; the
 *                                              call is over — finalise the log
 *
 * Money: the call log is NOT finalised when the agent's media socket closes
 * for the transfer (the bridge sees a pending transfer and only persists the
 * transcript). It is finalised HERE, once the whole call — agent leg plus
 * human leg — has ended, so billing covers both legs at the workspace rate.
 * On a failed handover the call resumes on the agent and the resumed bridge
 * finalises as usual.
 */
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { env } from '../config/env.js';
import { createCallFinalizer } from '../ws/callFinalizer.js';
import {
  verifyTransferToken, parseDialOutcome, buildHangupDocument, buildResumeDocument, buildDialDocument,
  takePendingTransfer, peekPendingTransfer, transferCallbackUrl,
} from '../services/telephony/transfer.service.js';

const field = (req, ...names) => {
  for (const n of names) {
    const v = req.body?.[n] ?? req.query?.[n];
    if (v !== undefined && v !== '') return String(v);
  }
  return '';
};
const xml = (res, body) => res.type('text/xml').send(body);
const carrierOf = (req) => String(req.params.carrier || '').toUpperCase();

const authorised = (req, res) => {
  const callLogId = field(req, 'callLogId');
  const token = field(req, 't');
  if (!callLogId || !verifyTransferToken(callLogId, token)) {
    logger.warn({ path: req.path, callLogId }, 'transfer callback rejected: bad token');
    res.status(403).type('text/xml').send('<Response><Hangup/></Response>');
    return null;
  }
  return { callLogId, workspaceId: field(req, 'workspaceId'), agentId: field(req, 'agentId') };
};

const STATUS_FOR = { completed: 'CONNECTED', busy: 'BUSY', 'no-answer': 'NO_ANSWER', failed: 'FAILED', canceled: 'CANCELED', unknown: 'FAILED' };

async function updateTransferRow(callLogId, data) {
  try {
    const row = await prisma.callTransfer.findFirst({ where: { callLogId }, orderBy: { requestedAt: 'desc' }, select: { id: true } });
    if (row) await prisma.callTransfer.update({ where: { id: row.id }, data });
  } catch (err) {
    logger.warn(`transfer: could not update CallTransfer for ${callLogId}: ${err.message}`);
  }
}

/** Plivo: the A-leg fetches its new document from here. */
export async function dialXml(req, res) {
  const auth = authorised(req, res);
  if (!auth) return;
  const carrier = carrierOf(req);
  const pending = peekPendingTransfer(auth.callLogId);
  if (!pending) {
    logger.warn({ callLogId: auth.callLogId }, 'transfer xml requested for a call with no pending transfer');
    return xml(res, buildHangupDocument(carrier));
  }
  const actionUrl = transferCallbackUrl({ carrierId: carrier, callLogId: auth.callLogId, workspaceId: auth.workspaceId, agentId: auth.agentId, kind: 'dial' });
  await updateTransferRow(auth.callLogId, { status: 'DIALING', dialedAt: new Date() });
  return xml(res, buildDialDocument(carrier, { number: pending.number, callerId: pending.callerId, timeoutSec: pending.timeoutSec, actionUrl }));
}

/** Both carriers: the <Dial> has ended. */
export async function dialStatus(req, res) {
  const auth = authorised(req, res);
  if (!auth) return;
  const carrier = carrierOf(req);
  const { outcome, durationSec, raw } = parseDialOutcome(carrier, req.body);
  const pending = takePendingTransfer(auth.callLogId);
  logger.info({ callLogId: auth.callLogId, carrier, outcome, raw, durationSec }, 'transfer: dial ended');

  if (outcome === 'completed') {
    // The human and the caller spoke, and one of them hung up. The call is
    // over: settle it with both legs' time.
    await updateTransferRow(auth.callLogId, { status: 'CONNECTED', resolvedAt: new Date(), humanLegSec: durationSec });
    finalizeWholeCall(auth, pending, 'COMPLETED').catch(() => {});
    return xml(res, buildHangupDocument(carrier));
  }

  // Nobody could be reached: bring the caller back to the agent, and tell it
  // what happened so it can say so. If we cannot build the resume document,
  // the honest fallback is to end the call rather than leave dead air.
  await updateTransferRow(auth.callLogId, { status: STATUS_FOR[outcome] ?? 'FAILED', resolvedAt: new Date(), error: raw || null });
  if (!env.PUBLIC_BACKEND_WS_URL || !auth.workspaceId || !auth.agentId) {
    logger.error({ callLogId: auth.callLogId }, 'transfer failed and the agent cannot be resumed (no PUBLIC_BACKEND_WS_URL) — hanging up');
    finalizeWholeCall(auth, pending, 'COMPLETED').catch(() => {});
    return xml(res, buildHangupDocument(carrier));
  }
  return xml(res, buildResumeDocument(carrier, {
    baseWsUrl: env.PUBLIC_BACKEND_WS_URL, workspaceId: auth.workspaceId, agentId: auth.agentId,
    callLogId: auth.callLogId, outcome, direction: pending?.direction ?? null,
  }));
}

/** Twilio call-level status callback after the redirect: the call has ended. */
export async function callStatus(req, res) {
  const auth = authorised(req, res);
  if (!auth) return;
  res.json({ ok: true });
  const status = String(field(req, 'CallStatus')).toLowerCase();
  if (status && status !== 'completed' && status !== 'busy' && status !== 'failed' && status !== 'no-answer' && status !== 'canceled') return;
  const pending = takePendingTransfer(auth.callLogId);
  await finalizeWholeCall(auth, pending, 'COMPLETED').catch(() => {});
}

/**
 * Finalise a call whose agent leg ended for a transfer. Idempotent through
 * the call log status: a resumed bridge, or the Plivo hangup webhook, may
 * already have done it.
 */
async function finalizeWholeCall({ callLogId, workspaceId, agentId }, pending, status) {
  try {
    const log = await prisma.agentCallLog.findUnique({ where: { id: callLogId }, select: { status: true, startedAt: true, transcript: true, workspaceId: true, agentId: true } });
    if (!log || (log.status !== 'IN_PROGRESS' && log.status !== 'INITIATED')) return;
    let transcript = [];
    try { transcript = JSON.parse(log.transcript || '[]'); } catch { /* keep empty */ }
    const finalize = createCallFinalizer({ workspaceId: workspaceId || log.workspaceId, agentId: agentId || log.agentId, label: 'transferred phone call' });
    await finalize(callLogId, status, { transcript, startedAt: new Date(log.startedAt).getTime() });
    logger.info({ callLogId, transfer: pending?.number ?? null }, 'transfer: call finalised with both legs');
  } catch (err) {
    logger.warn(`transfer: could not finalise ${callLogId}: ${err.message}`);
  }
}
