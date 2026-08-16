// The broadcast dispatcher.
//
// Structurally the same machine as campaignRunner.service.js — resumable from
// row state, paced, pausable mid-flight, opt-out aware — because those
// properties were not incidental there and are not optional here. Where it
// differs, it differs for a reason worth stating:
//
//   NO AGENT             There is nothing to resolve a call mode from. The
//                        recording IS the call.
//   THE OUTCOME IS ASYNC A conversational call learns its own duration from the
//                        socket that closes. A broadcast has no socket: the
//                        carrier tells us how long the answered leg was, later,
//                        on a webhook. So a dial does not end at 'sent' — it
//                        ends at 'calling', and something else finishes it. That
//                        is what `reapStalledDials` is for: a webhook that never
//                        arrives must not leave a row claiming to be in progress
//                        forever.
//   PACED PER MINUTE     Concurrency is meaningless for calls nobody answers
//                        interactively; what matters is not putting 10,000 dials
//                        into one carrier minute, for the carrier's rate limits
//                        and for the caller ID's reputation.
//   BILLED PER DIAL      The wallet is checked before each dial and the charge
//                        lands when the outcome does. An unanswered dial costs
//                        the customer nothing, because it costs us nothing.

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { BROADCAST_STATUS } from '../../constants/broadcastStatus.js';
import { assertRotationCompliant } from '../compliance/compliance.service.js';
import { placeBroadcastCall, broadcastReadiness } from './broadcastCall.service.js';
import { assertCanDial, quotePerCall } from './broadcastSettlement.service.js';
import { checkConcurrency, releaseSlot } from '../telephony/concurrency.js';

/** Broadcasts being dispatched by THIS process — guards against double dialling. */
const active = new Map(); // broadcastId -> { stop: boolean }

/**
 * Dials per minute. The pacer.
 *
 * 60/min is deliberately conservative: an Indian caller ID that suddenly emits
 * hundreds of short unanswered calls a minute is the exact signature carriers
 * filter on, and a filtered number is a far more expensive problem than a
 * broadcast finishing an hour later. See DIALING_HYGIENE_PLAN.md.
 */
const DIALS_PER_MINUTE = Number(process.env.BROADCAST_DIALS_PER_MINUTE || 60);
const DIAL_SPACING_MS = Math.max(50, Math.round(60_000 / Math.max(1, DIALS_PER_MINUTE)));
const BATCH_SIZE = Number(process.env.BROADCAST_BATCH_SIZE || 50);

/**
 * How long a dial may sit in 'calling' before it is presumed lost.
 *
 * Generous against the longest thing that can legitimately happen: ring timeout
 * (30s) plus the recording (≤300s) plus carrier callback latency. Anything past
 * this is a webhook that never came — a signature mismatch, a network drop, a
 * restart — and the row is closed unbilled rather than left claiming to be live.
 */
const STALLED_DIAL_MS = Number(process.env.BROADCAST_STALLED_DIAL_MS || 15 * 60 * 1000);

/** How long to wait when the carrier's concurrent-call pool is full. */
const CONCURRENCY_WAIT_MS = Number(process.env.BROADCAST_CONCURRENCY_WAIT_MS || 15_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const isRunning = (broadcastId) => active.has(broadcastId);

/** Ask a running dispatch loop to stop at the next safe point. */
export function requestStop(broadcastId) {
  const entry = active.get(broadcastId);
  if (entry) entry.stop = true;
  return Boolean(entry);
}

/** Caller IDs to rotate across the dials. Falls back to the single number. */
export function callerRotation(broadcast) {
  const many = Array.isArray(broadcast.fromNumbers) ? broadcast.fromNumbers.filter(Boolean) : [];
  if (many.length) return many;
  return broadcast.fromNumber ? [broadcast.fromNumber] : [];
}

/**
 * Close out dials whose carrier callback never arrived.
 *
 * Unbilled, deliberately: the real duration is unknown and charging a guess is
 * worse than not charging. But they must leave PENDING, or the broadcast never
 * completes and the row reads as an unresolved bill forever.
 */
export async function reapStalledDials(broadcastId) {
  const cutoff = new Date(Date.now() - STALLED_DIAL_MS);

  // Read the ids before the update, so the concurrency slots these dials are
  // still holding can be handed back. concurrency.js has its own much longer
  // sweep, but at 15 minutes this one fires first, and a stalled dial holding a
  // slot for another 50 minutes is a slot a live campaign cannot use.
  const stalled = await prisma.broadcastRecipient.findMany({
    where: { broadcastId, status: 'calling', startedAt: { lt: cutoff } },
    select: { id: true },
  }).catch(() => []);

  const { count } = await prisma.broadcastRecipient.updateMany({
    where: { broadcastId, status: 'calling', startedAt: { lt: cutoff } },
    data: {
      status: 'failed',
      failureReason: 'no_carrier_callback',
      billingStatus: 'SKIPPED',
      endedAt: new Date(),
    },
  });

  for (const row of stalled) releaseSlot(row.id);

  if (count > 0) {
    logger.warn({ broadcastId, count }, 'Closed broadcast dials whose carrier callback never arrived');
  }
  return count;
}

/** Recompute the counters the UI shows. Derived from rows, never incremented blindly. */
export async function syncProgress(broadcastId) {
  const rows = await prisma.broadcastRecipient.groupBy({
    by: ['status'],
    where: { broadcastId },
    _count: { status: true },
  });
  const count = (s) => rows.find((r) => r.status === s)?._count.status ?? 0;

  const answered = count('answered');
  const failed = count('failed');
  const noAnswer = count('no_answer');
  const skipped = count('skipped');
  const total = rows.reduce((a, r) => a + r._count.status, 0);
  const done = answered + failed + noAnswer + skipped;

  // Spend comes from the rows that were actually charged, so the figure on the
  // broadcast can always be reconciled against the ledger line by line.
  const spent = await prisma.broadcastRecipient.aggregate({
    where: { broadcastId, billingStatus: 'BILLED' },
    _sum: { billedCents: true },
  });

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      answered,
      // "failed" on the broadcast means "did not reach anyone", which is what an
      // operator means by it — a rejected dial and a phone that rang out are the
      // same outcome to them, and both are unbilled.
      failed: failed + noAnswer,
      totalRecipients: total,
      progress: total ? Math.round((done / total) * 100) : 0,
      spentCents: spent._sum.billedCents ?? 0,
    },
  }).catch((e) => logger.warn(`Broadcast ${broadcastId}: could not sync progress: ${e.message}`));

  return { total, done, answered, failed: failed + noAnswer, skipped };
}

async function finish(broadcastId, status, lastError = null) {
  await syncProgress(broadcastId);
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      status,
      lastError,
      ...(status === BROADCAST_STATUS.COMPLETED ? { completedAt: new Date() } : {}),
    },
  }).catch(() => {});
  logger.info({ broadcastId, status }, 'Broadcast dispatch finished');
}

/**
 * Dial every pending recipient of a broadcast.
 *
 * Safe to call again after a crash, a pause, or a restart: it only ever looks at
 * rows still marked pending, and the unique index on (broadcastId, phoneNumber)
 * means the list itself cannot grow a duplicate.
 */
export async function runBroadcast(broadcastId, workspaceId) {
  if (active.has(broadcastId)) {
    logger.info({ broadcastId }, 'Broadcast already dispatching in this process — ignoring duplicate start');
    return { started: false, reason: 'already-running' };
  }
  const control = { stop: false };
  active.set(broadcastId, control);

  try {
    const broadcast = await prisma.broadcast.findFirst({
      where: { id: broadcastId, workspaceId },
      include: { recording: true },
    });
    if (!broadcast) return { started: false, reason: 'not-found' };
    if (!broadcast.recording) {
      await finish(broadcastId, BROADCAST_STATUS.FAILED, 'This broadcast has no recording to play.');
      return { started: false, reason: 'no-recording' };
    }

    const rotation = callerRotation(broadcast);
    if (!rotation.length) {
      await finish(broadcastId, BROADCAST_STATUS.FAILED, 'This broadcast has no caller ID to dial from.');
      return { started: false, reason: 'telephony' };
    }

    // Every caller ID, not just the first: a rotation can span carriers, and one
    // carrier in it that cannot play audio would silently fail its whole share
    // of the calls, one row at a time, with the reason buried per recipient.
    for (const from of rotation) {
      const ready = await broadcastReadiness(from);
      if (!ready.ready) {
        await finish(broadcastId, BROADCAST_STATUS.FAILED, `${from}: ${ready.error}`);
        return { started: false, reason: 'telephony' };
      }
    }

    // DLT gate, before the first dial. A pre-recorded promotional call is the
    // most heavily regulated thing this platform can do in India, and finding
    // out on recipient 4,000 means 3,999 unregistered commercial calls already
    // went out. Non-Indian caller IDs pass through untouched.
    const dlt = await assertRotationCompliant(workspaceId, rotation);
    if (!dlt.allowed) {
      await finish(broadcastId, BROADCAST_STATUS.FAILED, dlt.message);
      return { started: false, reason: 'compliance' };
    }

    const { perCallCents } = await quotePerCall(broadcast.recording.durationSec, broadcast.repeatCount);

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        status: BROADCAST_STATUS.RUNNING,
        lastError: null,
        launchedAt: broadcast.launchedAt ?? new Date(),
      },
    });
    logger.info(
      { broadcastId, callers: rotation.length, seconds: broadcast.recording.durationSec, perCallCents },
      'Broadcast dispatch started',
    );

    let dialled = 0;
    let rotationIndex = 0;

    for (;;) {
      if (control.stop) { await finish(broadcastId, BROADCAST_STATUS.PAUSED); return { started: true, dialled }; }

      // Re-read status each batch so Pause/Cancel from the UI takes effect
      // without reaching into this loop.
      const current = await prisma.broadcast.findUnique({
        where: { id: broadcastId },
        select: { status: true },
      });
      if (!current) return { started: true, dialled };
      if (current.status === BROADCAST_STATUS.CANCELLED || current.status === BROADCAST_STATUS.PAUSED) {
        await syncProgress(broadcastId);
        return { started: true, dialled };
      }

      // Once per batch, not per call: a workspace can be suspended or a header
      // revoked while a long broadcast is mid-flight, and the gate exists to
      // stop the traffic then.
      const stillCompliant = await assertRotationCompliant(workspaceId, rotation);
      if (!stillCompliant.allowed) {
        logger.warn({ broadcastId, code: stillCompliant.code }, `Broadcast paused mid-flight: ${stillCompliant.message}`);
        await finish(broadcastId, BROADCAST_STATUS.PAUSED, stillCompliant.message);
        return { started: true, dialled };
      }

      await reapStalledDials(broadcastId);

      const batch = await prisma.broadcastRecipient.findMany({
        where: { broadcastId, status: 'pending' },
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
      });

      if (!batch.length) {
        // Dials still out with the carrier are not finished business: their
        // outcome (and their charge) arrives on a webhook. Wait for them rather
        // than declaring a broadcast complete while calls are still ringing.
        const outstanding = await prisma.broadcastRecipient.count({
          where: { broadcastId, status: 'calling' },
        });
        if (outstanding > 0) {
          await syncProgress(broadcastId);
          await sleep(5_000);
          continue;
        }
        await finish(broadcastId, BROADCAST_STATUS.COMPLETED);
        return { started: true, dialled };
      }

      // Opt-outs are honoured mid-flight, not just at list build time. Someone
      // who says "stop calling me" on call 300 must not be dialled at 3,000
      // because the recipient rows were frozen an hour earlier.
      const linked = batch.map((r) => r.contactId).filter(Boolean);
      const blocked = new Set(
        linked.length
          ? (await prisma.contact.findMany({
            where: { id: { in: linked }, NOT: { status: 'ACTIVE' } },
            select: { id: true },
          })).map((c) => c.id)
          : [],
      );

      for (const recipient of batch) {
        if (control.stop) break;

        if (recipient.contactId && blocked.has(recipient.contactId)) {
          await prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: 'skipped', failureReason: 'contact_not_callable', billingStatus: 'SKIPPED' },
          }).catch(() => {});
          continue;
        }

        // Wait out a full carrier pool rather than pausing the send.
        //
        // Unlike the wallet below, this is transient and self-clearing: the
        // slots belong to calls that are ending on their own. Pausing a
        // broadcast because a campaign happened to be mid-flight would need a
        // human to restart it, for a condition that resolves in seconds.
        let slot = await checkConcurrency(workspaceId);
        while (!slot.allowed && !control.stop) {
          await sleep(CONCURRENCY_WAIT_MS);
          const still = await prisma.broadcast.findUnique({
            where: { id: broadcastId }, select: { status: true },
          });
          if (!still || still.status === BROADCAST_STATUS.CANCELLED || still.status === BROADCAST_STATUS.PAUSED) {
            await syncProgress(broadcastId);
            return { started: true, dialled };
          }
          slot = await checkConcurrency(workspaceId);
        }
        if (control.stop) break;

        // The wallet is the only thing that bounds a broadcast. Running out is
        // not going to fix itself by waiting, so pause rather than burn through
        // the remaining recipients marking them all failed.
        const gate = await assertCanDial(workspaceId, perCallCents);
        if (!gate.allowed) {
          logger.warn({ broadcastId, code: gate.code }, `Broadcast paused: ${gate.message}`);
          await finish(broadcastId, BROADCAST_STATUS.PAUSED, gate.message);
          return { started: true, dialled };
        }

        const from = rotation[rotationIndex % rotation.length];
        rotationIndex += 1;

        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: 'calling', startedAt: new Date(), fromNumber: from, attempts: { increment: 1 } },
        }).catch(() => {});

        const result = await placeBroadcastCall({
          recording: broadcast.recording,
          recipientId: recipient.id,
          toNumber: recipient.phoneNumber,
          fromNumber: from,
          repeat: broadcast.repeatCount,
          workspaceId,
        });

        if (result.ok) {
          dialled += 1;
          // Stays 'calling'. The carrier's callback is what makes it answered or
          // not — claiming success here would bill nothing and report everything
          // as delivered, which is the exact lie the old simulated campaign told.
          await prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: { providerCallId: result.callId ?? null, provider: result.provider },
          }).catch(() => {});

          if (recipient.contactId) {
            await prisma.contact.update({
              where: { id: recipient.contactId },
              data: { lastCalledAt: new Date(), callCount: { increment: 1 } },
            }).catch(() => {});
          }
        } else {
          await prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'failed',
              failureReason: (result.error || 'Dial failed').slice(0, 500),
              billingStatus: 'SKIPPED',
              endedAt: new Date(),
            },
          }).catch(() => {});
          logger.warn({ broadcastId, to: recipient.phoneNumber }, `Broadcast dial failed: ${result.error}`);
        }

        await sleep(DIAL_SPACING_MS);
      }

      await syncProgress(broadcastId);
    }
  } catch (err) {
    logger.error({ broadcastId, err }, 'Broadcast dispatch crashed');
    await finish(broadcastId, BROADCAST_STATUS.FAILED, err.message?.slice(0, 500));
    return { started: false, reason: 'error' };
  } finally {
    active.delete(broadcastId);
  }
}
