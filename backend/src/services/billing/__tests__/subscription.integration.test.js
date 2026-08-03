// backend/src/services/billing/__tests__/subscription.integration.test.js
/**
 * BUG-002 — subscription lifecycle against a real database.
 * Skipped without DATABASE_URL.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const HAS_DB = Boolean(process.env.DATABASE_URL);

let prisma; let subs; let applyWalletTransaction; let getBalance; let auditWallet; let TX_TYPES;
let usdToBillingMinor;
if (HAS_DB) {
  ({ default: prisma } = await import('../../../config/prisma.js'));
  subs = await import('../subscription.service.js');
  ({ applyWalletTransaction, getBalance, auditWallet, TX_TYPES } = await import('../wallet.service.js'));
  ({ usdToBillingMinor } = await import('../money.js'));
}

process.env.FX_USD_TO_INR = '96';
const created = { workspaces: [], plans: [] };

async function makePlan(name, priceUsd, includedMinutes = 100) {
  const p = await prisma.plan.create({
    data: {
      name: `__test__${name}-${randomUUID().slice(0, 8)}`, priceUsd, perMinuteUsd: 0.085,
      includedMinutes, features: '[]', maxAgents: 10, maxConcurrentCalls: 5,
      // Deliberately active:true. subscribe() correctly refuses an inactive
      // plan ("That plan is no longer available"), so these MUST be active or
      // the tests exercise the refusal path instead of the lifecycle. The
      // __test__ name prefix is what makes an orphan identifiable instead;
      // `npm run db:clean-test-data` removes them.
      active: true,
    },
  });
  created.plans.push(p.id);
  return p;
}

// Default seed must cover the priciest plan under test: Growth is $399, which
// at the rate-card FX of 96 is ₹38,304 (3,830,400 paise). Seeding ₹10,000 made
// the upgrade cases fail on balance rather than on the behaviour being tested.
async function makeWorkspace(balanceCents = 100_000_00) {
  const ws = await prisma.workspace.create({
    data: { name: 'Sub Test', slug: `sub-${randomUUID().slice(0, 8)}` },
  });
  created.workspaces.push(ws.id);
  // Only seed when there is something to seed. applyWalletTransaction rightly
  // refuses a zero amount — a no-op ledger row means nothing — so an unfunded
  // workspace must simply skip this rather than post one. The card-payment
  // tests below deliberately start from a ZERO balance, which is the whole
  // point: buying a plan must not depend on wallet balance.
  if (balanceCents > 0) {
    await applyWalletTransaction({
      workspaceId: ws.id, amountCents: balanceCents, type: TX_TYPES.TOPUP,
      idempotencyKey: `seed-${randomUUID()}`,
    });
  }
  return ws.id;
}

test.after(async () => {
  if (!HAS_DB) return;
  for (const id of created.workspaces) {
    await prisma.subscription.deleteMany({ where: { workspaceId: id } });
    await prisma.invoice.deleteMany({ where: { workspaceId: id } });
    const w = await prisma.wallet.findUnique({ where: { workspaceId: id } });
    if (w) {
      await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
      await prisma.wallet.delete({ where: { id: w.id } });
    }
    await prisma.workspace.delete({ where: { id } }).catch(() => {});
  }
  for (const id of created.plans) await prisma.plan.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

test('subscribing charges the wallet and issues an invoice', { skip: !HAS_DB }, async () => {
  const plan = await makePlan('Starter', 36);
  const workspaceId = await makeWorkspace();
  const before = (await getBalance(workspaceId)).balanceCents;

  const out = await subs.subscribe(workspaceId, plan.id);
  assert.equal(out.subscription.status, 'active');
  assert.equal(out.chargedCents, usdToBillingMinor(36));
  assert.equal((await getBalance(workspaceId)).balanceCents, before - usdToBillingMinor(36));
  assert.equal(out.subscription.minutesIncluded, 100);

  const invoices = await prisma.invoice.findMany({ where: { workspaceId } });
  assert.equal(invoices.length, 1, 'an invoice must be issued');
  assert.match(invoices[0].number, /^INV-\d{4}-\d{6}$/);
  assert.equal(invoices[0].amountCents, usdToBillingMinor(36));
  assert.equal((await auditWallet(workspaceId)).balanced, true);
});

test('subscribing twice to the same plan does not double-charge', { skip: !HAS_DB }, async () => {
  const plan = await makePlan('Starter', 36);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, plan.id);
  const after = (await getBalance(workspaceId)).balanceCents;
  const again = await subs.subscribe(workspaceId, plan.id);
  assert.equal(again.chargedCents, 0);
  assert.equal((await getBalance(workspaceId)).balanceCents, after);
});

test('an upgrade applies immediately and is prorated', { skip: !HAS_DB }, async () => {
  const starter = await makePlan('Starter', 36);
  const growth = await makePlan('Growth', 399, 5000);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, starter.id);
  const afterFirst = (await getBalance(workspaceId)).balanceCents;

  const out = await subs.subscribe(workspaceId, growth.id);
  assert.equal(out.deferred, false, 'upgrades take effect now');
  assert.equal(out.subscription.planName, growth.name);
  assert.equal(out.subscription.minutesIncluded, 5000);
  assert.ok(out.chargedCents > 0, 'prorated difference should be charged');
  // Charged the difference, not the full new price.
  assert.ok(out.chargedCents < usdToBillingMinor(399));
  assert.equal((await getBalance(workspaceId)).balanceCents, afterFirst - out.chargedCents);
  assert.equal((await auditWallet(workspaceId)).balanced, true);
});

test('a downgrade is DEFERRED to the period boundary', { skip: !HAS_DB }, async () => {
  // Applying it now would remove capacity the customer already paid for, and
  // could instantly breach the new plan's limits mid-call.
  const starter = await makePlan('Starter', 36);
  const growth = await makePlan('Growth', 399, 5000);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, growth.id);
  const after = (await getBalance(workspaceId)).balanceCents;

  const out = await subs.subscribe(workspaceId, starter.id);
  assert.equal(out.deferred, true);
  assert.equal(out.chargedCents, 0, 'no charge for a downgrade');
  assert.equal(out.subscription.planName, growth.name, 'still on the old plan until renewal');
  assert.equal(out.subscription.pendingPlanId, starter.id);
  assert.equal((await getBalance(workspaceId)).balanceCents, after, 'balance untouched');
});

test('renewal applies a pending downgrade and resets minutes', { skip: !HAS_DB }, async () => {
  const starter = await makePlan('Starter', 36, 471);
  const growth = await makePlan('Growth', 399, 5000);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, growth.id);
  await subs.subscribe(workspaceId, starter.id); // schedule downgrade

  // Force the period to be due, and pretend minutes were consumed.
  await prisma.subscription.update({
    where: { workspaceId },
    data: { currentPeriodEnd: new Date(Date.now() - 1000), minutesUsed: 4000 },
  });

  const out = await subs.renewSubscription(workspaceId);
  assert.equal(out.renewed, true);
  assert.equal(out.subscription.planName, starter.name, 'downgrade now applied');
  assert.equal(out.subscription.minutesIncluded, 471);
  assert.equal(out.subscription.minutesUsed, 0, 'allowance resets');
  assert.equal(out.subscription.pendingPlanId, null);
  assert.ok(out.subscription.currentPeriodEnd > new Date());
});

test('renewal is idempotent per period', { skip: !HAS_DB }, async () => {
  const plan = await makePlan('Starter', 36);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, plan.id);
  await prisma.subscription.update({
    where: { workspaceId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) },
  });
  const periodStart = (await subs.getSubscription(workspaceId)).currentPeriodEnd;

  await subs.renewSubscription(workspaceId);
  const afterFirst = (await getBalance(workspaceId)).balanceCents;

  // Re-run the job against the SAME period boundary — must not charge again.
  await prisma.subscription.update({
    where: { workspaceId }, data: { currentPeriodEnd: periodStart },
  });
  await subs.renewSubscription(workspaceId);
  assert.equal((await getBalance(workspaceId)).balanceCents, afterFirst, 'no double charge');
  assert.equal((await auditWallet(workspaceId)).balanced, true);
});

test('renewal without funds goes past_due, not cancelled', { skip: !HAS_DB }, async () => {
  // The customer must be able to top up and recover, not lose their setup.
  const plan = await makePlan('Growth', 399);
  const workspaceId = await makeWorkspace(usdToBillingMinor(399) + 100);
  await subs.subscribe(workspaceId, plan.id);
  await prisma.subscription.update({
    where: { workspaceId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) },
  });

  const out = await subs.renewSubscription(workspaceId);
  assert.equal(out.renewed, false);
  assert.equal(out.reason, 'insufficient-balance');
  assert.equal(out.subscription.status, 'past_due');
  assert.equal((await auditWallet(workspaceId)).balanced, true);
});

test('cancel defaults to end-of-period and keeps access', { skip: !HAS_DB }, async () => {
  const plan = await makePlan('Starter', 36);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, plan.id);

  const sub = await subs.cancelSubscription(workspaceId);
  assert.equal(sub.cancelAtPeriodEnd, true);
  assert.equal(sub.status, 'active', 'still active until the boundary');
});

test('immediate cancel ends access now', { skip: !HAS_DB }, async () => {
  const plan = await makePlan('Starter', 36);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, plan.id);
  const sub = await subs.cancelSubscription(workspaceId, { immediate: true });
  assert.equal(sub.status, 'cancelled');
});

test('a scheduled cancellation ends the subscription at renewal', { skip: !HAS_DB }, async () => {
  const plan = await makePlan('Starter', 36);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, plan.id);
  await subs.cancelSubscription(workspaceId);
  await prisma.subscription.update({
    where: { workspaceId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) },
  });
  const balanceBefore = (await getBalance(workspaceId)).balanceCents;

  const out = await subs.renewSubscription(workspaceId);
  assert.equal(out.renewed, false);
  assert.equal(out.reason, 'cancelled');
  assert.equal((await getBalance(workspaceId)).balanceCents, balanceBefore,
    'a cancelled subscription must not be charged');
});

test('resume undoes a pending cancellation', { skip: !HAS_DB }, async () => {
  const plan = await makePlan('Starter', 36);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, plan.id);
  await subs.cancelSubscription(workspaceId);
  const sub = await subs.resumeSubscription(workspaceId);
  assert.equal(sub.cancelAtPeriodEnd, false);
  assert.equal(sub.status, 'active');
});

// ── Direct plan checkout: pricing a change WITHOUT touching the wallet ───────
// Plan purchase must not depend on wallet balance. These pin that quoting a
// change works on an EMPTY wallet and never moves money.

test('quoting a new plan works on an empty wallet', { skip: !HAS_DB }, async () => {
  const plan = await makePlan('Starter', 36);
  const workspaceId = await makeWorkspace(0); // deliberately unfunded
  const q = await subs.quoteSubscriptionChange(workspaceId, plan.id);

  assert.equal(q.kind, 'new');
  assert.equal(q.requiresPayment, true);
  assert.equal(q.amountCents, usdToBillingMinor(36));
  assert.equal((await getBalance(workspaceId)).balanceCents, 0, 'quoting must move no money');
});

test('quoting never spends or reserves balance', { skip: !HAS_DB }, async () => {
  const plan = await makePlan('Growth', 399);
  const workspaceId = await makeWorkspace();
  const before = (await getBalance(workspaceId)).balanceCents;
  await subs.quoteSubscriptionChange(workspaceId, plan.id);
  await subs.quoteSubscriptionChange(workspaceId, plan.id);
  assert.equal((await getBalance(workspaceId)).balanceCents, before);
});

test('a free plan needs no payment', { skip: !HAS_DB }, async () => {
  const free = await makePlan('Free', 0);
  const workspaceId = await makeWorkspace(0);
  const q = await subs.quoteSubscriptionChange(workspaceId, free.id);
  assert.equal(q.requiresPayment, false);
  assert.equal(q.amountCents, 0);
});

test('quoting an upgrade returns the prorated amount, not the full price', { skip: !HAS_DB }, async () => {
  const starter = await makePlan('Starter', 36);
  const growth = await makePlan('Growth', 399, 5000);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, starter.id);

  const q = await subs.quoteSubscriptionChange(workspaceId, growth.id);
  assert.equal(q.kind, 'upgrade');
  assert.equal(q.requiresPayment, true);
  assert.ok(q.amountCents > 0);
  assert.ok(q.amountCents < usdToBillingMinor(399), 'must be prorated, not the full price');
});

test('quoting a downgrade collects nothing and is deferred', { skip: !HAS_DB }, async () => {
  const starter = await makePlan('Starter', 36);
  const growth = await makePlan('Growth', 399, 5000);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, growth.id);

  const q = await subs.quoteSubscriptionChange(workspaceId, starter.id);
  assert.equal(q.kind, 'downgrade');
  assert.equal(q.requiresPayment, false);
  assert.equal(q.amountCents, 0);
  assert.equal(q.deferred, true);
  assert.ok(q.effectiveAt instanceof Date);
});

test('re-quoting the current plan is a no-op', { skip: !HAS_DB }, async () => {
  const plan = await makePlan('Starter', 36);
  const workspaceId = await makeWorkspace();
  await subs.subscribe(workspaceId, plan.id);
  const q = await subs.quoteSubscriptionChange(workspaceId, plan.id);
  assert.equal(q.kind, 'unchanged');
  assert.equal(q.requiresPayment, false);
});

test('the paid-purchase flow nets to zero on the wallet', { skip: !HAS_DB }, async () => {
  // What direct checkout does once payment lands: credit the wallet with the
  // card payment, then immediately spend it on the plan. The customer never
  // pre-funds anything, and the ledger still records both movements.
  const plan = await makePlan('Starter', 36);
  const workspaceId = await makeWorkspace(0); // empty wallet, as a real buyer would be
  const q = await subs.quoteSubscriptionChange(workspaceId, plan.id);

  await applyWalletTransaction({
    workspaceId, amountCents: q.amountCents, type: TX_TYPES.TOPUP,
    idempotencyKey: `rzp:payment:test-${randomUUID()}`,
  });
  const out = await subs.subscribe(workspaceId, plan.id);

  assert.equal(out.subscription.status, 'active');
  assert.equal((await getBalance(workspaceId)).balanceCents, 0, 'credit and debit must net to zero');
  const audit = await auditWallet(workspaceId);
  assert.equal(audit.balanced, true);
  assert.equal(audit.transactionCount, 2, 'both movements must appear on the ledger');
});

test('an unknown or inactive plan is refused before any payment', { skip: !HAS_DB }, async () => {
  const workspaceId = await makeWorkspace();
  await assert.rejects(() => subs.quoteSubscriptionChange(workspaceId, 'does-not-exist'));
  const inactive = await prisma.plan.create({
    data: {
      name: `__test__Dead-${randomUUID().slice(0, 8)}`, priceUsd: 10, perMinuteUsd: 0.1,
      includedMinutes: 0, features: '[]', active: false,
    },
  });
  created.plans.push(inactive.id);
  await assert.rejects(() => subs.quoteSubscriptionChange(workspaceId, inactive.id));
});

// ── Auto-renewal via saved card ─────────────────────────────────────────────
// applyGatewayCharge handles BOTH the first authorization charge and every
// renewal after it. A replayed webhook must never grant a free month.

let autoRenew;
if (HAS_DB) autoRenew = await import('../autoRenew.service.js');

/** A workspace with a gateway-linked subscription awaiting its first charge. */
async function pendingAutoRenew(priceUsd = 36) {
  const plan = await makePlan('Starter', priceUsd);
  const workspaceId = await makeWorkspace(0); // no wallet balance — card pays
  const rzpSubId = `sub_test_${randomUUID().slice(0, 12)}`;
  await prisma.subscription.create({
    data: {
      workspaceId, planId: plan.id, planName: plan.name, status: 'pending',
      currentPeriodStart: new Date(0), currentPeriodEnd: new Date(0),
      minutesIncluded: 0, minutesUsed: 0,
      razorpaySubscriptionId: rzpSubId, autoRenew: true,
    },
  });
  return { workspaceId, plan, rzpSubId };
}

test('the first gateway charge activates the plan on an empty wallet', { skip: !HAS_DB }, async () => {
  const { workspaceId, plan, rzpSubId } = await pendingAutoRenew();
  const amount = usdToBillingMinor(36);

  const out = await autoRenew.applyGatewayCharge({
    razorpaySubscriptionId: rzpSubId, paymentId: `pay_${randomUUID().slice(0, 10)}`, amountCents: amount,
  });

  assert.equal(out.applied, true);
  assert.equal(out.subscription.status, 'active');
  assert.equal(out.subscription.minutesIncluded, plan.includedMinutes);
  assert.ok(out.subscription.currentPeriodEnd > new Date(), 'period must extend into the future');
  // Card in, plan out — the wallet is a conduit, not a prerequisite.
  assert.equal((await getBalance(workspaceId)).balanceCents, 0);
  const audit = await auditWallet(workspaceId);
  assert.equal(audit.balanced, true);
  assert.equal(audit.transactionCount, 2, 'both the credit and the debit must be recorded');
});

test('a replayed subscription.charged does NOT grant a second month', { skip: !HAS_DB }, async () => {
  const { workspaceId, rzpSubId } = await pendingAutoRenew();
  const paymentId = `pay_${randomUUID().slice(0, 10)}`;
  const amount = usdToBillingMinor(36);

  const first = await autoRenew.applyGatewayCharge({ razorpaySubscriptionId: rzpSubId, paymentId, amountCents: amount });
  const periodEnd = first.subscription.currentPeriodEnd;

  const second = await autoRenew.applyGatewayCharge({ razorpaySubscriptionId: rzpSubId, paymentId, amountCents: amount });
  assert.equal(second.applied, false, 'a replay must not extend the period');

  const after = await prisma.subscription.findUnique({ where: { workspaceId } });
  assert.equal(after.currentPeriodEnd.getTime(), periodEnd.getTime());
  assert.equal((await auditWallet(workspaceId)).transactionCount, 2, 'no extra ledger entries');
});

test('a genuine second cycle extends the period by another month', { skip: !HAS_DB }, async () => {
  const { workspaceId, rzpSubId } = await pendingAutoRenew();
  const amount = usdToBillingMinor(36);
  const first = await autoRenew.applyGatewayCharge({
    razorpaySubscriptionId: rzpSubId, paymentId: `pay_${randomUUID().slice(0, 10)}`, amountCents: amount,
  });
  const second = await autoRenew.applyGatewayCharge({
    razorpaySubscriptionId: rzpSubId, paymentId: `pay_${randomUUID().slice(0, 10)}`, amountCents: amount,
  });

  assert.equal(second.applied, true);
  assert.ok(second.subscription.currentPeriodEnd > first.subscription.currentPeriodEnd,
    'the second cycle must extend beyond the first');
  assert.equal(second.subscription.minutesUsed, 0, 'the minute allowance resets each cycle');
  assert.equal((await auditWallet(workspaceId)).balanced, true);
});

test('renewal chains from the previous boundary, so the date does not drift', { skip: !HAS_DB }, async () => {
  // If each renewal restarted from "now", a webhook arriving a day late would
  // push the billing date later every month until it wandered off the calendar.
  const { workspaceId, rzpSubId } = await pendingAutoRenew();
  const amount = usdToBillingMinor(36);
  await autoRenew.applyGatewayCharge({ razorpaySubscriptionId: rzpSubId, paymentId: `pay_${randomUUID().slice(0, 8)}`, amountCents: amount });

  // Pretend the cycle ended a week ago and the webhook is arriving late.
  const lateEnd = new Date(Date.now() - 7 * 864e5);
  await prisma.subscription.update({ where: { workspaceId }, data: { currentPeriodEnd: lateEnd } });

  const out = await autoRenew.applyGatewayCharge({ razorpaySubscriptionId: rzpSubId, paymentId: `pay_${randomUUID().slice(0, 8)}`, amountCents: amount });
  const expected = new Date(lateEnd); expected.setMonth(expected.getMonth() + 1);
  assert.equal(out.subscription.currentPeriodEnd.getTime(), expected.getTime(),
    'next period must start where the last one ended, not at the webhook time');
});

test('a charge for an unknown gateway subscription is ignored', { skip: !HAS_DB }, async () => {
  const out = await autoRenew.applyGatewayCharge({
    razorpaySubscriptionId: 'sub_does_not_exist', paymentId: 'pay_x', amountCents: 100,
  });
  assert.equal(out.applied, false);
  assert.equal(out.reason, 'unknown-subscription');
});

test('halted goes past_due, keeping the customer recoverable', { skip: !HAS_DB }, async () => {
  const { workspaceId, rzpSubId } = await pendingAutoRenew();
  await autoRenew.applyGatewayCharge({ razorpaySubscriptionId: rzpSubId, paymentId: `pay_${randomUUID().slice(0, 8)}`, amountCents: usdToBillingMinor(36) });

  assert.equal(await autoRenew.markHalted(rzpSubId), true);
  const after = await prisma.subscription.findUnique({ where: { workspaceId } });
  assert.equal(after.status, 'past_due', 'not cancelled — the card can still be fixed');
});

test('gateway cancellation ends the subscription and clears auto-renew', { skip: !HAS_DB }, async () => {
  const { workspaceId, rzpSubId } = await pendingAutoRenew();
  await autoRenew.applyGatewayCharge({ razorpaySubscriptionId: rzpSubId, paymentId: `pay_${randomUUID().slice(0, 8)}`, amountCents: usdToBillingMinor(36) });

  assert.equal(await autoRenew.markCancelled(rzpSubId), true);
  const after = await prisma.subscription.findUnique({ where: { workspaceId } });
  assert.equal(after.status, 'cancelled');
  assert.equal(after.autoRenew, false);
});

test('a long-lapsed subscription rolls forward to a LIVE period, keeping the billing day', { skip: !HAS_DB }, async () => {
  // The case the old 1-day clamp existed for. Naive chaining from a boundary
  // six months ago would hand the customer a period that expired five months
  // ago — paid, and immediately out of date. Rolling forward in whole months
  // fixes that WITHOUT abandoning the chain (which is what the clamp did, and
  // which reintroduced drift for every renewal more than a day late).
  const { workspaceId, rzpSubId } = await pendingAutoRenew();
  const amount = usdToBillingMinor(36);
  await autoRenew.applyGatewayCharge({
    razorpaySubscriptionId: rzpSubId, paymentId: `pay_${randomUUID().slice(0, 8)}`, amountCents: amount,
  });

  // Boundary six months in the past, on the 11th.
  const stale = new Date(Date.now() - 182 * 864e5);
  stale.setDate(11);
  await prisma.subscription.update({ where: { workspaceId }, data: { currentPeriodEnd: stale } });

  const out = await autoRenew.applyGatewayCharge({
    razorpaySubscriptionId: rzpSubId, paymentId: `pay_${randomUUID().slice(0, 8)}`, amountCents: amount,
  });

  assert.equal(out.applied, true);
  assert.ok(out.subscription.currentPeriodEnd > new Date(),
    'the new period must actually cover the present, not expire on arrival');
  assert.equal(out.subscription.currentPeriodEnd.getDate(), 11,
    'the billing day-of-month must survive the roll-forward');
});
