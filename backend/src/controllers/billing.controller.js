// backend/src/controllers/billing.controller.js
/**
 * Billing HTTP surface (BUG-002): wallet, top-ups, the Razorpay webhook,
 * subscriptions and invoices.
 *
 * THE CENTRAL RULE: a credit is only ever based on what RAZORPAY says, never on
 * what a client says. A client is free to lie, to replay an old success, or to
 * never call back at all, and none of those may move a balance.
 *
 * Two paths can credit, because they fail in different ways and neither alone
 * is sufficient:
 *   - the WEBHOOK is server-to-server and retries, so it survives a closed tab,
 *     lost signal, or a UPI payment finished on a phone — but it can lag;
 *   - the CHECKOUT CALLBACK is instant, but only fires if the browser survives.
 * The callback verifies the signature and then asks Razorpay directly whether
 * the payment is captured; it never takes the browser's word for it. Both share
 * the idempotency key `rzp:payment:<id>`, so whichever lands first credits and
 * the other is a no-op.
 *
 * Plan purchases are collected by card and do NOT require a funded wallet. The
 * payment is credited and immediately spent on the subscription, so the ledger
 * keeps a complete record while the customer never has to pre-fund anything.
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import * as razorpay from '../services/billing/razorpay.service.js';
import { applyWalletTransaction, getBalance, auditWallet, TX_TYPES } from '../services/billing/wallet.service.js';
import { generateInvoice, listInvoices } from '../services/billing/invoice.service.js';
import * as subs from '../services/billing/subscription.service.js';
import * as autoRenew from '../services/billing/autoRenew.service.js';
import { getBillingCurrency, formatMinor } from '../services/billing/money.js';
import { resolveWorkspacePlan } from '../services/billing/settlement.service.js';
import { writeAudit, AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../services/audit.service.js';

const MIN_TOPUP_CENTS = Number(process.env.MIN_TOPUP_CENTS) || 10_000;   // ₹100
const MAX_TOPUP_CENTS = Number(process.env.MAX_TOPUP_CENTS) || 50_000_00; // ₹50,000

/** GET /workspaces/:workspaceId/wallet */
export const getWallet = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const wallet = await getBalance(workspaceId);
    const transactions = await prisma.walletTransaction.findMany({
      where: { wallet: { workspaceId } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const { plan, subscription } = await resolveWorkspacePlan(workspaceId);
    res.json({
      ...wallet,
      transactions: transactions.map((t) => ({
        ...t,
        metadata: (() => { try { return JSON.parse(t.metadata); } catch { return {}; } })(),
      })),
      // Honest capability flag — the client renders a real button or an
      // explanation, never a dead control.
      topUpAvailable: razorpay.isRazorpayConfigured(),
      topUpUnavailableReason: razorpay.isRazorpayConfigured()
        ? null
        : 'Online payments are not configured on this deployment. An admin can credit your wallet manually.',
      razorpayKeyId: razorpay.getPublicKeyId(),
      minTopUpCents: MIN_TOPUP_CENTS,
      maxTopUpCents: MAX_TOPUP_CENTS,
      plan: plan ? { id: plan.id, name: plan.name, perMinuteUsd: plan.perMinuteUsd } : null,
      subscription: subscription
        ? {
          status: subscription.status,
          planName: subscription.planName,
          currentPeriodEnd: subscription.currentPeriodEnd,
          minutesIncluded: subscription.minutesIncluded,
          minutesUsed: subscription.minutesUsed,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          pendingPlanId: subscription.pendingPlanId,
          // Whether the card will be charged again automatically, so the UI can
          // say "renews on X" rather than leaving the customer to guess.
          autoRenew: subscription.autoRenew,
        }
        : null,
    });
  } catch (err) {
    logger.error('getWallet failed', err);
    res.status(500).json({ error: 'Failed to load wallet' });
  }
};

/**
 * POST /workspaces/:workspaceId/wallet/topup  { amountCents }
 * Creates a gateway order. Credits NOTHING — the webhook does that.
 */
export const createTopUpOrder = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    if (!razorpay.isRazorpayConfigured()) {
      return res.status(503).json({ error: 'Online payments are not configured on this deployment.' });
    }
    const amountCents = Math.trunc(Number(req.body?.amountCents));
    if (!Number.isFinite(amountCents) || amountCents < MIN_TOPUP_CENTS || amountCents > MAX_TOPUP_CENTS) {
      return res.status(400).json({
        error: `amountCents must be between ${MIN_TOPUP_CENTS} and ${MAX_TOPUP_CENTS} (${formatMinor(MIN_TOPUP_CENTS)}–${formatMinor(MAX_TOPUP_CENTS)})`,
      });
    }

    const currency = getBillingCurrency();
    const order = await razorpay.createOrder({
      amountCents, currency,
      receipt: `top_${workspaceId.slice(0, 12)}_${Date.now()}`,
      // Echoed back on the webhook. This is how a payment is bound to a
      // workspace without trusting anything the browser later says.
      notes: { workspaceId, purpose: 'topup' },
    });

    // Recorded BEFORE payment, so a webhook naming an unknown order is
    // detectable as a misroute or forgery instead of silently crediting.
    await prisma.paymentOrder.create({
      data: {
        workspaceId, provider: 'razorpay', providerOrderId: order.id,
        amountCents, currency, purpose: 'topup', status: 'created',
        notes: JSON.stringify({ receipt: order.receipt }),
      },
    });

    logger.info({ workspaceId, orderId: order.id, amountCents }, 'Top-up order created');
    res.status(201).json({
      orderId: order.id, amountCents, currency,
      razorpayKeyId: razorpay.getPublicKeyId(),
    });
  } catch (err) {
    logger.error('createTopUpOrder failed', err);
    res.status(500).json({ error: err.message || 'Could not start the payment' });
  }
};

/**
 * POST /workspaces/:workspaceId/wallet/topup/verify
 *
 * The browser reporting back from Checkout. This is the SECOND of two paths
 * that can credit a top-up; the webhook is the other. Both are needed, because
 * they fail in different ways:
 *
 *   - the webhook is server-to-server and RETRIES, so it survives the customer
 *     closing the tab, losing signal, or paying by UPI on their phone and never
 *     returning — but it can lag by seconds;
 *   - this callback is instant, but only fires if the browser is alive and
 *     reaches us, so it cannot be the only path.
 *
 * Running both is safe because they share one idempotency key
 * (`rzp:payment:<id>`): whichever arrives first credits, the other is a no-op.
 *
 * WHAT IS NOT TRUSTED: the client's claim that payment succeeded. The signature
 * proves the browser is relaying a genuine Razorpay result and not a forgery,
 * and then we ask RAZORPAY ITSELF whether the payment is captured. A valid
 * signature is replayable — a customer could resend a real one from an earlier
 * ₹1,000 payment — so authenticity alone is not authority. The credit is based
 * on Razorpay's own answer, and bounded by the order we created beforehand.
 */
export const verifyTopUp = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { orderId, paymentId, signature } = req.body ?? {};

    if (!razorpay.verifyPaymentSignature({ orderId, paymentId, signature })) {
      logger.warn({ orderId, paymentId }, 'Top-up verify: bad checkout signature');
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    const order = await prisma.paymentOrder.findUnique({ where: { providerOrderId: orderId } });
    // An order we never created must never credit, even with a valid signature.
    if (!order) {
      logger.error({ orderId, paymentId }, 'Top-up verify: unknown order');
      return res.status(404).json({ error: 'Unknown payment order' });
    }
    if (order.workspaceId !== workspaceId) {
      // Stops a valid payment for workspace A being redeemed against B.
      logger.error({ orderId, order: order.workspaceId, claimed: workspaceId },
        'Top-up verify: order belongs to a different workspace');
      return res.status(403).json({ error: 'This payment does not belong to this workspace' });
    }

    if (order.status === 'paid') {
      const { balanceCents } = await getBalance(workspaceId);
      return res.json({ verified: true, credited: true, status: 'paid', balanceCents,
        message: 'Payment received and wallet credited.' });
    }

    // Ask Razorpay directly rather than believing the browser.
    let payment;
    try {
      payment = await razorpay.fetchPayment(paymentId);
    } catch (err) {
      logger.warn({ orderId, paymentId, err: err.message },
        'Could not confirm payment with Razorpay — leaving it to the webhook');
      return res.json({ verified: true, credited: false, status: order.status,
        message: 'Payment confirmed. Your balance will update momentarily.' });
    }

    if (payment.status !== 'captured') {
      // authorized-but-not-captured, or failed. Not money yet.
      return res.json({ verified: true, credited: false, status: payment.status,
        message: 'Payment is still being processed. Your balance will update shortly.' });
    }
    if (Number(payment.amount) !== order.amountCents) {
      logger.error({ orderId, expected: order.amountCents, received: payment.amount },
        'Top-up verify: amount mismatch — refusing to credit');
      return res.status(409).json({ error: 'Payment amount does not match the order' });
    }

    const result = await applyWalletTransaction({
      workspaceId,
      amountCents: order.amountCents,
      type: TX_TYPES.TOPUP,
      // Same key the webhook uses — whichever lands first wins, the other no-ops.
      idempotencyKey: `rzp:payment:${payment.id}`,
      note: `Wallet top-up (${payment.method ?? 'razorpay'})`,
      metadata: { orderId, paymentId: payment.id, method: payment.method, via: 'checkout-callback' },
    });

    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'paid', providerPaymentId: payment.id, paidAt: new Date() },
    }).catch(() => { /* webhook may have won the race; harmless */ });

    await generateInvoice({
      workspaceId, amountCents: order.amountCents,
      type: order.purpose === 'subscription' ? 'subscription' : 'topup',
      paymentOrderId: order.id,
    });

    logger.info({ workspaceId, paymentId: payment.id, amountCents: order.amountCents,
      duplicate: result.duplicate }, `Wallet credited ${formatMinor(order.amountCents)} via checkout callback`);

    await activateSubscriptionForOrder(order);
    const isSubscription = order.purpose === 'subscription';
    const balance = await getBalance(workspaceId);

    res.json({
      verified: true, credited: true, status: 'paid',
      balanceCents: balance.balanceCents,
      purpose: order.purpose,
      message: isSubscription
        ? 'Payment received. Your plan is now active.'
        : `Payment received. ${formatMinor(order.amountCents)} added to your wallet.`,
    });
  } catch (err) {
    logger.error('verifyTopUp failed', err);
    res.status(500).json({ error: 'Verification failed' });
  }
};

/**
 * POST /billing/razorpay/webhook  (unauthenticated by design — the HMAC IS the
 * authentication). Mounted with express.raw so `req.body` is the exact bytes.
 *
 * THE ONLY PLACE A TOP-UP CREDITS A WALLET.
 */
export const razorpayWebhook = async (req, res) => {
  const signature = req.get('X-Razorpay-Signature');
  const rawBody = req.body; // Buffer, thanks to express.raw

  if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
    logger.warn({ ip: req.ip }, 'Rejected Razorpay webhook: invalid signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  } catch {
    return res.status(400).json({ error: 'Malformed payload' });
  }

  // ACK FAST. Razorpay retries on non-2xx, and a slow handler causes duplicate
  // deliveries — harmless here thanks to idempotency, but pointless load. The
  // work is done after responding; every step is safe to replay.
  res.json({ received: true });

  try {
    await handleRazorpayEvent(event);
  } catch (err) {
    logger.error({ event: event?.event, err: err.message }, 'Razorpay webhook processing failed');
  }
};

async function handleRazorpayEvent(event) {
  const type = event?.event;
  const payment = event?.payload?.payment?.entity;

  if (type === 'payment.captured' || type === 'order.paid') {
    if (!payment) return;
    const orderId = payment.order_id;
    const order = await prisma.paymentOrder.findUnique({ where: { providerOrderId: orderId } });
    if (!order) {
      // Never credit on an order we did not create. This is the check that
      // stops a forged-but-somehow-signed event, or a webhook from another
      // environment sharing the secret, from minting balance.
      logger.error({ orderId, paymentId: payment.id }, 'Webhook for an unknown order — ignoring');
      return;
    }
    if (order.status === 'paid') {
      logger.info({ orderId }, 'Webhook replay for an already-credited order — ignoring');
      return;
    }

    // Trust the AMOUNT from the gateway, not from our own record, and refuse a
    // mismatch: it means the customer paid something other than what was
    // ordered, which must be investigated rather than auto-credited.
    if (Number(payment.amount) !== order.amountCents) {
      logger.error(
        { orderId, expected: order.amountCents, received: payment.amount },
        'Webhook amount does not match the order — refusing to credit',
      );
      await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'failed', notes: JSON.stringify({ reason: 'amount-mismatch', received: payment.amount }) },
      });
      return;
    }

    const result = await applyWalletTransaction({
      workspaceId: order.workspaceId,
      amountCents: order.amountCents,
      type: TX_TYPES.TOPUP,
      // Keyed on the gateway's payment id: retried webhooks collide here.
      idempotencyKey: `rzp:payment:${payment.id}`,
      note: `Wallet top-up (${payment.method ?? 'razorpay'})`,
      metadata: { orderId, paymentId: payment.id, method: payment.method },
    });

    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'paid', providerPaymentId: payment.id, paidAt: new Date() },
    });

    await generateInvoice({
      workspaceId: order.workspaceId,
      amountCents: order.amountCents,
      type: order.purpose === 'subscription' ? 'subscription' : 'topup',
      paymentOrderId: order.id,
    });

    logger.info(
      { workspaceId: order.workspaceId, paymentId: payment.id,
        amountCents: order.amountCents, duplicate: result.duplicate },
      `Wallet credited ${formatMinor(order.amountCents)} via Razorpay`,
    );

    // A subscription purchase: the credit above funded it, now spend it. The
    // pair nets to zero on the balance and leaves both entries on the ledger.
    await activateSubscriptionForOrder(order);
    return;
  }

  if (type === 'payment.failed') {
    const orderId = payment?.order_id;
    if (orderId) {
      await prisma.paymentOrder.updateMany({
        where: { providerOrderId: orderId, status: 'created' },
        data: { status: 'failed' },
      });
    }
    return;
  }

  // The card was charged for a cycle — the first one (authorization) and every
  // renewal after it arrive here identically.
  if (type === 'subscription.charged') {
    const sub = event?.payload?.subscription?.entity;
    if (!sub?.id) return;
    await autoRenew.applyGatewayCharge({
      razorpaySubscriptionId: sub.id,
      // The payment id is the idempotency anchor; without it a replay cannot be
      // distinguished from a genuine second cycle, so refuse rather than guess.
      paymentId: payment?.id,
      amountCents: Number(payment?.amount) || undefined,
    });
    return;
  }

  if (type === 'subscription.halted' || type === 'subscription.pending') {
    // Card declined / expired / mandate revoked.
    const sub = event?.payload?.subscription?.entity;
    if (sub?.id) await autoRenew.markHalted(sub.id);
    return;
  }

  if (type === 'subscription.cancelled' || type === 'subscription.completed') {
    const sub = event?.payload?.subscription?.entity;
    if (sub?.id) await autoRenew.markCancelled(sub.id);
    return;
  }

  logger.debug({ type }, 'Unhandled Razorpay webhook event');
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * POST /workspaces/:workspaceId/subscription/checkout  { planId }
 *
 * Buy a plan by CARD, independently of wallet balance.
 *
 * Requiring the wallet to be pre-funded made buying a plan a two-step chore
 * (top up, then subscribe) for no benefit the customer could see. This collects
 * the plan price directly.
 *
 * The single-ledger property is kept, not traded away: when the payment lands,
 * the wallet is credited and the subscription debit fires immediately after, so
 * the ledger reads
 *     topup        +3,456
 *     subscription -3,456
 * — net wallet movement zero, subscription active, and every rupee still
 * accounted for in one place. The customer never has to think about a wallet;
 * an auditor still sees the whole story there.
 *
 * Nothing is charged for a downgrade (deferred to the period boundary) or a
 * free plan, so those apply immediately with no payment step.
 */
export const createSubscriptionCheckout = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { planId } = req.body ?? {};
    if (!planId) return res.status(400).json({ error: 'planId is required' });

    const quote = await subs.quoteSubscriptionChange(workspaceId, planId);

    // No money to collect — apply it now rather than opening an empty checkout.
    if (!quote.requiresPayment) {
      const out = await subs.subscribe(workspaceId, planId, { createdById: req.user?.userId ?? null });
      return res.json({
        requiresPayment: false,
        subscription: out.subscription,
        deferred: out.deferred,
        effectiveAt: out.effectiveAt ?? null,
        message: out.deferred
          ? `Your plan will change to ${quote.planName} on ${new Date(out.effectiveAt).toDateString()}.`
          : quote.kind === 'unchanged'
            ? `You are already on ${quote.planName}.`
            : `You are now on ${quote.planName}.`,
      });
    }

    if (!razorpay.isRazorpayConfigured()) {
      return res.status(503).json({ error: 'Online payments are not configured on this deployment.' });
    }

    const currency = getBillingCurrency();
    const order = await razorpay.createOrder({
      amountCents: quote.amountCents, currency,
      receipt: `sub_${workspaceId.slice(0, 10)}_${Date.now()}`,
      notes: { workspaceId, purpose: 'subscription', planId, planName: quote.planName },
    });

    // Recorded before payment, carrying the plan — this is what tells the
    // webhook/callback which subscription to activate once the money lands.
    await prisma.paymentOrder.create({
      data: {
        workspaceId, provider: 'razorpay', providerOrderId: order.id,
        amountCents: quote.amountCents, currency, purpose: 'subscription',
        planId, status: 'created',
        notes: JSON.stringify({ kind: quote.kind, planName: quote.planName }),
      },
    });

    logger.info({ workspaceId, planId, kind: quote.kind, amountCents: quote.amountCents },
      'Subscription checkout order created');

    res.status(201).json({
      requiresPayment: true,
      orderId: order.id,
      amountCents: quote.amountCents,
      currency,
      razorpayKeyId: razorpay.getPublicKeyId(),
      kind: quote.kind,
      planName: quote.planName,
    });
  } catch (err) {
    logger.error('createSubscriptionCheckout failed', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Could not start the plan purchase' });
  }
};

/**
 * Activate the subscription a paid order was for.
 *
 * Called from BOTH credit paths (webhook and checkout callback) after the
 * wallet has been credited, so whichever arrives first completes the purchase.
 * Safe to run twice: subscribe() is idempotent per plan+period via its own
 * ledger key, and the wallet debit cannot double-apply.
 */
async function activateSubscriptionForOrder(order) {
  if (order.purpose !== 'subscription' || !order.planId) return;
  try {
    const out = await subs.subscribe(order.workspaceId, order.planId);
    logger.info(
      { workspaceId: order.workspaceId, planName: out.subscription?.planName, chargedCents: out.chargedCents },
      'Subscription activated from paid order',
    );
  } catch (err) {
    // The customer HAS paid at this point, so the wallet already holds the
    // money — never lose it. Log loudly; the balance is recoverable and the
    // purchase can be retried from the dashboard.
    logger.error(
      { workspaceId: order.workspaceId, planId: order.planId, orderId: order.providerOrderId, err: err.message },
      'Payment captured but subscription activation FAILED — balance retained, needs follow-up',
    );
  }
}

export const subscribeToPlan = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { planId, billingPeriod } = req.body ?? {};
    if (!planId) return res.status(400).json({ error: 'planId is required' });
    const out = await subs.subscribe(workspaceId, planId, {
      billingPeriod: billingPeriod === 'yearly' ? 'yearly' : 'monthly',
      createdById: req.user?.userId ?? null,
    });
    res.json({
      success: true,
      subscription: out.subscription,
      chargedCents: out.chargedCents,
      deferred: out.deferred,
      effectiveAt: out.effectiveAt ?? null,
      message: out.deferred
        ? `Your plan will change at the end of the current billing period (${new Date(out.effectiveAt).toDateString()}).`
        : `Subscribed to ${out.subscription.planName}. ${formatMinor(out.chargedCents)} charged to your wallet.`,
    });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE') {
      return res.status(402).json({
        error: 'Not enough wallet balance for this plan. Top up and try again.',
        code: 'INSUFFICIENT_BALANCE',
        balanceCents: err.balanceCents,
        requiredCents: err.requiredCents,
      });
    }
    logger.error('subscribeToPlan failed', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Could not change plan' });
  }
};

/**
 * POST /workspaces/:workspaceId/subscription/autorenew  { planId }
 *
 * Start an auto-renewing subscription on a saved card. Returns a gateway
 * subscription id for Checkout to authorize; nothing is charged, and no local
 * plan is activated, until the `subscription.charged` webhook confirms the
 * first payment.
 */
export const startAutoRenew = async (req, res) => {
  try {
    if (!razorpay.isRazorpayConfigured()) {
      return res.status(503).json({ error: 'Online payments are not configured on this deployment.' });
    }
    const { planId } = req.body ?? {};
    if (!planId) return res.status(400).json({ error: 'planId is required' });
    const out = await autoRenew.startAutoRenewCheckout(req.params.workspaceId, planId);
    res.status(201).json({ ...out, razorpayKeyId: razorpay.getPublicKeyId() });
  } catch (err) {
    logger.error('startAutoRenew failed', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Could not start auto-renewal' });
  }
};

/**
 * POST /workspaces/:workspaceId/subscription/autorenew/verify
 *
 * Checkout reporting a completed authorization. Confirms the signature so the
 * UI can stop spinning — it does NOT activate the plan. Activation happens on
 * the webhook, because an authorization is a mandate, not a payment, and only
 * Razorpay can tell us the first charge actually succeeded.
 */
export const verifyAutoRenew = async (req, res) => {
  try {
    const { subscriptionId, paymentId, signature } = req.body ?? {};
    if (!razorpay.verifySubscriptionSignature({ subscriptionId, paymentId, signature })) {
      logger.warn({ subscriptionId, paymentId }, 'Auto-renew verify: bad signature');
      return res.status(400).json({ error: 'Signature verification failed' });
    }
    const local = await prisma.subscription.findUnique({ where: { razorpaySubscriptionId: subscriptionId } });
    res.json({
      verified: true,
      active: local?.status === 'active',
      message: local?.status === 'active'
        ? 'Your plan is active and will renew automatically.'
        : 'Payment authorized. Your plan will activate momentarily.',
    });
  } catch (err) {
    logger.error('verifyAutoRenew failed', err);
    res.status(500).json({ error: 'Verification failed' });
  }
};

/** POST /workspaces/:workspaceId/subscription/autorenew/stop */
export const stopAutoRenewPlan = async (req, res) => {
  try {
    const out = await autoRenew.stopAutoRenew(req.params.workspaceId, {
      immediate: req.body?.immediate === true,
    });
    res.json({
      ...out,
      message: out.stopped
        ? (out.immediate ? 'Subscription cancelled.' : 'Auto-renewal turned off. You keep access until the end of this period.')
        : 'This subscription does not auto-renew.',
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Could not stop auto-renewal' });
  }
};

export const cancelPlan = async (req, res) => {
  try {
    const sub = await subs.cancelSubscription(req.params.workspaceId, {
      immediate: req.body?.immediate === true,
    });
    res.json({
      success: true, subscription: sub,
      message: sub.status === 'cancelled'
        ? 'Subscription cancelled.'
        : `Subscription will end on ${sub.currentPeriodEnd.toDateString()}. You keep access until then.`,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Could not cancel' });
  }
};

export const resumePlan = async (req, res) => {
  try {
    res.json({ success: true, subscription: await subs.resumeSubscription(req.params.workspaceId) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Could not resume' });
  }
};

export const getInvoices = async (req, res) => {
  try {
    res.json({ invoices: await listInvoices(req.params.workspaceId) });
  } catch (err) {
    logger.error('getInvoices failed', err);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * POST /admin/wallets/credit  { workspaceId, amountCents, note, idempotencyKey }
 *
 * Manual wallet adjustment. This is the one place a human moves money directly,
 * so it carries the same protections as the automated paths:
 *
 *  - IDEMPOTENT. Previously this passed no key at all, which meant a
 *    double-clicked button, a retried request, or an impatient admin refreshing
 *    a hung POST credited the wallet twice with no way to tell the duplicate
 *    from a deliberate second credit. The client sends a key per dialog
 *    session; absent that we derive a minute-bucketed key, which collapses
 *    accidental repeats while still allowing a genuine second credit later.
 *  - AUDITED. Actor, target, amount, and before/after balance are recorded.
 */
export const adminCreditWallet = async (req, res) => {
  const { workspaceId, amountCents, note, idempotencyKey } = req.body ?? {};
  const amount = parseInt(amountCents, 10);
  if (!workspaceId || !Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ error: 'workspaceId and a non-zero integer amountCents are required' });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, slug: true },
  });
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

  // Minute bucket: absorbs double-submits without permanently blocking a
  // legitimate identical credit made later.
  const bucket = Math.floor(Date.now() / 60_000);
  const key = idempotencyKey
    ? `admin:credit:${workspaceId}:${idempotencyKey}`
    : `admin:credit:${workspaceId}:${amount}:${bucket}`;

  let before = null;
  try {
    before = await getBalance(workspaceId);

    const result = await applyWalletTransaction({
      workspaceId,
      amountCents: amount,
      type: amount > 0 ? TX_TYPES.ADMIN_CREDIT : TX_TYPES.ADJUSTMENT,
      idempotencyKey: key,
      note: note || null,
      createdById: req.user?.userId ?? null,
      // Admin debits are corrections and may legitimately push a balance
      // negative; the admin is looking at the number as they do it.
      allowNegative: true,
    });

    await writeAudit(req, {
      action: amount > 0 ? AUDIT_ACTIONS.WALLET_CREDIT : AUDIT_ACTIONS.WALLET_DEBIT,
      category: AUDIT_CATEGORIES.BILLING,
      targetType: 'Workspace',
      targetId: workspaceId,
      targetLabel: workspace.name,
      workspaceId,
      before: { balanceCents: before.balanceCents },
      after: { balanceCents: result.balanceCents },
      metadata: {
        amountCents: amount,
        currency: before.currency,
        note: note || null,
        idempotencyKey: key,
        // A duplicate is a successful no-op, and the log must distinguish it
        // from a credit that actually moved money.
        duplicate: result.duplicate,
        walletTransactionId: result.transaction?.id ?? null,
      },
    });

    res.json({ balanceCents: result.balanceCents, duplicate: result.duplicate });
  } catch (err) {
    logger.error('adminCreditWallet failed', err);
    await writeAudit(req, {
      action: amount > 0 ? AUDIT_ACTIONS.WALLET_CREDIT : AUDIT_ACTIONS.WALLET_DEBIT,
      category: AUDIT_CATEGORIES.BILLING,
      targetType: 'Workspace',
      targetId: workspaceId,
      targetLabel: workspace?.name ?? null,
      workspaceId,
      before: before ? { balanceCents: before.balanceCents } : null,
      metadata: { amountCents: amount, note: note || null },
      status: 'failure',
      errorMessage: err.message,
    });
    res.status(500).json({ error: 'Failed to credit wallet' });
  }
};

/** GET /admin/wallets/:workspaceId/audit — ledger vs balance reconciliation. */
export const adminAuditWallet = async (req, res) => {
  try {
    res.json(await auditWallet(req.params.workspaceId));
  } catch (err) {
    res.status(500).json({ error: 'Audit failed' });
  }
};
