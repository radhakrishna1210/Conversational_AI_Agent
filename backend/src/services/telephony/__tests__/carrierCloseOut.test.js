// backend/src/services/telephony/__tests__/carrierCloseOut.test.js
//
// What these pin — the end of a phone call when more than one path can reach it:
//
//   - exactly one path finalizes a call, whichever order the media bridge and the
//     carrier's end-of-call callback land in (it used to be both: the Sheets
//     row, webhook and email went out twice);
//   - a carrier callback never writes the transcript (Plivo's wiped the greeting
//     a greeting-only call had stored at dial time);
//   - Twilio agent calls ask for, and act on, a signed completed-call callback
//     (they had none, so unanswered and greeting-only calls never closed);
//   - a caller ID another workspace holds, or one that was released, is refused;
//   - a live transfer is redirected by the account that holds OUR number.
//
// Drives the real modules with the shared Prisma client's delegates swapped out,
// the same approach as plivo/__tests__/inboundCallLog.test.js.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.TWILIO_ACCOUNT_SID = 'AC_test';
process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
process.env.TWILIO_FROM_NUMBER = '+15550001111';
process.env.PUBLIC_BACKEND_URL = 'https://voice.example.test';
delete process.env.PUBLIC_BACKEND_WS_URL; // greeting-only calls: no media socket

const { default: prisma } = await import('../../../config/prisma.js');
const { createCallFinalizer } = await import('../../../ws/callFinalizer.js');
const {
  closeOutCarrierCall, closeOutTiming, bridgeMayStillClose,
  signCallStatusToken, verifyCallStatusToken, twilioCallStatusUrl,
} = await import('../carrierCloseOut.js');
const { callStatus: twilioCallStatus } = await import('../../../controllers/twilioCall.controller.js');
const { callStatus: transferCallStatus } = await import('../../../controllers/transfer.controller.js');
const { tokenOk: piopiyTokenOk } = await import('../../../controllers/piopiy.controller.js');
const { signTransferToken } = await import('../transfer.service.js');
const { transferCredentialsFor } = await import('../transferCredentials.js');
const { callerIdRefusal, placeOutboundCall } = await import('../../outboundCall.service.js');

const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

const res = () => {
  const r = { statusCode: 200, body: undefined };
  r.status = (code) => { r.statusCode = code; return r; };
  r.type = () => r;
  r.send = (b) => { r.body = b; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

/**
 * An AgentCallLog table with a real endedAt claim: the first conditional write
 * wins, every later one matches nothing — which is the database behaviour the
 * finalizer relies on.
 */
const callLogTable = (initial) => {
  const row = { id: 'cl_1', workspaceId: 'ws_1', agentId: 'agent_1', endedAt: null, transcript: '[]', ...initial };
  const t = { row, claims: [], transcriptWrites: [], settles: 0 };
  stub(prisma.agentCallLog, 'findUnique', async ({ select }) => {
    if (select) return { ...row };
    t.settles += 1;
    return { id: row.id, billingStatus: 'BILLED' }; // settleCall stops here: reached, not charged
  });
  stub(prisma.agentCallLog, 'updateMany', async ({ where, data }) => {
    if (where.endedAt === null) {
      if (row.endedAt) return { count: 0 };
      Object.assign(row, data);
      t.claims.push(data);
      return { count: 1 };
    }
    return { count: 0 };
  });
  stub(prisma.agentCallLog, 'update', async ({ data }) => {
    if ('transcript' in data) t.transcriptWrites.push(data.transcript);
    Object.assign(row, data);
    return { ...row };
  });
  stub(prisma.agentCallLog, 'findFirst', async () => null); // extraction/delivery find nothing
  stub(prisma.agent, 'findFirst', async () => null);
  return t;
};

const shortGrace = () => {
  const original = closeOutTiming.BRIDGE_GRACE_MS;
  closeOutTiming.BRIDGE_GRACE_MS = 5;
  restores.push(() => { closeOutTiming.BRIDGE_GRACE_MS = original; });
};

describe('callFinalizer — one path closes a call', () => {
  test('the bridge and the carrier callback both finishing: only the first settles and delivers', async () => {
    const t = callLogTable({ status: 'IN_PROGRESS' });
    const bridge = createCallFinalizer({ workspaceId: 'ws_1', agentId: 'agent_1', label: 'bridge' });
    const carrier = createCallFinalizer({ workspaceId: 'ws_1', agentId: 'agent_1', label: 'carrier' });

    const won = await bridge('cl_1', 'COMPLETED', { transcript: [{ role: 'user', content: 'book me in' }], startedAt: Date.now() - 60_000 });
    const lost = await carrier('cl_1', 'COMPLETED', { transcript: null, durationSec: 61 });

    assert.equal(won, true);
    assert.equal(lost, false);
    assert.equal(t.claims.length, 1);
    assert.equal(t.settles, 1, 'settled once');
    assert.match(t.row.transcript, /book me in/);
  });

  test('a carrier callback that wins first does not erase the transcript the bridge then brings', async () => {
    const t = callLogTable({ status: 'IN_PROGRESS' });
    const carrier = createCallFinalizer({ workspaceId: 'ws_1', agentId: 'agent_1', label: 'carrier' });
    const bridge = createCallFinalizer({ workspaceId: 'ws_1', agentId: 'agent_1', label: 'bridge' });

    await carrier('cl_1', 'COMPLETED', { transcript: null, durationSec: 30 });
    await bridge('cl_1', 'COMPLETED', { transcript: [{ role: 'user', content: 'yes please' }], startedAt: Date.now() - 30_000 });

    assert.equal('transcript' in t.claims[0], false, 'the callback wrote no transcript');
    assert.equal(t.settles, 1);
    assert.equal(t.transcriptWrites.length, 1, 'the losing bridge still kept what was said');
    assert.match(t.row.transcript, /yes please/);
  });

  test('transcript null leaves a greeting-only call\'s stored greeting in place', async () => {
    const greeting = JSON.stringify([{ role: 'assistant', content: 'Hi, this is Asha from Sunrise Clinic.' }]);
    const t = callLogTable({ status: 'INITIATED', transcript: greeting });
    const carrier = createCallFinalizer({ workspaceId: 'ws_1', agentId: 'agent_1', label: 'carrier' });
    await carrier('cl_1', 'COMPLETED', { transcript: null, durationSec: 12 });
    assert.equal(t.row.transcript, greeting);
    assert.equal(t.row.durationSec, 12);
  });
});

describe('closeOutCarrierCall', () => {
  test('a greeting-only call closes at once — there is no bridge to wait for', async () => {
    const original = closeOutTiming.BRIDGE_GRACE_MS;
    closeOutTiming.BRIDGE_GRACE_MS = 60_000; // would hang the test if it waited
    restores.push(() => { closeOutTiming.BRIDGE_GRACE_MS = original; });
    const t = callLogTable({ status: 'INITIATED', transcript: '[{"role":"assistant","content":"Hello"}]' });

    const outcome = await closeOutCarrierCall({ callLogId: 'cl_1', answered: true, durationSec: 9, label: 'test' });

    assert.equal(outcome, 'closed');
    assert.equal(t.row.status, 'COMPLETED');
    assert.equal(t.row.transcript, '[{"role":"assistant","content":"Hello"}]');
  });

  test('a dial nobody answered closes at once as FAILED', async () => {
    const t = callLogTable({ status: 'INITIATED' });
    const outcome = await closeOutCarrierCall({ callLogId: 'cl_1', answered: false, durationSec: 0, label: 'test' });
    assert.equal(outcome, 'closed');
    assert.equal(t.row.status, 'FAILED');
  });

  test('a call with a bridge attached is left to the bridge when it closes during the grace', async () => {
    const original = closeOutTiming.BRIDGE_GRACE_MS;
    closeOutTiming.BRIDGE_GRACE_MS = 30;
    restores.push(() => { closeOutTiming.BRIDGE_GRACE_MS = original; });
    const t = callLogTable({ status: 'IN_PROGRESS' });
    const bridge = createCallFinalizer({ workspaceId: 'ws_1', agentId: 'agent_1', label: 'bridge' });

    const pending = closeOutCarrierCall({ callLogId: 'cl_1', answered: true, durationSec: 40, label: 'test' });
    await bridge('cl_1', 'COMPLETED', { transcript: [{ role: 'user', content: 'thanks' }], startedAt: Date.now() - 40_000 });

    assert.equal(await pending, 'bridge-closed');
    assert.equal(t.settles, 1);
  });

  test('a bridge that never closes the call is backstopped after the grace', async () => {
    shortGrace();
    const t = callLogTable({ status: 'IN_PROGRESS' });
    assert.equal(await closeOutCarrierCall({ callLogId: 'cl_1', answered: true, durationSec: 40, label: 'test' }), 'closed');
    assert.equal(t.row.durationSec, 40, 'billed on the carrier\'s duration');
  });

  test('an already-closed call is left alone', async () => {
    const t = callLogTable({ status: 'COMPLETED', endedAt: new Date() });
    assert.equal(await closeOutCarrierCall({ callLogId: 'cl_1', answered: true, durationSec: 5, label: 'test' }), 'already-closed');
    assert.equal(t.claims.length, 0);
  });

  test('bridgeMayStillClose only waits where a bridge can exist', () => {
    assert.equal(bridgeMayStillClose({ status: 'IN_PROGRESS' }, { answered: false }), true);
    assert.equal(bridgeMayStillClose({ status: 'INITIATED', transcript: '[]' }, { answered: true }), true);
    assert.equal(bridgeMayStillClose({ status: 'INITIATED', transcript: '[]' }, { answered: false }), false);
    assert.equal(bridgeMayStillClose({ status: 'INITIATED', transcript: '[{"role":"assistant"}]' }, { answered: true }), false);
  });
});

describe('Twilio completed-call callback', () => {
  test('its token cannot be replayed from a transfer callback, and a forged one is refused', async () => {
    assert.ok(verifyCallStatusToken('cl_1', signCallStatusToken('cl_1')));
    assert.equal(verifyCallStatusToken('cl_1', signTransferToken('cl_1')), false);
    assert.equal(verifyCallStatusToken('cl_2', signCallStatusToken('cl_1')), false);

    const t = callLogTable({ status: 'INITIATED' });
    const r = res();
    await twilioCallStatus({ query: { callLogId: 'cl_1', token: 'nope' }, body: { CallStatus: 'completed', CallDuration: '20' } }, r);
    assert.equal(r.statusCode, 403);
    assert.equal(t.claims.length, 0);
  });

  test('an unanswered call is closed out as FAILED', async () => {
    const t = callLogTable({ status: 'INITIATED' });
    const r = res();
    await twilioCallStatus({
      query: { callLogId: 'cl_1', token: signCallStatusToken('cl_1') },
      body: { CallStatus: 'no-answer', CallDuration: '0' },
    }, r);
    assert.equal(r.statusCode, 200);
    assert.equal(t.row.status, 'FAILED');
  });

  test('a non-terminal or empty status closes nothing', async () => {
    const t = callLogTable({ status: 'IN_PROGRESS' });
    for (const CallStatus of ['in-progress', 'ringing', '']) {
      await twilioCallStatus({ query: { callLogId: 'cl_1', token: signCallStatusToken('cl_1') }, body: { CallStatus } }, res());
    }
    assert.equal(t.claims.length, 0);
  });

  test('the transfer status callback no longer finalizes on an empty CallStatus', async () => {
    const t = callLogTable({ status: 'IN_PROGRESS' });
    await transferCallStatus({
      params: { carrier: 'twilio' },
      query: { callLogId: 'cl_1', t: signTransferToken('cl_1') },
      body: {},
      path: '/twilio/status',
    }, res());
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(t.claims.length, 0);
  });
});

describe('placeOutboundCall — caller ID and Twilio callback', () => {
  const agent = { id: 'agent_1', name: 'Front desk', welcomeMessage: 'Hello', settings: '{}' };

  const dialWorld = ({ numberRow = null } = {}) => {
    const w = { created: [], updates: [], requests: [] };
    stub(prisma.voiceNumber, 'findUnique', async () => numberRow);
    stub(prisma.agentCallLog, 'create', async ({ data }) => { w.created.push(data); return { id: 'cl_new', ...data }; });
    stub(prisma.agentCallLog, 'update', async (args) => { w.updates.push(args); return {}; });
    stub(prisma.agent, 'findFirst', async () => agent);
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      w.requests.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? '')) });
      return new Response(JSON.stringify({ sid: 'CA_1' }), { status: 201 });
    };
    restores.push(() => { globalThis.fetch = savedFetch; });
    return w;
  };

  test('another workspace\'s number is refused before any carrier request', async () => {
    const w = dialWorld({ numberRow: { provider: 'PLIVO', status: 'ACTIVE', subaccountId: null, workspaceId: 'ws_other' } });
    const out = await placeOutboundCall({ workspaceId: 'ws_1', agent, toNumber: '+919876543210', fromNumber: '+912269851741' });
    assert.equal(out.ok, false);
    assert.equal(out.status, 403);
    assert.equal(out.code, 'CALLER_ID_NOT_OWNED');
    assert.equal(w.requests.length, 0);
    assert.equal(w.created.length, 0);
  });

  test('a released number is refused', async () => {
    const w = dialWorld({ numberRow: { provider: 'PLIVO', status: 'RELEASED', subaccountId: null, workspaceId: 'ws_1' } });
    const out = await placeOutboundCall({ workspaceId: 'ws_1', agent, toNumber: '+919876543210', fromNumber: '+912269851741' });
    assert.equal(out.code, 'NUMBER_RELEASED');
    assert.equal(w.requests.length, 0);
  });

  test('a Twilio greeting-only call asks for the signed completed-call callback, and is not marked ended at dial', async () => {
    const w = dialWorld();
    const out = await placeOutboundCall({ workspaceId: 'ws_1', agent, toNumber: '+14155550100', fromNumber: '+15550001111' });
    assert.equal(out.ok, true, out.error);
    assert.equal(out.mode, 'greeting');

    const body = w.requests[0].body;
    assert.equal(body.get('StatusCallback'), twilioCallStatusUrl('cl_new'));
    assert.equal(body.get('StatusCallbackEvent'), 'completed');
    const cb = new URL(body.get('StatusCallback'));
    assert.equal(cb.pathname, '/api/v1/twilio/call-status');
    assert.ok(verifyCallStatusToken('cl_new', cb.searchParams.get('token')));

    const greetingWrite = w.updates.find((u) => u.data?.transcript);
    assert.ok(greetingWrite, 'the greeting is still recorded');
    assert.equal('endedAt' in greetingWrite.data, false);
  });
});

describe('callerIdRefusal', () => {
  test('an unknown number (Twilio, verified BYO) is never refused', () => {
    assert.equal(callerIdRefusal(null, '+15550001111', 'ws_1').blocked, null);
  });
  test('ownership is only checked when the caller says who is dialling', () => {
    const row = { status: 'ACTIVE', workspaceId: 'ws_other' };
    assert.equal(callerIdRefusal(row, '+91…', undefined).blocked, null);
    assert.equal(callerIdRefusal(row, '+91…', 'ws_1').blockedCode, 'CALLER_ID_NOT_OWNED');
  });
  test('suspended keeps its original code and status', () => {
    const out = callerIdRefusal({ status: 'SUSPENDED_NONPAYMENT', workspaceId: 'ws_1' }, '+91…', 'ws_1');
    assert.equal(out.blockedCode, 'NUMBER_SUSPENDED_NONPAYMENT');
    assert.equal(out.blockedStatus, 402);
  });
});

describe('transferCredentialsFor', () => {
  const sub = { authId: 'SA_ws1', authToken: 'sub-token', enabled: true };
  const deps = (rows, log = null) => ({
    findNumber: async (n) => rows[n] ?? null,
    findCallLog: async () => log,
    subaccountCredentials: async () => sub,
  });

  test('a call on a number the main account holds is redirected as the main account', async () => {
    const out = await transferCredentialsFor(
      { carrierId: 'PLIVO', workspaceId: 'ws_1', callLogId: 'cl_1' },
      deps({}, { fromNumber: '+912269851741' }),
    );
    assert.equal(out, null);
  });

  test('a call on the workspace\'s rented number uses its subaccount, even when the carrier sent bare digits', async () => {
    const out = await transferCredentialsFor(
      { carrierId: 'PLIVO', workspaceId: 'ws_1', ourNumber: '912269851741' },
      deps({ '+912269851741': { subaccountId: 'SA_ws1' } }),
    );
    assert.deepEqual(out, sub);
  });

  test('a number held by a different subaccount is not moved with this workspace\'s credentials', async () => {
    const out = await transferCredentialsFor(
      { carrierId: 'PLIVO', workspaceId: 'ws_1', ourNumber: '+912269851741' },
      deps({ '+912269851741': { subaccountId: 'SA_someone_else' } }),
    );
    assert.equal(out, null);
  });

  test('Twilio is always the main account', async () => {
    assert.equal(await transferCredentialsFor({ carrierId: 'TWILIO', workspaceId: 'ws_1' }, deps({})), null);
  });
});

describe('PIOPIY CDR token', () => {
  test('unset refuses, wrong refuses, right passes', () => {
    const saved = process.env.PIOPIY_WEBHOOK_TOKEN;
    restores.push(() => { if (saved === undefined) delete process.env.PIOPIY_WEBHOOK_TOKEN; else process.env.PIOPIY_WEBHOOK_TOKEN = saved; });

    delete process.env.PIOPIY_WEBHOOK_TOKEN;
    assert.equal(piopiyTokenOk({ query: {} }), false);

    process.env.PIOPIY_WEBHOOK_TOKEN = 'cdr-secret';
    assert.equal(piopiyTokenOk({ query: { token: 'cdr-secre' } }), false);
    assert.equal(piopiyTokenOk({ query: { token: 'cdr-secret' } }), true);
  });
});
