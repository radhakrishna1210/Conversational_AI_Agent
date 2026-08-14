// backend/src/services/billing/__tests__/settlement.integration.test.js
/**
 * BUG-002 — per-call settlement and the pre-call gate, against a real database.
 *
 * The double-charge guards are database constraints (a conditional UPDATE and a
 * UNIQUE index), so these exercise the real thing. Skipped without DATABASE_URL.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const HAS_DB = Boolean(process.env.DATABASE_URL);

let prisma; let settleCall; let assertCanStartCall; let assertCanCreateAgent;
let applyWalletTransaction; let getBalance; let auditWallet; let TX_TYPES;
let getWalletRate; let finalizeAbandonedCall;
if (HAS_DB) {
  ({ default: prisma } = await import('../../../config/prisma.js'));
  ({ settleCall, assertCanStartCall, assertCanCreateAgent } = await import('../settlement.service.js'));
  ({ applyWalletTransaction, getBalance, auditWallet, TX_TYPES } = await import('../wallet.service.js'));
  ({ getWalletRate } = await import('../walletRate.js'));
  ({ finalizeAbandonedCall } = await import('../../../ws/callFinalizer.js'));
}

const created = { workspaces: [], plans: [] };

/**
 * Paise per minute every call is charged.
 *
 * Read from the live platform wallet rate rather than hardcoded, because that
 * is now the contract: one rate for everybody, set in Super Admin -> Wallet
 * Rate, with the workspace's plan no longer affecting the price. Deliberately
 * READ and never written — these tests run against the real database, and
 * mutating the platform price to suit a test would change what live customers
 * are charged for as long as the run lasts.
 */
let RATE_PAISE;
if (HAS_DB) RATE_PAISE = Math.round((await getWalletRate()).perMinuteInr * 100);

/** Workspace on a known plan, with a funded wallet. */
async function scenario({ perMinuteUsd = 0.085, balanceCents = 100_000,
  maxConcurrentCalls = 3, maxAgents = 5, includedMinutes = 0 } = {}) {
  const tag = randomUUID().slice(0, 8);
  const plan = await prisma.plan.create({
    data: {
      name: `TestPlan-${tag}`, priceUsd: 36, perMinuteUsd, includedMinutes,
      features: '[]', maxConcurrentCalls, maxAgents,
      // active:false so an orphan can never reach the PUBLIC pricing page.
      // listPlansPublic filters on active, and a test run killed before its
      // cleanup (a timeout, a Ctrl-C) would otherwise leave "Starter-a1b2c3d4"
      // visible to real customers. Belt and braces alongside the after() hook.
      active: false,
    },
  });
  created.plans.push(plan.id);
  const ws = await prisma.workspace.create({
    data: { name: 'Settle Test', slug: `settle-${tag}`, planName: plan.name },
  });
  created.workspaces.push(ws.id);
  if (balanceCents > 0) {
    await applyWalletTransaction({
      workspaceId: ws.id, amountCents: balanceCents, type: TX_TYPES.TOPUP,
      idempotencyKey: `seed-${tag}`,
    });
  }
  const agent = await prisma.agent.create({
    data: {
      workspaceId: ws.id, name: 'A', welcomeMessage: 'hi',
      aiModel: 'gemini-2.5-flash', voice: 'x',
    },
  });
  return { workspaceId: ws.id, agentId: agent.id, plan };
}

async function makeCall({ workspaceId, agentId }, { durationSec = 150, type = 'WEB_CALL', status = 'COMPLETED' } = {}) {
  return prisma.agentCallLog.create({
    data: { workspaceId, agentId, type, status, durationSec, endedAt: new Date() },
  });
}

test.after(async () => {
  if (!HAS_DB) return;
  for (const id of created.workspaces) {
    const w = await prisma.wallet.findUnique({ where: { workspaceId: id } });
    if (w) {
      await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
      await prisma.wallet.delete({ where: { id: w.id } });
    }
    await prisma.subscription.deleteMany({ where: { workspaceId: id } });
    await prisma.agentCallLog.deleteMany({ where: { workspaceId: id } });
    await prisma.agent.deleteMany({ where: { workspaceId: id } });
    await prisma.workspace.delete({ where: { id } }).catch(() => {});
  }
  for (const id of created.plans) await prisma.plan.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

test('a completed call is charged at the platform wallet rate', { skip: !HAS_DB }, async () => {
  const s = await scenario();
  const call = await makeCall(s, { durationSec: 150 }); // 2.5 billed minutes
  const r = await settleCall(call.id);
  const expected = Math.round(2.5 * RATE_PAISE);

  assert.equal(r.billed, true);
  assert.equal(r.minutes, 2.5);
  assert.equal(r.amountCents, expected);
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000 - expected);

  const row = await prisma.agentCallLog.findUnique({ where: { id: call.id } });
  assert.equal(row.billingStatus, 'BILLED');
  assert.equal(row.billedCents, expected);
  assert.equal(row.ratePerMinuteCents, RATE_PAISE, 'rate is snapshotted onto the call');
  assert.equal((await auditWallet(s.workspaceId)).balanced, true);
});

test('one extra second is charged as a second, not as a whole minute', { skip: !HAS_DB }, async () => {
  // The overcharge this billing model exists to prevent: a 61-second call used
  // to settle as two full minutes.
  const s = await scenario();
  const call = await makeCall(s, { durationSec: 61 });
  const r = await settleCall(call.id);

  assert.equal(r.amountCents, Math.round((61 / 60) * RATE_PAISE));
  assert.ok(r.amountCents < 2 * RATE_PAISE, 'must not round up to two minutes');
  assert.equal((await auditWallet(s.workspaceId)).balanced, true);
});

test('settling the same call twice charges once', { skip: !HAS_DB }, async () => {
  // The double-fired call-end event: socket close racing an explicit stop, or
  // a replayed client PATCH.
  const s = await scenario();
  const call = await makeCall(s, { durationSec: 60 });

  const first = await settleCall(call.id);
  const second = await settleCall(call.id);

  assert.equal(first.billed, true);
  assert.equal(second.billed, false);
  assert.equal(second.reason, 'already-billed');
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000 - RATE_PAISE);
  assert.equal((await auditWallet(s.workspaceId)).balanced, true);
});

test('CONCURRENT settlements of one call charge once', { skip: !HAS_DB }, async () => {
  // The status read-then-write would pass the sequential test above and fail
  // this one. Both the conditional UPDATE and the ledger key must hold.
  const s = await scenario();
  const call = await makeCall(s, { durationSec: 60 });

  const results = await Promise.all(Array.from({ length: 5 }, () => settleCall(call.id)));
  assert.equal(results.filter((r) => r.billed && r.amountCents > 0).length, 1);
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000 - RATE_PAISE);
  assert.equal((await auditWallet(s.workspaceId)).balanced, true);
});

test('chat sessions are never billed', { skip: !HAS_DB }, async () => {
  const s = await scenario();
  const call = await makeCall(s, { durationSec: 600, type: 'CHAT' });
  const r = await settleCall(call.id);
  assert.equal(r.billed, false);
  assert.equal(r.reason, 'not-billable-type');
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000);
});

test('a zero-duration call is free', { skip: !HAS_DB }, async () => {
  const s = await scenario();
  const call = await makeCall(s, { durationSec: 0 });
  const r = await settleCall(call.id);
  assert.equal(r.billed, false);
  assert.equal(r.reason, 'zero-duration');
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000);
});

test('usage is recorded even when the wallet cannot cover it', { skip: !HAS_DB }, async () => {
  // The minutes were served. Refusing to record them would lose the revenue
  // AND hide the usage; blocking is the PRE-call gate's job.
  const s = await scenario({ balanceCents: 100 });
  const call = await makeCall(s, { durationSec: 300 }); // 5 billed minutes
  const r = await settleCall(call.id);

  assert.equal(r.billed, true);
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100 - 5 * RATE_PAISE);
  assert.equal((await auditWallet(s.workspaceId)).balanced, true);
});

test('every billed minute hits the wallet, even with a subscription row present', { skip: !HAS_DB }, async () => {
  // Plans are gone: there is no included-minutes allowance to draw down. A
  // leftover subscription row from the old model must NOT buy free minutes, so
  // this asserts it is ignored rather than honoured.
  const s = await scenario({ includedMinutes: 100 });
  await prisma.subscription.create({
    data: {
      workspaceId: s.workspaceId, planId: s.plan.id, planName: s.plan.name,
      status: 'active', minutesIncluded: 100, minutesUsed: 0,
      currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    },
  });
  const call = await makeCall(s, { durationSec: 120 }); // 2 billed minutes
  const r = await settleCall(call.id);

  assert.equal(r.amountCents, 2 * RATE_PAISE, 'charged in full despite the allowance');
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000 - 2 * RATE_PAISE);
  const sub = await prisma.subscription.findUnique({ where: { workspaceId: s.workspaceId } });
  assert.equal(sub.minutesUsed, 0, 'the allowance is not touched either');
});

// ── Closed-tab backstop ─────────────────────────────────────────────────────

/** A call still in progress: no endedAt, exactly as the browser leaves it. */
async function liveCall({ workspaceId, agentId }, { startedAt = new Date(Date.now() - 90_000) } = {}) {
  return prisma.agentCallLog.create({
    data: { workspaceId, agentId, type: 'WEB_CALL', status: 'IN_PROGRESS', startedAt, durationSec: 0 },
  });
}

test('a call the browser never ended is finalized and billed server-side', { skip: !HAS_DB }, async () => {
  // The closed tab: served, logged, and — before the backstop — never charged,
  // because only the browser's terminal PATCH ever triggered settlement.
  const s = await scenario();
  const call = await liveCall(s);
  const endedAt = new Date();

  const finalized = await finalizeAbandonedCall(call.id, { ...s, endedAt });
  assert.equal(finalized, true);

  const row = await prisma.agentCallLog.findUnique({ where: { id: call.id } });
  assert.equal(row.status, 'COMPLETED');
  assert.ok(row.endedAt, 'the call must be closed out, not left in progress');
  assert.equal(row.billingStatus, 'BILLED');
  assert.ok(row.durationSec >= 89 && row.durationSec <= 91, `duration was ${row.durationSec}`);
  assert.ok(row.billedCents > 0, 'the minutes served must actually be charged');
  assert.equal((await auditWallet(s.workspaceId)).balanced, true);
});

test('the backstop bills the call, not the grace period before it runs', { skip: !HAS_DB }, async () => {
  // It fires ~30s after the socket closed. Charging to the moment it RAN would
  // add that half-minute of silence to every abandoned call's bill.
  const s = await scenario();
  const call = await liveCall(s, { startedAt: new Date(Date.now() - 120_000) });
  const mediaStoppedAt = new Date(Date.now() - 30_000);

  await finalizeAbandonedCall(call.id, { ...s, endedAt: mediaStoppedAt });

  const row = await prisma.agentCallLog.findUnique({ where: { id: call.id } });
  assert.ok(row.durationSec >= 89 && row.durationSec <= 91, `duration was ${row.durationSec}`);
});

test('the backstop stands down when the browser ended the call itself', { skip: !HAS_DB }, async () => {
  // The normal path. The browser's own finalization carries the recording and
  // the final transcript, so it must win — and the post-call webhook, Sheets row
  // and email must fire exactly once.
  const s = await scenario();
  const call = await makeCall(s, { durationSec: 60 }); // makeCall sets endedAt

  assert.equal(await finalizeAbandonedCall(call.id, { ...s }), false);
});

test('two backstops on one call finalize it once', { skip: !HAS_DB }, async () => {
  // endedAt is the claim, and it is a conditional UPDATE precisely so a retry or
  // a duplicated close event cannot deliver the post-call payload twice.
  const s = await scenario();
  const call = await liveCall(s);

  const results = await Promise.all([
    finalizeAbandonedCall(call.id, { ...s }),
    finalizeAbandonedCall(call.id, { ...s }),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await auditWallet(s.workspaceId)).balanced, true);
});

test('the backstop is inert without a call log', { skip: !HAS_DB }, async () => {
  const s = await scenario();
  assert.equal(await finalizeAbandonedCall(null, { ...s }), false);
  assert.equal(await finalizeAbandonedCall('does-not-exist', { ...s }), false);
});

// ── Pre-call gate ───────────────────────────────────────────────────────────

test('a funded workspace may start a call', { skip: !HAS_DB }, async () => {
  const s = await scenario();
  assert.equal((await assertCanStartCall(s.workspaceId)).allowed, true);
});

test('an empty wallet blocks new calls with a clear reason', { skip: !HAS_DB }, async () => {
  const s = await scenario({ balanceCents: 0 });
  const g = await assertCanStartCall(s.workspaceId);
  assert.equal(g.allowed, false);
  assert.equal(g.code, 'INSUFFICIENT_BALANCE');
  assert.match(g.message, /empty|balance/i, 'must explain WHY, not fail silently');
});

test('a balance too small for a usable call blocks rather than cutting off mid-greeting', { skip: !HAS_DB }, async () => {
  const s = await scenario({ balanceCents: 10 }); // a few paise: seconds, at best
  const g = await assertCanStartCall(s.workspaceId);
  assert.equal(g.allowed, false);
  assert.equal(g.code, 'INSUFFICIENT_BALANCE');
  assert.equal(g.maxSeconds, 0);
});

test('the gate returns a spend budget the balance can actually cover', { skip: !HAS_DB }, async () => {
  // The half of the gate that was missing: passing it used to mean a call could
  // run for any length, so one minute of balance paid for a thirty-minute call
  // and the wallet settled negative.
  const s = await scenario({ balanceCents: 2 * RATE_PAISE }); // two minutes' worth
  const g = await assertCanStartCall(s.workspaceId);

  assert.equal(g.allowed, true);
  assert.ok(Number.isFinite(g.maxSeconds), 'a funded call must still have a deadline');
  assert.equal(g.maxSeconds, 120);

  // Settling a call that runs exactly to the budget must not overdraw.
  const call = await makeCall(s, { durationSec: g.maxSeconds });
  await settleCall(call.id);
  assert.ok(
    (await getBalance(s.workspaceId)).balanceCents >= 0,
    'a call held to its budget must never end in the negative',
  );
});

test('concurrent calls are NOT limited', { skip: !HAS_DB }, async () => {
  // Wallet balance is the only gate. A workspace may run as many simultaneous
  // calls as it can pay for.
  const s = await scenario();
  for (let i = 0; i < 5; i++) await makeCall(s, { status: 'IN_PROGRESS' });
  assert.equal((await assertCanStartCall(s.workspaceId)).allowed, true);
});

test('chat is never gated on balance', { skip: !HAS_DB }, async () => {
  const s = await scenario({ balanceCents: 0 });
  assert.equal((await assertCanStartCall(s.workspaceId, { type: 'CHAT' })).allowed, true);
});

test('agent creation is NOT limited', { skip: !HAS_DB }, async () => {
  const s = await scenario();
  for (let i = 0; i < 4; i++) {
    await prisma.agent.create({
      data: { workspaceId: s.workspaceId, name: `A${i}`, welcomeMessage: 'hi', aiModel: 'm', voice: 'v' },
    });
    assert.equal((await assertCanCreateAgent(s.workspaceId)).allowed, true);
  }
});

test('a stale cancelled subscription does NOT block calls', { skip: !HAS_DB }, async () => {
  // The old model refused calls on a cancelled subscription. With plans gone
  // that row is meaningless history, and honouring it would strand a funded
  // workspace with no way to resubscribe.
  const s2 = await scenario();
  await prisma.subscription.create({
    data: {
      workspaceId: s2.workspaceId, planId: s2.plan.id, planName: s2.plan.name,
      status: 'cancelled', currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() - 864e5),
    },
  });
  assert.equal((await assertCanStartCall(s2.workspaceId)).allowed, true);
});

