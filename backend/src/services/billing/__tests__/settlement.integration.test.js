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
if (HAS_DB) {
  ({ default: prisma } = await import('../../../config/prisma.js'));
  ({ settleCall, assertCanStartCall, assertCanCreateAgent } = await import('../settlement.service.js'));
  ({ applyWalletTransaction, getBalance, auditWallet, TX_TYPES } = await import('../wallet.service.js'));
}

const created = { workspaces: [], plans: [] };

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

test('a completed call is charged at the plan rate', { skip: !HAS_DB }, async () => {
  const s = await scenario();
  const call = await makeCall(s, { durationSec: 150 }); // 3 billed minutes
  const r = await settleCall(call.id);

  assert.equal(r.billed, true);
  assert.equal(r.minutes, 3);
  assert.equal(r.amountCents, 3 * 816); // $0.085 x 96 x 100 = 816 paise/min
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000 - 2_448);

  const row = await prisma.agentCallLog.findUnique({ where: { id: call.id } });
  assert.equal(row.billingStatus, 'BILLED');
  assert.equal(row.billedCents, 2_448);
  assert.equal(row.ratePerMinuteCents, 816, 'rate is snapshotted onto the call');
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
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000 - 816);
  assert.equal((await auditWallet(s.workspaceId)).balanced, true);
});

test('CONCURRENT settlements of one call charge once', { skip: !HAS_DB }, async () => {
  // The status read-then-write would pass the sequential test above and fail
  // this one. Both the conditional UPDATE and the ledger key must hold.
  const s = await scenario();
  const call = await makeCall(s, { durationSec: 60 });

  const results = await Promise.all(Array.from({ length: 5 }, () => settleCall(call.id)));
  assert.equal(results.filter((r) => r.billed && r.amountCents > 0).length, 1);
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000 - 816);
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
  const call = await makeCall(s, { durationSec: 300 }); // 5 min = 4080 paise
  const r = await settleCall(call.id);

  assert.equal(r.billed, true);
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100 - 4_080);
  assert.equal((await auditWallet(s.workspaceId)).balanced, true);
});

test('plan-included minutes are consumed before the wallet', { skip: !HAS_DB }, async () => {
  const s = await scenario({ includedMinutes: 100 });
  await prisma.subscription.create({
    data: {
      workspaceId: s.workspaceId, planId: s.plan.id, planName: s.plan.name,
      status: 'active', minutesIncluded: 100, minutesUsed: 0,
      currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    },
  });
  const call = await makeCall(s, { durationSec: 120 }); // 2 min
  const r = await settleCall(call.id);

  assert.equal(r.coveredByPlan, 2);
  assert.equal(r.amountCents, 0, 'wallet must not be touched while minutes remain');
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000);
  const sub = await prisma.subscription.findUnique({ where: { workspaceId: s.workspaceId } });
  assert.equal(sub.minutesUsed, 2);
});

test('usage beyond included minutes spills to the wallet', { skip: !HAS_DB }, async () => {
  const s = await scenario({ includedMinutes: 2 });
  await prisma.subscription.create({
    data: {
      workspaceId: s.workspaceId, planId: s.plan.id, planName: s.plan.name,
      status: 'active', minutesIncluded: 2, minutesUsed: 0,
      currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    },
  });
  const call = await makeCall(s, { durationSec: 300 }); // 5 min: 2 covered, 3 charged
  const r = await settleCall(call.id);

  assert.equal(r.coveredByPlan, 2);
  assert.equal(r.amountCents, 3 * 816);
  assert.equal((await getBalance(s.workspaceId)).balanceCents, 100_000 - 2_448);
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
  const s = await scenario({ balanceCents: 10 }); // < 816 paise/min
  const g = await assertCanStartCall(s.workspaceId);
  assert.equal(g.allowed, false);
  assert.equal(g.code, 'INSUFFICIENT_BALANCE');
});

test('concurrency limit is enforced before the call starts', { skip: !HAS_DB }, async () => {
  const s = await scenario({ maxConcurrentCalls: 2 });
  await makeCall(s, { status: 'IN_PROGRESS' });
  assert.equal((await assertCanStartCall(s.workspaceId)).allowed, true, '1 of 2 in progress');
  await makeCall(s, { status: 'IN_PROGRESS' });
  const g = await assertCanStartCall(s.workspaceId);
  assert.equal(g.allowed, false);
  assert.equal(g.code, 'CONCURRENCY_LIMIT');
  assert.match(g.message, /2/);
});

test('chat is never gated on balance', { skip: !HAS_DB }, async () => {
  const s = await scenario({ balanceCents: 0 });
  assert.equal((await assertCanStartCall(s.workspaceId, { type: 'CHAT' })).allowed, true);
});

test('agent count limit is enforced', { skip: !HAS_DB }, async () => {
  const s = await scenario({ maxAgents: 2 });
  assert.equal((await assertCanCreateAgent(s.workspaceId)).allowed, true, '1 of 2 exists');
  await prisma.agent.create({
    data: { workspaceId: s.workspaceId, name: 'B', welcomeMessage: 'hi', aiModel: 'm', voice: 'v' },
  });
  const g = await assertCanCreateAgent(s.workspaceId);
  assert.equal(g.allowed, false);
  assert.equal(g.code, 'AGENT_LIMIT');
});

test('a cancelled subscription blocks calls', { skip: !HAS_DB }, async () => {
  const s = await scenario();
  await prisma.subscription.create({
    data: {
      workspaceId: s.workspaceId, planId: s.plan.id, planName: s.plan.name,
      status: 'cancelled', currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() - 864e5),
    },
  });
  const g = await assertCanStartCall(s.workspaceId);
  assert.equal(g.allowed, false);
  assert.equal(g.code, 'SUBSCRIPTION_INACTIVE');
});
