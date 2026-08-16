// Broadcast billing: the pre-dial gate and the per-call charge.
//
// Deliberately NOT settlement.service.js. That file settles an AgentCallLog, and
// a broadcast has no agent, no transcript and no call log — its unit of billing
// is a BroadcastRecipient row. What IS shared is everything that matters for
// correctness: the same wallet, the same append-only ledger, the same
// idempotency-key guard, and the same money.js arithmetic. Only the rate and the
// row being claimed differ.
//
// The two guards against double-charging are the same pair AgentCallLog uses,
// and a broadcast needs them at least as much: a carrier status webhook is
// retried on any non-2xx, and Plivo's hangup callback can arrive twice.
//
//   - BroadcastRecipient.billingStatus moves PENDING -> BILLED under a
//     conditional UPDATE, so only one caller can claim a dial;
//   - the ledger write carries `broadcast:<recipientId>` as its idempotency key,
//     so even if the claim were bypassed the UNIQUE index refuses the second
//     charge.
//
// Unanswered dials are never charged. That is not generosity — the carrier does
// not charge us for them either, and billing for a phone that rang out is the
// fastest way to lose a bulk customer.

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { applyWalletTransaction, getOrCreateWallet, TX_TYPES } from '../billing/wallet.service.js';
import { calculateCallCharge, resolveCallRate, formatMinor } from '../billing/money.js';
import { getBroadcastRate } from '../billing/broadcastRate.js';

/**
 * What one answered call of this recording will cost the customer.
 *
 * `repeatCount` multiplies the audio, and the carrier bills the whole answered
 * leg, so a message played twice costs twice — quoting the single-play figure
 * would under-quote every broadcast that uses the repeat option.
 *
 * @returns {Promise<{ ratePerMinuteCents: number, perCallCents: number, secondsPerCall: number }>}
 */
export async function quotePerCall(durationSec, repeatCount = 1) {
  const rate = await getBroadcastRate();
  const seconds = Math.max(1, Math.ceil(Number(durationSec) || 0) * Math.max(1, Number(repeatCount) || 1));
  const { ratePerMinuteCents, amountCents } = calculateCallCharge(seconds, rate);
  return { ratePerMinuteCents, perCallCents: amountCents, secondsPerCall: seconds };
}

/**
 * Estimate a whole broadcast before it is launched.
 *
 * The honest figure is a RANGE, and the UI shows it as one: nobody knows how
 * many people will answer. `maximum` assumes every dial connects and plays in
 * full — the number the wallet has to be able to absorb — while `typical` uses a
 * pickup rate, because quoting only the ceiling makes every broadcast look
 * unaffordable and quoting only the typical case is how a wallet ends up
 * empty mid-send.
 */
export async function estimateBroadcast({ recipients, durationSec, repeatCount = 1, pickupRate = 0.35 }) {
  const { perCallCents, ratePerMinuteCents, secondsPerCall } = await quotePerCall(durationSec, repeatCount);
  const count = Math.max(0, Number(recipients) || 0);
  return {
    recipients: count,
    secondsPerCall,
    ratePerMinuteCents,
    perCallCents,
    maximumCents: perCallCents * count,
    typicalCents: Math.round(perCallCents * count * pickupRate),
    pickupRate,
  };
}

/**
 * Can this workspace afford to dial?
 *
 * One call's worth of headroom, checked per dial rather than per broadcast. A
 * broadcast of 50,000 recipients would never start if the gate demanded the full
 * theoretical maximum up front, and it must not be allowed to run the wallet
 * arbitrarily negative either — so the loop simply stops the moment the balance
 * can no longer cover the next call. That is the same shape as the conversational
 * gate, minus the talk-time budget, which a fixed-length recording does not need.
 */
export async function assertCanDial(workspaceId, perCallCents) {
  const wallet = await getOrCreateWallet(workspaceId);
  const available = wallet.balanceCents + wallet.overdraftLimitCents;
  if (available < perCallCents) {
    return {
      allowed: false,
      code: 'INSUFFICIENT_BALANCE',
      availableCents: available,
      message: available <= 0
        ? 'Your wallet balance is empty. Add funds to continue this broadcast.'
        : `Your balance (${formatMinor(wallet.balanceCents)}) no longer covers one more broadcast call `
          + `(${formatMinor(perCallCents)}). Add funds to continue.`,
    };
  }
  return { allowed: true, availableCents: available };
}

/**
 * Charge one answered broadcast call. Idempotent per recipient.
 *
 * @param {string} recipientId
 * @param {object} p
 * @param {number} p.durationSec  what the carrier says the answered leg lasted
 * @param {boolean} p.answered    false for busy / no-answer / rejected
 * @param {string} [p.failureReason]
 * @param {string} [p.providerCallId]
 */
export async function settleBroadcastCall(recipientId, {
  durationSec = 0, answered = false, failureReason = null, providerCallId = null,
} = {}) {
  if (!recipientId) return { billed: false, reason: 'no-recipient-id' };

  try {
    const recipient = await prisma.broadcastRecipient.findUnique({
      where: { id: recipientId },
      include: { broadcast: { select: { id: true, workspaceId: true } } },
    });
    if (!recipient) return { billed: false, reason: 'not-found' };

    const seconds = Math.max(0, Math.round(Number(durationSec) || 0));
    const connected = Boolean(answered) && seconds > 0;

    // The outcome is recorded whether or not there is anything to charge. A
    // no-answer is a result, not an absence of one: it is what "answered 41% of
    // 10,000" is computed from, and what a retry pass would work off.
    const outcome = {
      status: connected ? 'answered' : 'no_answer',
      durationSec: seconds,
      endedAt: new Date(),
      ...(connected ? { answeredAt: recipient.answeredAt ?? new Date() } : {}),
      ...(failureReason ? { failureReason: String(failureReason).slice(0, 500) } : {}),
      ...(providerCallId ? { providerCallId } : {}),
    };

    if (!connected) {
      await prisma.broadcastRecipient.updateMany({
        where: { id: recipientId, billingStatus: 'PENDING' },
        data: { ...outcome, billingStatus: 'SKIPPED' },
      });
      return { billed: false, reason: 'not-answered' };
    }

    const rate = await getBroadcastRate();
    const { ratePerMinuteCents, fxRate, amountCents, minutes } = calculateCallCharge(seconds, rate);

    // Claim before charging, for the same reason settleCall does: dying between
    // the two under-bills one call, which is strictly safer than the reverse and
    // is visible in the audit as BILLED with billedCents 0 and no ledger row.
    const claimed = await prisma.broadcastRecipient.updateMany({
      where: { id: recipientId, billingStatus: 'PENDING' },
      data: { ...outcome, billingStatus: 'BILLED', billedCents: amountCents, ratePerMinuteCents },
    });
    if (claimed.count === 0) return { billed: false, reason: 'claimed-concurrently' };

    if (amountCents > 0) {
      const result = await applyWalletTransaction({
        workspaceId: recipient.broadcast.workspaceId,
        amountCents: -amountCents,
        type: TX_TYPES.USAGE,
        idempotencyKey: `broadcast:${recipientId}`,
        note: `Voice broadcast ${seconds}s @ ${formatMinor(ratePerMinuteCents)}/min`,
        metadata: {
          broadcastId: recipient.broadcastId,
          recipientId,
          type: 'BROADCAST_CALL',
          phoneNumber: recipient.phoneNumber,
          durationSec: seconds,
          billedMinutes: minutes,
          ratePerMinuteCents,
        },
        fxRateUsdToInr: fxRate,
        // Never refuse: the call already happened. The dial-time gate is what
        // prevents a broadcast running the balance down in the first place.
        allowNegative: true,
      });
      logger.info(
        { recipientId, amountCents, balanceAfter: result.balanceCents, duplicate: result.duplicate },
        `Settled broadcast call: ${formatMinor(amountCents)}`,
      );
    }

    return { billed: true, amountCents, seconds };
  } catch (err) {
    logger.error({ recipientId, err: err.message }, 'Broadcast settlement failed');
    // FAILED, not left PENDING: a row nothing will ever revisit must not read as
    // "awaiting billing" forever. It is visible and retryable as FAILED.
    await prisma.broadcastRecipient.updateMany({
      where: { id: recipientId, billingStatus: 'PENDING' },
      data: { billingStatus: 'FAILED', endedAt: new Date() },
    }).catch(() => {});
    return { billed: false, reason: 'error', error: err.message };
  }
}

/** Rupees-per-minute figure the UI quotes, without the full estimate machinery. */
export async function currentBroadcastRate() {
  const rate = await getBroadcastRate();
  const { ratePerMinuteCents } = resolveCallRate(rate);
  return { perMinuteInr: rate.perMinuteInr, ratePerMinuteCents };
}
