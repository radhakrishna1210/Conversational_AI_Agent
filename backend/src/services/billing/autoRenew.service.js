// backend/src/services/billing/autoRenew.service.js
/**
 * Gateway-managed auto-renewal (Razorpay Subscriptions, card on file).
 *
 * WHY THIS EXISTS
 * ---------------
 * Plan PURCHASE became a direct card payment, but RENEWAL still debited the
 * wallet. So a customer who paid ₹3,456 by card in month 1 would hit month 2
 * with an empty wallet, silently fall to `past_due`, and never be told. A
 * "monthly plan" that does not renew is not a monthly plan.
 *
 * Razorpay Subscriptions hold a mandate against the customer's card and charge
 * it each cycle, emitting `subscription.charged`. That webhook is what advances
 * the local billing period.
 *
 * HOW IT COMPOSES WITH THE WALLET
 * -------------------------------
 * Each successful gateway charge is recorded as the SAME paired movement used
 * everywhere else:
 *     topup        +₹3,456   (the card payment)
 *     subscription -₹3,456   (spent on the period)
 * Net wallet effect zero, one ledger, one invoice. Nothing about auto-renewal
 * bypasses the audit trail — the card is just where the money came from.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * Razorpay does not prorate a mid-cycle plan change. Rather than pretend
 * otherwise, an upgrade keeps its existing behaviour (one-off prorated charge,
 * applied immediately) and the recurring mandate is re-pointed at the new plan
 * from the NEXT cycle by cancelling and recreating it. That is honest about the
 * gateway's limits instead of silently over- or under-charging.
 */

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import * as razorpay from './razorpay.service.js';
import { applyWalletTransaction, TX_TYPES } from './wallet.service.js';
import { planPriceMinor, getBillingCurrency, formatMinor } from './money.js';
import { generateInvoice } from './invoice.service.js';

/** Column holding the mirrored plan id for the CURRENT key mode. */
const planIdColumn = () =>
  (razorpay.getMode() === 'live' ? 'razorpayPlanIdLive' : 'razorpayPlanIdTest');

/**
 * Get (or create and cache) the Razorpay plan mirroring a local plan.
 *
 * Cached per mode. If the local price has changed since the mirror was made,
 * a NEW Razorpay plan is created: Razorpay plans are immutable, so reusing a
 * stale mirror would keep charging the old price forever — the single most
 * damaging silent failure available here.
 */
export async function ensureRazorpayPlan(plan) {
  const column = planIdColumn();
  const cachedId = plan[column];
  const { amountCents } = planPriceMinor(plan);
  if (amountCents <= 0) throw new Error(`Plan "${plan.name}" is free — nothing to auto-renew`);

  if (cachedId) {
    try {
      const existing = await razorpay.fetchPlan(cachedId);
      if (Number(existing?.item?.amount) === amountCents) return cachedId;
      logger.warn(
        { plan: plan.name, cachedId, was: existing?.item?.amount, now: amountCents },
        'Local plan price changed since the Razorpay mirror was created — creating a new mirror',
      );
    } catch (err) {
      // The id does not resolve (wrong mode, deleted, different account).
      logger.warn({ plan: plan.name, cachedId, err: err.message },
        'Cached Razorpay plan id did not resolve — recreating');
    }
  }

  const created = await razorpay.createPlan({
    name: plan.name,
    amountCents,
    currency: getBillingCurrency(),
    period: 'monthly',
    interval: 1,
    notes: { localPlanId: plan.id, planName: plan.name },
  });
  await prisma.plan.update({ where: { id: plan.id }, data: { [column]: created.id } });
  logger.info({ plan: plan.name, razorpayPlanId: created.id, mode: razorpay.getMode() },
    'Created Razorpay plan mirror');
  return created.id;
}

/**
 * Begin an auto-renewing subscription. Returns the gateway subscription id for
 * Checkout to authorize — no money moves until the customer authorizes, and
 * the local Subscription is not activated until `subscription.charged` lands.
 */
export async function startAutoRenewCheckout(workspaceId, planId) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw Object.assign(new Error('Plan not found'), { statusCode: 404 });
  if (!plan.active) throw Object.assign(new Error('That plan is no longer available'), { statusCode: 400 });

  const { amountCents } = planPriceMinor(plan);
  if (amountCents <= 0) {
    throw Object.assign(new Error('Free plans do not need auto-renewal'), { statusCode: 400 });
  }

  const rzpPlanId = await ensureRazorpayPlan(plan);
  const sub = await razorpay.createSubscription({
    planId: rzpPlanId,
    notes: { workspaceId, localPlanId: plan.id, planName: plan.name },
  });

  // Recorded now so the webhook can resolve the workspace from the gateway id
  // alone. Left INACTIVE ('pending') — an authorized mandate is not a payment,
  // and activating here would grant a plan nobody has paid for yet.
  await prisma.subscription.upsert({
    where: { workspaceId },
    create: {
      workspaceId, planId: plan.id, planName: plan.name,
      status: 'pending', billingPeriod: 'monthly',
      currentPeriodStart: new Date(), currentPeriodEnd: new Date(),
      minutesIncluded: 0, minutesUsed: 0,
      razorpaySubscriptionId: sub.id, autoRenew: true,
    },
    update: { razorpaySubscriptionId: sub.id, autoRenew: true },
  });

  logger.info({ workspaceId, planId, subscriptionId: sub.id }, 'Auto-renew subscription created (awaiting authorization)');
  return { subscriptionId: sub.id, amountCents, planName: plan.name, currency: getBillingCurrency() };
}

/**
 * Apply one gateway charge — the authorization charge and every renewal after
 * it arrive here identically, so there is one code path for "a cycle was paid".
 *
 * Idempotent on the payment id: a replayed webhook collides on the ledger's
 * unique key and is reported as a duplicate rather than granting a free month.
 */
export async function applyGatewayCharge({ razorpaySubscriptionId, paymentId, amountCents }) {
  const sub = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId },
    include: { plan: true },
  });
  if (!sub) {
    logger.error({ razorpaySubscriptionId, paymentId },
      'subscription.charged for an unknown subscription — ignoring');
    return { applied: false, reason: 'unknown-subscription' };
  }
  if (sub.lastChargeId === paymentId) {
    return { applied: false, reason: 'already-applied' };
  }

  const plan = sub.plan;
  const charged = Number.isFinite(amountCents) && amountCents > 0
    ? amountCents
    : planPriceMinor(plan).amountCents;

  // Card payment in...
  const credit = await applyWalletTransaction({
    workspaceId: sub.workspaceId,
    amountCents: charged,
    type: TX_TYPES.TOPUP,
    idempotencyKey: `rzp:payment:${paymentId}`,
    note: `${plan.name} auto-renewal payment`,
    metadata: { razorpaySubscriptionId, paymentId, planName: plan.name, autoRenew: true },
  });
  if (credit.duplicate) {
    logger.info({ razorpaySubscriptionId, paymentId }, 'Gateway charge already applied — ignoring replay');
    return { applied: false, reason: 'duplicate-payment' };
  }

  // ...and straight back out onto the plan, so the wallet nets to zero and the
  // ledger tells the whole story.
  await applyWalletTransaction({
    workspaceId: sub.workspaceId,
    amountCents: -charged,
    type: TX_TYPES.SUBSCRIPTION,
    idempotencyKey: `rzp:sub-charge:${paymentId}`,
    note: `${plan.name} subscription period`,
    metadata: { razorpaySubscriptionId, paymentId, planName: plan.name },
    // The customer has paid; never refuse to record the period they bought.
    allowNegative: true,
  });

  // ── Advance the billing period ────────────────────────────────────────────
  // Chain from the PREVIOUS boundary, not from "now". A webhook that arrives
  // late would otherwise push the billing date later every single cycle until
  // it wandered off the calendar — bill on the 1st, webhook lands on the 3rd,
  // and by month twelve the customer is billed on the 20th.
  //
  // The complication is a subscription that has lapsed for a long time: naive
  // chaining from a boundary six months ago yields a period that expired five
  // months ago, i.e. the customer pays and is immediately out of date. An
  // earlier attempt clamped the base to "no older than a day", which fixed
  // that case by abandoning the chain — reintroducing the drift for anything
  // more than a day late, which is most of them.
  //
  // Rolling forward in WHOLE MONTHS satisfies both: the day-of-month is
  // preserved (no drift) and the resulting period is guaranteed to cover the
  // present (no dead period).
  const now = new Date();
  const chainable = ['active', 'past_due'].includes(sub.status)
    && sub.currentPeriodEnd.getTime() > 0;
  let base = chainable ? new Date(sub.currentPeriodEnd) : new Date(now);
  const addMonth = (d) => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; };
  let periodEnd = addMonth(base);
  while (periodEnd <= now) {
    base = periodEnd;
    periodEnd = addMonth(periodEnd);
  }

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: 'active',
      currentPeriodStart: base,
      currentPeriodEnd: periodEnd,
      minutesIncluded: plan.includedMinutes,
      minutesUsed: 0,
      lastChargeId: paymentId,
      planName: plan.name,
    },
    include: { plan: true },
  });
  await prisma.workspace.update({
    where: { id: sub.workspaceId }, data: { planName: plan.name },
  }).catch(() => {});

  await generateInvoice({
    workspaceId: sub.workspaceId, amountCents: charged, type: 'subscription',
    planName: plan.name, periodStart: base, periodEnd,
  });

  logger.info(
    { workspaceId: sub.workspaceId, plan: plan.name, amount: formatMinor(charged), periodEnd },
    'Auto-renewal charge applied',
  );
  return { applied: true, subscription: updated, amountCents: charged };
}

/** Gateway reports the mandate is failing (card declined, expired, revoked). */
export async function markHalted(razorpaySubscriptionId) {
  const updated = await prisma.subscription.updateMany({
    where: { razorpaySubscriptionId },
    // past_due, not cancelled: the customer keeps their setup and can fix the
    // card. Included minutes stop counting because minutesUsed is not reset.
    data: { status: 'past_due' },
  });
  if (updated.count) logger.warn({ razorpaySubscriptionId }, 'Auto-renewal halted — marked past_due');
  return updated.count > 0;
}

export async function markCancelled(razorpaySubscriptionId) {
  const updated = await prisma.subscription.updateMany({
    where: { razorpaySubscriptionId },
    data: { status: 'cancelled', cancelledAt: new Date(), autoRenew: false },
  });
  return updated.count > 0;
}

/** Stop auto-renewal at the gateway, keeping access to the end of the period. */
export async function stopAutoRenew(workspaceId, { immediate = false } = {}) {
  const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (!sub?.razorpaySubscriptionId) return { stopped: false, reason: 'not-auto-renewing' };
  try {
    await razorpay.cancelSubscription(sub.razorpaySubscriptionId, { atCycleEnd: !immediate });
  } catch (err) {
    // Already cancelled at the gateway, or unreachable. Record intent locally
    // regardless — refusing to honour a cancellation because a third party is
    // down is the wrong way round.
    logger.warn({ workspaceId, err: err.message }, 'Gateway cancel failed — recording locally anyway');
  }
  await prisma.subscription.update({
    where: { workspaceId },
    data: immediate
      ? { status: 'cancelled', cancelledAt: new Date(), autoRenew: false, cancelAtPeriodEnd: false }
      : { autoRenew: false, cancelAtPeriodEnd: true },
  });
  return { stopped: true, immediate };
}
