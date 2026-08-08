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
 *
 * Reaped calls are NOT charged — the real duration is unknown and charging a
 * guess is worse than not charging. But they must still leave PENDING. Marking
 * only `status` left billingStatus at its PENDING default with nothing in the
 * system that would ever revisit the row, so an abandoned call sat forever
 * claiming to be awaiting billing: "pending" in the console, and unresolved
 * liability in any report that trusts the field. SKIPPED says the true thing —
 * this call was closed out and deliberately not billed.
 */
function reapAbandonedCalls(workspaceId, staleBefore) {
  prisma.agentCallLog
    .updateMany({
      where: { workspaceId, status: 'IN_PROGRESS', startedAt: { lt: staleBefore } },
      data: { status: 'FAILED', endedAt: new Date(), billingStatus: 'SKIPPED' },
    })
    .then(({ count }) => {
      if (count > 0) logger.warn({ workspaceId, count }, 'Retired abandoned IN_PROGRESS calls (never finalized by the client)');
    })
    .catch((err) => logger.warn({ workspaceId, err: err.message }, 'Could not retire abandoned calls'));
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

    // Every billed minute hits the wallet. There are no plans, so there is no
    // included-minutes allowance to draw down first — the workspace's balance is
    // the only thing that pays for a call.
    const chargeableMinutes = minutes;

    // One ₹/min for everybody, set in Super Admin → Wallet Rate. The same figure
    // the public landing page quotes.
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

    // Can only happen if the rate itself is 0, which setWalletRate refuses.
    // Kept so a zero-value ledger row is never written if that ever changes.
    if (amountCents <= 0) {
      logger.info({ callLogId, workspaceId: call.workspaceId, minutes }, 'Nothing to charge for this call');
      return { billed: true, amountCents: 0, minutes };
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
        durationSec, billedMinutes: minutes, ratePerMinuteCents,
      },
      fxRateUsdToInr: fxRate,
      // Never refuse: the minutes were served. See the header note.
      allowNegative: true,
    });

    logger.info(
      { callLogId, workspaceId: call.workspaceId, minutes,
        amountCents, balanceAfter: result.balanceCents, duplicate: result.duplicate },
      `Settled call: ${formatMinor(amountCents)}`,
    );

    return {
      billed: true, amountCents, minutes,
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

  /*
   * Balance is the ONLY gate.
   *
   * This used to also enforce a per-plan concurrency ceiling and refuse calls on
   * a cancelled subscription. Both are gone with plans: the product bills a
   * single ₹/min against a prepaid wallet, so a workspace's own balance is what
   * bounds its usage — there is no tier to exceed and nothing to renew.
   *
   * Concurrency is deliberately unbounded. The wallet caps the spend, so the
   * remaining exposure is provider rate limits rather than unpaid usage; if that
   * ever bites, the ceiling belongs in Super Admin as one platform-wide number,
   * not back on a per-customer plan.
   *
   * Require headroom for at least one billing increment: starting a call with a
   * few paise left just cuts the caller off mid-sentence, which is worse than a
   * clear refusal up front.
   */
  const wallet = await getOrCreateWallet(workspaceId);
  // The same rate the call will actually settle at, so the pre-call check and
  // the post-call charge can never disagree.
  const { ratePerMinuteCents } = resolveCallRate(await getWalletRate());

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

  /*
   * Retire calls stuck IN_PROGRESS. A WEB_CALL is only moved off IN_PROGRESS by
   * the BROWSER (the `ended: true` PATCH in cleanupWebCall), so a closed tab, a
   * crash or a dropped network leaves the row in progress forever and it shows
   * as perpetually live in Recent Calls. Nothing can genuinely still be running
   * past the cutoff. Deliberately NOT charged — the real duration is unknown,
   * and charging a guess is worse than not charging — but closed out as SKIPPED
   * so it does not linger as a PENDING bill that nothing will ever resolve.
   *
   * This used to be a side effect of counting calls for the concurrency limit.
   * The limit is gone; the reaping still has to happen, so it is explicit now.
   */
  reapAbandonedCalls(workspaceId, new Date(Date.now() - STALE_CALL_MS));

  return { allowed: true };
}

/**
 * Agent creation is unrestricted.
 *
 * Kept as a function rather than deleted because agent.controller.js calls it on
 * every create; the seam is where a platform-wide cap would go if one is ever
 * wanted. An agent costs nothing until it takes a call, and the call is gated on
 * the wallet, so there is nothing to protect here.
 */
export async function assertCanCreateAgent() {
  return { allowed: true };
}
