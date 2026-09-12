// Number requests — how a client gets a number while self-serve renting is off.
//
// Renting spends real money on our parent account the moment it runs. The
// wallet debit in front of it exists (numberBilling.service.js), but the whole
// path has never run against the live carrier, so letting any client trigger it
// is gated by PLIVO_SELF_SERVE_RENT and off by default. With it off the client
// still browses live inventory and picks the number they want; the pick becomes
// a request, and an admin fulfils it from the console — which runs exactly the
// same rentNumber(), wallet debit included. Flipping the flag on removes the
// middle step and nothing else.

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import {
  NUMBER_REQUEST_KIND,
  NUMBER_REQUEST_STATUS,
  VOICE_NUMBER_STATUS,
} from '../../constants/compliance.js';
import { notifyWorkspace, NOTIFY_TYPE } from '../notify.service.js';
import {
  assertProvisionable,
  releaseRentedNumber,
  rentNumber,
  seriesForRentedNumber,
} from './number.service.js';

/** Open requests one workspace may hold. A request is a hand-off to a person. */
export const MAX_PENDING_PER_WORKSPACE = 3;

/** Whether clients may rent directly. Superadmin always may. */
export const selfServeRentEnabled = () => process.env.PLIVO_SELF_SERVE_RENT === 'true';

const toE164 = (n) => {
  const digits = String(n ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
};

const clip = (s, n = 500) => (s ? String(s).slice(0, n) : null);

/**
 * Ask for a specific number.
 *
 * Checked as hard as a rent would be — approved application, right series, not
 * already held — so an admin never picks up a request that could not have been
 * fulfilled anyway.
 */
export async function createNumberRequest(workspaceId, { phoneNumber, note = null, requestedBy = null } = {}) {
  const gate = await assertProvisionable(workspaceId);
  if (!gate.ok) return gate;

  const number = toE164(phoneNumber);
  const series = seriesForRentedNumber(number, gate.record.useCase);
  if (series.error) return { ok: false, error: series.error };

  const held = await prisma.voiceNumber.findUnique({ where: { phoneNumber: number }, select: { workspaceId: true } });
  if (held) {
    return {
      ok: false,
      error: held.workspaceId === workspaceId
        ? 'This number is already assigned to this workspace.'
        : 'That number is already held by another customer.',
    };
  }

  const pending = await prisma.numberRequest.findMany({
    where: { workspaceId, status: NUMBER_REQUEST_STATUS.PENDING },
    select: { phoneNumber: true },
  });
  if (pending.some((p) => p.phoneNumber === number)) {
    return { ok: false, error: 'You have already requested this number.' };
  }
  if (pending.length >= MAX_PENDING_PER_WORKSPACE) {
    return {
      ok: false,
      error: `You already have ${pending.length} open requests. Wait for those to be handled, or cancel one.`,
    };
  }

  const request = await prisma.numberRequest.create({
    data: { workspaceId, phoneNumber: number, note: clip(note), requestedBy },
  });
  logger.info({ workspaceId, phoneNumber: number, requestId: request.id }, 'Number requested');
  return { ok: true, request };
}

/**
 * Ask for a number to be given back.
 *
 * Not done immediately, and not by the client, because releasing is
 * irreversible in a way that costs THEM: the number never comes back to anyone,
 * and the DLT header registration they spent days getting on their operator's
 * portal goes with it. So this is a request a person reads. What it does
 * guarantee is that there IS a way out of a recurring charge that does not
 * involve emailing support.
 *
 * The number keeps working, and keeps billing, until an admin actions it — said
 * plainly on the screen, because the opposite assumption is the expensive one.
 */
export async function createReleaseRequest(workspaceId, { numberId, note = null, requestedBy = null } = {}) {
  const number = await prisma.voiceNumber.findFirst({ where: { id: numberId, workspaceId } });
  if (!number) return { ok: false, error: 'Number not found in this workspace.' };
  if (number.status === VOICE_NUMBER_STATUS.RELEASED) {
    return { ok: false, error: 'That number has already been released.' };
  }

  const open = await prisma.numberRequest.findFirst({
    where: {
      workspaceId,
      voiceNumberId: numberId,
      kind: NUMBER_REQUEST_KIND.RELEASE,
      status: NUMBER_REQUEST_STATUS.PENDING,
    },
  });
  if (open) return { ok: false, error: 'You have already asked us to release this number.' };

  const request = await prisma.numberRequest.create({
    data: {
      workspaceId,
      kind: NUMBER_REQUEST_KIND.RELEASE,
      phoneNumber: number.phoneNumber,
      voiceNumberId: numberId,
      note: clip(note),
      requestedBy,
    },
  });
  logger.info({ workspaceId, phoneNumber: number.phoneNumber, requestId: request.id }, 'Number release requested');
  return { ok: true, request };
}

/** A workspace's own requests, newest first. */
export function listNumberRequests(workspaceId, { limit = 20 } = {}) {
  return prisma.numberRequest.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(1, Number(limit) || 20), 100),
  });
}

/** Withdraw an open request. */
export async function cancelNumberRequest(workspaceId, requestId) {
  const updated = await prisma.numberRequest.updateMany({
    where: { id: requestId, workspaceId, status: NUMBER_REQUEST_STATUS.PENDING },
    data: {
      status: NUMBER_REQUEST_STATUS.CANCELLED,
      resolvedAt: new Date(),
      resolution: 'Cancelled by the client.',
    },
  });
  return updated.count ? { ok: true } : { ok: false, error: 'No open request with that id.' };
}

// ── Admin side ──────────────────────────────────────────────────────────────

/** Requests across every workspace, oldest open ones first — the queue order. */
export function adminListNumberRequests({ status = NUMBER_REQUEST_STATUS.PENDING, kind = null, limit = 100 } = {}) {
  const where = {
    ...(status && status !== 'ALL' ? { status } : {}),
    ...(kind && kind !== 'ALL' ? { kind } : {}),
  };
  return prisma.numberRequest.findMany({
    where,
    orderBy: { createdAt: status === NUMBER_REQUEST_STATUS.PENDING ? 'asc' : 'desc' },
    take: Math.min(Math.max(1, Number(limit) || 100), 500),
    include: { workspace: { select: { id: true, name: true } } },
  });
}

/**
 * Fulfil a request: rent the number asked for (or a substitute the admin picked
 * when the original has gone, since Plivo holds nothing), or release it.
 *
 * A failed attempt leaves the request open with the error on it, so the next
 * person to look at the queue sees why.
 */
export async function fulfilNumberRequest(requestId, { phoneNumber = null, resolvedBy = null } = {}) {
  const request = await prisma.numberRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, status: 404, error: 'Request not found.' };
  if (request.status !== NUMBER_REQUEST_STATUS.PENDING) {
    return { ok: false, status: 409, error: `This request is already ${request.status.toLowerCase()}.` };
  }

  if (request.kind === NUMBER_REQUEST_KIND.RELEASE) {
    return fulfilReleaseRequest(request, { resolvedBy });
  }

  const number = phoneNumber ? toE164(phoneNumber) : request.phoneNumber;

  let result;
  try {
    result = await rentNumber(request.workspaceId, { phoneNumber: number });
  } catch (err) {
    await prisma.numberRequest.update({
      where: { id: requestId },
      data: { resolution: clip(`Attempt failed: ${err.message}`) },
    }).catch(() => {});
    throw err;
  }

  if (!result.ok) {
    await prisma.numberRequest.update({
      where: { id: requestId },
      data: { resolution: clip(`Attempt failed: ${result.error}`) },
    }).catch(() => {});
    return result;
  }

  await prisma.numberRequest.update({
    where: { id: requestId },
    data: {
      status: NUMBER_REQUEST_STATUS.FULFILLED,
      resolvedAt: new Date(),
      resolvedBy,
      voiceNumberId: result.number?.id ?? null,
      resolution: number !== request.phoneNumber ? `Fulfilled with ${number} instead.` : null,
    },
  });

  await notifyWorkspace(request.workspaceId, {
    title: 'Your phone number is ready',
    message: `${number} has been added to your workspace.`,
    details: 'Before calls will connect, register it as a header under your DLT Principal Entity on your operator\'s portal, then mark it registered on the Phone numbers page.',
    type: NOTIFY_TYPE.SUCCESS,
    actionText: 'View numbers',
    actionLink: '/phone_numbers',
    email: true,
  });

  return { ok: true, number: result.number };
}

/**
 * Give the number back at the carrier and close the request.
 *
 * releaseRentedNumber() calls the carrier FIRST and only records the release if
 * that succeeded — a row marked released while Plivo still bills us is the
 * exact drift it exists to prevent — so a failure here leaves the request open
 * with the reason on it and the number still working.
 */
async function fulfilReleaseRequest(request, { resolvedBy = null } = {}) {
  let result;
  try {
    result = await releaseRentedNumber(request.workspaceId, { numberId: request.voiceNumberId });
  } catch (err) {
    await prisma.numberRequest.update({
      where: { id: request.id },
      data: { resolution: clip(`Release failed: ${err.message}`) },
    }).catch(() => {});
    throw err;
  }

  if (!result.ok) {
    await prisma.numberRequest.update({
      where: { id: request.id },
      data: { resolution: clip(`Release failed: ${result.error}`) },
    }).catch(() => {});
    return result;
  }

  await prisma.numberRequest.update({
    where: { id: request.id },
    data: {
      status: NUMBER_REQUEST_STATUS.FULFILLED,
      resolvedAt: new Date(),
      resolvedBy,
    },
  });

  await notifyWorkspace(request.workspaceId, {
    title: `${request.phoneNumber} has been released`,
    message: 'The number has been given back to the carrier and you will not be billed for it again.',
    details: 'It cannot be recovered, and its DLT header registration has gone with it. A replacement number needs a fresh header application on your operator\'s portal.',
    type: NOTIFY_TYPE.INFO,
    actionText: 'View numbers',
    actionLink: '/phone_numbers',
    email: true,
  });

  return { ok: true, released: request.phoneNumber };
}

/** Decline an open request, telling the client why. */
export async function declineNumberRequest(requestId, { reason = null, resolvedBy = null } = {}) {
  const updated = await prisma.numberRequest.updateMany({
    where: { id: requestId, status: NUMBER_REQUEST_STATUS.PENDING },
    data: {
      status: NUMBER_REQUEST_STATUS.DECLINED,
      resolvedAt: new Date(),
      resolvedBy,
      resolution: clip(reason) || 'Declined.',
    },
  });
  if (!updated.count) return { ok: false, status: 409, error: 'No open request with that id.' };

  const request = await prisma.numberRequest.findUnique({ where: { id: requestId } });
  const releasing = request.kind === NUMBER_REQUEST_KIND.RELEASE;
  await notifyWorkspace(request.workspaceId, {
    title: releasing
      ? `${request.phoneNumber} has not been released`
      : 'We could not allocate the number you asked for',
    message: releasing
      // Said explicitly: the charge continues, which is the whole reason they
      // asked, and silence here reads as "done".
      ? `${request.phoneNumber} is still yours and its monthly rental still applies.`
      : `${request.phoneNumber} was not allocated. You have not been charged.`,
    details: reason || null,
    type: NOTIFY_TYPE.WARNING,
    actionText: releasing ? 'View numbers' : 'Pick another number',
    actionLink: releasing ? '/phone_numbers' : '/number_verification',
    email: true,
  });
  return { ok: true };
}
