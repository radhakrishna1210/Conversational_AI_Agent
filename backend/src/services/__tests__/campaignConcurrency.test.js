// What these pin: a bulk campaign keeps no more of its calls up at once than its
// "Concurrent Calls" setting — and a call that ended without anyone releasing its
// slot cannot stall the campaign.
//
// The failure they guard against was live: Bulk Call saved `concurrentCalls`
// (default 1) and the dialer read it and never used it. The loop dialled the
// next recipient a second after the last one without waiting for any call to
// end, so a campaign set to one call at a time had every recipient on the line
// at once. Every one of those calls shared one LLM quota, one database pool and
// one TTS plan, which is why the same agent was fast on a test call and slow in
// a campaign.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { default: prisma } = await import('../../config/prisma.js');
const {
  runCampaign, campaignCallLimit, trackCampaignCall, liveCampaignCallCount,
  reconcileCampaignCalls, waitForCampaignSlot, __resetCampaignCallsForTests,
} = await import('../campaignRunner.service.js');
const { acquireSlot, releaseSlot, isSlotHeld, snapshot, __resetForTests } = await import('../telephony/concurrency.js');

const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};

beforeEach(() => {
  __resetCampaignCallsForTests();
  __resetForTests({ carrierCeiling: 50, perWorkspace: 0 });
});
afterEach(() => { while (restores.length) restores.pop()(); });

describe('campaignCallLimit', () => {
  test('reads the saved setting as whole calls, never less than one', () => {
    assert.equal(campaignCallLimit(3), 3);
    assert.equal(campaignCallLimit('2'), 2);
    assert.equal(campaignCallLimit(2.7), 2);
    for (const bad of [0, -4, null, undefined, 'lots', NaN]) assert.equal(campaignCallLimit(bad), 1, String(bad));
  });
});

describe('counting a campaign\'s live calls', () => {
  test('a call counts while its carrier slot is held, and is forgotten once released', () => {
    acquireSlot({ workspaceId: 'ws', callLogId: 'c1' });
    acquireSlot({ workspaceId: 'ws', callLogId: 'c2' });
    trackCampaignCall('camp', 'c1');
    trackCampaignCall('camp', 'c2');
    trackCampaignCall('other', 'c3-never-held');
    assert.equal(liveCampaignCallCount('camp'), 2);
    releaseSlot('c1');
    assert.equal(liveCampaignCallCount('camp'), 1);
    assert.equal(liveCampaignCallCount('other'), 0, 'campaigns are counted separately');
  });
});

describe('reconcileCampaignCalls — a slot nothing released', () => {
  const NOW = 10_000_000;
  const world = (rows, ages) => {
    for (const id of Object.keys(ages)) trackCampaignCall('camp', id, { held: () => true });
    const released = [];
    return {
      released,
      opts: {
        now: NOW,
        db: { agentCallLog: { findMany: async () => rows } },
        takenAt: (id) => NOW - ages[id],
        release: (id) => released.push(id),
        unansweredAfterMs: 120_000,
      },
    };
  };

  test('finished, vanished and long-unanswered calls are given back; live and ringing ones are not', async () => {
    const { released, opts } = world(
      [
        { id: 'done', status: 'COMPLETED' },
        { id: 'failed', status: 'FAILED' },
        { id: 'ringing', status: 'INITIATED' },
        { id: 'never-answered', status: 'INITIATED' },
        { id: 'long-call', status: 'IN_PROGRESS' },
      ],
      { done: 30_000, failed: 5_000, ringing: 40_000, 'never-answered': 180_000, 'long-call': 1_800_000, vanished: 60_000 },
    );
    const n = await reconcileCampaignCalls('camp', opts);
    assert.deepEqual(released.sort(), ['done', 'failed', 'never-answered', 'vanished']);
    assert.equal(n, 4);
  });

  test('a database error releases nothing — guessing would overfill the carrier', async () => {
    trackCampaignCall('camp', 'c1', { held: () => true });
    const released = [];
    const n = await reconcileCampaignCalls('camp', {
      db: { agentCallLog: { findMany: async () => { throw new Error('connection reset'); } } },
      release: (id) => released.push(id),
    });
    assert.equal(n, 0);
    assert.deepEqual(released, []);
  });
});

describe('waitForCampaignSlot', () => {
  test('below the limit it does not wait at all', async () => {
    let pauses = 0;
    const out = await waitForCampaignSlot('camp', 2, { count: () => 1, pause: async () => { pauses += 1; } });
    assert.equal(out, 'free');
    assert.equal(pauses, 0);
  });

  test('at the limit it waits until a call ends', async () => {
    const counts = [1, 1, 1, 0];
    let pauses = 0;
    const out = await waitForCampaignSlot('camp', 1, {
      count: () => counts.shift() ?? 0,
      pause: async () => { pauses += 1; },
      checkEveryMs: Infinity,
    });
    assert.equal(out, 'free');
    assert.equal(pauses, 3);
  });

  test('pausing or cancelling the campaign from the UI ends the wait', async () => {
    for (const status of ['PAUSED', 'CANCELLED', null]) {
      let t = 0;
      const out = await waitForCampaignSlot('camp', 1, {
        count: () => 1,
        pause: async () => { t += 1_000; },
        now: () => t,
        checkEveryMs: 1_000,
        readStatus: async () => status,
        reconcile: async () => 0,
      });
      assert.equal(out, 'halted', String(status));
    }
  });

  test('a stop request ends the wait', async () => {
    const control = { stop: false };
    const out = await waitForCampaignSlot('camp', 1, {
      control,
      count: () => 1,
      pause: async () => { control.stop = true; },
      checkEveryMs: Infinity,
    });
    assert.equal(out, 'stopped');
  });

  test('while stuck, it reconciles — so a missed release cannot park the campaign', async () => {
    let t = 0;
    let live = 1;
    const out = await waitForCampaignSlot('camp', 1, {
      count: () => live,
      pause: async () => { t += 1_000; },
      now: () => t,
      checkEveryMs: 5_000,
      readStatus: async () => 'RUNNING',
      reconcile: async () => { live = 0; return 1; },
    });
    assert.equal(out, 'free');
    assert.ok(t >= 5_000, 'reconciled on the slow clock, not every poll');
  });
});

describe('runCampaign honours "Concurrent Calls"', () => {
  const SLOT_POLL = 7; // distinctive, so the fake pause knows a slot wait from a dial gap

  const campaignWorld = ({ concurrentCalls, recipients }) => {
    const rows = Array.from({ length: recipients }, (_, i) => ({
      id: `r${i}`, campaignId: 'camp', phoneNumber: `+9198765432${String(i).padStart(2, '0')}`, contactId: null, status: 'pending',
    }));
    stub(prisma.campaign, 'findFirst', async () => ({
      id: 'camp', workspaceId: 'ws', botId: 'agent_1', fromNumbers: ['+918045678901'], fromNumber: null, launchedAt: null,
    }));
    stub(prisma.agent, 'findFirst', async () => ({ id: 'agent_1', name: 'Hotel desk', settings: '{}' }));
    stub(prisma.campaign, 'update', async () => ({}));
    stub(prisma.campaign, 'findUnique', async () => ({ status: 'RUNNING', concurrentCalls }));
    stub(prisma.campaignRecipient, 'findMany', async ({ take }) => rows.filter((r) => r.status === 'pending').slice(0, take));
    stub(prisma.campaignRecipient, 'update', async ({ where, data }) => {
      const row = rows.find((r) => r.id === where.id);
      if (row && data.status) row.status = data.status;
      return row;
    });
    stub(prisma.campaignRecipient, 'groupBy', async () => []);

    const calls = [];
    let peak = 0;
    const deps = {
      numberStatus: async () => ({ ready: true }),
      rotationCompliant: async () => ({ allowed: true }),
      callMode: async () => ({ mode: 'conversation', reason: '' }),
      gateCall: async () => ({ allowed: true }),
      slotPollMs: SLOT_POLL,
      // A dial the carrier accepted takes a slot, exactly as placeOutboundCall does.
      dial: async () => {
        const callLogId = `call_${calls.length}`;
        acquireSlot({ workspaceId: 'ws', callLogId });
        calls.push(callLogId);
        peak = Math.max(peak, snapshot().active);
        return { ok: true, callLogId, mode: 'conversation' };
      },
      // While the campaign waits for a slot, the oldest call hangs up.
      pause: async (ms) => {
        if (ms !== SLOT_POLL) return;
        const oldest = calls.find((id) => isSlotHeld(id));
        if (oldest) releaseSlot(oldest);
      },
    };
    return { deps, calls, peak: () => peak };
  };

  test('set to 2 with five recipients: every recipient is called, never more than two at once', async () => {
    const w = campaignWorld({ concurrentCalls: 2, recipients: 5 });
    const out = await runCampaign('camp', 'ws', w.deps);
    assert.equal(out.dialled, 5);
    assert.equal(w.peak(), 2);
  });

  test('the default of 1 means one call at a time', async () => {
    const w = campaignWorld({ concurrentCalls: 1, recipients: 4 });
    const out = await runCampaign('camp', 'ws', w.deps);
    assert.equal(out.dialled, 4);
    assert.equal(w.peak(), 1);
  });
});
