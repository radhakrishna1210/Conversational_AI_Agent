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

/** Set, or clear with a null agentId, the agent that answers a number. */
export async function setInboundAgent(workspaceId, { numberId, agentId = null }) {
  const number = await prisma.voiceNumber.findFirst({ where: { id: numberId, workspaceId } });
  if (!number) return { ok: false, error: 'Number not found in this workspace.' };
  if (number.status === VOICE_NUMBER_STATUS.RELEASED) {
    return { ok: false, error: 'That number has been released.' };
  }

  if (agentId) {
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId }, select: { id: true } });
    if (!agent) return { ok: false, error: 'Agent not found in this workspace.' };
  }

  const updated = await prisma.voiceNumber.update({
    where: { id: numberId },
    data: { inboundAgentId: agentId || null },
  });
  return { ok: true, number: updated };
}
