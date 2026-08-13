// Bulk voice campaign dispatcher.
//
// Replaces the old startCampaign(), which only animated a progress bar on a
// timer and never placed a call.
//
// Runs either inside the BullMQ worker or, when Redis is unreachable, directly
// in this process. Redis in this deployment drops out (the connection falls back
// to "memory mode" on error), and a campaign that silently does nothing because
// a queue was unavailable is exactly the failure the simulated version had. The
// loop is resumable either way: all progress lives in CampaignRecipient rows, so
// a restart mid-campaign continues from the pending ones rather than re-dialling.

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { CAMPAIGN_STATUS } from '../constants/campaignStatus.js';
import { assertCanStartCall } from './billing/settlement.service.js';
import { assertRotationCompliant } from './compliance/compliance.service.js';
import { placeOutboundCall, resolveCallMode, telephonyStatusForNumber } from './outboundCall.service.js';

// Campaigns being dispatched by THIS process. Guards against the same campaign
// being run twice concurrently (queue retry + in-process start, say), which
// would double-dial every recipient.
const active = new Map(); // campaignId -> { stop: boolean }

// How long to wait when the plan's concurrency ceiling is already full. Calls
// last minutes, so polling faster just burns database queries.
const CONCURRENCY_WAIT_MS = Number(process.env.CAMPAIGN_CONCURRENCY_WAIT_MS || 15_000);
// Gap between individual dials, so a campaign doesn't hammer Twilio (and the
// recipients' carrier) in one burst.
const DIAL_SPACING_MS = Number(process.env.CAMPAIGN_DIAL_SPACING_MS || 1_000);
const BATCH_SIZE = Number(process.env.CAMPAIGN_BATCH_SIZE || 50);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const isRunning = (campaignId) => active.has(campaignId);

/** Ask a running dispatch loop to stop at the next safe point. */
export function requestStop(campaignId) {
  const entry = active.get(campaignId);
  if (entry) entry.stop = true;
  return Boolean(entry);
}

/**
 * Normalise the configured caller IDs into a rotation list.
 * Falls back to the single fromNumber, then the platform default.
 */
export function callerRotation(campaign) {
  const many = Array.isArray(campaign.fromNumbers) ? campaign.fromNumbers.filter(Boolean) : [];
  if (many.length) return many;
  if (campaign.fromNumber) return [campaign.fromNumber];
  const fallback = process.env.TWILIO_FROM_NUMBER;
  return fallback ? [fallback] : [];
}

/** Recompute the counters the UI shows. Derived from rows, never incremented blindly. */
async function syncProgress(campaignId) {
  const rows = await prisma.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { status: true },
  });
  const count = (s) => rows.find((r) => r.status === s)?._count.status ?? 0;
  const sent = count('sent');
  const failed = count('failed');
  const skipped = count('skipped');
  const total = rows.reduce((a, r) => a + r._count.status, 0);
  const done = sent + failed + skipped;
  const progress = total ? Math.round((done / total) * 100) : 0;
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { sent, failed, totalContacts: total, progress },
  }).catch((e) => logger.warn(`Campaign ${campaignId}: could not sync progress: ${e.message}`));
  return { total, done, sent, failed, skipped };
}

async function finish(campaignId, status, lastError = null) {
  await syncProgress(campaignId);
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status,
      lastError,
      ...(status === CAMPAIGN_STATUS.COMPLETED ? { completedAt: new Date() } : {}),
    },
  }).catch(() => {});
  logger.info({ campaignId, status }, 'Campaign dispatch finished');
}

/**
 * Dial every pending recipient of a campaign.
 *
 * Safe to call again after a crash, a pause, or a process restart: it only ever
 * looks at rows still marked pending.
 */
export async function runCampaign(campaignId, workspaceId) {
  if (active.has(campaignId)) {
    logger.info({ campaignId }, 'Campaign already dispatching in this process — ignoring duplicate start');
    return { started: false, reason: 'already-running' };
  }
  const control = { stop: false };
  active.set(campaignId, control);

  try {
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
    if (!campaign) return { started: false, reason: 'not-found' };

    if (!campaign.botId) {
      await finish(campaignId, CAMPAIGN_STATUS.FAILED, 'No voice agent selected for this campaign.');
      return { started: false, reason: 'no-agent' };
    }
    const agent = await prisma.agent.findFirst({ where: { id: campaign.botId, workspaceId } });
    if (!agent) {
      await finish(campaignId, CAMPAIGN_STATUS.FAILED, 'The selected voice agent no longer exists.');
      return { started: false, reason: 'agent-missing' };
    }

    const rotation = callerRotation(campaign);
    if (!rotation.length) {
      await finish(campaignId, CAMPAIGN_STATUS.FAILED, 'This campaign has no caller ID to dial from.');
      return { started: false, reason: 'telephony' };
    }

    // Ask each caller ID's OWN carrier, not the platform default.
    //
    // This checked `telephonyStatus(rotation[0])` with no provider, which
    // resolves TELEPHONY_PROVIDER_DEFAULT — so a campaign dialling from a Plivo
    // number was cleared to start by Twilio's credentials, and vice versa. The
    // failure that produces is the worst kind: the campaign starts, every dial
    // is refused by the carrier that was never asked, and each recipient is
    // marked failed one per second with the reason buried in its own row.
    //
    // EVERY number, not just the first: a rotation can span carriers, and one
    // unconfigured carrier in it silently fails its whole share of the calls.
    for (const from of rotation) {
      const tw = await telephonyStatusForNumber(from);
      if (!tw.ready) {
        await finish(campaignId, CAMPAIGN_STATUS.FAILED, `${from}: ${tw.error}`);
        return { started: false, reason: 'telephony' };
      }
    }

    // DLT gate. Checked before the first dial rather than per recipient: an
    // incomplete registration is a property of the workspace and its caller
    // IDs, so discovering it on recipient 4,000 would mean 3,999 unregistered
    // commercial calls have already gone out. Non-Indian caller IDs pass
    // through untouched — DLT is Indian law about Indian traffic.
    const dlt = await assertRotationCompliant(workspaceId, rotation);
    if (!dlt.allowed) {
      await finish(campaignId, CAMPAIGN_STATUS.FAILED, dlt.message);
      return { started: false, reason: 'compliance' };
    }

    const { mode, reason } = resolveCallMode(agent);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CAMPAIGN_STATUS.RUNNING, callMode: mode, lastError: null, launchedAt: campaign.launchedAt ?? new Date() },
    });
    logger.info({ campaignId, agentId: agent.id, mode, callers: rotation.length }, 'Campaign dispatch started');
    if (reason) logger.warn({ campaignId }, reason);

    let dialled = 0;
    let rotationIndex = 0;

    for (;;) {
      if (control.stop) { await finish(campaignId, CAMPAIGN_STATUS.PAUSED); return { started: true, dialled }; }

      // Re-read status each batch so Pause/Cancel from the UI takes effect
      // without needing to reach into this loop.
      const current = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true, concurrentCalls: true },
      });
      if (!current) return { started: true, dialled };
      if (current.status === CAMPAIGN_STATUS.CANCELLED) {
        await syncProgress(campaignId);
        return { started: true, dialled };
      }
      if (current.status === CAMPAIGN_STATUS.PAUSED) {
        await syncProgress(campaignId);
        return { started: true, dialled };
      }

      // Re-check compliance once per batch, not per call. A workspace can be
      // suspended or a header revoked while a long campaign is mid-flight, and
      // the whole point of the gate is that it stops the traffic then — but a
      // database round trip per dial to catch a rare event is the wrong trade.
      const stillCompliant = await assertRotationCompliant(workspaceId, rotation);
      if (!stillCompliant.allowed) {
        logger.warn({ campaignId, code: stillCompliant.code }, `Campaign paused mid-flight: ${stillCompliant.message}`);
        await finish(campaignId, CAMPAIGN_STATUS.PAUSED, stillCompliant.message);
        return { started: true, dialled };
      }

      const batch = await prisma.campaignRecipient.findMany({
        where: { campaignId, status: 'pending' },
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
      });
      if (!batch.length) {
        await finish(campaignId, CAMPAIGN_STATUS.COMPLETED);
        return { started: true, dialled };
      }

      // Opt-outs are honoured mid-flight, not just at list build time. Someone
      // who says "stop calling me" on call 300 must not be dialled at 3,000
      // because the recipient rows were frozen an hour earlier. One query per
      // batch, not per call.
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
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: 'skipped', failureReason: 'contact_not_callable' },
          }).catch(() => {});
          continue;
        }

        // The plan gate is the real pacer: it refuses while the workspace is at
        // its concurrent-call ceiling, so the campaign naturally runs at the
        // plan's rate instead of dumping 10k calls into Twilio at once.
        let gate = await assertCanStartCall(workspaceId, { type: 'PHONE_CALL' });
        while (!gate.allowed && gate.code === 'CONCURRENCY_LIMIT' && !control.stop) {
          await sleep(CONCURRENCY_WAIT_MS);
          const still = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
          if (!still || still.status === CAMPAIGN_STATUS.CANCELLED || still.status === CAMPAIGN_STATUS.PAUSED) {
            await syncProgress(campaignId);
            return { started: true, dialled };
          }
          gate = await assertCanStartCall(workspaceId, { type: 'PHONE_CALL' });
        }
        if (control.stop) break;

        // Anything other than concurrency (no balance, dead subscription) is not
        // going to fix itself by waiting. Pause rather than burn through the
        // remaining recipients marking them all failed.
        if (!gate.allowed) {
          logger.warn({ campaignId, code: gate.code }, `Campaign paused: ${gate.message}`);
          await finish(campaignId, CAMPAIGN_STATUS.PAUSED, gate.message);
          return { started: true, dialled };
        }

        const from = rotation[rotationIndex % rotation.length];
        rotationIndex += 1;

        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'calling', startedAt: new Date(), attempts: { increment: 1 } },
        }).catch(() => {});

        const result = await placeOutboundCall({
          workspaceId,
          agent,
          toNumber: recipient.phoneNumber,
          fromNumber: from,
          closingLine: mode === 'conversation' ? '' : (agent.endCallMessage || ''),
        });

        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: result.ok
            ? { status: 'sent', sentAt: new Date(), callLogId: result.callLogId, failureReason: null }
            : { status: 'failed', failureReason: (result.error || 'Call failed').slice(0, 500) },
        }).catch((e) => logger.warn(`Campaign ${campaignId}: could not update recipient: ${e.message}`));

        if (result.ok) {
          dialled += 1;
          // Contact-level call history. Cheap, and it is what makes "when did we
          // last bother this person" answerable without scanning every campaign.
          if (recipient.contactId) {
            await prisma.contact.update({
              where: { id: recipient.contactId },
              data: { lastCalledAt: new Date(), callCount: { increment: 1 } },
            }).catch(() => {});
          }
        } else {
          logger.warn({ campaignId, to: recipient.phoneNumber }, `Campaign call failed: ${result.error}`);
        }

        await sleep(DIAL_SPACING_MS);
      }

      await syncProgress(campaignId);
    }
  } catch (err) {
    logger.error({ campaignId, err }, 'Campaign dispatch crashed');
    await finish(campaignId, CAMPAIGN_STATUS.FAILED, err.message?.slice(0, 500));
    return { started: false, reason: 'error' };
  } finally {
    active.delete(campaignId);
  }
}
