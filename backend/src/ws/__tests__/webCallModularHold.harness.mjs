// Run by webCallModularHold.test.js, in a child process with module mocks.
//
// A timed hold on the browser transport: the runtime's pause event must reach
// the page as { type: 'pause', ms, turnId }, exactly between the two audio
// segments it separates — the page plays segments from a queue in arrival
// order, so a pause relayed anywhere else would silence the wrong place. And a
// reply the caller has cut off must not deliver its pause after the barge.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from './support/mockedHarness.js';

const here = (rel) => new URL(rel, import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const scenario = {
  /** Runs inside the mocked voiceTurnStream; each test scripts its reply. */
  reply: async () => {},
};

const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return silentLogger; } };
mockModule(here('../../lib/logger.js'), {}, silentLogger);
mockModule(here('../../lib/jwt.js'), { verifyAccessToken: () => ({ workspaceId: 'ws-1', userId: 'u-1' }) });
mockModule(here('../../config/prisma.js'), {}, {
  agent: {
    findFirst: async () => ({ id: 'agent-1', workspaceId: 'ws-1', languages: '["English"]', settings: JSON.stringify({ holdPauseSec: 5 }) }),
  },
  callTransfer: { create: async () => ({}) },
});
mockModule(here('../../services/agentRuntime.service.js'), {
  voiceTurnStream: async (_w, _a, _audio, _mime, _history, opts) => scenario.reply(opts),
  warmVoiceTurn: () => {},
  converseStream: async function* none() {},
});
mockModule(here('../../services/stt/deepgramStream.service.js'), {
  DeepgramStreamSession: class { constructor() { throw new Error('not in this harness'); } },
  isDeepgramConfigured: () => false,
  toDeepgramLanguage: () => 'en',
});
// Every turn here is real speech: the acoustic gates are not what is under test.
mockModule(here('../../services/stt/speechGate.js'), {
  analyzeSpeech: () => ({ hasSpeech: true, voicedMs: 600, contrast: 1, peakRms: 0.5 }),
  classifyCallerAffect: () => null,
  isEchoOfAgent: () => false,
});
mockModule(here('../../services/billing/callBudget.js'), {
  openCallBudget: async () => ({ allowed: true, budget: { stop() {}, expired: () => false } }),
});
mockModule(here('../callFinalizer.js'), { finalizeAbandonedCall: async () => {} });
mockModule(here('../socketHeartbeat.js'), { startHeartbeat: () => () => {} });
mockModule(here('../../lib/latencyLog.js'), { logTurnLatency: () => {} });

const { handleWebCallModularUpgrade } = await import('../webCallModularRealtime.handler.js');

function fakeSocket() {
  const handlers = {};
  return {
    OPEN: 1,
    readyState: 1,
    frames: [],
    on(event, fn) { handlers[event] = fn; },
    emit(event, ...args) { return handlers[event]?.(...args); },
    send(raw, opts) {
      if (opts?.binary) this.frames.push({ type: 'binary', data: String(raw) });
      else this.frames.push(JSON.parse(raw));
    },
    close() { this.readyState = 3; },
    ping() {},
    terminate() { this.readyState = 3; },
  };
}

const json = (obj) => Buffer.from(JSON.stringify(obj));

/** Authenticate, then speak one turn and let the server run it. */
async function callWithOneTurn(ws) {
  await handleWebCallModularUpgrade(ws, { workspaceId: 'ws-1', agentId: 'agent-1' });
  await ws.emit('message', json({ type: 'auth', token: 't' }), false);
  assert.ok(ws.frames.some((f) => f.type === 'ready'), JSON.stringify(ws.frames));
  const history = [{ role: 'assistant', content: 'Namaste!' }];
  await ws.emit('message', json({ type: 'start-turn', sampleRate: 16000, history }), false);
  await ws.emit('message', Buffer.alloc(16000), true); // 500ms of caller PCM16
  return ws.emit('message', json({ type: 'end-turn', history }), false);
}

const segment = (opts, text) => {
  opts.onEvent({ type: 'audio-start', contentType: 'audio/mpeg' });
  opts.onEvent({ type: 'audio-chunk', chunk: Buffer.from(text) });
  opts.onEvent({ type: 'audio-end' });
};

/** The frames after `ready`, reduced to what the page's playback queue acts on. */
const playback = (ws) => ws.frames
  .filter((f) => ['audio-start', 'binary', 'audio-end', 'pause', 'done'].includes(f.type))
  .map((f) => (f.type === 'binary' ? `binary:${f.data}` : f.type === 'pause' ? `pause:${f.ms}` : f.type));

describe('timed hold on the modular web call', () => {
  test('the pause frame is relayed between the two segments, with the turn it belongs to', async () => {
    scenario.reply = async (opts) => {
      segment(opts, 'line par rahiye');
      opts.onEvent({ type: 'pause', ms: 5000 });
      segment(opts, 'manager se baat ho gayi');
      opts.onEvent({ type: 'done', reply: 'Line par rahiye. Ji, manager se baat ho gayi.' });
    };
    const ws = fakeSocket();
    await callWithOneTurn(ws);

    assert.deepEqual(playback(ws), [
      'audio-start', 'binary:line par rahiye', 'audio-end',
      'pause:5000',
      'audio-start', 'binary:manager se baat ho gayi', 'audio-end',
      'done',
    ]);
    const pause = ws.frames.find((f) => f.type === 'pause');
    const start = ws.frames.find((f) => f.type === 'audio-start');
    assert.ok(pause.turnId, 'the pause carries its turn');
    assert.equal(pause.turnId, start.turnId);
  });

  test('a reply the caller barged into does not deliver its pause afterwards', async () => {
    let barge;
    const barged = new Promise((r) => { barge = r; });
    scenario.reply = async (opts) => {
      segment(opts, 'line par rahiye');
      await barged;
      opts.onEvent({ type: 'pause', ms: 5000 });
      segment(opts, 'manager se baat ho gayi');
      opts.onEvent({ type: 'done', reply: null });
    };
    const ws = fakeSocket();
    const turn = callWithOneTurn(ws);
    await sleep(20);
    await ws.emit('message', json({ type: 'barge' }), false);
    barge();
    await turn;

    assert.deepEqual(playback(ws), ['audio-start', 'binary:line par rahiye', 'audio-end', 'done']);
  });
});
