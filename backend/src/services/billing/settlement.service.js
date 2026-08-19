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
 * balance go negative. Blocking here would be both too late and destructive.
 *
 * That makes a negative balance a symptom of something upstream failing, and it
 * takes TWO things upstream to prevent it, not one:
 *
 *   - assertCanStartCall() refuses a call nobody can pay for, before anyone is
 *     talking;
 *   - its `maxSeconds` budget hangs the call up when the balance runs out.
 *
 * The gate alone was never enough: it only ever asked "can you afford to
 * start?", so one minute of balance bought a call of any length.
 */

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { applyWalletTransaction, getOrCreateWallet, TX_TYPES } from './wallet.service.js';
import { calculateCallCharge, formatMinor, billableMinutes, resolveCallRate, affordableSeconds } from './money.js';
import { getWalletRate } from './walletRate.js';
import { checkConcurrency } from '../telephony/concurrency.js';

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

    // Every billed second hits the wallet. There are no plans, so there is no
    // included-minutes allowance to draw down first — the workspace's balance is
    // the only thing that pays for a call.
    //
    // One ₹/min for everybody, set in Super Admin → Wallet Rate. The same figure
    // the public landing page quotes, charged pro-rata for the seconds actually
    // talked. Costed straight from `durationSec`: the previous version round
    // tripped through `billableMinutes(...) * 60` to rebuild a duration it
    // already had, which was harmless only while the increment was a whole
    // minute and is a second, silent rounding step at any finer granularity.
    const walletRate = await getWalletRate();
    const { ratePerMinuteCents, fxRate, amountCents } = calculateCallCharge(durationSec, walletRate);

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
      // Seconds, not the fractional minute figure — "1.0166666666 min" is not a
      // line item anyone can read on their own statement.
      note: `${call.type} ${durationSec}s @ ${formatMinor(ratePerMinuteCents)}/min`,
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
 * The shortest call worth starting, in seconds.
 *
 * Starting a call with two paise left just cuts the caller off mid-greeting,
 * which is a worse experience than a clear refusal. This used to demand a FULL
 * MINUTE of headroom, which made sense when a minute was the smallest thing that
 * could be billed; under per-second billing it strands a workspace that has real
 * money left and can genuinely afford to talk.
 */
const MIN_CALL_SECONDS = Number(process.env.MIN_CALL_SECONDS) || 15;

/**
 * Nothing sane runs longer than this, whatever the balance says. Purely a
 * backstop against a wildly funded workspace parking a socket open forever.
 */
const MAX_CALL_SECONDS = Number(process.env.MAX_CALL_SECONDS) || 4 * 60 * 60;

/**
 * PRE-CALL GATE. Decides whether a call may start, BEFORE anyone is talking,
 * and — just as importantly — HOW LONG it may run.
 *
 * This is where unpaid usage is actually prevented. Every reason returns a
 * `code` the transport can surface verbatim, because "the call just didn't
 * work" is the failure mode this is meant to eliminate — a blocked call must
 * say why.
 *
 * `maxSeconds` is the other half of the job, and the half that was missing. A
 * pass here only ever meant "you can afford to START", so a workspace with one
 * minute of balance could hold a thirty-minute call and settle it into a deep
 * negative balance — the wallet was a doorman, not a budget. Transports are
 * expected to hang up at `maxSeconds`; see the budget timers in the web and
 * phone bridges.
 *
 * @returns {Promise<{ allowed: boolean, code?: string, message?: string,
 *   maxSeconds?: number, availableCents?: number, ratePerMinuteCents?: number }>}
 */
export async function assertCanStartCall(workspaceId, { type = 'WEB_CALL' } = {}) {
  if (!BILLABLE_TYPES.has(type)) return { allowed: true, maxSeconds: Infinity };

  /*
   * Two gates: the wallet, and the carrier's concurrency ceiling.
   *
   * This used to enforce a PER-PLAN concurrency ceiling and refuse calls on a
   * cancelled subscription. Both are gone with plans: the product bills a single
   * ₹/min against a prepaid wallet, so a workspace's own balance is what bounds
   * its usage — there is no tier to exceed and nothing to renew.
   *
   * Concurrency came back for a different reason than it left, in the shape this
   * comment predicted: "the ceiling belongs in Super Admin as one platform-wide
   * number, not back on a per-customer plan". It is not about unpaid usage — the
   * wallet still handles that — it is that Plivo hard-fails calls past the
   * account ceiling with 5030 and does not queue them. Unbounded here means the
   * carrier does the bounding, by rejecting whichever call happens to be next,
   * possibly a different customer's. See telephony/concurrency.js.
   *
   * Checked BEFORE the wallet: a full pool is transient and the campaign runner
   * waits it out, whereas an empty wallet is terminal and pauses the campaign.
   * Reporting the terminal one first would pause a campaign that was merely busy.
   *
   * PHONE_CALL only. A web call is a browser WebSocket to our own server and
   * never touches a carrier leg, so counting it against a PSTN ceiling would
   * refuse browser calls to protect a resource they do not consume.
   */
  /*
   * ISSUED TOGETHER, EVALUATED IN ORDER. The three reads below are independent —
   * the concurrency ceiling, the wallet row and the platform rate know nothing
   * about each other — but they used to be awaited one after another, and each
   * is a round trip to a remote Postgres that measures ~490ms from this
   * deployment (a bare `SELECT 1` costs the same, so it is network distance, not
   * query cost). That put ~1.5s of pure waiting in front of every phone call
   * before the callee heard anything, and every call in a bulk campaign pays it
   * again.
   *
   * Starting them together does not change WHICH failure is reported: the
   * precedence below is unchanged, concurrency is still decided before the
   * wallet. That ordering is load-bearing — a full pool is transient and the
   * campaign runner waits it out, whereas an empty wallet is terminal and pauses
   * the campaign, so reporting the terminal one first would pause a campaign
   * that was merely busy.
   *
   * The only behavioural difference is that a refused call may now also have
   * created its wallet row. That row would have been created by the next call
   * anyway, and getOrCreateWallet is idempotent.
   */
  const slotPending = type === 'PHONE_CALL' ? checkConcurrency(workspaceId) : null;
  const walletPending = getOrCreateWallet(workspaceId);
  const ratePending = getWalletRate();

  if (slotPending) {
    const slot = await slotPending;
    if (!slot.allowed) {
      // Do not leave the two in-flight reads as unhandled rejections just
      // because this path returns before awaiting them.
      walletPending.catch(() => {});
      ratePending.catch(() => {});
      return { allowed: false, code: slot.code, message: slot.message, maxSeconds: 0 };
    }
  }

  /*
   * Require headroom for at least MIN_CALL_SECONDS of talk time, and hand back
   * how many seconds the remaining balance actually buys.
   */
  const wallet = await walletPending;
  // The same rate the call will actually settle at, so the pre-call check and
  // the post-call charge can never disagree.
  const { ratePerMinuteCents } = resolveCallRate(await ratePending);

  const available = wallet.balanceCents + wallet.overdraftLimitCents;
  const affordable = affordableSeconds(available, ratePerMinuteCents);
  if (affordable < MIN_CALL_SECONDS) {
    return {
      allowed: false,
      code: 'INSUFFICIENT_BALANCE',
      maxSeconds: 0,
      availableCents: available,
      ratePerMinuteCents,
      message: available <= 0
        ? 'Your wallet balance is empty. Add funds to place calls.'
        : `Your balance (${formatMinor(wallet.balanceCents)}) buys less than ${MIN_CALL_SECONDS} seconds at ${formatMinor(ratePerMinuteCents)}/min. Add funds to continue.`,
    };
  }

  /*
   * Retire calls stuck IN_PROGRESS. Nothing can genuinely still be running past
   * the cutoff. Deliberately NOT charged — the real duration is unknown, and
   * charging a guess is worse than not charging — but closed out as SKIPPED so
   * it does not linger as a PENDING bill that nothing will ever resolve.
   *
   * This used to be the ONLY thing that ever ended an abandoned web call, which
   * made every closed tab a free call. The socket now closes the call out itself
   * (ws/callFinalizer.js finalizeAbandonedCall), where the duration IS known and
   * the call is billed properly. What is left here is the genuine residue: a
   * call whose log id never reached the socket, or one whose server restarted
   * inside the backstop's grace window.
   *
   * This used to be a side effect of counting calls for the concurrency limit.
   * The limit is gone; the reaping still has to happen, so it is explicit now.
   */
  reapAbandonedCalls(workspaceId, new Date(Date.now() - STALE_CALL_MS));

  return {
    allowed: true,
    maxSeconds: Math.min(affordable, MAX_CALL_SECONDS),
    availableCents: available,
    ratePerMinuteCents,
  };
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
