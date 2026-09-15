// backend/src/services/telephony/carrierCloseOut.js
//
// Closing a phone call from the CARRIER's side: Plivo's hangup callback, the
// PIOPIY CDR, and Twilio's completed-call status callback.
//
// Each of those is the backstop for a call nothing else will finish — a dial
// nobody answered, a greeting-only call (no media socket at all), a bridge that
// died with the call. But for an answered conversational call the media bridge
// is the one that should finish it: it holds the transcript, and it closes the
// call the moment its socket does — which is the same moment the carrier posts.
// Three copies of "who wins" had drifted into those three handlers; this is the
// one version of it.
//
// Correctness does not rest on the timing below. callFinalizer's claim on
// `endedAt` guarantees one path finalizes whatever the order. The grace window
// exists so that the path that wins is, whenever possible, the one with the
// transcript — extraction and post-call delivery run on whatever the winner saw.

import { createHmac, timingSafeEqual } from 'crypto';
import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { publicHttpBase } from '../../lib/publicUrl.js';
import { createCallFinalizer } from '../../ws/callFinalizer.js';

/**
 * How long a carrier callback gives a media bridge to close the call itself.
 * The bridge finalizes on socket close with no await ahead of its claim, so
 * this only has to outlast one database round trip (490-1400ms measured from
 * the VPS). Exported mutable for tests, which do not want to sit through it.
 */
export const closeOutTiming = { BRIDGE_GRACE_MS: 10_000 };

const OPEN = new Set(['INITIATED', 'IN_PROGRESS']);

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });

const readLog = (callLogId) => prisma.agentCallLog.findUnique({
  where: { id: callLogId },
  select: { status: true, endedAt: true, transcript: true, workspaceId: true, agentId: true },
});

const isOpen = (log) => Boolean(log) && !log.endedAt && OPEN.has(log.status);

/**
 * Might a media bridge still be about to close this call with its transcript?
 *
 * IN_PROGRESS is written by a bridge when media starts, so yes. So is an
 * answered call still at INITIATED with no transcript: the bridge's status write
 * is fire-and-forget and can be overtaken on a short call. A greeting-only call
 * stores its greeting as the transcript at dial time and never has a bridge, and
 * an unanswered call cannot have one — neither is worth waiting for.
 */
export function bridgeMayStillClose(log, { answered }) {
  if (log.status === 'IN_PROGRESS') return true;
  const blank = !log.transcript || log.transcript === '[]';
  return answered && log.status === 'INITIATED' && blank;
}

/**
 * Finish a call from a carrier's end-of-call callback, unless something else
 * already has or is about to.
 *
 * Never touches the transcript: a carrier callback has none, and writing an
 * empty one erased the greeting on greeting-only calls.
 *
 * @param {object} p
 * @param {string} p.callLogId
 * @param {boolean} p.answered     the carrier says a person picked up
 * @param {number} p.durationSec   the carrier's billed duration — more exact
 *   than any wall clock of ours, and what the wallet should be charged against
 * @param {string} p.label         names the carrier in log lines
 * @param {object} [p.log]         the row, when the caller already read it
 * @returns {Promise<'closed'|'already-closed'|'bridge-closed'|'missing'>}
 */
export async function closeOutCarrierCall({ callLogId, answered, durationSec, label, log = undefined }) {
  let row = log === undefined ? await readLog(callLogId) : log;
  if (!row) return 'missing';
  if (!isOpen(row)) return 'already-closed';

  if (bridgeMayStillClose(row, { answered })) {
    await sleep(closeOutTiming.BRIDGE_GRACE_MS);
    row = await readLog(callLogId);
    if (!row) return 'missing';
    if (!isOpen(row)) return 'bridge-closed';
    logger.warn({ callLogId }, `${label}: no media bridge closed this call — closing it from the carrier callback`);
  }

  // workspaceId and agentId from the ROW, never from a callback's query string:
  // an inbound call's callback carries neither, and finalizing with empty ids
  // bills the call but silently skips extraction and post-call delivery.
  const finalize = createCallFinalizer({ workspaceId: row.workspaceId, agentId: row.agentId, label });
  const won = await finalize(callLogId, answered ? 'COMPLETED' : 'FAILED', {
    transcript: null,
    durationSec: Math.max(0, Number(durationSec) || 0),
  });
  return won ? 'closed' : 'already-closed';
}

// ── Twilio's completed-call callback ─────────────────────────────────────────
//
// Twilio agent calls used to be dialled with no StatusCallback at all, so a call
// nobody answered — and every greeting-only call, which opens no socket — was
// never told it had ended: INITIATED and PENDING forever, never charged, its
// concurrency slot held until the 65-minute sweep. Broadcasts already asked for
// this callback; agent calls now do too, and it lands here.
//
// Authorised the same way the broadcast one is: a carrier callback cannot hold a
// session, so an HMAC over the call log id rides in the URL. Its own purpose
// string, so a transfer or broadcast token cannot be replayed against it.

const secret = () => process.env.CARRIER_CALLBACK_SECRET || process.env.JWT_ACCESS_SECRET || '';

export function signCallStatusToken(callLogId) {
  const s = secret();
  if (!s || !callLogId) return '';
  return createHmac('sha256', s).update(`call-status:${callLogId}`).digest('hex').slice(0, 32);
}

export function verifyCallStatusToken(callLogId, token) {
  const expected = signCallStatusToken(callLogId);
  if (!expected || !token) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** '' when this server has no public address, in which case no callback is requested. */
export function twilioCallStatusUrl(callLogId) {
  const base = publicHttpBase();
  if (!base || !callLogId) return '';
  const token = signCallStatusToken(callLogId);
  if (!token) return '';
  return `${base}/api/v1/twilio/call-status?callLogId=${encodeURIComponent(callLogId)}&token=${token}`;
}

/** The only CallStatus values Twilio sends for an ENDED call. */
export const TWILIO_TERMINAL = new Set(['completed', 'busy', 'no-answer', 'failed', 'canceled']);
