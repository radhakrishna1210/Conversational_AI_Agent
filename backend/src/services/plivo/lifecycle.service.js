// A workspace's standing at the carrier: the kill switch, suspension, and
// offboarding.
//
// WorkspaceCompliance.suspended is OUR gate — assertComplianceReady refuses the
// dial. PlivoSubaccount.enabled is the CARRIER's — Plivo refuses it. They are
// meant to say the same thing, and until this module nothing kept them in step:
// the kill switch existed and was never pulled. Everything that suspends or
// reinstates a workspace comes through here so the two cannot drift.

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import {
  NUMBER_REQUEST_STATUS,
  TELEPHONY_PROVIDER,
  VOICE_NUMBER_STATUS,
} from '../../constants/compliance.js';
import { review, releaseNumber as recordRelease } from '../compliance/compliance.service.js';
import { isPlivoConfigured } from './client.js';
import { releaseRentedNumber } from './number.service.js';
import { deleteSubaccount, getSubaccount, setSubaccountEnabled } from './subaccount.service.js';

/**
 * Make the carrier agree with us about whether this workspace may call.
 *
 * Never throws. The callers are a carrier webhook that must still record the
 * status it carried, and an admin action that has already changed our own gate
 * — our gate is the one that matters for every path we control, so a carrier
 * outage here is reported rather than allowed to undo it.
 *
 * @returns {Promise<{ok: boolean, changed: boolean, reason?: string, error?: string}>}
 */
export async function syncCarrierAccess(workspaceId, { enabled }) {
  const row = await getSubaccount(workspaceId);
  if (!row) return { ok: true, changed: false, reason: 'no subaccount' };
  if (row.enabled === Boolean(enabled)) return { ok: true, changed: false };
  if (!isPlivoConfigured()) {
    return { ok: false, changed: false, error: 'Plivo is not configured on this server.' };
  }

  try {
    await setSubaccountEnabled(workspaceId, enabled);
    logger.warn({ workspaceId, enabled: Boolean(enabled) }, 'Carrier access for this workspace changed');
    return { ok: true, changed: true };
  } catch (err) {
    logger.error(
      { workspaceId, enabled: Boolean(enabled), err: err.message },
      'Could not change carrier access — the kill switch did NOT take effect at the carrier',
    );
    return { ok: false, changed: false, error: err.message };
  }
}

/**
 * Suspend or reinstate a workspace's calling: our gate, then the carrier's.
 *
 * Reinstating does not re-approve anything. A workspace suspended because the
 * carrier revoked its compliance application still has a REJECTED application
 * after this; lifting the suspension is the platform's call to make, and the
 * admin screen shows the application status next to the button.
 */
export async function setWorkspaceSuspension(workspaceId, { suspended, reason = null }) {
  const result = await review(workspaceId, {
    suspended: Boolean(suspended),
    suspendedReason: suspended ? (reason || 'Suspended by the platform.') : null,
  });
  if (!result.ok) return result;

  const carrier = await syncCarrierAccess(workspaceId, { enabled: !suspended });
  return { ok: true, carrier };
}

/**
 * Take a workspace off the carrier entirely.
 *
 * Releases every number it holds, deletes its subaccount with cascade=true, and
 * suspends it. The order is deliberate: each number is released on its own
 * first so our rows record exactly which ones went, and the cascade on the
 * subaccount delete is the backstop for any the per-number release could not
 * reach — those are then recorded as released too, because the carrier no
 * longer holds them.
 *
 * Not reversible. Released numbers are never reissued (their DLT headers and
 * reputation belong to this client), and a new subaccount would be a new one.
 */
export async function offboardWorkspace(workspaceId, { reason = null } = {}) {
  const numbers = await prisma.voiceNumber.findMany({
    where: {
      workspaceId,
      provider: TELEPHONY_PROVIDER.PLIVO,
      status: { not: VOICE_NUMBER_STATUS.RELEASED },
    },
    select: { id: true, phoneNumber: true },
  });

  const released = [];
  const failed = [];
  for (const n of numbers) {
    try {
      const r = await releaseRentedNumber(workspaceId, { numberId: n.id });
      if (r.ok) released.push(n.phoneNumber);
      else failed.push({ numberId: n.id, phoneNumber: n.phoneNumber, error: r.error });
    } catch (err) {
      failed.push({ numberId: n.id, phoneNumber: n.phoneNumber, error: err.message });
    }
  }

  let subaccount;
  try {
    subaccount = await deleteSubaccount(workspaceId, { cascade: true });
  } catch (err) {
    subaccount = { deleted: false, error: err.message };
  }

  if (subaccount.deleted) {
    for (const f of failed) {
      const recorded = await recordRelease(workspaceId, { numberId: f.numberId }).catch(() => ({ ok: false }));
      f.releasedByCascade = Boolean(recorded.ok);
    }
  }

  const cancelled = await prisma.numberRequest.updateMany({
    where: { workspaceId, status: NUMBER_REQUEST_STATUS.PENDING },
    data: { status: NUMBER_REQUEST_STATUS.CANCELLED, resolvedAt: new Date(), resolution: 'Workspace offboarded.' },
  });

  await review(workspaceId, {
    suspended: true,
    suspendedReason: reason || 'Offboarded: numbers released and the carrier account closed.',
  });

  const complete = !subaccount.error && failed.every((f) => f.releasedByCascade);
  logger[complete ? 'warn' : 'error'](
    { workspaceId, released: released.length, failed: failed.length, subaccount },
    complete ? 'Offboarded a workspace from the carrier' : 'Offboarding left carrier resources behind',
  );

  return { ok: complete, released, failed, subaccount, cancelledRequests: cancelled.count };
}
