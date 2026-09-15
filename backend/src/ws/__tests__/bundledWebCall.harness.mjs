// Run by bundledWebCall.test.js, in a child process with module mocks.
//
// The bundled (xAI / ElevenLabs) web call handler: start-up failures must be
// reported and close the socket, a hangup mid-start must not leave a paid
// provider session or an open call log behind, and a finished call must get
// the same end-of-call pipeline (settlement AND post-call delivery) as a phone
// call.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mockModule } from './support/mockedHarness.js';

const here = (rel) => new URL(rel, import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const scenario = {};
const reset = () => Object.assign(scenario, {
  agentError: null,
  budgetError: null,
  connectDelayMs: 0,
  sessions: [],
  created: 0,
  finalized: [],
  settled: [],
});
reset();

const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return silentLogger; } };
mockModule(here('../../lib/logger.js'), {}, silentLogger);
mockModule(here('../../config/prisma.js'), {}, {
  agent: {
    findFirst: async () => {
      if (scenario.agentError) throw scenario.agentError;
      return { id: 'agent-1', workspaceId: 'ws-1', settings: JSON.stringify({ voiceEngine: 'xai' }), interruptibleEnabled: true };
    },
  },
  agentCallLog: {
    create: async () => { scenario.created += 1; return { id: 'log-9' }; },
    update: async () => ({}),
  },
});
mockModule(here('../../services/billing/callBudget.js'), {
  openCallBudget: async () => {
    if (scenario.budgetError) throw scenario.budgetError;
    return { allowed: true, budget: { stop() {}, expired: () => false } };
  },
});
mockModule(here('../../services/billing/settlement.service.js'), {
  settleCall: async (id) => { scenario.settled.push(id); },
});
mockModule(here('../callFinalizer.js'), {
  createCallFinalizer: () => async (callLogId, status) => { scenario.finalized.push({ callLogId, status }); },
});
mockModule(here('../../services/agentRuntime.service.js'), {
  getAgentKbText: async () => ({ kbText: '' }),
  renderWelcome: () => ({ welcome: 'Hello!' }),
});
mockModule(here('../../services/voice/realtimeEngine.factory.js'), {
  createRealtimeSession: () => {
    const s = new EventEmitter();
    s.closed = false;
    s.connect = async () => { await sleep(scenario.connectDelayMs); };
    s.close = () => { s.closed = true; };
    s.sendAudioChunk = () => {};
    scenario.sessions.push(s);
    return s;
  },
});
mockModule(here('../../services/platform/modelCatalog.js'), { isModelAllowed: async () => true });
mockModule(here('../socketHeartbeat.js'), { startHeartbeat: () => () => {} });

const { handleWebCallUpgrade } = await import('../webCallRealtime.handler.js');
const { signAccessToken } = await import('../../lib/jwt.js');

function fakeSocket() {
  const ws = new EventEmitter();
  ws.OPEN = 1;
  ws.readyState = 1;
  ws.frames = [];
  ws.closed = null;
  ws.send = (raw) => { try { ws.frames.push(JSON.parse(raw)); } catch { /* binary */ } };
  ws.close = (code, reason) => {
    if (ws.readyState === 3) return;
    ws.readyState = 3;
    ws.closed = { code, reason };
    ws.emit('close');
  };
  return ws;
}

const unhandled = [];
process.on('unhandledRejection', (err) => { unhandled.push(err); });

async function connect() {
  const ws = fakeSocket();
  await handleWebCallUpgrade(ws, { workspaceId: 'ws-1', agentId: 'agent-1' });
  const token = signAccessToken({ userId: 'u1', workspaceId: 'ws-1', role: 'Member' });
  ws.emit('message', Buffer.from(JSON.stringify({ type: 'auth', token })), false);
  return ws;
}

beforeEach(() => { reset(); unhandled.length = 0; });

describe('bundled web call', () => {
  test('a database failure loading the agent is reported and closes the call', async () => {
    scenario.agentError = new Error('Timed out fetching a new connection from the connection pool');
    const ws = await connect();
    await sleep(50);
    assert.ok(ws.closed, 'the socket must be closed, not left hanging');
    assert.equal(ws.closed.code, 4503);
    assert.equal(ws.frames.find((f) => f.type === 'error')?.code, 'BACKEND_UNAVAILABLE');
    assert.equal(unhandled.length, 0, 'no unhandled rejection');
  });

  test('a failure reading the wallet is reported as unavailable, not as no balance', async () => {
    scenario.budgetError = new Error('connection reset');
    const ws = await connect();
    await sleep(50);
    assert.ok(ws.closed);
    assert.equal(ws.closed.code, 4503);
    assert.equal(ws.frames.find((f) => f.type === 'error')?.code, 'BACKEND_UNAVAILABLE');
    assert.equal(unhandled.length, 0);
  });

  test('a finished call runs the shared end-of-call pipeline, post-call delivery included', async () => {
    const ws = await connect();
    await sleep(50);
    assert.ok(ws.frames.some((f) => f.type === 'ready'), 'the call started');
    ws.close(1000, 'bye');
    await sleep(20);
    assert.deepEqual(scenario.finalized.filter((f) => f.callLogId), [{ callLogId: 'log-9', status: 'COMPLETED' }]);
  });

  test('hanging up while the provider session connects leaves no session and no open call log', async () => {
    scenario.connectDelayMs = 100;
    const ws = await connect();
    await sleep(30);
    ws.close(1000, 'caller hung up');
    await sleep(200);
    assert.equal(scenario.sessions.length, 1);
    assert.equal(scenario.sessions[0].closed, true, 'the provider session is closed');
    assert.equal(scenario.created, 0, 'no IN_PROGRESS call log is created for a call that already ended');
  });
});
