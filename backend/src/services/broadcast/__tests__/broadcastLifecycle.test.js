// backend/src/services/broadcast/__tests__/broadcastLifecycle.test.js
//
// The broadcast half of campaignLifecycle.test.js: a dispatch never acts on a
// broadcast nobody asked to run, a restart pauses orphans rather than leaving
// them RUNNING forever, and an edit cannot point a broadcast at another
// workspace's recording.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { default: prisma } = await import('../../../config/prisma.js');
const { runBroadcast, recoverOrphanedBroadcasts } = await import('../broadcastRunner.service.js');
const { updateBroadcast } = await import('../broadcast.service.js');

const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

describe('runBroadcast', () => {
  test('does nothing for a broadcast that is no longer RUNNING, and overwrites nothing', async () => {
    const writes = [];
    stub(prisma.broadcast, 'update', async (args) => { writes.push(args); return {}; });
    stub(prisma.broadcast, 'updateMany', async (args) => { writes.push(args); return { count: 1 }; });
    for (const status of ['PAUSED', 'CANCELLED', 'COMPLETED']) {
      stub(prisma.broadcast, 'findFirst', async () => ({ id: 'b1', workspaceId: 'ws', status, recording: { id: 'rec', durationSec: 10 } }));
      const out = await runBroadcast('b1', 'ws');
      assert.equal(out.reason, 'not-runnable', status);
    }
    assert.equal(writes.length, 0);
  });
});

describe('recoverOrphanedBroadcasts', () => {
  test('pauses a broadcast left RUNNING by a restart, with a reason, after reaping lost dials', async () => {
    const calls = [];
    stub(prisma.broadcast, 'findMany', async () => [{ id: 'b1' }]);
    stub(prisma.broadcastRecipient, 'findMany', async () => []);
    stub(prisma.broadcastRecipient, 'updateMany', async ({ where }) => { calls.push(['reap', where.status]); return { count: 2 }; });
    stub(prisma.broadcast, 'updateMany', async ({ where, data }) => { calls.push(['pause', where.status, data.status, data.lastError]); return { count: 1 }; });
    stub(prisma.broadcastRecipient, 'groupBy', async () => []);
    stub(prisma.broadcastRecipient, 'aggregate', async () => ({ _sum: { billedCents: 0 } }));
    stub(prisma.broadcast, 'update', async () => ({}));

    const out = await recoverOrphanedBroadcasts();

    assert.deepEqual(out, { paused: 1, reaped: 2 });
    const pause = calls.find((c) => c[0] === 'pause');
    assert.equal(pause[1], 'RUNNING', 'only a broadcast still RUNNING is touched');
    assert.equal(pause[2], 'PAUSED');
    assert.match(pause[3], /server restart/);
  });
});

describe('updateBroadcast', () => {
  test('refuses a recording from another workspace', async () => {
    let updated = false;
    stub(prisma.broadcast, 'findFirstOrThrow', async () => ({ id: 'b1', workspaceId: 'ws', status: 'DRAFT', recordingId: 'rec_mine' }));
    stub(prisma.broadcastRecording, 'findFirst', async ({ where }) => (where.workspaceId === 'ws' && where.id === 'rec_mine2' ? { id: 'rec_mine2' } : null));
    stub(prisma.broadcast, 'update', async () => { updated = true; return {}; });

    await assert.rejects(updateBroadcast('ws', 'b1', { recordingId: 'rec_theirs' }), (err) => err.statusCode === 400);
    assert.equal(updated, false);

    await updateBroadcast('ws', 'b1', { recordingId: 'rec_mine2' });
    assert.equal(updated, true);
  });
});
