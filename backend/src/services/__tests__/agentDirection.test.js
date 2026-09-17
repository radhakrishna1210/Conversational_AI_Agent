// backend/src/services/__tests__/agentDirection.test.js
//
// What these pin — an agent works for ONE direction of call:
//
//   - an Outbound agent cannot be put on a number, an Inbound agent cannot dial
//     (test call, placeOutboundCall, or a campaign at create / start / dispatch);
//   - an agent with no CHOSEN direction keeps working everywhere — including an
//     older agent whose settings carry the INBOUND the old editor saved by
//     default — so a deploy stops nothing that is live;
//   - a direction cannot change while a number or a live campaign depends on it,
//     and the refusal names what to undo;
//   - the settings validator normalises the value and never lets a save clear it.
//
// Drives the real modules with the shared Prisma client's delegates swapped out,
// the same approach as campaignLifecycle.test.js.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
delete process.env.REDIS_URL;

const { default: prisma } = await import('../../config/prisma.js');
const {
  agentDirection, storedDirection, inboundRefusal, outboundRefusal, directionChangeConflict, normaliseDirection,
} = await import('../agentDirection.js');
const { validateAgentSettings } = await import('../../validators/agentSettings.validator.js');
const { placeOutboundCall } = await import('../outboundCall.service.js');
const { setInboundAgent } = await import('../plivo/inbound.service.js');
const campaignService = await import('../campaign.service.js');
const { runCampaign } = await import('../campaignRunner.service.js');

const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

const unreachable = (what) => async () => { throw new Error(`${what} should not have been reached`); };

/** An agent whose direction was chosen under the rule (locked), or none at all. */
const agentWith = (callDirection, extra = {}) => ({
  id: 'agent_1',
  workspaceId: 'ws_1',
  name: 'Front desk',
  welcomeMessage: 'Hello',
  settings: JSON.stringify(callDirection === undefined ? {} : { callDirection, callDirectionLocked: true }),
  ...extra,
});

/** An older agent: a direction the editor saved by default, never chosen. */
const legacyAgent = (callDirection) => ({
  id: 'agent_1', workspaceId: 'ws_1', name: 'Hotel desk', welcomeMessage: 'Hello',
  settings: JSON.stringify({ callDirection }),
});

describe('reading an agent\'s direction', () => {
  test('normalises case and rejects anything else', () => {
    assert.equal(normaliseDirection('outbound'), 'OUTBOUND');
    assert.equal(normaliseDirection(' INBOUND '), 'INBOUND');
    assert.equal(normaliseDirection('both'), null);
    assert.equal(normaliseDirection(null), null);
  });

  test('reads a raw row, parsed settings, or a serialized agent', () => {
    assert.equal(agentDirection(agentWith('OUTBOUND')), 'OUTBOUND');
    assert.equal(agentDirection({ settings: { callDirection: 'inbound', callDirectionLocked: true } }), 'INBOUND');
    assert.equal(agentDirection({ callDirection: 'OUTBOUND', callDirectionLocked: true, settings: undefined }), 'OUTBOUND');
    assert.equal(agentDirection(agentWith(undefined)), null);
    assert.equal(agentDirection({ settings: 'not json' }), null);
    assert.equal(agentDirection(null), null);
  });

  test('a stored direction nobody chose under the rule is only a suggestion', () => {
    assert.equal(agentDirection(legacyAgent('INBOUND')), null);
    assert.equal(storedDirection(legacyAgent('INBOUND')), 'INBOUND');
    assert.equal(agentDirection({ callDirection: 'OUTBOUND', callDirectionLocked: 'true' }), null, 'only a real true locks');
    // The hotel agent case: stored INBOUND, running campaigns — still allowed to dial.
    assert.equal(outboundRefusal(legacyAgent('INBOUND')), null);
    assert.equal(inboundRefusal(legacyAgent('OUTBOUND')), null);
  });

  test('each direction is refused only on the other side; unset is refused nowhere', () => {
    assert.match(inboundRefusal(agentWith('OUTBOUND')), /Outbound agent/);
    assert.equal(inboundRefusal(agentWith('INBOUND')), null);
    assert.equal(inboundRefusal(agentWith(undefined)), null);

    assert.match(outboundRefusal(agentWith('INBOUND')), /Inbound agent/);
    assert.equal(outboundRefusal(agentWith('OUTBOUND')), null);
    assert.equal(outboundRefusal(agentWith(undefined)), null);
  });
});

describe('changing a direction while the agent is in use', () => {
  const db = ({ numbers = [], campaigns = [] } = {}) => {
    const seen = { numberQuery: null, campaignQuery: null };
    return {
      seen,
      voiceNumber: { findMany: async (q) => { seen.numberQuery = q; return numbers; } },
      campaign: { findMany: async (q) => { seen.campaignQuery = q; return campaigns; } },
    };
  };

  test('unchanged or absent asks nothing', async () => {
    const fake = db();
    assert.equal(await directionChangeConflict(agentWith('INBOUND'), 'INBOUND', fake), null);
    assert.equal(await directionChangeConflict(agentWith('INBOUND'), undefined, fake), null);
    assert.equal(fake.seen.numberQuery, null);
    assert.equal(fake.seen.campaignQuery, null);
  });

  test('to Outbound is refused while a number routes to the agent, naming it', async () => {
    const fake = db({ numbers: [{ phoneNumber: '+912269851741' }] });
    const msg = await directionChangeConflict(agentWith('INBOUND'), 'OUTBOUND', fake);
    assert.match(msg, /\+912269851741/);
    assert.equal(fake.seen.numberQuery.where.inboundAgentId, 'agent_1');
    assert.equal(fake.seen.numberQuery.where.workspaceId, 'ws_1');
    assert.equal(await directionChangeConflict(agentWith('INBOUND'), 'OUTBOUND', db()), null);
  });

  test('to Inbound is refused while a live voice campaign uses the agent', async () => {
    const fake = db({ campaigns: [{ name: 'Diwali offers', status: 'RUNNING' }] });
    const msg = await directionChangeConflict(agentWith('OUTBOUND'), 'INBOUND', fake);
    assert.match(msg, /"Diwali offers" \(running\)/);
    assert.deepEqual(fake.seen.campaignQuery.where.status.in.sort(), ['PAUSED', 'RUNNING', 'SCHEDULED']);
    assert.equal(fake.seen.campaignQuery.where.channel, 'VOICE');
  });

  test('giving a direction to an agent that never had one is a change', async () => {
    const fake = db({ campaigns: [{ name: 'Hotel follow-ups', status: 'PAUSED' }] });
    assert.match(await directionChangeConflict(agentWith(undefined), 'INBOUND', fake), /Hotel follow-ups/);
  });

  test('confirming the INBOUND an older agent already stores is still checked', async () => {
    const fake = db({ campaigns: [{ name: 'Hotel follow-ups', status: 'RUNNING' }] });
    assert.match(await directionChangeConflict(legacyAgent('INBOUND'), 'INBOUND', fake), /Hotel follow-ups/);
  });
});

describe('validateAgentSettings — callDirection', () => {
  test('normalises a valid direction and locks it', () => {
    const r = validateAgentSettings({ callDirection: 'outbound' });
    assert.equal(r.ok, true);
    assert.equal(r.extras.callDirection, 'OUTBOUND');
    assert.equal(r.extras.callDirectionLocked, true);
  });
  test('the lock is never taken from the request', () => {
    assert.equal('callDirectionLocked' in validateAgentSettings({ callDirectionLocked: true }).extras, false);
    assert.equal('callDirectionLocked' in validateAgentSettings({ callDirection: null, callDirectionLocked: true }).extras, false);
  });
  test('refuses anything that is not a direction', () => {
    const r = validateAgentSettings({ callDirection: 'both' });
    assert.equal(r.ok, false);
    assert.match(r.error, /Inbound or Outbound/);
  });
  test('a blank or null direction is dropped, so a save cannot clear it', () => {
    assert.equal('callDirection' in validateAgentSettings({ callDirection: null }).extras, false);
    assert.equal('callDirection' in validateAgentSettings({ callDirection: '' }).extras, false);
  });
});

describe('where an agent may be used', () => {
  test('placeOutboundCall refuses an Inbound agent before touching the database or a carrier', async () => {
    stub(prisma.voiceNumber, 'findUnique', unreachable('caller ID lookup'));
    stub(prisma.agentCallLog, 'create', unreachable('call log'));
    const out = await placeOutboundCall({
      workspaceId: 'ws_1', agent: agentWith('INBOUND'), toNumber: '+919876543210', fromNumber: '+912269851741',
    });
    assert.equal(out.ok, false);
    assert.equal(out.status, 409);
    assert.equal(out.code, 'AGENT_IS_INBOUND');
  });

  test('setInboundAgent refuses an Outbound agent and leaves the number alone', async () => {
    stub(prisma.voiceNumber, 'findFirst', async () => ({ id: 'num_1', workspaceId: 'ws_1', status: 'ACTIVE' }));
    stub(prisma.agent, 'findFirst', async () => agentWith('OUTBOUND'));
    stub(prisma.voiceNumber, 'update', unreachable('number update'));
    const out = await setInboundAgent('ws_1', { numberId: 'num_1', agentId: 'agent_1' });
    assert.equal(out.ok, false);
    assert.equal(out.status, 409);
    assert.match(out.error, /Outbound agent/);
  });

  test('setInboundAgent still assigns an Inbound or undecided agent, and still unassigns', async () => {
    const writes = [];
    stub(prisma.voiceNumber, 'findFirst', async () => ({ id: 'num_1', workspaceId: 'ws_1', status: 'ACTIVE' }));
    stub(prisma.voiceNumber, 'update', async ({ data }) => { writes.push(data); return { id: 'num_1', ...data }; });
    for (const direction of ['INBOUND', undefined]) {
      stub(prisma.agent, 'findFirst', async () => agentWith(direction));
      assert.equal((await setInboundAgent('ws_1', { numberId: 'num_1', agentId: 'agent_1' })).ok, true);
    }
    assert.equal((await setInboundAgent('ws_1', { numberId: 'num_1', agentId: null })).ok, true);
    assert.deepEqual(writes.map((w) => w.inboundAgentId), ['agent_1', 'agent_1', null]);
  });

  test('a bulk campaign cannot be created with an Inbound agent', async () => {
    stub(prisma.agent, 'findFirst', async () => agentWith('INBOUND'));
    stub(prisma.campaign, 'create', unreachable('campaign create'));
    await assert.rejects(
      campaignService.createBulkCampaign('ws_1', { name: 'X', botId: 'agent_1', clusterIds: ['c1'] }),
      (err) => err.statusCode === 409 && /Inbound agent/.test(err.message),
    );
  });

  test('a campaign cannot be pointed at, or started with, an Inbound agent', async () => {
    stub(prisma.agent, 'findFirst', async () => agentWith('INBOUND'));
    stub(prisma.campaign, 'update', unreachable('campaign update'));
    await assert.rejects(
      campaignService.updateCampaign('ws_1', 'camp_1', { botId: 'agent_1' }),
      (err) => err.statusCode === 409,
    );

    stub(prisma.campaign, 'findFirstOrThrow', async () => ({
      id: 'camp_1', workspaceId: 'ws_1', channel: 'VOICE', botId: 'agent_1', status: 'DRAFT', launchedAt: null,
    }));
    await assert.rejects(campaignService.startCampaign('ws_1', 'camp_1'), (err) => err.statusCode === 409);
    await assert.rejects(campaignService.launchCampaign('ws_1', 'camp_1'), (err) => err.statusCode === 409);
  });

  test('editing a campaign without touching its agent does not look the agent up', async () => {
    stub(prisma.agent, 'findFirst', unreachable('agent lookup'));
    stub(prisma.campaign, 'update', async ({ data }) => data);
    assert.deepEqual(await campaignService.updateCampaign('ws_1', 'camp_1', { name: 'Renamed' }), { name: 'Renamed' });
  });

  test('a queued campaign whose agent became Inbound fails before its first dial', async () => {
    const statusWrites = [];
    stub(prisma.campaign, 'findFirst', async () => ({
      id: 'camp_1', workspaceId: 'ws_1', botId: 'agent_1', status: 'RUNNING', fromNumbers: ['+918045678901'],
    }));
    stub(prisma.agent, 'findFirst', async () => agentWith('INBOUND'));
    stub(prisma.campaignRecipient, 'groupBy', async () => []);
    stub(prisma.campaign, 'update', async () => ({}));
    stub(prisma.campaign, 'updateMany', async ({ data }) => { statusWrites.push(data); return { count: 1 }; });
    let dials = 0;
    const out = await runCampaign('camp_1', 'ws_1', { dial: async () => { dials += 1; return { ok: true }; } });
    assert.deepEqual(out, { started: false, reason: 'agent-direction' });
    assert.equal(dials, 0);
    assert.equal(statusWrites.at(-1).status, 'FAILED');
    assert.match(statusWrites.at(-1).lastError, /Inbound agent/);
  });
});
