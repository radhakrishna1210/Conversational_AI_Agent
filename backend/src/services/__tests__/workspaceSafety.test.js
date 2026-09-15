// The customer-facing workspace routes. What these pin, database stubbed:
//
//  1. A timezone is saved to WorkspaceSettings instead of crashing the update.
//  2. Pricing columns never reach a customer's response.
//  3. A member cannot demote or remove the platform owner's membership.
//  4. An unexpected 500 does not echo the raw error text in production.
//
// Lives under services/ because `npm test` only globs services/**/__tests__.

import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { default: prisma } = await import('../../config/prisma.js');
const ws = await import('../workspace.service.js');
const ctrl = await import('../../controllers/workspace.controller.js');
const { workspaceUpdateSchema } = await import('../../validators/settings.validator.js');
const { errorHandler } = await import('../../middleware/errorHandler.js');

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

const ROW = { id: 'ws_1', name: 'Acme', slug: 'acme', rateOverrideInr: 7.5, pricingBucketId: 'bkt_1' };

describe('workspace update', () => {
  test('a timezone goes to WorkspaceSettings, the rest to Workspace', async () => {
    const calls = {};
    stub(prisma.workspaceSettings, 'upsert', async (args) => { calls.settings = args; return {}; });
    stub(prisma.workspace, 'update', async (args) => { calls.workspace = args; return { ...ROW, ...args.data }; });
    await ws.updateWorkspace('ws_1', { name: 'Acme Ltd', timezone: 'Asia/Kolkata' });
    assert.equal(calls.settings.update.timezone, 'Asia/Kolkata');
    assert.deepEqual(calls.workspace.data, { name: 'Acme Ltd' });
  });

  test('a timezone alone does not issue an empty Workspace update', async () => {
    let updated = false;
    stub(prisma.workspaceSettings, 'upsert', async () => ({}));
    stub(prisma.workspace, 'update', async () => { updated = true; });
    stub(prisma.workspace, 'findUniqueOrThrow', async () => ROW);
    await ws.updateWorkspace('ws_1', { timezone: 'UTC' });
    assert.equal(updated, false);
  });

  test('an unknown timezone is a validation error, not a 500', () => {
    assert.equal(workspaceUpdateSchema.safeParse({ timezone: 'Mars/Olympus' }).success, false);
    assert.equal(workspaceUpdateSchema.safeParse({ timezone: 'Asia/Kolkata' }).success, true);
  });
});

describe('pricing is not shown to customers', () => {
  test('GET strips the admin-only columns', async () => {
    const res = fakeRes();
    await ctrl.getWorkspace({ workspace: ROW, params: { workspaceId: 'ws_1' } }, res);
    assert.equal(res.body.name, 'Acme');
    assert.equal('rateOverrideInr' in res.body, false);
    assert.equal('pricingBucketId' in res.body, false);
  });

  test('PATCH strips them too', async () => {
    stub(prisma.workspace, 'update', async () => ROW);
    const res = fakeRes();
    await ctrl.updateWorkspace({ params: { workspaceId: 'ws_1' }, body: { name: 'Acme' } }, res);
    assert.equal('rateOverrideInr' in res.body, false);
  });
});

describe('the platform owner\'s membership', () => {
  const ownerTarget = () => stub(prisma.workspaceMember, 'findUnique', async () => ({ role: 'Superadmin' }));

  test('a member cannot remove it', async () => {
    let deleted = false;
    ownerTarget();
    stub(prisma.workspaceMember, 'delete', async () => { deleted = true; });
    await assert.rejects(ws.removeMember('ws_1', 'owner', 'Member'), (e) => e.statusCode === 403);
    assert.equal(deleted, false);
  });

  test('a member cannot demote it', async () => {
    ownerTarget();
    stub(prisma.workspaceMember, 'update', async () => { throw new Error('must not run'); });
    await assert.rejects(ws.updateMemberRole('ws_1', 'owner', 'Member', 'Member'), (e) => e.statusCode === 403);
  });

  test('a member can still remove another member', async () => {
    let deleted = false;
    stub(prisma.workspaceMember, 'findUnique', async () => ({ role: 'Member' }));
    stub(prisma.workspaceMember, 'delete', async () => { deleted = true; });
    await ws.removeMember('ws_1', 'colleague', 'Member');
    assert.equal(deleted, true);
  });

  test('the platform owner may manage it', async () => {
    let deleted = false;
    stub(prisma.workspaceMember, 'delete', async () => { deleted = true; });
    await ws.removeMember('ws_1', 'owner', 'Superadmin');
    assert.equal(deleted, true);
  });
});

describe('errorHandler', () => {
  const run = (nodeEnv) => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = nodeEnv;
    try {
      const res = fakeRes();
      errorHandler(new Error('Invalid `prisma.workspace.update()` invocation: Unknown argument `timezone`'), { url: '/x', method: 'PATCH' }, res, () => {});
      return res;
    } finally {
      process.env.NODE_ENV = previous;
    }
  };

  test('production answers a 500 without the raw error', () => {
    const res = run('production');
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
  });

  test('development still shows it', () => {
    assert.match(run('development').body.message, /Unknown argument/);
  });
});
