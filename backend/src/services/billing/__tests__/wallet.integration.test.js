// backend/src/services/billing/__tests__/wallet.integration.test.js
/**
 * BUG-002 — ledger integrity against a REAL database.
 *
 * The guarantees under test (atomicity, idempotency, no lost updates) are
 * properties of Postgres constraints and row locks. Mocking the database would
 * test the mock, not the guarantee, so this talks to the configured DATABASE_URL
 * and skips entirely when there isn't one.
 *
 * Everything is created inside a throwaway workspace and removed afterwards.
 *
 * Run: npm run test:billing
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const HAS_DB = Boolean(process.env.DATABASE_URL);

let prisma; let wallet; let TX_TYPES;
if (HAS_DB) {
  ({ default: prisma } = await import('../../../config/prisma.js'));
  wallet = await import('../wallet.service.js');
  ({ TX_TYPES } = wallet);
}

/** Fresh workspace per test so cases cannot contaminate each other. */
async function withWorkspace(fn) {
  const slug = `billing-test-${randomUUID().slice(0, 8)}`;
  const ws = await prisma.workspace.create({ data: { name: 'Billing Test', slug } });
  try {
    return await fn(ws.id);
  } finally {
    // Wallet has no FK to Workspace (pre-existing convention), so it and its
    // cascaded ledger rows must be removed explicitly.
    const w = await prisma.wallet.findUnique({ where: { workspaceId: ws.id } });
    if (w) {
      await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
      await prisma.wallet.delete({ where: { id: w.id } });
    }
    await prisma.workspace.delete({ where: { id: ws.id } }).catch(() => {});
  }
}

test('credits and debits produce a balanced ledger', { skip: !HAS_DB }, async () => {
  await withWorkspace(async (workspaceId) => {
    await wallet.applyWalletTransaction({
      workspaceId, amountCents: 100_000, type: TX_TYPES.TOPUP,
      idempotencyKey: `t-${randomUUID()}`,
    });
    const r = await wallet.applyWalletTransaction({
      workspaceId, amountCents: -2_448, type: TX_TYPES.USAGE,
      idempotencyKey: `u-${randomUUID()}`,
    });
    assert.equal(r.balanceCents, 97_552);

    const audit = await wallet.auditWallet(workspaceId);
    assert.equal(audit.balanced, true, JSON.stringify(audit));
    assert.equal(audit.ledgerSumCents, 97_552);
    assert.deepEqual(audit.discrepancies, []);
  });
});

test('a replayed idempotency key charges exactly once', { skip: !HAS_DB }, async () => {
  // The retried-webhook / double-fired-call-end case.
  await withWorkspace(async (workspaceId) => {
    await wallet.applyWalletTransaction({
      workspaceId, amountCents: 50_000, type: TX_TYPES.TOPUP,
      idempotencyKey: `seed-${randomUUID()}`,
    });
    const key = `call-${randomUUID()}`;
    const first = await wallet.applyWalletTransaction({
      workspaceId, amountCents: -1_000, type: TX_TYPES.USAGE, idempotencyKey: key,
    });
    const second = await wallet.applyWalletTransaction({
      workspaceId, amountCents: -1_000, type: TX_TYPES.USAGE, idempotencyKey: key,
    });

    assert.equal(first.applied, true);
    assert.equal(first.duplicate, false);
    assert.equal(second.applied, false);
    assert.equal(second.duplicate, true, 'replay must be reported as a duplicate');
    assert.equal(second.balanceCents, 49_000, 'balance must not move on replay');
    assert.equal((await wallet.auditWallet(workspaceId)).balanced, true);
  });
});

test('SIMULTANEOUS replays of one key still charge once', { skip: !HAS_DB }, async () => {
  // A read-then-write idempotency check would pass the sequential test above
  // and fail this one: both callers read "not applied" before either writes.
  // Only the UNIQUE constraint survives this.
  await withWorkspace(async (workspaceId) => {
    await wallet.applyWalletTransaction({
      workspaceId, amountCents: 50_000, type: TX_TYPES.TOPUP,
      idempotencyKey: `seed-${randomUUID()}`,
    });
    const key = `race-${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => wallet.applyWalletTransaction({
        workspaceId, amountCents: -1_000, type: TX_TYPES.USAGE, idempotencyKey: key,
      })),
    );
    assert.equal(results.filter((r) => r.applied).length, 1, 'exactly one write may win');
    const { balanceCents } = await wallet.getBalance(workspaceId);
    assert.equal(balanceCents, 49_000);
    assert.equal((await wallet.auditWallet(workspaceId)).balanced, true);
  });
});

test('concurrent DISTINCT debits do not lose an update', { skip: !HAS_DB }, async () => {
  // The lost-update race: without SELECT ... FOR UPDATE, two settlements
  // landing together both read balance B and both write B-x, so one call is
  // never charged. Guaranteed to occur on a system built for concurrent calls.
  await withWorkspace(async (workspaceId) => {
    await wallet.applyWalletTransaction({
      workspaceId, amountCents: 100_000, type: TX_TYPES.TOPUP,
      idempotencyKey: `seed-${randomUUID()}`,
    });
    const N = 10;
    await Promise.all(
      Array.from({ length: N }, () => wallet.applyWalletTransaction({
        workspaceId, amountCents: -1_000, type: TX_TYPES.USAGE,
        idempotencyKey: `d-${randomUUID()}`,
      })),
    );
    const { balanceCents } = await wallet.getBalance(workspaceId);
    assert.equal(balanceCents, 100_000 - N * 1_000, 'every debit must be reflected');

    const audit = await wallet.auditWallet(workspaceId);
    assert.equal(audit.balanced, true, JSON.stringify(audit.discrepancies));
    assert.equal(audit.transactionCount, N + 1);
  });
});

test('a debit past the balance floor is refused', { skip: !HAS_DB }, async () => {
  await withWorkspace(async (workspaceId) => {
    await wallet.applyWalletTransaction({
      workspaceId, amountCents: 500, type: TX_TYPES.TOPUP,
      idempotencyKey: `seed-${randomUUID()}`,
    });
    await assert.rejects(
      () => wallet.applyWalletTransaction({
        workspaceId, amountCents: -5_000, type: TX_TYPES.USAGE,
        idempotencyKey: `over-${randomUUID()}`,
      }),
      (err) => err.code === 'INSUFFICIENT_BALANCE',
    );
    assert.equal((await wallet.getBalance(workspaceId)).balanceCents, 500,
      'a refused debit must leave no trace');
    assert.equal((await wallet.auditWallet(workspaceId)).balanced, true);
  });
});

test('allowNegative records usage for a call that already happened', { skip: !HAS_DB }, async () => {
  // Settlement must never fail to record real usage — the minutes were served
  // regardless of balance. Blocking happens BEFORE a call starts, not after.
  await withWorkspace(async (workspaceId) => {
    const r = await wallet.applyWalletTransaction({
      workspaceId, amountCents: -2_500, type: TX_TYPES.USAGE,
      idempotencyKey: `neg-${randomUUID()}`, allowNegative: true,
    });
    assert.equal(r.applied, true);
    assert.equal(r.balanceCents, -2_500);
    assert.equal((await wallet.auditWallet(workspaceId)).balanced, true);
  });
});

test('overdraftLimitCents permits invoice-terms accounts', { skip: !HAS_DB }, async () => {
  await withWorkspace(async (workspaceId) => {
    await wallet.getOrCreateWallet(workspaceId);
    await prisma.wallet.update({ where: { workspaceId }, data: { overdraftLimitCents: 10_000 } });
    const r = await wallet.applyWalletTransaction({
      workspaceId, amountCents: -8_000, type: TX_TYPES.USAGE,
      idempotencyKey: `od-${randomUUID()}`,
    });
    assert.equal(r.balanceCents, -8_000);
    await assert.rejects(
      () => wallet.applyWalletTransaction({
        workspaceId, amountCents: -5_000, type: TX_TYPES.USAGE,
        idempotencyKey: `od2-${randomUUID()}`,
      }),
      (err) => err.code === 'INSUFFICIENT_BALANCE',
      'must still refuse beyond the overdraft limit',
    );
  });
});

test('invalid mutations are rejected before touching the ledger', { skip: !HAS_DB }, async () => {
  await withWorkspace(async (workspaceId) => {
    for (const bad of [
      { amountCents: 0, type: TX_TYPES.TOPUP },
      { amountCents: NaN, type: TX_TYPES.TOPUP },
      { amountCents: 100, type: 'not_a_real_type' },
    ]) {
      await assert.rejects(() => wallet.applyWalletTransaction({ workspaceId, ...bad }));
    }
    assert.equal((await wallet.getBalance(workspaceId)).balanceCents, 0);
  });
});

test('auditWallet detects a balance mutated outside the ledger', { skip: !HAS_DB }, async () => {
  // Proves the invariant is falsifiable: if any future code writes a balance
  // directly, this is what catches it.
  await withWorkspace(async (workspaceId) => {
    await wallet.applyWalletTransaction({
      workspaceId, amountCents: 1_000, type: TX_TYPES.TOPUP,
      idempotencyKey: `seed-${randomUUID()}`,
    });
    assert.equal((await wallet.auditWallet(workspaceId)).balanced, true);
    await prisma.wallet.update({ where: { workspaceId }, data: { balanceCents: 999_999 } });
    const audit = await wallet.auditWallet(workspaceId);
    assert.equal(audit.balanced, false, 'tampering must be detected');
    assert.equal(audit.ledgerSumCents, 1_000);
    assert.equal(audit.balanceCents, 999_999);
  });
});

test.after(async () => { if (HAS_DB) await prisma.$disconnect(); });
