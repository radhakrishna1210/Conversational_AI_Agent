// backend/src/services/billing/__tests__/razorpay.test.js
/**
 * BUG-002 — signature verification. This is the security boundary of the whole
 * payment flow: it is the only thing standing between a POST from anyone on the
 * internet and a wallet credit. No DB or network needed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  verifyPaymentSignature, verifyWebhookSignature, isRazorpayConfigured, __testing,
} from '../razorpay.service.js';

const KEY_SECRET = 'test_key_secret_abc123';
const WEBHOOK_SECRET = 'test_webhook_secret_xyz789';
const sign = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

test.beforeEach(() => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_fake';
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

test('configuration flag reflects the env', () => {
  assert.equal(isRazorpayConfigured(), true);
  delete process.env.RAZORPAY_KEY_ID;
  assert.equal(isRazorpayConfigured(), false);
});

// ── Checkout signature (browser callback) ───────────────────────────────────

test('a genuine checkout signature verifies', () => {
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';
  assert.equal(verifyPaymentSignature({
    orderId, paymentId, signature: sign(KEY_SECRET, `${orderId}|${paymentId}`),
  }), true);
});

test('a tampered checkout signature is rejected', () => {
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';
  const good = sign(KEY_SECRET, `${orderId}|${paymentId}`);
  for (const bad of [
    good.slice(0, -1) + '0',                            // last byte flipped
    sign(KEY_SECRET, `${orderId}|pay_DIFFERENT`),       // different payment
    sign('wrong_secret', `${orderId}|${paymentId}`),    // wrong secret
    '', 'deadbeef', good.toUpperCase(),
  ]) {
    assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: bad }), false, `accepted: ${bad}`);
  }
});

test('swapping order and payment ids is rejected', () => {
  // The payload is concatenated, so a naive implementation could be confused by
  // reordering. It must not verify.
  const orderId = 'order_ABC';
  const paymentId = 'pay_XYZ';
  assert.equal(verifyPaymentSignature({
    orderId: paymentId, paymentId: orderId, signature: sign(KEY_SECRET, `${orderId}|${paymentId}`),
  }), false);
});

test('missing checkout fields are rejected, never treated as valid', () => {
  for (const args of [
    {}, { orderId: 'o' }, { orderId: 'o', paymentId: 'p' },
    { orderId: 'o', paymentId: 'p', signature: null },
    { orderId: null, paymentId: 'p', signature: 'x' },
  ]) {
    assert.equal(verifyPaymentSignature(args), false);
  }
});

// ── Webhook signature (the authority for crediting) ─────────────────────────

test('a genuine webhook signature verifies over the raw bytes', () => {
  const raw = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} }));
  assert.equal(verifyWebhookSignature(raw, sign(WEBHOOK_SECRET, raw)), true);
});

test('webhook verification is byte-exact, not structural', () => {
  // The reason app.js mounts express.raw for this route. Re-serialising an
  // object does not reproduce the original bytes (key order, whitespace), so a
  // signature over the original must NOT verify against the re-serialised form.
  const original = '{"event":"payment.captured","x":1}';
  const signature = sign(WEBHOOK_SECRET, original);
  const reserialised = JSON.stringify(JSON.parse(original.replace('"x":1', '"x":1 ')));
  assert.equal(verifyWebhookSignature(Buffer.from(original), signature), true);
  assert.equal(
    verifyWebhookSignature(Buffer.from(`${reserialised} `), signature), false,
    'a body that differs by even one byte must not verify',
  );
});

test('a webhook signed with the CHECKOUT secret is rejected', () => {
  // The two secrets are different and must not be interchangeable — otherwise
  // anything able to forge one could forge the other.
  const raw = Buffer.from('{"event":"payment.captured"}');
  assert.equal(verifyWebhookSignature(raw, sign(KEY_SECRET, raw)), false);
});

test('a modified webhook body is rejected', () => {
  const raw = Buffer.from('{"event":"payment.captured","amount":10000}');
  const signature = sign(WEBHOOK_SECRET, raw);
  const tampered = Buffer.from('{"event":"payment.captured","amount":9999999}');
  assert.equal(verifyWebhookSignature(tampered, signature), false);
});

test('an UNSET webhook secret fails CLOSED', () => {
  // The single most dangerous possible default. If a missing secret meant
  // "skip verification", this endpoint would credit wallets for anyone.
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  const raw = Buffer.from('{"event":"payment.captured"}');
  assert.equal(verifyWebhookSignature(raw, sign(WEBHOOK_SECRET, raw)), false);
  assert.equal(verifyWebhookSignature(raw, 'anything'), false);
  assert.equal(verifyWebhookSignature(raw, ''), false);
});

test('missing signature or body is rejected', () => {
  const raw = Buffer.from('{}');
  assert.equal(verifyWebhookSignature(raw, undefined), false);
  assert.equal(verifyWebhookSignature(raw, ''), false);
  assert.equal(verifyWebhookSignature(null, sign(WEBHOOK_SECRET, '')), false);
});

test('string and Buffer bodies verify identically', () => {
  const body = '{"event":"payment.captured"}';
  const signature = sign(WEBHOOK_SECRET, body);
  assert.equal(verifyWebhookSignature(body, signature), true);
  assert.equal(verifyWebhookSignature(Buffer.from(body), signature), true);
});

// ── Comparison primitive ────────────────────────────────────────────────────

test('safeCompare is length-safe and value-correct', () => {
  const { safeCompare } = __testing;
  assert.equal(safeCompare('abc', 'abc'), true);
  assert.equal(safeCompare('abc', 'abd'), false);
  // Different lengths must return false rather than throw — timingSafeEqual
  // throws on unequal buffers, and an exception here would surface as a 500
  // instead of a clean rejection.
  assert.equal(safeCompare('abc', 'abcd'), false);
  assert.equal(safeCompare('', ''), true);
  for (const bad of [null, undefined, 123, {}, []]) {
    assert.equal(safeCompare(bad, 'abc'), false);
    assert.equal(safeCompare('abc', bad), false);
  }
});
