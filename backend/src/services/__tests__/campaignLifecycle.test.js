// backend/src/services/__tests__/campaignLifecycle.test.js
//
// What these pin — the campaign states a person sets must be the states that
// stick, and a campaign that says RUNNING must have something dialling:
//
//   - Cancel stays CANCELLED (the exiting dispatch loop used to write PAUSED over it);
//   - Start pressed while a paused loop is still unwinding resumes dialling
//     (it used to read RUNNING with nothing dialling);
//   - a dispatch never acts on a campaign nobody asked to run;
//   - after a restart, orphaned RUNNING campaigns are paused, never re-dialled,
//     and campaigns BullMQ still holds a job for are left to it;
//   - Launch without Redis still dispatches;
//   - PUT cannot set status, and recipients can only be added in-workspace,
//     with a phone number.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
delete process.env.REDIS_URL; // no queue: the in-process paths are the ones under test

const { default: prisma } = await import('../../config/prisma.js');
const {
  runCampaign, requestStop, requestResume, recoverOrphanedCampaigns,
} = await import('../campaignRunner.service.js');
const campaignService = await import('../campaign.service.js');
const { updateCampaignSchema } = await import('../../validators/campaign.validator.js');
const { releaseSlot, isSlotHeld } = await import('../telephony/concurrency.js');

const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** A campaign whose status lives in `db.status`, the way the UI and the loop both see it. */
const world = ({ recipients = 3, status = 'RUNNING' } = {}) => {
  const db = { status, statusWrites: [], dials: 0 };
  const rows = Array.from({ length: recipients }, (_, i) => ({
    id: `r${i}`, campaignId: 'camp', phoneNumber: `+91987654321${i}`, contactId: null, status: 'pending',
  }));
  stub(prisma.campaign, 'findFirst', async () => ({
    id: 'camp', workspaceId: 'ws', botId: 'agent_1', fromNumbers: ['+918045678901'], fromNumber: null, launchedAt: null, status: db.status,
  }));
  stub(prisma.agent, 'findFirst', async () => ({ id: 'agent_1', name: 'Desk', settings: '{}' }));
  stub(prisma.campaign, 'update', async ({ data }) => { if (data.status) { db.status = data.status; db.statusWrites.push(data.status); } return {}; });
  stub(prisma.campaign, 'updateMany', async ({ where, data }) => {
    if (where.status?.not && db.status === where.status.not) return { count: 0 };
    if (typeof where.status === 'string' && db.status !== where.status) return { count: 0 };
    if (data.status) { db.status = data.status; db.statusWrites.push(data.status); }
    return { count: 1 };
  });
  stub(prisma.campaign, 'findUnique', async () => ({ status: db.status, concurrentCalls: 5 }));
  stub(prisma.campaignRecipient, 'findMany', async ({ take }) => rows.filter((r) => r.status === 'pending').slice(0, take));
  stub(prisma.campaignRecipient, 'update', async ({ where, data }) => {
    const row = rows.find((r) => r.id === where.id);
    if (row && data.status) row.status = data.status;
    return row;
  });
  stub(prisma.campaignRecipient, 'groupBy', async () => []);
  const deps = (onDial = () => {}) => ({
    numberStatus: async () => ({ ready: true }),
    rotationCompliant: async () => ({ allowed: true }),
    callMode: async () => ({ mode: 'conversation', reason: '' }),
    gateCall: async () => ({ allowed: true }),
    pause: async () => {},
    dial: async () => {
      db.dials += 1;
      onDial(db.dials);
      // Hang the call up at once so the campaign's own call limit never waits.
      return { ok: true, callLogId: `call_${db.dials}` };
    },
  });
  return { db, rows, deps };
};

afterEach(() => { for (let i = 0; i < 20; i += 1) if (isSlotHeld(`call_${i}`)) releaseSlot(`call_${i}`); });

describe('runCampaign — the status a person sets is the one that sticks', () => {
  test('Cancel during dispatch stays CANCELLED; the loop writes no PAUSED on its way out', async () => {
    const w = world({ recipients: 5 });
    const out = await runCampaign('camp', 'ws', w.deps((n) => {
      if (n === 1) {
        requestStop('camp');     // what cancelCampaign does first…
        w.db.status = 'CANCELLED'; // …and then writes
      }
    }));
    assert.equal(out.started, true);
    assert.equal(w.db.status, 'CANCELLED');
    assert.equal(w.db.statusWrites.includes('PAUSED'), false);
    assert.equal(w.db.dials, 1);
  });

  test('Start pressed while a paused loop is unwinding: dialling carries on', async () => {
    const w = world({ recipients: 4 });
    await runCampaign('camp', 'ws', w.deps((n) => {
      if (n === 1) {
        requestStop('camp');       // Pause…
        w.db.status = 'PAUSED';
        w.db.status = 'RUNNING';   // …then Start, before the loop has left
        assert.equal(requestResume('camp'), true);
      }
    }));
    // The resumed run is scheduled once the first has released its slot.
    for (let i = 0; i < 20 && w.rows.some((r) => r.status === 'pending'); i += 1) await tick();
    assert.equal(w.rows.filter((r) => r.status === 'sent').length, 4, 'every recipient dialled');
    assert.equal(w.db.status, 'COMPLETED');
  });

  test('a queued or scheduled job for a campaign that is no longer running does nothing', async () => {
    for (const status of ['PAUSED', 'CANCELLED', 'COMPLETED', 'DRAFT']) {
      const w = world({ status });
      const out = await runCampaign('camp', 'ws', w.deps());
      assert.equal(out.reason, 'not-runnable', status);
      assert.equal(w.db.dials, 0);
      assert.equal(w.db.statusWrites.length, 0, `${status} was not overwritten`);
    }
  });

  test('a dispatch reaching its end after a cancel does not mark it COMPLETED', async () => {
    const w = world({ recipients: 1 });
    await runCampaign('camp', 'ws', w.deps(() => { w.db.status = 'CANCELLED'; }));
    assert.equal(w.db.status, 'CANCELLED');
  });
});

describe('recoverOrphanedCampaigns — after a restart', () => {
  const recoveryWorld = (runningIds) => {
    const r = { paused: [], failedCalling: [], synced: 0 };
    stub(prisma.campaign, 'findMany', async () => runningIds.map((id) => ({ id })));
    stub(prisma.campaignRecipient, 'updateMany', async ({ where, data }) => {
      if (where.status === 'calling' && data.status === 'failed') r.failedCalling.push(where.campaignId);
      return { count: 1 };
    });
    stub(prisma.campaign, 'updateMany', async ({ where, data }) => {
      if (data.status === 'PAUSED') r.paused.push({ id: where.id, lastError: data.lastError });
      return { count: 1 };
    });
    stub(prisma.campaignRecipient, 'groupBy', async () => []);
    stub(prisma.campaign, 'update', async () => { r.synced += 1; return {}; });
    return r;
  };

  test('orphans are paused with a reason, not re-dialled; queued ones are left to BullMQ', async () => {
    const r = recoveryWorld(['orphan', 'queued']);
    const out = await recoverOrphanedCampaigns({ queuedCampaignIds: async () => new Set(['queued']) });
    assert.deepEqual(r.paused.map((p) => p.id), ['orphan']);
    assert.match(r.paused[0].lastError, /server restart/);
    assert.deepEqual(r.failedCalling, ['orphan'], 'a mid-dial recipient is closed, never re-dialled');
    assert.equal(out.paused, 1);
  });

  test('a queue that cannot be read pauses every running campaign rather than leaving orphans', async () => {
    const r = recoveryWorld(['a', 'b']);
    await recoverOrphanedCampaigns({ queuedCampaignIds: async () => { throw new Error('ECONNREFUSED'); } });
    assert.deepEqual(r.paused.map((p) => p.id), ['a', 'b']);
  });
});

describe('campaign.service', () => {
  test('Launch without a queue dispatches in-process', async () => {
    stub(prisma.campaign, 'findFirstOrThrow', async () => ({ id: 'camp', workspaceId: 'ws', status: 'DRAFT' }));
    stub(prisma.campaign, 'update', async ({ data }) => ({ id: 'camp', ...data }));
    let dispatched = 0;
    stub(prisma.campaign, 'findFirst', async () => { dispatched += 1; return null; }); // runCampaign's first read
    const out = await campaignService.launchCampaign('ws', 'camp');
    await tick();
    assert.equal(out.dispatch, 'in-process');
    assert.equal(out.status, 'RUNNING');
    assert.equal(dispatched, 1, 'a dispatch actually started');
  });

  test('PUT takes settings only — never status or progress', async () => {
    const parsed = updateCampaignSchema.parse({ name: 'Diwali', status: 'RUNNING', progress: 100, concurrentCalls: 3 });
    assert.deepEqual(parsed, { name: 'Diwali', concurrentCalls: 3 });

    let written;
    stub(prisma.campaign, 'update', async ({ data }) => { written = data; return data; });
    await campaignService.updateCampaign('ws', 'camp', { name: 'Diwali', status: 'COMPLETED', sent: 999 });
    assert.deepEqual(written, { name: 'Diwali' });
  });

  test('recipients are added only to this workspace\'s campaign, only for its callable contacts, with their numbers', async () => {
    let contactQuery;
    let created;
    stub(prisma.campaign, 'findFirstOrThrow', async ({ where }) => {
      if (where.workspaceId !== 'ws') throw Object.assign(new Error('No Campaign found'), { code: 'P2025' });
      return { id: 'camp', workspaceId: 'ws', status: 'DRAFT' };
    });
    stub(prisma.contact, 'findMany', async (args) => { contactQuery = args; return [{ id: 'c1', phoneNumber: '+919876543210' }]; });
    stub(prisma.campaignRecipient, 'createMany', async ({ data }) => { created = data; return { count: data.length }; });
    stub(prisma.campaignRecipient, 'count', async () => 1);
    stub(prisma.campaign, 'update', async ({ data }) => ({ id: 'camp', ...data }));

    await assert.rejects(campaignService.addRecipients('ws_intruder', 'camp', ['c1']));
    assert.equal(created, undefined);

    const out = await campaignService.addRecipients('ws', 'camp', ['c1', 'c_other_workspace']);
    assert.equal(contactQuery.where.workspaceId, 'ws');
    assert.equal(contactQuery.where.status, 'ACTIVE');
    assert.deepEqual(created, [{ campaignId: 'camp', contactId: 'c1', phoneNumber: '+919876543210' }]);
    assert.equal(out.ignored, 1);
  });
});
