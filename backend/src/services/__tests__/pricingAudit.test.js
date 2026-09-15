// Admin pricing changes are audited.
//
// Every one reprices real customers, and none wrote an audit row. What these
// pin: a successful change records before and after; a refused one is recorded
// as a failure with its reason; the HTTP answer is unchanged. Database stubbed.
//
// Lives under services/ because `npm test` only globs services/**/__tests__.

import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { default: prisma } = await import('../../config/prisma.js');
const { adminSetWalletRate, adminSetRateOverride } = await import('../../controllers/platform.controller.js');
const { AUDIT_ACTIONS } = await import('../audit.service.js');

const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

const fakeRes = () => {
  const res = { statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const admin = (body, params = {}) => ({ body, params, user: { userId: 'admin_1', email: 'owner@x.co', role: 'Superadmin' }, headers: {} });

describe('pricing audit', () => {
  test('a wallet-rate change records the old and new rate', async () => {
    const audits = [];
    let stored = 11.52;
    stub(prisma.auditLog, 'create', async ({ data }) => { audits.push(data); return data; });
    stub(prisma.plan, 'findUnique', async () => ({ perMinuteInr: stored, perMinuteUsd: 0.12 }));
    stub(prisma.plan, 'update', async ({ data }) => { stored = data.perMinuteInr; return { ...data }; });

    const res = fakeRes();
    await adminSetWalletRate(admin({ perMinuteInr: 9.5 }), res);

    assert.deepEqual(res.body, { perMinuteInr: 9.5 });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, AUDIT_ACTIONS.PRICING_WALLET_RATE_UPDATE);
    assert.equal(audits[0].status, 'success');
    assert.equal(audits[0].actorEmail, 'owner@x.co');
    assert.deepEqual(JSON.parse(audits[0].before), { perMinuteInr: 11.52 });
    assert.deepEqual(JSON.parse(audits[0].after), { perMinuteInr: 9.5 });
  });

  test('a refused override is recorded as a failure, and still answers 400', async () => {
    const audits = [];
    stub(prisma.auditLog, 'create', async ({ data }) => { audits.push(data); return data; });
    stub(prisma.plan, 'findUnique', async () => ({ perMinuteInr: 11.52, perMinuteUsd: 0.12 }));
    stub(prisma.workspace, 'findUnique', async () => ({ rateOverrideInr: null, pricingBucketId: null, pricingBucket: null }));

    const res = fakeRes();
    await adminSetRateOverride(admin({ perMinuteInr: -3 }, { workspaceId: 'ws_1' }), res);

    assert.equal(res.statusCode, 400);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, AUDIT_ACTIONS.PRICING_WORKSPACE_OVERRIDE);
    assert.equal(audits[0].status, 'failure');
    assert.equal(audits[0].workspaceId, 'ws_1');
    assert.match(audits[0].errorMessage, /greater than zero/);
  });
});
