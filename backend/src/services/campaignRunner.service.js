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
import { isSlotHeld, releaseSlot, slotTakenAt } from './telephony/concurrency.js';
import { assertRotationCompliant } from './compliance/compliance.service.js';
import { placeOutboundCall, resolveCallMode, telephonyStatusForNumber } from './outboundCall.service.js';

/** The agent's configured closing line, from settings (where the editor saves it). Exported for tests. */
export const closingLineOf = (agent) => {
  try {
    const settings = typeof agent?.settings === 'string' ? JSON.parse(agent.settings || '{}') : (agent?.settings || {});
    return typeof settings?.endCallMessage === 'string' ? settings.endCallMessage.trim() : '';
  } catch {
    return '';
  }
};

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
// How often a campaign at its own "Concurrent Calls" limit looks for a call that
// has ended. In-memory, so polling is free; it only bounds how long a freed slot
// sits idle before the next dial.
const SLOT_POLL_MS = Number(process.env.CAMPAIGN_SLOT_POLL_MS || 2_000);
// A call log still INITIATED this long after its dial was never answered —
// carriers ring for 60s by default. Past it, a slot nothing released is given
// back (Twilio sends agent calls no no-answer callback, so for those nothing
// ever would, and one unanswered number would stall the campaign for an hour).
const UNANSWERED_AFTER_MS = Number(process.env.CAMPAIGN_UNANSWERED_AFTER_MS || 120_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── The campaign's own "Concurrent Calls" limit ─────────────────────────────
//
// Bulk Call has always saved `concurrentCalls` (default 1), and this dialer read
// it and never used it. The only pacing was the carrier ceiling and a 1s gap
// between dials, and the loop never waits for a call to END — so a campaign set
// to one call at a time had every recipient on a live call within seconds.
//
// That is the bulk-call latency. Every live call in this process shares one LLM
// requests-per-minute quota, one database pool and the TTS plan's concurrent
// request limit; a single test call never contends for any of them, a campaign
// with ten recipients up at once contends for all three on every turn.

// Calls each campaign dialled that may still be up: campaignId -> Set<callLogId>.
// Module-level rather than per run, so a campaign paused and resumed in this
// process still counts the calls its previous run left on the line. A restart
// forgets them, which is correct: a restart also drops every media bridge.
const liveCampaignCalls = new Map();

/** The saved setting as a usable number: at least one call, whole calls only. */
export function campaignCallLimit(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Remember a call this campaign just dialled. Also forgets every campaign's ended calls. */
export function trackCampaignCall(campaignId, callLogId, { held = isSlotHeld } = {}) {
  if (!campaignId || !callLogId) return;
  for (const [id, calls] of liveCampaignCalls) {
    for (const call of calls) if (!held(call)) calls.delete(call);
    if (!calls.size) liveCampaignCalls.delete(id);
  }
  if (!liveCampaignCalls.has(campaignId)) liveCampaignCalls.set(campaignId, new Set());
  liveCampaignCalls.get(campaignId).add(callLogId);
}

/**
 * How many of this campaign's calls are still up. A call counts from the moment
 * the carrier accepts the dial until its carrier slot is released at finalize —
 * ringing included, because a ringing call is about to need everything a
 * talking one does.
 */
export function liveCampaignCallCount(campaignId, { held = isSlotHeld } = {}) {
  const calls = liveCampaignCalls.get(campaignId);
  if (!calls) return 0;
  for (const call of calls) if (!held(call)) calls.delete(call);
  if (!calls.size) liveCampaignCalls.delete(campaignId);
  return calls?.size ?? 0;
}

/**
 * Give back the slots of calls that are over but were never released.
 *
 * Every normal path releases in the call finalizer, and the carrier ceiling's
 * own backstop reaps after 65 minutes. That is fine for a 45-call ceiling and
 * useless for a campaign limited to one call: a single missed release would park
 * the whole campaign for an hour. So while a campaign waits, the call log is the
 * tie-breaker — a finished status, or a dial that has been INITIATED for longer
 * than any carrier rings, means the call is not up whatever the table says.
 *
 * @returns {Promise<number>} slots given back
 */
export async function reconcileCampaignCalls(campaignId, {
  now = Date.now(),
  db = prisma,
  takenAt = slotTakenAt,
  release = releaseSlot,
  unansweredAfterMs = UNANSWERED_AFTER_MS,
} = {}) {
  const calls = liveCampaignCalls.get(campaignId);
  if (!calls?.size) return 0;
  const ids = [...calls];

  let rows;
  try {
    rows = await db.agentCallLog.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } });
  } catch (e) {
    logger.warn(`Campaign ${campaignId}: could not check its live calls: ${e.message}`);
    return 0;
  }
  const statusOf = new Map(rows.map((r) => [r.id, r.status]));

  let released = 0;
  for (const id of ids) {
    const status = statusOf.get(id);
    const age = now - (takenAt(id) ?? now);
    const over = status == null
      || (status !== 'INITIATED' && status !== 'IN_PROGRESS')
      || (status === 'INITIATED' && age > unansweredAfterMs);
    if (!over) continue;
    release(id);
    calls.delete(id);
    released += 1;
  }
  if (!calls.size) liveCampaignCalls.delete(campaignId);
  if (released) {
    logger.warn({ campaignId, released }, 'Campaign: gave back call slots that ended without being released');
  }
  return released;
}

/**
 * Wait until this campaign is below its own concurrent-call limit.
 *
 * @returns {Promise<'free'|'stopped'|'halted'>} `halted` when the campaign was
 *   paused, cancelled or deleted from the UI while waiting
 */
export async function waitForCampaignSlot(campaignId, limit, {
  control = { stop: false },
  count = liveCampaignCallCount,
  reconcile = reconcileCampaignCalls,
  readStatus = async () => (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } }))?.status ?? null,
  pause = sleep,
  pollMs = SLOT_POLL_MS,
  checkEveryMs = CONCURRENCY_WAIT_MS,
  now = Date.now,
} = {}) {
  let lastCheck = now();
  while (count(campaignId) >= limit) {
    if (control.stop) return 'stopped';
    await pause(pollMs);
    // Status and the call log are database reads, so they run on the slow
    // clock; the in-memory count above runs on the fast one.
    if (now() - lastCheck >= checkEveryMs) {
      lastCheck = now();
      const status = await readStatus();
      if (!status || status === CAMPAIGN_STATUS.CANCELLED || status === CAMPAIGN_STATUS.PAUSED) return 'halted';
      await reconcile(campaignId);
    }
  }
  return control.stop ? 'stopped' : 'free';
}

/** Tests only. */
export function __resetCampaignCallsForTests() {
  liveCampaignCalls.clear();
}

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
 *
 * @param {object} [deps]  tests only: the collaborators that would reach a
 *   carrier, the wallet or the clock. Production callers pass nothing.
 */
export async function runCampaign(campaignId, workspaceId, deps = {}) {
  const {
    dial = placeOutboundCall,
    gateCall = assertCanStartCall,
    rotationCompliant = assertRotationCompliant,
    numberStatus = telephonyStatusForNumber,
    callMode = resolveCallMode,
    pause = sleep,
    slotPollMs = SLOT_POLL_MS,
  } = deps;
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
      const tw = await numberStatus(from);
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
    const dlt = await rotationCompliant(workspaceId, rotation);
    if (!dlt.allowed) {
      await finish(campaignId, CAMPAIGN_STATUS.FAILED, dlt.message);
      return { started: false, reason: 'compliance' };
    }

    const { mode, reason } = await callMode(agent);
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
      const stillCompliant = await rotationCompliant(workspaceId, rotation);
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
      // Read per batch, so an edited limit applies without a restart.
      const callLimit = campaignCallLimit(current.concurrentCalls);

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

        // The campaign's own limit first: no more of ITS calls up at once than
        // the owner set. Waiting here, before the wallet gate, keeps that gate's
        // answer fresh for the dial that follows it.
        const slot = await waitForCampaignSlot(campaignId, callLimit, { control, pause, pollMs: slotPollMs });
        if (slot === 'halted') {
          await syncProgress(campaignId);
          return { started: true, dialled };
        }
        if (control.stop) break;

        // Then the carrier ceiling: it refuses while the platform or this
        // workspace is at its concurrent-call ceiling, whatever this campaign
        // itself allows.
        let gate = await gateCall(workspaceId, { type: 'PHONE_CALL' });
        while (!gate.allowed && gate.code === 'CONCURRENCY_LIMIT' && !control.stop) {
          await pause(CONCURRENCY_WAIT_MS);
          const still = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
          if (!still || still.status === CAMPAIGN_STATUS.CANCELLED || still.status === CAMPAIGN_STATUS.PAUSED) {
            await syncProgress(campaignId);
            return { started: true, dialled };
          }
          gate = await gateCall(workspaceId, { type: 'PHONE_CALL' });
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

        const result = await dial({
          workspaceId,
          agent,
          toNumber: recipient.phoneNumber,
          fromNumber: from,
          // endCallMessage lives in settings JSON, not on the row — this read
          // `agent.endCallMessage`, which is always undefined, so every
          // greeting-only campaign call hung up with no closing line at all.
          closingLine: mode === 'conversation' ? '' : (closingLineOf(agent) || ''),
        });

        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: result.ok
            ? { status: 'sent', sentAt: new Date(), callLogId: result.callLogId, failureReason: null }
            : { status: 'failed', failureReason: (result.error || 'Call failed').slice(0, 500) },
        }).catch((e) => logger.warn(`Campaign ${campaignId}: could not update recipient: ${e.message}`));

        if (result.ok) {
          dialled += 1;
          trackCampaignCall(campaignId, result.callLogId);
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

        await pause(DIAL_SPACING_MS);
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
