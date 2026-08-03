// backend/src/services/billing/razorpay.service.js
/**
 * Razorpay gateway adapter (BUG-002).
 *
 * Implemented against the REST API with `fetch` + `node:crypto` rather than the
 * SDK: the surface needed here is three endpoints and two HMACs, and avoiding
 * the dependency keeps the signature verification — the part that actually
 * carries the security weight — explicit and auditable in this file rather than
 * hidden behind a library call.
 *
 * THE TRUST MODEL
 * ---------------
 * A client saying "payment succeeded" means nothing; anyone can POST that. Two
 * signatures exist and they are NOT interchangeable:
 *
 *   - CHECKOUT signature (verifyPaymentSignature): HMAC of
 *     `order_id|payment_id` with the KEY SECRET. Returned to the browser by
 *     Razorpay Checkout. It proves the browser is not lying, but it is a
 *     convenience for UX only — it must never be the sole basis for crediting.
 *   - WEBHOOK signature (verifyWebhookSignature): HMAC of the RAW request body
 *     with the WEBHOOK SECRET, delivered server-to-server. This is the
 *     authority, because it cannot be replayed or fabricated by a client.
 *
 * Money is credited on the WEBHOOK path. The checkout callback only tells the
 * UI to stop spinning.
 *
 * RAW BODY REQUIREMENT
 * --------------------
 * The webhook HMAC is computed over the exact bytes Razorpay sent.
 * `JSON.parse` + `JSON.stringify` does not round-trip byte-for-byte (key
 * order, whitespace, unicode escapes), so verifying against a re-serialised
 * body fails intermittently — or, worse, someone "fixes" it by skipping
 * verification. The webhook route must therefore mount a raw body parser; see
 * routes/billing.routes.js.
 */

import crypto from 'node:crypto';
import logger from '../../lib/logger.js';

const API_BASE = 'https://api.razorpay.com/v1';

export const isRazorpayConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

export const getPublicKeyId = () => process.env.RAZORPAY_KEY_ID || null;

const authHeader = () => {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set');
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
};

/**
 * Compare two hex digests without leaking timing information.
 *
 * `a === b` on a secret comparison returns early at the first differing byte,
 * which is measurable over many attempts and lets an attacker reconstruct a
 * valid signature byte by byte. timingSafeEqual requires equal lengths, so the
 * length check comes first — and a length mismatch is not a secret.
 */
const safeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const hmacHex = (secret, payload) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

/**
 * Create an order. Amount is in the currency's MINOR units (paise) — the same
 * unit the wallet uses, so no conversion happens at the boundary.
 *
 * @returns {Promise<{ id: string, amount: number, currency: string, status: string }>}
 */
export async function createOrder({ amountCents, currency = 'INR', receipt, notes = {} }) {
  const amount = Math.trunc(Number(amountCents));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amountCents must be a positive integer');
  }
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount, currency, receipt,
      // Echoed back on the webhook, which is how a payment is tied to the
      // workspace that initiated it without trusting anything client-side.
      notes,
      payment_capture: 1,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.description || `HTTP ${res.status}`;
    throw new Error(`Razorpay createOrder failed: ${msg}`);
  }
  return body;
}

/** Fetch a payment — used to re-verify server-side before crediting. */
export async function fetchPayment(paymentId) {
  const res = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Razorpay fetchPayment failed: ${body?.error?.description || res.status}`);
  }
  return body;
}

/**
 * Verify the signature Razorpay Checkout hands the BROWSER.
 * HMAC-SHA256(`${order_id}|${payment_id}`, KEY_SECRET).
 *
 * Proves the browser is relaying a genuine Razorpay result. Deliberately NOT
 * sufficient to credit a wallet on its own — a client can replay an old, valid
 * triple. Use it to update the UI; let the webhook move money.
 */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  return safeCompare(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

/**
 * Verify a webhook. THIS is the authority for crediting.
 *
 * @param {Buffer|string} rawBody EXACT bytes received. Not a re-serialised object.
 * @param {string} signature `X-Razorpay-Signature`
 */
export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    // Fail CLOSED. An unconfigured secret must never mean "accept everything" —
    // that would leave an unauthenticated endpoint that credits wallets.
    logger.error('RAZORPAY_WEBHOOK_SECRET is not set — rejecting webhook');
    return false;
  }
  if (!signature || !rawBody) return false;
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  return safeCompare(hmacHex(secret, payload), signature);
}

/** Which Razorpay dataset the configured keys point at. Test and live are
 *  entirely separate: ids minted in one do not resolve in the other. */
export const getMode = () =>
  (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? 'live' : 'test';

/**
 * Mirror a local plan as a Razorpay plan object.
 *
 * Required before a recurring subscription can reference it — Razorpay bills
 * against its own plan, not an arbitrary amount.
 *
 * @param {{ name: string, amountCents: number, currency?: string, period?: string, interval?: number }} p
 */
export async function createPlan({ name, amountCents, currency = 'INR', period = 'monthly', interval = 1, notes = {} }) {
  const res = await fetch(`${API_BASE}/plans`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      period, interval,
      item: { name, amount: Math.trunc(amountCents), currency },
      notes,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay createPlan failed: ${body?.error?.description || res.status}`);
  return body;
}

/**
 * Create a recurring subscription for a mirrored plan.
 *
 * `total_count` is how many cycles Razorpay will attempt before stopping — it
 * is REQUIRED, and there is no "forever" value. 120 monthly cycles is ten
 * years, i.e. effectively indefinite while still being a bounded mandate rather
 * than an open-ended claim on the customer's card.
 */
export async function createSubscription({ planId, totalCount = 120, notes = {}, customerNotify = true, startAt }) {
  const res = await fetch(`${API_BASE}/subscriptions`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: planId,
      total_count: totalCount,
      quantity: 1,
      customer_notify: customerNotify ? 1 : 0,
      ...(startAt ? { start_at: Math.floor(new Date(startAt).getTime() / 1000) } : {}),
      notes,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay createSubscription failed: ${body?.error?.description || res.status}`);
  return body;
}

/** Read back a mirrored plan — used to detect that the local price has changed
 *  since the mirror was made. Razorpay plans are immutable, so a stale mirror
 *  silently keeps charging the old price. */
export async function fetchPlan(planId) {
  const res = await fetch(`${API_BASE}/plans/${encodeURIComponent(planId)}`, {
    headers: { Authorization: authHeader() },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay fetchPlan failed: ${body?.error?.description || res.status}`);
  return body;
}

export async function fetchSubscription(subscriptionId) {
  const res = await fetch(`${API_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: authHeader() },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay fetchSubscription failed: ${body?.error?.description || res.status}`);
  return body;
}

/**
 * Verify the signature Checkout returns for a SUBSCRIPTION authorization.
 *
 * Note the payload order is the REVERSE of a one-off payment:
 *   one-off      HMAC(`${order_id}|${payment_id}`)
 *   subscription HMAC(`${payment_id}|${subscription_id}`)
 * Getting this backwards produces a signature that never verifies, and the
 * usual "fix" is to stop verifying — so it is spelled out here.
 */
export function verifySubscriptionSignature({ subscriptionId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !subscriptionId || !paymentId || !signature) return false;
  return safeCompare(hmacHex(secret, `${paymentId}|${subscriptionId}`), signature);
}

/** Subscription lifecycle. Optional: plan changes are handled in-app against
 *  the wallet, so these are only needed for gateway-managed auto-renewal. */
export async function cancelSubscription(subscriptionId, { atCycleEnd = true } = {}) {
  const res = await fetch(`${API_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay cancelSubscription failed: ${body?.error?.description || res.status}`);
  return body;
}

export const __testing = { safeCompare, hmacHex };
