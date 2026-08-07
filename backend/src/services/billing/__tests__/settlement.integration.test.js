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
let getWalletRate;
if (HAS_DB) {
  ({ default: prisma } = await import('../../../config/prisma.js'));
  ({ settleCall, assertCanStartCall, assertCanCreateAgent } = await import('../settlement.service.js'));
  ({ applyWalletTransaction, getBalance, auditWallet, TX_TYPES } = await import('../wallet.service.js'));
  ({ getWalletRate } = await import('../walletRate.js'));
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
  const call = await makeCall(s, { durationSec: 150 }); // 3 billed minutes
  const r = await settleCall(call.id);

  assert.equal(r.billed, true);
  assert.equal(r.minutes, 3);
  assert.equal(r.amountCents, 3 * RATE_PAISE);
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000 - 3 * RATE_PAISE);

  const row = await prisma.agentCallLog.findUnique({ where: { id: call.id } });
  assert.equal(row.billingStatus, 'BILLED');
  assert.equal(row.billedCents, 3 * RATE_PAISE);
  assert.equal(row.ratePerMinuteCents, RATE_PAISE, 'rate is snapshotted onto the call');
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

test('a balance below one minute blocks rather than cutting off mid-call', { skip: !HAS_DB }, async () => {
  const s = await scenario({ balanceCents: 10 }); // below one minute at any sane rate
  const g = await assertCanStartCall(s.workspaceId);
  assert.equal(g.allowed, false);
  assert.equal(g.code, 'INSUFFICIENT_BALANCE');
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

