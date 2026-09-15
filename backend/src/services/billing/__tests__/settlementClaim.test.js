// settleCall when the ledger write fails AFTER the call was claimed BILLED.
//
// The claim writes billedCents before the debit. The catch used to update only
// PENDING rows, so a failed debit left the call reading BILLED with an amount
// no wallet was charged, and — not FAILED — nothing would ever retry it.
//
// Database fully stubbed (unlike the *.integration suites next door, this never
// needs DATABASE_URL to point anywhere).

import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { default: prisma } = await import('../../../config/prisma.js');
const { settleCall } = await import('../settlement.service.js');

const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

/** One call row whose conditional updates behave like Postgres's. */
const world = ({ ledgerHasRow = false } = {}) => {
  const row = { id: 'call_1', workspaceId: 'ws_1', agentId: 'a_1', type: 'PHONE_CALL', durationSec: 90, billingStatus: 'PENDING', billedCents: 0 };
  stub(prisma.agentCallLog, 'findUnique', async () => ({ ...row }));
  stub(prisma.agentCallLog, 'updateMany', async ({ where, data }) => {
    if (where.id !== row.id || where.billingStatus !== row.billingStatus) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  });
  stub(prisma.plan, 'findUnique', async () => ({ perMinuteInr: 10, perMinuteUsd: 0.1 }));
  stub(prisma.workspace, 'findUnique', async () => ({ rateOverrideInr: null, pricingBucketId: null, pricingBucket: null }));
  // The debit fails at its first statement.
  stub(prisma.wallet, 'upsert', async () => { throw new Error('connection reset'); });
  stub(prisma.walletTransaction, 'findUnique', async () => (ledgerHasRow ? { id: 'tx_1' } : null));
  return row;
};

describe('settleCall — a debit that fails after the claim', () => {
  test('leaves an honest FAILED row with nothing billed', async () => {
    const row = world();
    const out = await settleCall('call_1');
    assert.equal(out.billed, false);
    assert.equal(row.billingStatus, 'FAILED');
    assert.equal(row.billedCents, 0);
    assert.equal(row.billedAt, null);
  });

  test('keeps BILLED when the ledger shows the debit did land', async () => {
    const row = world({ ledgerHasRow: true });
    await settleCall('call_1');
    assert.equal(row.billingStatus, 'BILLED');
    assert.ok(row.billedCents > 0);
  });

  test('a failure BEFORE the claim still marks the PENDING row FAILED', async () => {
    const row = world();
    stub(prisma.plan, 'findUnique', async () => { throw new Error('db down'); });
    await settleCall('call_1');
    assert.equal(row.billingStatus, 'FAILED');
  });
});
