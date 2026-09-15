// Run by modularBridgeLifecycle.test.js, in a child process with module mocks.
//
// The modular phone bridge's start-up and greeting, driven through the REAL
// bridge with its database, providers and Deepgram replaced. Phone calls cannot
// be placed from a development machine, so this is the only place the order of
// events on answer is checked at all.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mockModule } from './support/mockedHarness.js';

const here = (rel) => new URL(rel, import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FRAME = 160;

const scenario = {
  loadDelayMs: 0,
  greetingFrames: 20,
  deepgram: [],
  budgets: [],
  finalized: [],
};

class FakeDeepgram {
  constructor(opts) {
    this.opts = opts;
    this.closed = false;
    this.beginTurnAt = [];
    this.sent = 0;
    scenario.deepgram.push(this);
  }
  connect() {}
  beginTurn() { this.beginTurnAt.push(performance.now()); return this.beginTurnAt.length; }
  get isAlive() { return !this.closed; }
  get isConnected() { return !this.closed; }
  async finalizeTurn() { return ''; }
  takeTranscript() { return ''; }
  hasTranscript() { return false; }
  turnTextSoFar() { return ''; }
  send() { this.sent += 1; }
  close() { this.closed = true; }
  get lastTurnTimeline() { return null; }
  get lastEndpointMs() { return null; }
}

const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return silentLogger; } };
mockModule(here('../../lib/logger.js'), {}, silentLogger);
mockModule(here('../../config/prisma.js'), {}, {
  // updateMany: the bridge's IN_PROGRESS write is conditional on INITIATED.
  agentCallLog: { update: async () => ({}), updateMany: async () => ({ count: 1 }), findUnique: async () => null },
  callTransfer: { create: async () => ({ id: 't1' }), update: async () => ({}) },
});
mockModule(here('../../services/agentRuntime.service.js'), {
  voiceTurnStream: async (...args) => { args[5]?.onEvent?.({ type: 'done', reply: null }); },
  getRenderedWelcome: async () => ({ welcome: 'Hello, thanks for picking up.' }),
  warmVoiceTurn: () => {},
  loadAgent: async () => {
    await sleep(scenario.loadDelayMs);
    return {
      id: 'agent-1', workspaceId: 'ws-1', voice: 'ElevenLabs - Test', languages: '["English"]',
      settings: '{}', maxDuration: 0, interruptibleEnabled: true,
    };
  },
  converseStream: async function* converseStream() {},
  neutralGreeting: () => 'Hello.',
});
mockModule(here('../../services/billing/callBudget.js'), {
  openCallBudget: async () => {
    const budget = { stopped: false, stop() { this.stopped = true; }, expired: () => false };
    scenario.budgets.push(budget);
    return { allowed: true, budget };
  },
});
mockModule(here('../../services/voice.service.js'), {
  resolveAgentVoice: async () => ({ id: 'voice-1', name: 'Test', provider: { name: 'ElevenLabs' } }),
  streamSynthesizeVoice: async () => { throw new Error('the cached greeting should be used'); },
});
mockModule(here('../../services/voice/telephonyVoice.js'), {
  telephonyFormatForVoice: () => ({ kind: 'native', format: 'ulaw_8000' }),
  synthesisProviderForVoice: () => 'ElevenLabs',
});
mockModule(here('../../services/voice/greetingAudio.js'), {
  // A cached greeting: the case that is pushed into the pacer in one burst.
  getGreetingAudio: () => ({ buf: Buffer.alloc(scenario.greetingFrames * FRAME, 0x7f), contentType: 'audio/basic', audioFormat: 'ulaw_8000' }),
  rememberGreetingAudio: () => {},
  greetingSynthesisOpts: () => ({ pace: 1.05, audioFormat: 'ulaw_8000', sampleRate: null, ambienceTag: null }),
});
mockModule(here('../../services/stt/deepgramStream.service.js'), {
  DeepgramStreamSession: FakeDeepgram,
  isDeepgramConfigured: () => true,
  toDeepgramLanguage: () => 'en',
});
mockModule(here('../../services/telephony/transfer.service.js'), {
  transferAvailability: () => ({ available: false, reason: 'off', config: { condition: '', targetLabel: 'a team member', number: null, mode: 'announce' } }),
  transferLiveCall: async () => ({ ok: false }),
  registerPendingTransfer: () => {},
  failureLineFor: () => 'Sorry.',
});
mockModule(here('../../services/plivo/subaccount.service.js'), { subaccountCredentials: async () => null });
mockModule(here('../callRecordingTap.js'), {
  createRecordingTap: () => ({ active: false, inbound() {}, outbound() {}, barge() {}, save() {} }),
});
mockModule(here('../callFinalizer.js'), {
  createCallFinalizer: () => async (callLogId, status, opts = {}) => {
    scenario.finalized.push({ callLogId, status, transcript: structuredClone(opts.transcript ?? null) });
  },
});
mockModule(here('../../lib/latencyLog.js'), { logTurnLatency: () => {} });

const { runModularMediaBridge } = await import('../modularMediaBridge.js');

/** A carrier that paces its outbound leg, like Plivo. */
function pacedCarrier(sent) {
  return {
    id: 'PLIVO',
    label: 'test carrier',
    pacedOutbound: true,
    readStart: () => ({ streamId: 'stream-1', callLogId: null }),
    sendAudio: (_ws, _streamId, frame) => { sent.push({ at: performance.now(), frame }); },
    clearAudio: () => {},
  };
}

function fakeSocket() {
  const ws = new EventEmitter();
  ws.OPEN = 1;
  ws.readyState = 1;
  ws.send = () => {};
  ws.close = () => {
    if (ws.readyState === 3) return;
    ws.readyState = 3;
    ws.emit('close');
  };
  return ws;
}

const message = (obj) => Buffer.from(JSON.stringify(obj));
const media = () => message({ event: 'media', media: { payload: Buffer.alloc(FRAME, 0xff).toString('base64') } });

function startCall(extra = {}) {
  const sent = [];
  const ws = fakeSocket();
  runModularMediaBridge(ws, { workspaceId: 'ws-1', agentId: 'agent-1', callLogId: 'log-1', carrier: pacedCarrier(sent), ...extra });
  return { ws, sent };
}

beforeEach(() => {
  scenario.loadDelayMs = 0;
  scenario.greetingFrames = 20;
  scenario.deepgram = [];
  scenario.budgets = [];
  scenario.finalized = [];
});

describe('modular bridge start-up', () => {
  // V1. A cached greeting goes into the pacer's queue in one synchronous burst;
  // nothing has reached the wire when speakLine() returns. Listening used to be
  // re-armed right then, over the top of the greeting that was about to play.
  test('does not start listening until a paced greeting has actually played', async () => {
    scenario.greetingFrames = 20; // 400ms
    const { ws, sent } = startCall();
    ws.emit('message', message({ event: 'start' }));

    await sleep(900);
    const [dg] = scenario.deepgram;
    assert.ok(dg, 'a Deepgram session was opened');
    assert.ok(sent.length >= scenario.greetingFrames - 1, `the greeting played (${sent.length} frames)`);
    assert.ok(dg.beginTurnAt.length >= 2, 'listening was re-armed after the greeting');

    const lastGreetingFrameAt = sent[sent.length - 1].at;
    const rearmedAt = dg.beginTurnAt[1];
    assert.ok(rearmedAt >= lastGreetingFrameAt,
      `listening re-armed ${Math.round(lastGreetingFrameAt - rearmedAt)}ms before the greeting finished playing`);
    ws.close();
  });

  // V2. Media arrives while `start` is still loading the agent.
  test('opens exactly one Deepgram session, even with media arriving during start-up', async () => {
    scenario.loadDelayMs = 150;
    const { ws } = startCall();
    ws.emit('message', message({ event: 'start' }));
    for (let i = 0; i < 10; i++) { ws.emit('message', media()); await sleep(10); }

    await sleep(300);
    assert.equal(scenario.deepgram.length, 1, `opened ${scenario.deepgram.length} sessions`);
    assert.equal(scenario.deepgram.filter((d) => !d.closed).length, 1);
    ws.close();
    assert.equal(scenario.deepgram.filter((d) => !d.closed).length, 0, 'hangup closes it');
  });

  test('a caller who hangs up during start-up leaves nothing running', async () => {
    scenario.loadDelayMs = 150;
    const { ws, sent } = startCall();
    ws.emit('message', message({ event: 'start' }));
    await sleep(20);
    ws.close(); // hung up while the agent was loading

    await sleep(400);
    assert.equal(scenario.deepgram.length, 0, 'no Deepgram session for a call that is over');
    assert.equal(sent.length, 0, 'no greeting sent to a closed call');
    assert.ok(scenario.budgets.every((b) => b.stopped), 'the wallet budget timer is stopped');
  });

  // speakLine() records the line it speaks. The resume-after-a-failed-handover
  // path also pushed it first, so the call log carried every apology twice.
  test('a call resumed after a failed handover records its apology once', async () => {
    const { ws } = startCall({ transferOutcome: 'no-answer' });
    ws.emit('message', message({ event: 'start' }));
    await sleep(700);
    ws.close();
    await sleep(50);

    const [final] = scenario.finalized;
    assert.ok(final?.transcript, 'the call was finalised with its transcript');
    const apologies = final.transcript.filter((m) => m.role === 'assistant' && m.content === 'Sorry.');
    assert.equal(apologies.length, 1, JSON.stringify(final.transcript));
  });
});
