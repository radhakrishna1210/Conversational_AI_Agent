// Run by modularBridgeHold.test.js, in a child process with module mocks.
//
// A timed hold on a real phone bridge: "line par rahiye" … silence … the answer.
// Drives the actual runModularMediaBridge with a fake carrier, a fake Deepgram
// session and a runtime that emits a reply with a pause in it, so what is
// checked is what a carrier would receive and what the call would do around it:
// the silence frames and their place on the wire, listening and the no-input
// prompt staying off for the whole hold, and a caller's "hello?" during the
// hold not cutting the answer they are waiting for.
//
// Timing is real (the pacer is a 20ms wall clock), a few seconds per test.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mockModule } from './support/mockedHarness.js';

// Read by the bridge at import time / when the prompt is armed.
process.env.PHONE_BARGE_GRACE_MS = '40';
process.env.NO_INPUT_PROMPT_MS = '300';

const here = (rel) => new URL(rel, import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FRAME = 160;

const { encodeUlaw } = await import('../../services/voice/ambience.js');
const tone = (freq, ms, amp) => {
  const pcm = new Int16Array(Math.round((8000 * ms) / 1000));
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(amp * Math.sin((2 * Math.PI * freq * i) / 8000));
  return encodeUlaw(pcm);
};
const frames = (buf) => Array.from({ length: Math.floor(buf.length / FRAME) }, (_, i) => buf.subarray(i * FRAME, (i + 1) * FRAME));
const isSilence = (f) => f.length === FRAME && f.every((b) => b === 0xff);

const GREETING = tone(500, 200, 6000);
const QUIET = tone(300, 20, 30);
const LOUD = tone(1200, 20, 9000);

const scenario = {
  settings: { holdPauseSec: 1 },
  preMs: 400,
  holdMs: 1000,
  postMs: 400,
  turns: [],
  lines: [],
  logs: [],
  recorded: [],
};

let dg = null;
class FakeDeepgram {
  constructor(opts) {
    Object.assign(this, { opts, text: '', beginTurnAt: [], isAlive: true, isConnected: true, lastEndpointMs: null, lastTurnTimeline: null });
    dg = this;
  }
  connect() {}
  beginTurn() { this.beginTurnAt.push(performance.now()); return this.beginTurnAt.length; }
  send() {}
  turnTextSoFar() { return this.text; }
  takeTranscript() { const t = this.text; this.text = ''; return t; }
  hasTranscript() { return Boolean(this.text); }
  async finalizeTurn() { return this.takeTranscript(); }
  close() { this.isAlive = false; }
}

const log = (lvl) => (a, b) => scenario.logs.push(`${lvl} ${typeof a === 'string' ? a : `${b} ${JSON.stringify(a)}`}`);
const logger = { info: log('info'), warn: log('warn'), error: log('error'), debug() {}, fatal() {}, child() { return logger; } };
mockModule(here('../../lib/logger.js'), {}, logger);
mockModule(here('../../config/prisma.js'), {}, {
  agentCallLog: { update: async () => ({}), updateMany: async () => ({ count: 1 }), findUnique: async () => null },
  callTransfer: { create: async () => ({ id: 't1' }), update: async () => ({}) },
});

/** The reply for one turn: words, a hold, the answer. What voiceTurnStream emits. */
const PRE = () => tone(440, scenario.preMs, 6000);
const POST = () => tone(880, scenario.postMs, 6000);
mockModule(here('../../services/agentRuntime.service.js'), {
  loadAgent: async () => ({
    id: 'agent-1', workspaceId: 'ws-1', voice: 'Sarvam - Test', languages: '["English"]',
    settings: JSON.stringify(scenario.settings), maxDuration: 0, interruptibleEnabled: true,
  }),
  getRenderedWelcome: async () => ({ welcome: 'Hello.' }),
  warmVoiceTurn: () => {},
  converseStream: async function* none() {},
  neutralGreeting: () => 'Hello.',
  voiceTurnStream: async (_w, _a, _audio, _mime, history, opts) => {
    const turn = { userText: opts.userText, history: structuredClone(history), sentBefore: scenario.sentCount() };
    scenario.turns.push(turn);
    const segment = (buf) => {
      opts.onEvent({ type: 'audio-start', contentType: 'audio/basic', format: 'ulaw_8000' });
      opts.onEvent({ type: 'audio-chunk', chunk: buf });
      opts.onEvent({ type: 'audio-end' });
    };
    if (scenario.turns.length === 1) {
      segment(PRE());
      opts.onEvent({ type: 'pause', ms: scenario.holdMs });
      segment(POST());
      opts.onEvent({ type: 'done', reply: 'Line par rahiye. Ji, manager se baat ho gayi.' });
    } else {
      opts.onEvent({ type: 'done', reply: 'Ji?' });
    }
  },
});
mockModule(here('../../services/billing/callBudget.js'), { openCallBudget: async () => ({ allowed: true, budget: { stop() {}, expired: () => false } }) });
mockModule(here('../../services/plivo/subaccount.service.js'), { subaccountCredentials: async () => null });
mockModule(here('../../services/stt/deepgramStream.service.js'), {
  DeepgramStreamSession: FakeDeepgram, isDeepgramConfigured: () => true, toDeepgramLanguage: () => 'en',
});
mockModule(here('../../services/telephony/transfer.service.js'), {
  transferAvailability: () => ({ available: false, reason: 'off', config: { condition: '', targetLabel: 'a team member', number: null, mode: 'announce' } }),
  transferLiveCall: async () => ({ ok: false }),
  registerPendingTransfer: () => {},
  failureLineFor: () => 'Sorry.',
});
mockModule(here('../../services/voice.service.js'), {
  resolveAgentVoice: async () => ({ id: 'voice-1', name: 'Test', provider: { name: 'Sarvam' } }),
  streamSynthesizeVoice: async () => { throw new Error('every line is cached in this harness'); },
});
mockModule(here('../../services/voice/telephonyVoice.js'), {
  telephonyFormatForVoice: () => ({ kind: 'native', format: 'ulaw_8000' }),
  synthesisProviderForVoice: () => 'Sarvam',
});
mockModule(here('../../services/voice/greetingAudio.js'), {
  // The greeting and the no-input prompt are both spoken through here.
  getGreetingAudio: (_voice, text) => { scenario.lines.push({ text, at: performance.now() }); return { buf: GREETING, contentType: 'audio/basic' }; },
  rememberGreetingAudio: () => {},
  greetingSynthesisOpts: () => ({ pace: 1, audioFormat: 'ulaw_8000', sampleRate: null, ambienceTag: null }),
});
mockModule(here('../callRecordingTap.js'), {
  createRecordingTap: () => ({ active: true, inbound() {}, outbound(f) { scenario.recorded.push(f); }, barge() {}, save() {} }),
});
mockModule(here('../callFinalizer.js'), { createCallFinalizer: () => async () => {} });
mockModule(here('../../lib/latencyLog.js'), { logTurnLatency: () => {} });

const { runModularMediaBridge } = await import('../modularMediaBridge.js');

/** One call. `paced` is a Plivo-like carrier (our pacer holds the queue); else Twilio-like. */
function makeCall({ paced }) {
  const ws = new EventEmitter();
  Object.assign(ws, { OPEN: 1, readyState: 1, send() {}, close: () => { if (ws.readyState === 3) return; ws.readyState = 3; ws.emit('close'); } });
  const sent = [];
  const carrier = {
    id: paced ? 'PLIVO' : 'TWILIO', label: 'HoldCarrier', pacedOutbound: paced, clears: 0,
    readStart: () => ({ streamId: 'S1', callLogId: null }),
    sendAudio: (_ws, _id, frame) => { sent.push({ frame: Buffer.from(frame), at: performance.now() }); },
    clearAudio: () => { carrier.clears += 1; },
  };
  scenario.sentCount = () => sent.length;
  runModularMediaBridge(ws, { workspaceId: 'ws-1', agentId: 'agent-1', carrier, direction: 'OUTBOUND' });
  const media = (buf) => ws.emit('message', Buffer.from(JSON.stringify({ event: 'media', media: { payload: buf.toString('base64') } })));
  /** `n` inbound frames at about real time. */
  const inbound = async (buf, n) => {
    for (let i = 0; i < n; i++) {
      media(buf);
      if (i % 5 === 4) await sleep(100);
    }
  };
  return {
    carrier,
    sent,
    async open() {
      ws.emit('message', Buffer.from(JSON.stringify({ event: 'start', start: {} })));
      for (let i = 0; i < 40; i++) media(QUIET); // the line, measured while the bridge sets up
      for (let i = 0; i < 100 && !(dg && dg.beginTurnAt.length >= 2); i++) await sleep(20);
      assert.ok(dg?.beginTurnAt.length >= 2, 'listening was armed after the greeting');
      await inbound(QUIET, 30); // a quiet line while listening: the barge floor is learned
    },
    /** The caller asks something; the turn runs off Deepgram's end of turn. */
    ask(text) { dg.text = text; dg.opts.onEndOfTurn('speech_final'); },
    /** Resolve once the carrier has received `n` frames in total. */
    async untilSent(n, maxMs = 8000) {
      const deadline = Date.now() + maxMs;
      while (sent.length < n && Date.now() < deadline) await sleep(10);
      assert.ok(sent.length >= n, `only ${sent.length}/${n} frames reached the carrier`);
    },
    quiet: (n) => inbound(QUIET, n),
    loud: (n) => inbound(LOUD, n),
    end: () => ws.close(),
  };
}

const bridgeLog = () => scenario.logs.filter((l) => l.includes('HoldCarrier')).join('\n');

beforeEach(() => {
  scenario.settings = { holdPauseSec: 1 };
  scenario.preMs = 400;
  scenario.holdMs = 1000;
  scenario.postMs = 400;
  scenario.turns = [];
  scenario.lines = [];
  scenario.logs = [];
  scenario.recorded = [];
  dg = null;
});

/** The turn's frames on the wire must be exactly: the words, the silence, the answer. */
function assertWire(call, turn) {
  const wire = call.sent.slice(turn.sentBefore).map((s) => s.frame);
  const expected = [...frames(PRE()), ...Array.from({ length: scenario.holdMs / 20 }, () => Buffer.alloc(FRAME, 0xff)), ...frames(POST())];
  assert.equal(wire.length, expected.length, `sent ${wire.length} frames, expected ${expected.length}`);
  const firstMismatch = wire.findIndex((f, i) => !f.equals(expected[i]));
  assert.equal(firstMismatch, -1, `frame ${firstMismatch} is not where it belongs`);
}

describe('a timed hold on the phone bridge', () => {
  for (const paced of [true, false]) {
    test(`${paced ? 'paced (Plivo)' : 'unpaced (Twilio)'}: the hold is ms/20 frames of mu-law silence, between the words and the answer, and recorded`, async () => {
      const call = makeCall({ paced });
      try {
        await call.open();
        const recordedBefore = scenario.recorded.length;
        call.ask('can I get a better price');
        const perTurn = (scenario.preMs + scenario.holdMs + scenario.postMs) / 20;
        for (let i = 0; i < 50 && !scenario.turns.length; i++) await sleep(10);
        const [turn] = scenario.turns;
        assert.ok(turn, bridgeLog());
        await call.untilSent(turn.sentBefore + perTurn);
        assertWire(call, turn);
        const recordedSilence = scenario.recorded.slice(recordedBefore).filter(isSilence).length;
        assert.equal(recordedSilence, scenario.holdMs / 20, 'the recording has the hold where the caller heard it');
      } finally {
        call.end();
        await sleep(50);
      }
    });
  }

  test('listening is not re-armed, and the no-input prompt does not fire, until the answer has played', async () => {
    scenario.settings = { holdPauseSec: 2 };
    scenario.holdMs = 1500; // five times the 300ms no-input window
    const call = makeCall({ paced: true });
    try {
      await call.open();
      const armsBefore = dg.beginTurnAt.length;
      const linesBefore = scenario.lines.length;
      call.ask('can I get a better price');
      for (let i = 0; i < 50 && !scenario.turns.length; i++) await sleep(10);
      const [turn] = scenario.turns;
      const perTurn = (scenario.preMs + scenario.holdMs + scenario.postMs) / 20;
      await call.untilSent(turn.sentBefore + perTurn, 10_000);
      const lastFrameAt = call.sent.at(-1).at;

      const armsDuringReply = dg.beginTurnAt.slice(armsBefore).filter((t) => t < lastFrameAt);
      assert.deepEqual(armsDuringReply, [], 'listening was re-armed while the hold or the answer was still playing');
      assert.equal(scenario.lines.length, linesBefore, 'a no-input prompt was spoken during the reply');

      // And both do happen once the answer is over — so the silence above is the
      // hold's doing, not a harness that never arms them.
      await sleep(900);
      assert.ok(dg.beginTurnAt.length > armsBefore, 'listening resumed after the answer');
      assert.ok(scenario.lines.length > linesBefore, `the no-input prompt fires after the answer\n${bridgeLog()}`);
    } finally {
      call.end();
      await sleep(50);
    }
  });

  test('a caller talking during the hold does not cut the answer, and is heard as over-talk', async () => {
    scenario.holdMs = 1000;
    scenario.settings = { holdPauseSec: 2 };
    const call = makeCall({ paced: true });
    try {
      await call.open();
      call.ask('can I get a better price');
      for (let i = 0; i < 50 && !scenario.turns.length; i++) await sleep(10);
      const [turn] = scenario.turns;
      // Into the hold: the words have played and silence is on the wire.
      await call.untilSent(turn.sentBefore + scenario.preMs / 20 + 5);
      dg.text = 'hello? are you there';
      await call.loud(25); // 500ms of a caller talking over the silence
      assert.equal(call.carrier.clears, 0, `the hold was cut\n${bridgeLog()}`);
      assert.ok(scenario.logs.some((l) => l.includes('barge held — the caller spoke during a timed hold')), bridgeLog());

      await call.quiet(10);
      const perTurn = (scenario.preMs + scenario.holdMs + scenario.postMs) / 20;
      await call.untilSent(turn.sentBefore + perTurn);
      assertWire(call, turn);

      // What they said is answered once the reply is over, like any over-talk.
      for (let i = 0; i < 150 && scenario.turns.length < 2; i++) await sleep(20);
      assert.equal(scenario.turns.length, 2, bridgeLog());
      assert.match(scenario.turns[1].userText, /hello/);
    } finally {
      call.end();
      await sleep(50);
    }
  });

  test('a caller who cuts in over the words before the hold still barges, and the hold goes with them', async () => {
    scenario.preMs = 1000;
    const call = makeCall({ paced: true });
    try {
      await call.open();
      call.ask('can I get a better price');
      for (let i = 0; i < 50 && !scenario.turns.length; i++) await sleep(10);
      const [turn] = scenario.turns;
      await call.untilSent(turn.sentBefore + 10);
      await call.loud(15);
      assert.equal(call.carrier.clears, 1, `the reply was not cut\n${bridgeLog()}`);
      await sleep(1500);
      const wire = call.sent.slice(turn.sentBefore).map((s) => s.frame);
      assert.equal(wire.filter(isSilence).length, 0, 'the dropped hold still played');
      assert.ok(wire.length < scenario.preMs / 20, 'the words after the barge still played');
    } finally {
      call.end();
      await sleep(50);
    }
  });
});
