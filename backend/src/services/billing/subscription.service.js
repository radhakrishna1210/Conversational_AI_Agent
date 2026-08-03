// backend/src/services/billing/subscription.service.js
/**
 * Subscription lifecycle (BUG-002): subscribe, upgrade, downgrade, renew,
 * cancel — with proration on plan changes.
 *
 * WHY UPGRADES AND DOWNGRADES BEHAVE DIFFERENTLY
 * ----------------------------------------------
 * An UPGRADE takes effect immediately and is charged pro-rata: the customer
 * asked for more capacity now, and billing them the unused remainder of the
 * difference is the fair exchange.
 *
 * A DOWNGRADE is DEFERRED to the period boundary. Applying it immediately would
 * retroactively remove capacity the customer already paid for through the end
 * of the period — and, worse, could instantly put them over the new plan's
 * agent or concurrency limit, breaking live calls. It is parked in
 * `pendingPlanId` and applied at renewal.
 *
 * Charges route through the WALLET rather than the card. The customer tops up
 * once and the balance settles subscriptions and usage alike, which keeps one
 * ledger as the single audit trail instead of two reconciling systems.
 */

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { applyWalletTransaction, TX_TYPES } from './wallet.service.js';
import { calculateProration, planPriceMinor, formatMinor } from './money.js';
import { generateInvoice } from './invoice.service.js';

const addPeriod = (from, billingPeriod) => {
  const d = new Date(from);
  if (billingPeriod === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
};

export const getSubscription = (workspaceId) =>
  prisma.subscription.findUnique({ where: { workspaceId }, include: { plan: true } });

/**
 * Price a plan change WITHOUT charging anything.
 *
 * Exists so plan purchase can be a direct card payment instead of requiring the
 * customer to pre-fund a wallet. The checkout endpoint needs to know the exact
 * amount to collect before any money moves, and it must apply the same
 * new/upgrade/downgrade rules the charging path uses — computing the price in
 * two places is how a quoted amount and a charged amount drift apart.
 *
 * @returns {Promise<{
 *   kind: 'new'|'upgrade'|'downgrade'|'unchanged',
 *   amountCents: number,       // what to collect now (0 for downgrade/free)
 *   requiresPayment: boolean,
 *   deferred: boolean,         // takes effect at the period boundary
 *   plan: object, planName: string, effectiveAt?: Date, proration?: object,
 * }>}
 */
export async function quoteSubscriptionChange(workspaceId, planId) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw Object.assign(new Error('Plan not found'), { statusCode: 404 });
  if (!plan.active) throw Object.assign(new Error('That plan is no longer available'), { statusCode: 400 });

  const existing = await getSubscription(workspaceId);
  const base = { plan, planName: plan.name };

  if (!existing || ['cancelled', 'expired'].includes(existing.status)) {
    const { amountCents } = planPriceMinor(plan);
    return { ...base, kind: 'new', amountCents, requiresPayment: amountCents > 0, deferred: false };
  }

  if (existing.planId === plan.id && !existing.pendingPlanId) {
    return { ...base, kind: 'unchanged', amountCents: 0, requiresPayment: false, deferred: false };
  }

  const isUpgrade = planPriceMinor(plan).amountCents > planPriceMinor(existing.plan).amountCents;
  if (!isUpgrade) {
    // Downgrades are deferred and never collect money up front — the customer
    // has already paid through the end of the current period.
    return {
      ...base, kind: 'downgrade', amountCents: 0, requiresPayment: false,
      deferred: true, effectiveAt: existing.currentPeriodEnd,
    };
  }

  const proration = calculateProration({
    oldPlan: existing.plan, newPlan: plan,
    periodStart: existing.currentPeriodStart, periodEnd: existing.currentPeriodEnd,
    now: new Date(),
  });
  const amountCents = Math.max(0, proration.amountCents);
  return {
    ...base, kind: 'upgrade', amountCents,
    requiresPayment: amountCents > 0, deferred: false, proration,
  };
}

/**
 * Start a subscription, or change the plan of an existing one.
 *
 * @returns {Promise<{ subscription: object, chargedCents: number, deferred: boolean }>}
 */
export async function subscribe(workspaceId, planId, { billingPeriod = 'monthly', createdById = null } = {}) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw Object.assign(new Error('Plan not found'), { statusCode: 404 });
  if (!plan.active) throw Object.assign(new Error('That plan is no longer available'), { statusCode: 400 });

  const existing = await getSubscription(workspaceId);
  const now = new Date();

  // ── First subscription: charge the full price, start a fresh period ────────
  if (!existing || ['cancelled', 'expired'].includes(existing.status)) {
    // INR-native when the plan has it; falls back to USD x FX otherwise.
    const { amountCents: priceCents, fxRate: appliedFx } = planPriceMinor(plan);
    if (priceCents > 0) {
      await applyWalletTransaction({
        workspaceId,
        amountCents: -priceCents,
        type: TX_TYPES.SUBSCRIPTION,
        idempotencyKey: `sub:${workspaceId}:${plan.id}:${now.toISOString().slice(0, 10)}:new`,
        note: `${plan.name} subscription`,
        metadata: { planId: plan.id, planName: plan.name, billingPeriod },
        fxRateUsdToInr: appliedFx,
        createdById,
      });
    }
    const periodEnd = addPeriod(now, billingPeriod);
    const subscription = await prisma.subscription.upsert({
      where: { workspaceId },
      create: {
        workspaceId, planId: plan.id, planName: plan.name, status: 'active',
        billingPeriod, currentPeriodStart: now, currentPeriodEnd: periodEnd,
        minutesIncluded: plan.includedMinutes, minutesUsed: 0,
      },
      update: {
        planId: plan.id, planName: plan.name, status: 'active',
        billingPeriod, currentPeriodStart: now, currentPeriodEnd: periodEnd,
        minutesIncluded: plan.includedMinutes, minutesUsed: 0,
        cancelAtPeriodEnd: false, cancelledAt: null, pendingPlanId: null,
      },
      include: { plan: true },
    });
    await prisma.workspace.update({ where: { id: workspaceId }, data: { planName: plan.name } });
    if (priceCents > 0) {
      await generateInvoice({
        workspaceId, amountCents: priceCents, type: 'subscription',
        planName: plan.name, periodStart: now, periodEnd,
      });
    }
    logger.info({ workspaceId, planName: plan.name }, 'Subscription started');
    return { subscription, chargedCents: priceCents, deferred: false };
  }

  if (existing.planId === plan.id && !existing.pendingPlanId) {
    return { subscription: existing, chargedCents: 0, deferred: false };
  }

  // Compare the prices ACTUALLY charged, not the USD catalogue figures. Once a
  // plan carries a native INR price the two orderings can diverge (an admin
  // repricing in INR without touching priceUsd), and getting this backwards
  // would apply a downgrade immediately — removing capacity the customer has
  // already paid for — or defer an upgrade they just asked for.
  const isUpgrade = planPriceMinor(plan).amountCents > planPriceMinor(existing.plan).amountCents;

  // ── Downgrade: defer to the period boundary ───────────────────────────────
  if (!isUpgrade) {
    const subscription = await prisma.subscription.update({
      where: { workspaceId },
      data: { pendingPlanId: plan.id, cancelAtPeriodEnd: false },
      include: { plan: true },
    });
    logger.info(
      { workspaceId, from: existing.planName, to: plan.name, effective: existing.currentPeriodEnd },
      'Downgrade scheduled for the end of the current period',
    );
    return { subscription, chargedCents: 0, deferred: true, effectiveAt: existing.currentPeriodEnd };
  }

  // ── Upgrade: immediate, prorated ──────────────────────────────────────────
  const proration = calculateProration({
    oldPlan: existing.plan, newPlan: plan,
    periodStart: existing.currentPeriodStart, periodEnd: existing.currentPeriodEnd, now,
  });

  if (proration.amountCents > 0) {
    await applyWalletTransaction({
      workspaceId,
      amountCents: -proration.amountCents,
      type: TX_TYPES.SUBSCRIPTION,
      // Bound to the period, so a double-submitted upgrade cannot charge twice.
      idempotencyKey: `sub:${workspaceId}:${plan.id}:${existing.currentPeriodEnd.toISOString()}:upgrade`,
      note: `Upgrade ${existing.planName} -> ${plan.name} (prorated)`,
      metadata: {
        fromPlan: existing.planName, toPlan: plan.name,
        unusedFraction: proration.unusedFraction,
        creditCents: proration.creditCents, chargeCents: proration.chargeCents,
      },
      fxRateUsdToInr: proration.fxRate,
      createdById,
    });
  }

  const subscription = await prisma.subscription.update({
    where: { workspaceId },
    data: {
      planId: plan.id, planName: plan.name, pendingPlanId: null,
      // Included minutes scale to the new plan; minutes already consumed stay
      // consumed, so an upgrade cannot be used to reset a spent allowance.
      minutesIncluded: plan.includedMinutes,
    },
    include: { plan: true },
  });
  await prisma.workspace.update({ where: { id: workspaceId }, data: { planName: plan.name } });

  if (proration.amountCents > 0) {
    await generateInvoice({
      workspaceId, amountCents: proration.amountCents, type: 'subscription',
      planName: `${plan.name} (prorated upgrade)`,
      periodStart: now, periodEnd: existing.currentPeriodEnd,
    });
  }

  logger.info(
    { workspaceId, from: existing.planName, to: plan.name, charged: formatMinor(proration.amountCents) },
    'Subscription upgraded',
  );
  return { subscription, chargedCents: proration.amountCents, deferred: false, proration };
}

/**
 * Cancel. Defaults to end-of-period: the customer paid through the boundary and
 * cutting service instantly would be taking money for nothing.
 */
export async function cancelSubscription(workspaceId, { immediate = false } = {}) {
  const existing = await getSubscription(workspaceId);
  if (!existing) throw Object.assign(new Error('No active subscription'), { statusCode: 404 });

  const subscription = await prisma.subscription.update({
    where: { workspaceId },
    data: immediate
      ? { status: 'cancelled', cancelledAt: new Date(), cancelAtPeriodEnd: false, pendingPlanId: null }
      : { cancelAtPeriodEnd: true, pendingPlanId: null },
    include: { plan: true },
  });
  logger.info({ workspaceId, immediate }, 'Subscription cancellation recorded');
  return subscription;
}

/** Undo a pending cancellation or downgrade before it takes effect. */
export async function resumeSubscription(workspaceId) {
  return prisma.subscription.update({
    where: { workspaceId },
    data: { cancelAtPeriodEnd: false, pendingPlanId: null, status: 'active', cancelledAt: null },
    include: { plan: true },
  });
}

/**
 * Roll one subscription into its next period. Applies any pending downgrade,
 * honours a pending cancellation, resets the minute allowance, and charges the
 * new period from the wallet.
 *
 * Idempotent per period: the ledger key includes the period boundary, so a
 * re-run of the renewal job cannot double-charge.
 */
export async function renewSubscription(workspaceId, { now = new Date() } = {}) {
  const sub = await getSubscription(workspaceId);
  if (!sub || sub.status === 'cancelled') return { renewed: false, reason: 'not-active' };
  if (sub.currentPeriodEnd > now) return { renewed: false, reason: 'not-due' };

  if (sub.cancelAtPeriodEnd) {
    const updated = await prisma.subscription.update({
      where: { workspaceId },
      data: { status: 'cancelled', cancelledAt: now },
      include: { plan: true },
    });
    logger.info({ workspaceId }, 'Subscription ended at period boundary as scheduled');
    return { renewed: false, reason: 'cancelled', subscription: updated };
  }

  // A scheduled downgrade takes effect now.
  const plan = sub.pendingPlanId
    ? await prisma.plan.findUnique({ where: { id: sub.pendingPlanId } })
    : sub.plan;
  if (!plan) return { renewed: false, reason: 'plan-missing' };

  const { amountCents: priceCents, fxRate: appliedFx } = planPriceMinor(plan);
  const periodStart = sub.currentPeriodEnd;
  const periodEnd = addPeriod(periodStart, sub.billingPeriod);

  if (priceCents > 0) {
    try {
      await applyWalletTransaction({
        workspaceId,
        amountCents: -priceCents,
        type: TX_TYPES.SUBSCRIPTION,
        idempotencyKey: `sub:${workspaceId}:renew:${periodStart.toISOString()}`,
        note: `${plan.name} renewal`,
        metadata: { planId: plan.id, planName: plan.name, periodStart, periodEnd },
        fxRateUsdToInr: appliedFx,
      });
    } catch (err) {
      if (err.code === 'INSUFFICIENT_BALANCE') {
        // past_due, not cancelled: the customer keeps their data and can top up
        // to recover. assertCanStartCall still blocks new calls on balance.
        const updated = await prisma.subscription.update({
          where: { workspaceId }, data: { status: 'past_due' }, include: { plan: true },
        });
        logger.warn({ workspaceId, plan: plan.name }, 'Renewal failed — insufficient balance, marked past_due');
        return { renewed: false, reason: 'insufficient-balance', subscription: updated };
      }
      throw err;
    }
  }

  const subscription = await prisma.subscription.update({
    where: { workspaceId },
    data: {
      planId: plan.id, planName: plan.name, pendingPlanId: null, status: 'active',
      currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
      minutesIncluded: plan.includedMinutes, minutesUsed: 0,
    },
    include: { plan: true },
  });
  await prisma.workspace.update({ where: { id: workspaceId }, data: { planName: plan.name } });
  if (priceCents > 0) {
    await generateInvoice({
      workspaceId, amountCents: priceCents, type: 'subscription',
      planName: plan.name, periodStart, periodEnd,
    });
  }
  logger.info({ workspaceId, planName: plan.name, periodEnd }, 'Subscription renewed');
  return { renewed: true, subscription };
}

/** Renew everything that is due. Safe to run repeatedly (see idempotency). */
export async function renewDueSubscriptions({ now = new Date() } = {}) {
  const due = await prisma.subscription.findMany({
    where: { status: { in: ['active', 'past_due'] }, currentPeriodEnd: { lte: now } },
    select: { workspaceId: true },
  });
  const results = [];
  for (const { workspaceId } of due) {
    try {
      results.push({ workspaceId, ...(await renewSubscription(workspaceId, { now })) });
    } catch (err) {
      logger.error({ workspaceId, err: err.message }, 'Subscription renewal failed');
      results.push({ workspaceId, renewed: false, reason: 'error', error: err.message });
    }
  }
  return results;
}
