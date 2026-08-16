// Broadcast lifecycle: build the list, launch it, pause it, price it.
//
// The list comes from the SAME contacts and clusters bulk calling dials —
// `resolveClusterContacts` is shared, not reimplemented — so a list built for a
// campaign can be broadcast to without a second import, and an opt-out recorded
// on either side is honoured by both.

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { BROADCAST_STATUS } from '../../constants/broadcastStatus.js';
import { resolveClusterContacts } from '../contact.service.js';
import { runBroadcast, requestStop, syncProgress } from './broadcastRunner.service.js';
import { estimateBroadcast, quotePerCall } from './broadcastSettlement.service.js';
import { broadcastReadiness } from './broadcastCall.service.js';

const RECIPIENT_CHUNK = 500;

const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

export const listBroadcasts = (workspaceId) =>
  prisma.broadcast.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: { recording: { select: { id: true, name: true, durationSec: true, source: true } } },
  });

export const getBroadcast = (workspaceId, broadcastId) =>
  prisma.broadcast.findFirstOrThrow({
    where: { id: broadcastId, workspaceId },
    include: { recording: true },
  });

/**
 * Create a broadcast from one or more clusters.
 *
 * The resolved contacts are written out as BroadcastRecipient rows immediately,
 * which is what makes the dispatcher resumable and idempotent (unique on
 * broadcastId + phoneNumber). Those rows are a snapshot: editing a cluster
 * afterwards does not silently change a send that is already running — see
 * syncBroadcastList for the deliberate way to top one up.
 */
export async function createBroadcast(workspaceId, {
  name, recordingId, clusterIds = [], fromNumbers = [], repeatCount = 1, createdById = null,
}) {
  const title = String(name ?? '').trim();
  if (!title) throw badRequest('Give this broadcast a name');
  if (!recordingId) throw badRequest('Pick the recording this broadcast will play');
  if (!fromNumbers.length) throw badRequest('Pick at least one caller ID to broadcast from');

  const recording = await prisma.broadcastRecording.findFirst({
    where: { id: recordingId, workspaceId },
  });
  if (!recording) throw Object.assign(new Error('That recording no longer exists'), { statusCode: 404 });

  const contacts = await resolveClusterContacts(workspaceId, clusterIds);
  if (!contacts.length) {
    throw badRequest(
      'The selected list has no dialable contacts. Contacts that opted out or failed validation are '
      + 'never dialled.',
    );
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      workspaceId,
      name: title,
      recordingId,
      clusterIds,
      fromNumbers,
      // Kept in step so the list view has something to show without unpacking
      // the array, exactly as Campaign.fromNumber does.
      fromNumber: fromNumbers[0] ?? null,
      repeatCount: Math.min(Math.max(Number(repeatCount) || 1, 1), 5),
      status: BROADCAST_STATUS.DRAFT,
      totalRecipients: contacts.length,
      createdById,
    },
  });

  for (let i = 0; i < contacts.length; i += RECIPIENT_CHUNK) {
    await prisma.broadcastRecipient.createMany({
      data: contacts.slice(i, i + RECIPIENT_CHUNK).map((c) => ({
        broadcastId: broadcast.id,
        phoneNumber: c.phoneNumber,
        contactId: c.id,
      })),
      skipDuplicates: true,
    });
  }

  return prisma.broadcast.findUnique({
    where: { id: broadcast.id },
    include: { recording: true },
  });
}

/** Statuses whose recipient list can still be topped up. */
const SYNCABLE = new Set([
  BROADCAST_STATUS.DRAFT,
  BROADCAST_STATUS.SCHEDULED,
  BROADCAST_STATUS.PAUSED,
  BROADCAST_STATUS.FAILED,
]);

/**
 * Pull in contacts added to this broadcast's clusters since it was created.
 *
 * Already-dialled recipients are untouched — skipDuplicates on
 * (broadcastId, phoneNumber) guarantees it — so this can never re-call someone.
 */
export async function syncBroadcastList(workspaceId, broadcastId) {
  const broadcast = await prisma.broadcast.findFirstOrThrow({ where: { id: broadcastId, workspaceId } });
  if (!SYNCABLE.has(broadcast.status)) {
    throw conflict(`A ${broadcast.status.toLowerCase()} broadcast cannot take on new numbers — pause it first`);
  }
  const clusterIds = Array.isArray(broadcast.clusterIds) ? broadcast.clusterIds : [];
  if (!clusterIds.length) throw badRequest('This broadcast was not built from a cluster, so there is nothing to sync');

  const contacts = await resolveClusterContacts(workspaceId, clusterIds);
  let added = 0;
  for (let i = 0; i < contacts.length; i += RECIPIENT_CHUNK) {
    const { count } = await prisma.broadcastRecipient.createMany({
      data: contacts.slice(i, i + RECIPIENT_CHUNK).map((c) => ({
        broadcastId,
        phoneNumber: c.phoneNumber,
        contactId: c.id,
      })),
      skipDuplicates: true,
    });
    added += count;
  }

  const total = await prisma.broadcastRecipient.count({ where: { broadcastId } });
  const updated = await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { totalRecipients: total },
  });
  return { ...updated, added };
}

export const updateBroadcast = async (workspaceId, broadcastId, data) => {
  const broadcast = await prisma.broadcast.findFirstOrThrow({ where: { id: broadcastId, workspaceId } });
  if (broadcast.status === BROADCAST_STATUS.RUNNING) {
    throw conflict('Pause this broadcast before editing it');
  }
  return prisma.broadcast.update({ where: { id: broadcastId }, data });
};

export const deleteBroadcast = async (workspaceId, broadcastId) => {
  const broadcast = await prisma.broadcast.findFirstOrThrow({ where: { id: broadcastId, workspaceId } });
  if (broadcast.status === BROADCAST_STATUS.RUNNING) {
    throw conflict('Cancel this broadcast before deleting it');
  }
  await prisma.broadcast.delete({ where: { id: broadcastId } });
  return { deleted: true };
};

// A broadcast can be started from DRAFT/SCHEDULED/FAILED (fresh) or PAUSED (resume).
const STARTABLE = new Set([
  BROADCAST_STATUS.DRAFT,
  BROADCAST_STATUS.SCHEDULED,
  BROADCAST_STATUS.PAUSED,
  BROADCAST_STATUS.FAILED,
]);

/**
 * Start (or resume) a broadcast.
 *
 * Runs in-process, fire-and-forget, for the same reason the campaign dispatcher
 * falls back to it: Redis in this deployment drops to "memory mode" on error,
 * and a Start that returns 200 while placing no calls is the worst possible
 * failure — it is indistinguishable from success. The loop is resumable from row
 * state, so a restart mid-send continues rather than re-dialling.
 */
export async function startBroadcast(workspaceId, broadcastId) {
  const broadcast = await prisma.broadcast.findFirstOrThrow({ where: { id: broadcastId, workspaceId } });

  if (!STARTABLE.has(broadcast.status)) {
    throw conflict(`Broadcast cannot be started while it is ${broadcast.status}`);
  }

  const pending = await prisma.broadcastRecipient.count({ where: { broadcastId, status: 'pending' } });
  if (!pending) throw conflict('This broadcast has no pending recipients left to call');

  const updated = await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      status: BROADCAST_STATUS.RUNNING,
      lastError: null,
      scheduledAt: null,
      launchedAt: broadcast.launchedAt ?? new Date(),
    },
  });

  runBroadcast(broadcastId, workspaceId).catch((err) =>
    logger.error({ broadcastId, err }, 'In-process broadcast dispatch failed'));

  return { ...updated, pending };
}

/**
 * Schedule a broadcast for later, or start it now when no time is given.
 *
 * The timer lives in this process. That is honest about what it is — a restart
 * before the fire time leaves the broadcast SCHEDULED and undialled — which is
 * why `sweepDueBroadcasts` exists and runs at boot.
 */
export async function launchBroadcast(workspaceId, broadcastId, scheduledAt) {
  if (!scheduledAt) return startBroadcast(workspaceId, broadcastId);

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) throw badRequest('That scheduled time is not a valid date');
  if (when.getTime() < Date.now() - 60_000) throw badRequest('That scheduled time is in the past');

  const broadcast = await prisma.broadcast.findFirstOrThrow({ where: { id: broadcastId, workspaceId } });
  if (!STARTABLE.has(broadcast.status)) {
    throw conflict(`Broadcast cannot be scheduled while it is ${broadcast.status}`);
  }

  const updated = await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: BROADCAST_STATUS.SCHEDULED, scheduledAt: when, lastError: null },
  });

  scheduleTimer(broadcastId, workspaceId, when.getTime() - Date.now());
  return updated;
}

// In-process timers for scheduled sends. Keyed so re-scheduling replaces rather
// than stacks a second timer that would dial the same list twice.
const timers = new Map();

function scheduleTimer(broadcastId, workspaceId, delayMs) {
  clearTimeout(timers.get(broadcastId));
  // setTimeout's delay is a signed 32-bit int; anything longer fires
  // immediately, which for a broadcast means dialling a list weeks early. The
  // boot sweep picks up sends beyond that horizon instead.
  const MAX_TIMER_MS = 2 ** 31 - 1;
  if (delayMs > MAX_TIMER_MS) return;

  const timer = setTimeout(async () => {
    timers.delete(broadcastId);
    try {
      const row = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
      if (!row || row.status !== BROADCAST_STATUS.SCHEDULED) return;
      await startBroadcast(workspaceId, broadcastId);
    } catch (err) {
      logger.error({ broadcastId, err: err.message }, 'Scheduled broadcast failed to start');
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: BROADCAST_STATUS.FAILED, lastError: err.message?.slice(0, 500) },
      }).catch(() => {});
    }
  }, Math.max(0, delayMs));

  timer.unref?.();
  timers.set(broadcastId, timer);
}

/**
 * Re-arm scheduled broadcasts after a restart, and start any that came due while
 * the process was down.
 *
 * Called from server startup. Without it, "scheduled for 9am" quietly means
 * "scheduled for 9am unless we deploy tonight".
 */
export async function sweepDueBroadcasts() {
  const scheduled = await prisma.broadcast.findMany({
    where: { status: BROADCAST_STATUS.SCHEDULED },
    select: { id: true, workspaceId: true, scheduledAt: true },
  });

  for (const row of scheduled) {
    const delay = (row.scheduledAt?.getTime() ?? 0) - Date.now();
    if (delay <= 0) {
      logger.info({ broadcastId: row.id }, 'Starting a broadcast that came due while the server was down');
      startBroadcast(row.workspaceId, row.id).catch((err) =>
        logger.error({ broadcastId: row.id, err: err.message }, 'Overdue broadcast could not start'));
    } else {
      scheduleTimer(row.id, row.workspaceId, delay);
    }
  }
  return scheduled.length;
}

/** Stop after the in-flight dial; pending recipients stay pending so it can resume. */
export async function pauseBroadcast(workspaceId, broadcastId) {
  const broadcast = await prisma.broadcast.findFirstOrThrow({ where: { id: broadcastId, workspaceId } });
  if (broadcast.status !== BROADCAST_STATUS.RUNNING && broadcast.status !== BROADCAST_STATUS.SCHEDULED) {
    throw conflict(`Only a running or scheduled broadcast can be paused (this one is ${broadcast.status})`);
  }
  requestStop(broadcastId);
  clearTimeout(timers.get(broadcastId));
  timers.delete(broadcastId);
  return prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: BROADCAST_STATUS.PAUSED },
  });
}

export async function cancelBroadcast(workspaceId, broadcastId) {
  await prisma.broadcast.findFirstOrThrow({ where: { id: broadcastId, workspaceId } });
  requestStop(broadcastId);
  clearTimeout(timers.get(broadcastId));
  timers.delete(broadcastId);

  // Retire the queue so a resumed or duplicated dispatch cannot pick them up
  // later. Dials already with the carrier are left alone — they are out of our
  // hands and their outcome still has to be recorded and billed honestly.
  await prisma.broadcastRecipient.updateMany({
    where: { broadcastId, status: 'pending' },
    data: { status: 'skipped', failureReason: 'broadcast_cancelled', billingStatus: 'SKIPPED' },
  });

  await syncProgress(broadcastId);
  return prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: BROADCAST_STATUS.CANCELLED, completedAt: new Date() },
  });
}

/**
 * Everything the detail view needs: the send, its outcome breakdown, and what it
 * has actually cost so far.
 */
export async function getBroadcastStats(workspaceId, broadcastId) {
  const broadcast = await getBroadcast(workspaceId, broadcastId);
  const breakdown = await prisma.broadcastRecipient.groupBy({
    by: ['status'],
    where: { broadcastId },
    _count: { status: true },
  });
  const billed = await prisma.broadcastRecipient.aggregate({
    where: { broadcastId, billingStatus: 'BILLED' },
    _sum: { billedCents: true, durationSec: true },
    _count: true,
  });

  return {
    broadcast,
    breakdown,
    billing: {
      billedCalls: billed._count ?? 0,
      billedCents: billed._sum.billedCents ?? 0,
      billedSeconds: billed._sum.durationSec ?? 0,
    },
  };
}

/** Per-recipient outcomes, for the detail table and for exporting a delivery report. */
export const listRecipients = (workspaceId, broadcastId, { status, take = 200, skip = 0 } = {}) =>
  prisma.broadcastRecipient.findMany({
    where: {
      broadcastId,
      broadcast: { workspaceId },
      ...(status ? { status } : {}),
    },
    orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
    take: Math.min(Number(take) || 200, 1000),
    skip: Number(skip) || 0,
    include: { contact: { select: { name: true } } },
  });

/**
 * Price a broadcast before it exists.
 *
 * Answered before anything is created, because "what will this cost" is the
 * question people actually ask first, and answering it only after the list is
 * built makes the estimate feel like a commitment.
 */
export async function previewBroadcastCost(workspaceId, { recordingId, clusterIds = [], repeatCount = 1 }) {
  const recording = recordingId
    ? await prisma.broadcastRecording.findFirst({ where: { id: recordingId, workspaceId } })
    : null;
  const contacts = clusterIds.length ? await resolveClusterContacts(workspaceId, clusterIds) : [];

  const estimate = await estimateBroadcast({
    recipients: contacts.length,
    durationSec: recording?.durationSec ?? 0,
    repeatCount,
  });

  return {
    ...estimate,
    recordingSec: recording?.durationSec ?? 0,
    repeatCount: Math.min(Math.max(Number(repeatCount) || 1, 1), 5),
  };
}

/** Can these caller IDs broadcast at all? Asked by the wizard before launch, not after. */
export async function checkCallerReadiness(fromNumbers = []) {
  const results = [];
  for (const from of fromNumbers) {
    // Sequential on purpose: this is at most a handful of numbers, and each
    // check is a VoiceNumber lookup that would otherwise stampede the pool.
    results.push({ fromNumber: from, ...(await broadcastReadiness(from)) });
  }
  return { ready: results.every((r) => r.ready), numbers: results };
}

export { quotePerCall };
