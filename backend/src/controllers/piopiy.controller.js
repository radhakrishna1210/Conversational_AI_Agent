// backend/src/controllers/piopiy.controller.js
/**
 * The one public PIOPIY endpoint:
 *
 *   POST /api/v1/piopiy/cdr
 *       Terminal call state. PIOPIY posts a CDR when a call ends, and for the
 *       two call shapes that open no media socket — greeting-only and broadcast
 *       — it is the ONLY end-of-call signal that exists. Without it those logs
 *       sit at INITIATED forever and their billing state never leaves PENDING,
 *       because HTTP 200 from the dial API means accepted, not connected.
 *
 * There is no answer endpoint here, unlike Plivo. PIOPIY takes its PCMO
 * document inline on the dial request, so nothing has to be served at pickup —
 * one less public surface, and no per-call latency on the answer path.
 *
 * ── How this is protected ────────────────────────────────────────────────────
 *
 * PIOPIY signs nothing. Plivo's V3 request signature and Twilio's X-Twilio-
 * Signature both have no equivalent here — its webhook documentation describes
 * URL configuration only, with no signature, token or mTLS scheme. So the only
 * authentication available is a shared secret we put on the URL ourselves
 * (PIOPIY_WEBHOOK_TOKEN), the only authentication a carrier callback can carry.
 *
 * That makes the token the whole of the protection, which is worth stating
 * plainly: unset, this endpoint is open, and anyone who learns a call log id can
 * close out a call. It is best-effort-idempotent (a log already past INITIATED /
 * IN_PROGRESS is left alone), so the blast radius is a call finalized early
 * rather than corrupted state — but set the token.
 *
 * ── Where the call's identity comes from ─────────────────────────────────────
 *
 * `extra_params`, which we set on the dial request and PIOPIY echoes back. It
 * arrives as a JSON *string*, not an object — that is documented in their CDR
 * payload and is the single most likely thing to break silently if it ever
 * changes, so readExtraParams tolerates both.
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { createCallFinalizer } from '../ws/callFinalizer.js';
import { releaseSlot } from '../services/telephony/concurrency.js';
import { settleBroadcastCall } from '../services/broadcast/broadcastSettlement.service.js';
import { syncProgress } from '../services/broadcast/broadcastRunner.service.js';

/**
 * PIOPIY's vocabulary for how a call ended.
 *
 * Its CDR `status` is the outcome, not a state machine: 'answered' for a call
 * that connected, 'missed' / 'busy' / 'failed' / 'no_answer' / 'cancel' for the
 * ones that did not. Only an answered call has a duration worth settling, and
 * `duration > 0` is checked alongside this rather than trusted from the status
 * alone — a 0-second "answered" call is a carrier artefact, not a conversation.
 */
const ANSWERED_STATES = new Set(['answered', 'completed']);

/**
 * Unset means open, and says so once at boot rather than failing silently at
 * 2am. The trade-off is deliberate: a deployment
 * that forgets the token gets a working integration and a warning.
 */
const tokenOk = (req) => {
  const expected = process.env.PIOPIY_WEBHOOK_TOKEN;
  if (!expected) return true;
  return String(req.query?.token || req.body?.token || '') === expected;
};

/**
 * `extra_params` comes back as a JSON string in PIOPIY's documented CDR payload.
 * Parsed defensively because the alternative — an already-decoded object — is
 * exactly what a future version would send, and the failure mode of guessing
 * wrong is a call that never closes out.
 */
export function readExtraParams(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// ── POST /api/v1/piopiy/cdr ──────────────────────────────────────────────────

export async function cdr(req, res) {
  if (!tokenOk(req)) return res.status(403).json({ error: 'Invalid token' });

  // Answer first, work after. A carrier webhook kept waiting on our database is
  // a carrier webhook that retries, and everything below is best effort.
  res.json({ ok: true });

  const body = req.body || {};
  const status = String(body.status ?? '').toLowerCase();
  const seconds = Number(body.duration) || 0;
  const cmiuuid = body.cmiuuid ? String(body.cmiuuid) : null;
  const answered = ANSWERED_STATES.has(status) && seconds > 0;

  const extra = readExtraParams(body.extra_params);

  // ── broadcast ──
  //
  // A one-way call has no AgentCallLog and opens no media socket, so this is
  // where its answered/no-answer outcome and its charge both come from.
  const broadcastRecipientId = extra.broadcastRecipientId || null;
  if (broadcastRecipientId) {
    // The leg is down: give the concurrency slot back before settling, so a
    // waiting dialer sees the free slot immediately rather than after the wallet
    // write. Keyed on the recipient id — a broadcast has no call log.
    releaseSlot(broadcastRecipientId);
    try {
      await settleBroadcastCall(broadcastRecipientId, {
        durationSec: seconds,
        answered,
        failureReason: answered ? null : (status || 'unknown'),
        providerCallId: cmiuuid,
      });
      const recipient = await prisma.broadcastRecipient.findUnique({
        where: { id: broadcastRecipientId },
        select: { broadcastId: true },
      });
      // Keep the broadcast's counters moving as outcomes land, rather than only
      // when the dispatcher next comes round — otherwise a finished send whose
      // last calls are still resolving sits at 98% indefinitely.
      if (recipient) await syncProgress(recipient.broadcastId).catch(() => {});
    } catch (e) {
      logger.warn(`PIOPIY CDR could not settle broadcast recipient ${broadcastRecipientId}: ${e.message}`);
    }
    return;
  }

  const callLogId = extra.callLogId || null;
  if (!callLogId) return;

  try {
    const log = await prisma.agentCallLog.findUnique({
      where: { id: callLogId },
      select: { status: true },
    });
    // The media bridge already closed this out on socket close. Re-finalizing
    // would duplicate the Sheets row / webhook / email for one call — the exact
    // thing callFinalizer's once-only guard exists to prevent, except that guard
    // is per-bridge-instance and this is a different process path.
    if (!log || (log.status !== 'INITIATED' && log.status !== 'IN_PROGRESS')) return;

    const finalize = createCallFinalizer({
      workspaceId: extra.workspaceId,
      agentId: extra.agentId,
      label: 'PIOPIY phone call',
    });
    await finalize(callLogId, answered ? 'COMPLETED' : 'FAILED', {
      transcript: [],
      startedAt: Date.now() - seconds * 1000,
    });

    logger.info(
      { callLogId, status, cmiuuid, duration: seconds },
      `PIOPIY CDR closed out a call as ${answered ? 'COMPLETED' : 'FAILED'}`,
    );
  } catch (e) {
    logger.warn(`PIOPIY CDR could not close out ${callLogId}: ${e.message}`);
  }
}
