// backend/src/services/plivo/__tests__/inboundCallLog.test.js
//
// What these pin: a customer ringing one of our rented numbers now produces a
// call log — so the call is recorded, billed and gets its post-call delivery —
// without the answer endpoint waiting on the database, without a retried answer
// opening a second record, and without a call refused for an empty wallet being
// charged for the refusal.
//
// Before this, only the dialler created AgentCallLog rows. The answer handler
// handed an inbound call to the media bridge with callLogId null, and the
// finalizer returns before settleCall() when there is no id: every inbound
// minute was served free.
//
// Drives the real controller functions with fake req/res and the shared Prisma
// client's delegates swapped out. Lives under services/ because `npm test` only
// globs services/**/__tests__.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.PLIVO_SKIP_SIGNATURE_CHECK = 'true';
process.env.PUBLIC_BACKEND_WS_URL = 'wss://voice.example.test';

const { default: prisma } = await import('../../../config/prisma.js');
const { answer, hangup, hangupTiming } = await import('../../../controllers/plivo.controller.js');
const { inboundCallLogId, openInboundCallLog } = await import('../inbound.service.js');
const { createCallFinalizer } = await import('../../../ws/callFinalizer.js');
const { closeOutTiming } = await import('../../telephony/carrierCloseOut.js');
const { directionOf, partiesOf } = await import('../../analytics.service.js');

// ── Stubbing ────────────────────────────────────────────────────────────────
// Prisma model delegates are proxies: node:test's mock.method cannot see their
// methods, but plain assignment sticks. Every stub is restored after each test.
const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

const CALL_UUID = '2f8d6c1e-7a4b-4c1d-9e3f-5b6a7c8d9e0f';
const OUR_NUMBER = '912269851741';     // as Plivo sends it: digits, no plus
const CALLER = '919876543210';

const req = ({ body = {}, query = {} } = {}) => ({ body, query, method: 'POST', get: () => undefined });
const res = () => {
  const r = { statusCode: 200, body: undefined };
  r.status = (code) => { r.statusCode = code; return r; };
  r.type = () => r;
  r.send = (b) => { r.body = b; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

/** The stream URL out of the answer XML, unescaped. */
const streamUrlOf = (xml) => {
  const m = /<Stream[^>]*>([^<]+)<\/Stream>/.exec(String(xml));
  return m ? new URL(m[1].replace(/&amp;/g, '&')) : null;
};

let db;

/** A routable rented number, a modular agent, and a call log table that records writes. */
const world = ({ create } = {}) => {
  stub(prisma.voiceNumber, 'findUnique', async ({ where }) => (where.phoneNumber === `+${OUR_NUMBER}`
    ? { id: 'num_1', workspaceId: 'ws_1', status: 'ACTIVE', inboundAgentId: 'agent_1' }
    : null));
  stub(prisma.agent, 'findFirst', async ({ where }) => ({ id: where.id, workspaceId: where.workspaceId, name: 'Front desk', settings: '{}' }));
  stub(prisma.agentCallLog, 'create', create ?? (async ({ data }) => { db.created.push(data); return data; }));
};

beforeEach(() => { db = { created: [], updated: [], updatedMany: [], settleLookups: [] }; });

const inboundAnswer = (overrides = {}) => req({ body: { CallUUID: CALL_UUID, From: CALLER, To: OUR_NUMBER, Direction: 'inbound', ...overrides } });

describe('answer() — an inbound call opens its call log', () => {
  test('the stream URL carries a call log id derived from the CallUUID, and the row is created', async () => {
    world();
    const r = res();
    await answer(inboundAnswer(), r);

    const url = streamUrlOf(r.body);
    assert.ok(url, `expected a stream document, got: ${r.body}`);
    assert.equal(url.searchParams.get('callLogId'), `plivo-in-${CALL_UUID}`);
    // withStreamParams lower-cases it; server.js upper-cases it on the way in.
    assert.equal(url.searchParams.get('direction')?.toUpperCase(), 'INBOUND');

    assert.equal(db.created.length, 1);
    assert.deepEqual(db.created[0], {
      id: `plivo-in-${CALL_UUID}`,
      workspaceId: 'ws_1',
      agentId: 'agent_1',
      type: 'PHONE_CALL',
      status: 'INITIATED',
      direction: 'INBOUND',
      // The customer is phoneNumber and we are fromNumber — the same shape as a
      // dialled call, so post-call delivery messages the customer either way.
      phoneNumber: `+${CALLER}`,
      fromNumber: `+${OUR_NUMBER}`,
      provider: 'PLIVO',
      providerCallId: CALL_UUID,
    });
  });

  test('the caller is not kept waiting for the insert — it is dead air on a live line', async () => {
    let finishInsert;
    world({ create: () => new Promise((resolve) => { finishInsert = resolve; }) });
    const r = res();

    await answer(inboundAnswer(), r);

    assert.ok(streamUrlOf(r.body), 'answered with the stream while the insert was still pending');
    assert.equal(typeof finishInsert, 'function', 'the insert was started');
    finishInsert({});
  });

  test('an insert that fails still answers the call — bookkeeping never drops a customer', async () => {
    world({ create: async () => { throw new Error('connection reset'); } });
    const r = res();
    await answer(inboundAnswer(), r);
    assert.ok(streamUrlOf(r.body));
    await new Promise((resolve) => setImmediate(resolve)); // let the rejected insert settle, unhandled-free
  });

  test('a retried answer for the same call reuses the same id', async () => {
    world({ create: async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); } });
    const first = res();
    const second = res();
    await answer(inboundAnswer(), first);
    await answer(inboundAnswer(), second);
    assert.equal(streamUrlOf(first.body).searchParams.get('callLogId'), streamUrlOf(second.body).searchParams.get('callLogId'));
  });

  test('an inbound call with no CallUUID is still answered, just unlogged', async () => {
    world();
    const r = res();
    await answer(inboundAnswer({ CallUUID: '' }), r);
    const url = streamUrlOf(r.body);
    assert.ok(url);
    assert.equal(url.searchParams.get('callLogId'), null);
    assert.equal(db.created.length, 0);
  });

  test('a number with no agent hears "not in service" and opens no call log', async () => {
    world();
    const r = res();
    await answer(inboundAnswer({ To: '910000000000' }), r);
    assert.match(String(r.body), /not in service/);
    assert.equal(db.created.length, 0);
  });

  test('an OUTBOUND call keeps the call log the dialler created, and opens none', async () => {
    world();
    const r = res();
    await answer(req({
      query: { workspaceId: 'ws_1', agentId: 'agent_1', callLogId: 'cl_dialled', direction: 'OUTBOUND', engine: 'modular' },
      body: { CallUUID: CALL_UUID, From: OUR_NUMBER, To: CALLER },
    }), r);
    assert.equal(streamUrlOf(r.body).searchParams.get('callLogId'), 'cl_dialled');
    assert.equal(db.created.length, 0);
  });
});

describe('openInboundCallLog / inboundCallLogId', () => {
  test('a repeat of the same call returns the existing id instead of throwing', async () => {
    stub(prisma.agentCallLog, 'create', async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); });
    const out = await openInboundCallLog({ workspaceId: 'ws_1', agentId: 'agent_1', callUuid: CALL_UUID, from: CALLER, to: OUR_NUMBER });
    assert.deepEqual(out, { id: `plivo-in-${CALL_UUID}`, created: false });
  });

  test('any other database error is not mistaken for a repeat', async () => {
    stub(prisma.agentCallLog, 'create', async () => { throw new Error('connection reset'); });
    await assert.rejects(openInboundCallLog({ workspaceId: 'ws_1', agentId: 'agent_1', callUuid: CALL_UUID }), /connection reset/);
  });

  test('a withheld caller is stored with no number, not stray digits', async () => {
    stub(prisma.agentCallLog, 'create', async ({ data }) => { db.created.push(data); return data; });
    await openInboundCallLog({ workspaceId: 'ws_1', agentId: 'agent_1', callUuid: CALL_UUID, from: 'anonymous', to: OUR_NUMBER });
    assert.equal(db.created[0].phoneNumber, null);
  });

  test('refuses ids that would break the WhatsApp queue\'s job ids', () => {
    assert.equal(inboundCallLogId('abc:def:ghi'), null, "':' is Redis's key separator");
    assert.equal(inboundCallLogId('abcdefgh__ijk'), null, "'__' is the job-id joiner");
    assert.equal(inboundCallLogId(''), null);
    assert.equal(inboundCallLogId(undefined), null);
    assert.equal(inboundCallLogId(CALL_UUID), `plivo-in-${CALL_UUID}`);
  });
});

describe('hangup() — an inbound call is closed out and billed', () => {
  /**
   * The inbound row as the hangup and the finalizer see it. settleCall's own
   * lookup (no `select`) reports the call as already billed, which is enough to
   * prove settlement was reached for THIS call without driving the wallet.
   */
  const callLogTable = ({ rowsBySelect }) => {
    stub(prisma.agentCallLog, 'findUnique', async ({ where, select }) => {
      if (select) return rowsBySelect.shift() ?? null;
      db.settleLookups.push(where.id);
      return { id: where.id, billingStatus: 'BILLED' };
    });
    stub(prisma.agentCallLog, 'update', async (args) => { db.updated.push(args); return {}; });
    // The finalizer's claim on endedAt.
    stub(prisma.agentCallLog, 'updateMany', async (args) => { db.updatedMany.push(args); return { count: 1 }; });
    stub(prisma.agentCallLog, 'findFirst', async () => null); // extraction finds nothing; the finalizer tolerates it
    stub(prisma.agent, 'findFirst', async () => null);
  };
  const claimWrite = () => db.updatedMany.find((u) => u.where?.endedAt === null);
  const shortBridgeGrace = () => {
    const original = closeOutTiming.BRIDGE_GRACE_MS;
    closeOutTiming.BRIDGE_GRACE_MS = 5;
    restores.push(() => { closeOutTiming.BRIDGE_GRACE_MS = original; });
  };

  const inboundHangup = (overrides = {}) => req({
    // No query string: the subaccount application's hangup URL is shared.
    body: { CallUUID: CALL_UUID, CallStatus: 'completed', Duration: '94', Direction: 'inbound', From: CALLER, To: OUR_NUMBER, ...overrides },
  });

  test('found by its CallUUID, finalized under the row\'s own workspace and agent, and settled', async () => {
    shortBridgeGrace();
    // IN_PROGRESS: a bridge was attached, so the hangup gives it the grace window
    // first — and on the second look nothing has closed the call.
    const row = { status: 'IN_PROGRESS', endedAt: null, transcript: '[]', workspaceId: 'ws_1', agentId: 'agent_1' };
    callLogTable({ rowsBySelect: [row, { ...row }] });

    await hangup(inboundHangup(), res());

    const finalizeWrite = claimWrite();
    assert.ok(finalizeWrite, 'the call log was closed out');
    assert.equal(finalizeWrite.where.id, `plivo-in-${CALL_UUID}`);
    assert.equal(finalizeWrite.data.status, 'COMPLETED');
    assert.equal(finalizeWrite.data.durationSec, 94);
    assert.equal('transcript' in finalizeWrite.data, false, 'a carrier callback never writes the transcript');
    assert.deepEqual(db.settleLookups, [`plivo-in-${CALL_UUID}`], 'settleCall was reached for this call');
  });

  test('a caller who hangs up before the non-awaited insert lands is still closed out', async () => {
    const original = hangupTiming.INBOUND_INSERT_GRACE_MS;
    hangupTiming.INBOUND_INSERT_GRACE_MS = 5;
    restores.push(() => { hangupTiming.INBOUND_INSERT_GRACE_MS = original; });
    shortBridgeGrace();
    const row = { status: 'INITIATED', endedAt: null, transcript: '[]', workspaceId: 'ws_1', agentId: 'agent_1' };
    callLogTable({ rowsBySelect: [null, row, { ...row }] });

    await hangup(inboundHangup(), res());

    assert.ok(claimWrite(), 'closed out on the second look');
    assert.deepEqual(db.settleLookups, [`plivo-in-${CALL_UUID}`]);
  });

  test('a call the media bridge closes during the grace window is left to it', async () => {
    shortBridgeGrace();
    callLogTable({ rowsBySelect: [
      { status: 'IN_PROGRESS', endedAt: null, transcript: '[]', workspaceId: 'ws_1', agentId: 'agent_1' },
      { status: 'COMPLETED', endedAt: new Date(), transcript: '[{"role":"user","content":"hi"}]', workspaceId: 'ws_1', agentId: 'agent_1' },
    ] });

    await hangup(inboundHangup(), res());

    assert.equal(claimWrite(), undefined);
    assert.equal(db.settleLookups.length, 0, 'no second settlement, no second post-call delivery');
  });

  test('a call that was never routed has no row, and nothing is written', async () => {
    const original = hangupTiming.INBOUND_INSERT_GRACE_MS;
    hangupTiming.INBOUND_INSERT_GRACE_MS = 5;
    restores.push(() => { hangupTiming.INBOUND_INSERT_GRACE_MS = original; });
    callLogTable({ rowsBySelect: [null, null] });

    await hangup(inboundHangup(), res());

    assert.equal(db.updated.length, 0);
    assert.equal(db.settleLookups.length, 0);
  });

  test('a call the bridge already closed out is left alone', async () => {
    callLogTable({ rowsBySelect: [{ status: 'COMPLETED', endedAt: new Date(), workspaceId: 'ws_1', agentId: 'agent_1' }] });
    await hangup(inboundHangup(), res());
    assert.equal(db.updated.length, 0);
    assert.equal(db.updatedMany.length, 0);
    assert.equal(db.settleLookups.length, 0);
  });

  test('an OUTBOUND hangup still records the CallUUID on the call the dialler named', async () => {
    callLogTable({ rowsBySelect: [{ status: 'COMPLETED', endedAt: new Date(), workspaceId: 'ws_1', agentId: 'agent_1' }] });
    await hangup(req({ query: { callLogId: 'cl_dialled', workspaceId: 'ws_1', agentId: 'agent_1' }, body: { CallUUID: CALL_UUID, CallStatus: 'completed', Duration: '30' } }), res());
    await new Promise((resolve) => setImmediate(resolve)); // that write is deliberately not awaited
    assert.deepEqual(db.updated.find((u) => u.data?.providerCallId), { where: { id: 'cl_dialled' }, data: { providerCallId: CALL_UUID } });
  });
});

describe('a call refused for an empty wallet is not charged for the refusal', () => {
  const settleTable = () => {
    let written = null;
    stub(prisma.agentCallLog, 'update', async (args) => { db.updated.push(args); return {}; });
    // settleCall reads back what the finalizer's claim just wrote.
    stub(prisma.agentCallLog, 'findUnique', async ({ where }) => ({
      id: where.id, workspaceId: 'ws_1', agentId: 'agent_1', type: 'PHONE_CALL', billingStatus: 'PENDING', durationSec: written?.durationSec ?? 0,
    }));
    stub(prisma.agentCallLog, 'updateMany', async (args) => {
      if (args.where?.endedAt === null) { written = args.data; db.claims = [...(db.claims ?? []), args]; } else db.updatedMany.push(args);
      return { count: 1 };
    });
    stub(prisma.agentCallLog, 'findFirst', async () => null);
    stub(prisma.agent, 'findFirst', async () => null);
  };

  test('a refusal closes out as 0 seconds and settles as SKIPPED, however long the gate took', async () => {
    settleTable();
    const finalize = createCallFinalizer({ workspaceId: 'ws_1', agentId: 'agent_1', label: 'test' });

    // The socket opened 2.4s ago; the wallet check alone ate that.
    await finalize('cl_1', 'FAILED', { transcript: [], startedAt: Date.now() - 2400, durationSec: 0 });

    assert.equal(db.claims[0].data.durationSec, 0);
    assert.equal(db.updatedMany.length, 1);
    assert.equal(db.updatedMany[0].data.billingStatus, 'SKIPPED');
  });

  test('without the flag the served time is still measured from the socket, as before', async () => {
    settleTable();
    const finalize = createCallFinalizer({ workspaceId: 'ws_1', agentId: 'agent_1', label: 'test' });
    await finalize('cl_2', 'COMPLETED', { transcript: [], startedAt: Date.now() - 90_000 });
    assert.equal(db.claims[0].data.durationSec, 90);
  });
});

describe('analytics labels inbound calls as inbound', () => {
  test('direction comes from the row; web calls are WEB', () => {
    assert.equal(directionOf({ type: 'PHONE_CALL', direction: 'INBOUND' }), 'INBOUND');
    assert.equal(directionOf({ type: 'PHONE_CALL', direction: 'OUTBOUND' }), 'OUTBOUND');
    assert.equal(directionOf({ type: 'PHONE_CALL', direction: null }), 'OUTBOUND', 'a row from before the column was dialled by us');
    assert.equal(directionOf({ type: 'WEB_CALL', direction: null }), 'WEB');
  });

  test('"from" is the customer on an inbound call and our number on an outbound one', () => {
    assert.deepEqual(
      partiesOf({ type: 'PHONE_CALL', direction: 'INBOUND', phoneNumber: '+919876543210', fromNumber: '+912269851741' }),
      { from: '+919876543210', to: '+912269851741' },
    );
    assert.deepEqual(
      partiesOf({ type: 'PHONE_CALL', direction: 'OUTBOUND', phoneNumber: '+919876543210', fromNumber: '+912269851741' }),
      { from: '+912269851741', to: '+919876543210' },
    );
    assert.deepEqual(partiesOf({ type: 'WEB_CALL', phoneNumber: null }), { from: null, to: null });
  });
});
