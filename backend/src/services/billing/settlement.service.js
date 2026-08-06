// backend/src/services/billing/settlement.service.js
/**
 * Per-call usage settlement and the pre-call gate (BUG-002).
 *
 * ONE FUNCTION, THREE CALLERS
 * ---------------------------
 * Calls finalize in three unrelated places, and before this they all just wrote
 * `durationSec` and stopped — nothing charged anything, anywhere:
 *
 *   1. controllers/agentCallLog.controller.js  (client PATCH — modular web call)
 *   2. ws/twilioMediaRealtime.handler.js       (telephony)
 *   3. ws/webCallRealtime.handler.js           (bundled engine web call)
 *
 * All three now call settleCall(). Charging in only the web path would mean
 * telephony minutes were free, which is both a revenue hole and an
 * inconsistency a customer would eventually notice and dispute.
 *
 * WHY THIS IS SAFE TO CALL TWICE
 * ------------------------------
 * Two independent guards, because the event genuinely does double-fire (a
 * socket 'close' racing an explicit 'stop', or a client PATCH replayed):
 *
 *   - `AgentCallLog.billingStatus` moves PENDING -> BILLED under a conditional
 *     UPDATE, so only one caller can claim a call;
 *   - the ledger write carries `call:<id>` as its idempotency key, so even if
 *     the status guard were somehow bypassed, the UNIQUE index refuses the
 *     second charge.
 *
 * WHY SETTLEMENT NEVER REFUSES
 * ----------------------------
 * The minutes were already served — refusing to record them would lose the
 * revenue AND hide the usage. So settlement uses `allowNegative` and lets the
 * balance go negative. Preventing unpaid usage is the PRE-CALL gate's job
 * (assertCanStartCall), which runs before anyone is talking. Blocking at
 * settlement would be both too late and destructive.
 */

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { applyWalletTransaction, getOrCreateWallet, TX_TYPES } from './wallet.service.js';
import { calculateCallCharge, formatMinor, billableMinutes, resolveCallRate } from './money.js';
import { getWalletRate } from './walletRate.js';

/** Call types that consume voice minutes. CHAT is text — never billed. */
const BILLABLE_TYPES = new Set(['WEB_CALL', 'PHONE_CALL']);

/**
 * After this long, an IN_PROGRESS call is treated as abandoned rather than
 * active. Generous on purpose: the cost of being too eager (cutting off a real
 * long call's concurrency slot) is worse than being slightly late to reclaim an
 * abandoned one. The longest configurable agent call is 30 minutes, so 2 hours
 * cannot collide with a live call.
 */
const STALE_CALL_MS = Number(process.env.STALE_CALL_MS) || 2 * 60 * 60 * 1000;

/**
 * Retire calls left IN_PROGRESS past the staleness cutoff. Fire-and-forget: this
 * runs on the pre-call gate path, and a failure to tidy up must never be able to
 * block someone from placing a call.
 */
function reapAbandonedCalls(workspaceId, staleBefore) {
  prisma.agentCallLog
    .updateMany({
      where: { workspaceId, status: 'IN_PROGRESS', startedAt: { lt: staleBefore } },
      data: { status: 'FAILED', endedAt: new Date() },
    })
    .then(({ count }) => {
      if (count > 0) logger.warn({ workspaceId, count }, 'Retired abandoned IN_PROGRESS calls (never finalized by the client)');
    })
    .catch((err) => logger.warn({ workspaceId, err: err.message }, 'Could not retire abandoned calls'));
}

/** Resolve the plan a workspace is actually on (subscription first, then the
 *  Workspace.planName label, then whatever is cheapest-tier configured). */
export async function resolveWorkspacePlan(workspaceId) {
  const sub = await prisma.subscription.findUnique({
    where: { workspaceId },
    include: { plan: true },
  });
  if (sub?.plan) return { plan: sub.plan, subscription: sub };

  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { planName: true },
  });
  const plan = ws?.planName
    ? await prisma.plan.findUnique({ where: { name: ws.planName } })
    : null;
  return { plan, subscription: null };
}

/**
 * Charge a finished call. Idempotent per callLogId.
 *
 * @param {string} callLogId
 * @param {object} [opts]
 * @param {number} [opts.actualCostMicroUsd] measured provider COGS, recorded
 *   for margin reporting — NOT what the customer is charged.
 * @returns {Promise<{ billed: boolean, reason?: string, amountCents?: number }>}
 */
export async function settleCall(callLogId, { actualCostMicroUsd = null } = {}) {
  if (!callLogId) return { billed: false, reason: 'no-call-id' };

  try {
    const call = await prisma.agentCallLog.findUnique({ where: { id: callLogId } });
    if (!call) return { billed: false, reason: 'not-found' };

    // Guard 1: claim the call. The `billingStatus: 'PENDING'` predicate makes
    // this a compare-and-set — a concurrent second caller updates 0 rows and
    // backs off, so only one settlement proceeds.
    if (call.billingStatus !== 'PENDING') {
      return { billed: false, reason: `already-${call.billingStatus.toLowerCase()}` };
    }

    if (!BILLABLE_TYPES.has(call.type)) {
      await prisma.agentCallLog.updateMany({
        where: { id: callLogId, billingStatus: 'PENDING' },
        data: { billingStatus: 'SKIPPED' },
      });
      return { billed: false, reason: 'not-billable-type' };
    }

    const durationSec = Number(call.durationSec) || 0;
    const minutes = billableMinutes(durationSec);
    if (minutes <= 0) {
      // A call that never connected costs the customer nothing.
      await prisma.agentCallLog.updateMany({
        where: { id: callLogId, billingStatus: 'PENDING' },
        data: { billingStatus: 'SKIPPED', actualCostMicroUsd },
      });
      return { billed: false, reason: 'zero-duration' };
    }

    const { plan, subscription } = await resolveWorkspacePlan(call.workspaceId);

    // Included minutes are drawn down FIRST; only the excess hits the wallet.
    let chargeableMinutes = minutes;
    let coveredByPlan = 0;
    if (subscription && subscription.status === 'active') {
      const remaining = Math.max(0, subscription.minutesIncluded - subscription.minutesUsed);
      coveredByPlan = Math.min(remaining, minutes);
      chargeableMinutes = minutes - coveredByPlan;
    }

    // The rate comes from the platform wallet rate, not from the workspace's
    // plan: this deployment bills one ₹/min for everybody, set in Super Admin →
    // Wallet Rate, and that is the same figure the public landing page quotes.
    // The plan is still consulted above for included minutes, so an existing
    // subscription keeps drawing its allowance down before the wallet is hit.
    const walletRate = await getWalletRate();
    const { ratePerMinuteCents, fxRate } = resolveCallRate(walletRate);
    const amountCents = calculateCallCharge(chargeableMinutes * 60, walletRate).amountCents;

    // Claim before charging. If the process dies between claim and ledger
    // write the call ends up BILLED with no charge — under-billing one call,
    // which is strictly safer than the reverse and is visible in the audit
    // (billedCents 0 with no matching ledger row).
    const claimed = await prisma.agentCallLog.updateMany({
      where: { id: callLogId, billingStatus: 'PENDING' },
      data: {
        billingStatus: 'BILLED',
        billedAt: new Date(),
        billedMinutes: minutes,
        ratePerMinuteCents,
        billedCents: amountCents,
        actualCostMicroUsd,
      },
    });
    if (claimed.count === 0) {
      return { billed: false, reason: 'claimed-concurrently' };
    }

    if (coveredByPlan > 0 && subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { minutesUsed: { increment: coveredByPlan } },
      });
    }

    if (amountCents <= 0) {
      logger.info(
        { callLogId, workspaceId: call.workspaceId, minutes, coveredByPlan },
        'Call fully covered by plan-included minutes — no wallet charge',
      );
      return { billed: true, amountCents: 0, coveredByPlan, minutes };
    }

    const result = await applyWalletTransaction({
      workspaceId: call.workspaceId,
      amountCents: -amountCents,
      type: TX_TYPES.USAGE,
      // Guard 2. Stable and derived from the call, so any replay collides.
      idempotencyKey: `call:${callLogId}`,
      note: `${call.type} ${minutes} min @ ${formatMinor(ratePerMinuteCents)}/min`,
      metadata: {
        callLogId, agentId: call.agentId, type: call.type,
        durationSec, billedMinutes: minutes, coveredByPlan,
        ratePerMinuteCents, planName: plan?.name ?? null,
      },
      fxRateUsdToInr: fxRate,
      // Never refuse: the minutes were served. See the header note.
      allowNegative: true,
    });

    logger.info(
      { callLogId, workspaceId: call.workspaceId, minutes, coveredByPlan,
        amountCents, balanceAfter: result.balanceCents, duplicate: result.duplicate },
      `Settled call: ${formatMinor(amountCents)}`,
    );

    return {
      billed: true, amountCents, minutes, coveredByPlan,
      balanceCents: result.balanceCents, duplicate: result.duplicate,
    };
  } catch (err) {
    // Settlement must never break call teardown — the caller is a socket close
    // handler. Mark FAILED so it is retryable and visible, and swallow.
    logger.error({ callLogId, err: err.message }, 'Call settlement failed');
    await prisma.agentCallLog.updateMany({
      where: { id: callLogId, billingStatus: 'PENDING' },
      data: { billingStatus: 'FAILED' },
    }).catch(() => {});
    return { billed: false, reason: 'error', error: err.message };
  }
}

/**
 * PRE-CALL GATE. Decides whether a call may start, BEFORE anyone is talking.
 *
 * This is where unpaid usage is actually prevented. Every reason returns a
 * `code` the transport can surface verbatim, because "the call just didn't
 * work" is the failure mode this is meant to eliminate — a blocked call must
 * say why.
 *
 * @returns {Promise<{ allowed: boolean, code?: string, message?: string }>}
 */
export async function assertCanStartCall(workspaceId, { type = 'WEB_CALL' } = {}) {
  if (!BILLABLE_TYPES.has(type)) return { allowed: true };

  const { plan, subscription } = await resolveWorkspacePlan(workspaceId);

  if (subscription && ['cancelled', 'expired'].includes(subscription.status)) {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_INACTIVE',
      message: `Your ${subscription.planName} subscription is ${subscription.status}. Renew it to place calls.`,
    };
  }

  // Concurrency: count calls currently in progress for this workspace.
  //
  // Bounded by age, and that bound is load-bearing. A WEB_CALL is only moved off
  // IN_PROGRESS by the BROWSER (the `ended: true` PATCH in cleanupWebCall), so a
  // closed tab, a crash or a dropped network leaves the row in progress forever.
  // Counting those permanently consumed a concurrency slot: on a 1-call plan a
  // single abandoned call silently blocked every future call from being logged,
  // and the client swallows the 402 into console.error, so it looked like calls
  // simply stopped appearing in Recent Calls. No call can genuinely still be
  // running after this cutoff, so anything older is abandoned, not active.
  const maxConcurrent = plan?.maxConcurrentCalls ?? 1;
  if (maxConcurrent > 0) {
    const staleBefore = new Date(Date.now() - STALE_CALL_MS);
    const active = await prisma.agentCallLog.count({
      where: {
        workspaceId,
        status: 'IN_PROGRESS',
        type: { in: [...BILLABLE_TYPES] },
        startedAt: { gte: staleBefore },
      },
    });
    // Self-heal: retire the abandoned rows so they stop showing as perpetually
    // "in progress" in Recent Calls. Deliberately NOT settled — their real
    // duration is unknown, and charging a guess is worse than not charging.
    reapAbandonedCalls(workspaceId, staleBefore);
    if (active >= maxConcurrent) {
      return {
        allowed: false,
        code: 'CONCURRENCY_LIMIT',
        message: `Your ${plan?.name ?? 'current'} plan allows ${maxConcurrent} simultaneous call${maxConcurrent === 1 ? '' : 's'}. ${active} are already in progress.`,
      };
    }
  }

  // Balance: require headroom for at least one billing increment. Starting a
  // call with a few paise left just cuts the caller off mid-sentence, which is
  // a worse experience than a clear refusal up front.
  const wallet = await getOrCreateWallet(workspaceId);
  // Same rate the call will actually settle at, so the pre-call balance check
  // and the post-call charge can never disagree.
  const { ratePerMinuteCents } = resolveCallRate(await getWalletRate());
  const planMinutesLeft = subscription && subscription.status === 'active'
    ? Math.max(0, subscription.minutesIncluded - subscription.minutesUsed)
    : 0;

  if (planMinutesLeft <= 0) {
    const available = wallet.balanceCents + wallet.overdraftLimitCents;
    if (available < ratePerMinuteCents) {
      return {
        allowed: false,
        code: 'INSUFFICIENT_BALANCE',
        message: available <= 0
          ? 'Your wallet balance is empty. Add funds to place calls.'
          : `Your balance (${formatMinor(wallet.balanceCents)}) is below the ${formatMinor(ratePerMinuteCents)} needed for one minute. Add funds to continue.`,
      };
    }
  }

  return { allowed: true };
}

/** Agent-count limit, checked at agent creation rather than at call time. */
export async function assertCanCreateAgent(workspaceId) {
  const { plan } = await resolveWorkspacePlan(workspaceId);
  const max = plan?.maxAgents ?? 1;
  if (max <= 0) return { allowed: true };
  const count = await prisma.agent.count({ where: { workspaceId } });
  if (count >= max) {
    return {
      allowed: false,
      code: 'AGENT_LIMIT',
      message: `Your ${plan?.name ?? 'current'} plan includes ${max} agent${max === 1 ? '' : 's'}. Upgrade to add more.`,
    };
  }
  return { allowed: true };
}
