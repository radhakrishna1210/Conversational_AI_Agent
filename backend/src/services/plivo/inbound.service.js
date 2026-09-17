// Inbound calls to numbers we rent.
//
// An outbound call reaches /plivo/answer carrying its own workspace and agent on
// the query string, because placeCall() put them there. An inbound call carries
// nothing of ours: the application it rings through is shared by every number
// in the subaccount, so its answer URL cannot name an agent. The called number
// is the only thing that identifies the call, and VoiceNumber.inboundAgentId is
// where it finds who answers.

import prisma from '../../config/prisma.js';
import { VOICE_NUMBER_STATUS } from '../../constants/compliance.js';
import { inboundRefusal } from '../agentDirection.js';

/**
 * Plivo sends numbers as bare digits ("912269851741"); VoiceNumber stores E.164
 * with the plus. Anything that is not a phone number — a SIP URI, an empty
 * field — comes back empty rather than as a string of stray digits.
 */
export function e164FromCarrier(raw) {
  const s = String(raw ?? '').trim();
  if (!s || /^sip:/i.test(s)) return '';
  const digits = s.replace(/\D/g, '');
  return digits.length >= 8 ? `+${digits}` : '';
}

/**
 * Who answers a call placed TO this number.
 *
 * `workspaceId` is returned even when the call cannot be routed, so the caller
 * can still find the subaccount whose token signed the request.
 *
 * @returns {Promise<{ok: boolean, workspaceId?: string, agentId?: string,
 *   numberId?: string, reason?: string}>}
 */
export async function resolveInboundRoute(calledNumber) {
  const phoneNumber = e164FromCarrier(calledNumber);
  if (!phoneNumber) return { ok: false, reason: 'no called number on the request' };

  const row = await prisma.voiceNumber.findUnique({
    where: { phoneNumber },
    select: { id: true, workspaceId: true, status: true, inboundAgentId: true },
  });
  if (!row) return { ok: false, reason: `${phoneNumber} is not a number this platform holds` };

  const base = { workspaceId: row.workspaceId, numberId: row.id };
  // A number suspended for an unpaid rental must not keep taking calls on an
  // agent that bills per minute; a released one is no longer the client's.
  if (row.status !== VOICE_NUMBER_STATUS.ACTIVE) return { ok: false, ...base, reason: `${phoneNumber} is ${row.status}` };
  if (!row.inboundAgentId) return { ok: false, ...base, reason: `${phoneNumber} has no inbound agent assigned` };

  return { ok: true, ...base, agentId: row.inboundAgentId };
}

/** Prisma's unique-constraint violation. */
const isUniqueViolation = (err) => err?.code === 'P2002';

/**
 * Plivo CallUUIDs are hyphenated UUIDs. Anything else is refused rather than
 * embedded in an id: call log ids end up in BullMQ job ids, where ':' is Redis's
 * key separator and '__' is the job-id joiner (whatsappPostCall.queue.js).
 */
const CALL_UUID_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * The call log id for an inbound Plivo call — derived from its CallUUID, not
 * generated.
 *
 * That derivation is the whole idempotency story, and it needs no lookup and no
 * new index:
 *
 *   - Plivo re-fetches the answer URL when a response is slow or fails, and every
 *     fetch is the same call. A generated id would open a second call log for it,
 *     and bill the customer twice.
 *   - The hangup callback for an inbound call carries no callLogId — the
 *     application's URL is shared by every number in the subaccount, so it cannot
 *     name one — but it does carry the CallUUID, so it can find the row again.
 *
 * @returns {string|null} null when the request carries no usable CallUUID
 */
export function inboundCallLogId(callUuid) {
  const uuid = String(callUuid ?? '').trim();
  return CALL_UUID_RE.test(uuid) ? `plivo-in-${uuid}` : null;
}

/**
 * Open the call log for a call placed TO one of our numbers.
 *
 * BEFORE THIS EXISTED an inbound call had no row at all. Only the dialler created
 * one, the answer handler handed the bridge `callLogId: null`, and callFinalizer
 * returns before settleCall() when there is no id — so every inbound minute was
 * served free, with no transcript, no extracted variables and no post-call
 * delivery. The wallet gate already ran at pickup (the media bridges check
 * balance with concurrency:false); the charge simply had nowhere to land.
 *
 * Shaped like the dialler's row so every consumer reads it the same way:
 * `phoneNumber` is the customer and `fromNumber` is our number, in both
 * directions. Created INITIATED, as the dialler's is; the bridge moves it to
 * IN_PROGRESS when media starts, and callFinalizer — or the hangup callback, if
 * media never opened — closes it and bills it.
 *
 * Safe to call again for the same call: a repeat returns the existing id.
 *
 * @param {object} p
 * @param {string} p.workspaceId
 * @param {string} p.agentId
 * @param {string} p.callUuid   Plivo's CallUUID
 * @param {string} [p.from]     the caller, as Plivo sends it
 * @param {string} [p.to]       the number they rang, as Plivo sends it
 * @returns {Promise<{ id: string, created: boolean } | null>} null when there is
 *   no CallUUID to key the row on
 */
export async function openInboundCallLog({ workspaceId, agentId, callUuid, from, to }) {
  const id = inboundCallLogId(callUuid);
  if (!id) return null;

  try {
    await prisma.agentCallLog.create({
      data: {
        id,
        workspaceId,
        agentId,
        type: 'PHONE_CALL',
        status: 'INITIATED',
        direction: 'INBOUND',
        // A withheld or SIP caller has no number; null, not a string of stray
        // digits that post-call delivery would try to message.
        phoneNumber: e164FromCarrier(from) || null,
        fromNumber: e164FromCarrier(to) || null,
        provider: 'PLIVO',
        providerCallId: String(callUuid).trim(),
      },
    });
    return { id, created: true };
  } catch (err) {
    // The same call arriving again. The row is already there; reuse it.
    if (isUniqueViolation(err)) return { id, created: false };
    throw err;
  }
}

/** Set, or clear with a null agentId, the agent that answers a number. */
export async function setInboundAgent(workspaceId, { numberId, agentId = null }) {
  const number = await prisma.voiceNumber.findFirst({ where: { id: numberId, workspaceId } });
  if (!number) return { ok: false, error: 'Number not found in this workspace.' };
  if (number.status === VOICE_NUMBER_STATUS.RELEASED) {
    return { ok: false, error: 'That number has been released.' };
  }

  if (agentId) {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, workspaceId },
      select: { id: true, name: true, settings: true },
    });
    if (!agent) return { ok: false, error: 'Agent not found in this workspace.' };
    // Only an agent built to answer calls may answer this number.
    const refusal = inboundRefusal(agent);
    if (refusal) return { ok: false, status: 409, code: 'AGENT_IS_OUTBOUND', error: refusal };
  }

  const updated = await prisma.voiceNumber.update({
    where: { id: numberId },
    data: { inboundAgentId: agentId || null },
  });
  return { ok: true, number: updated };
}
