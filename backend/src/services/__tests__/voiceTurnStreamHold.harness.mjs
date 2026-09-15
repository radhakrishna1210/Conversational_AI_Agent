// Run by voiceTurnStreamHold.test.js, in a child process with module mocks.
//
// A timed hold inside one reply: "line par rahiye" … silence … "manager se baat
// ho gayi". Driven through the real voiceTurnStream on every generation path it
// has — socket TTS, the sentence split, the hedge, the buffered fallback and a
// speculation hit — with the database, the LLM and TTS replaced. What matters
// on each is the ORDER of events the transports play: the text before the hold,
// then the pause, then the text after it, and the marker nowhere in between.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mockModule } from '../../ws/__tests__/support/mockedHarness.js';

process.env.VOICE_LLM_FIRST_TOKEN_TIMEOUT_MS = '120';
process.env.VOICE_LLM_SPIKE_TIMEOUT_MS = '400';
process.env.VOICE_LLM_STALL_TIMEOUT_MS = '500';
process.env.VOICE_TTS_DRAIN_TIMEOUT_MS = '500';
process.env.VOICE_FILLER = 'false';
process.env.GEMINI_API_KEY = 'fake-key';

const here = (rel) => new URL(rel, import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const scenario = {
  agents: new Map(),
  llm: null,
  overlap: false,
  sockets: [],
  ttsTexts: [],
  ttsDelay: () => 0,
  latency: [],
};

mockModule(here('../../config/prisma.js'), {}, {
  agent: { findFirst: async ({ where }) => scenario.agents.get(where.id) ?? null },
  kbFile: { findMany: async () => [] },
});
mockModule(here('../llm.factory.js'), { getLLMProviderWithFallback: () => scenario.llm });
mockModule(here('../../controllers/llm.controller.js'), {
  mapAgentModel: () => ({ provider: 'gemini', model: 'gemini-3.5-flash-lite' }),
});
mockModule(here('../voice.service.js'), {
  resolveAgentVoice: async () => ({ id: 'voice-1', name: 'Test Voice', provider: { name: 'Sarvam' } }),
  // The bytes spell out the text they were synthesized from, so the event log
  // says which sentence each segment carried.
  streamSynthesizeVoice: async (_voice, text) => {
    scenario.ttsTexts.push(text);
    await sleep(scenario.ttsDelay(text));
    return { stream: Readable.from([Buffer.from(`<${text}>`)]), contentType: 'audio/mpeg' };
  },
});
mockModule(here('../voice/ttsStreamFactory.js'), {
  supportsTokenStreaming: () => scenario.overlap,
  createTokenTtsStream: () => {
    const s = new EventEmitter();
    s.pushed = [];
    s.ended = false;
    s.connect = () => {};
    s.pushText = (t) => { s.pushed.push(t); s.emit('audio', Buffer.from(`~${t}~`)); };
    s.end = () => { s.ended = true; setImmediate(() => s.emit('done')); };
    s.close = () => setImmediate(() => s.emit('done'));
    scenario.sockets.push(s);
    return s;
  },
  synthesisProviderName: () => 'FakeTTS',
  supportsSsmlBreaks: () => false,
});
mockModule(here('../groq.service.js'), { groqService: {} });
mockModule(here('../stt.service.js'), { transcribeAudio: async () => ({ text: '', provider: 'none' }) });
mockModule(here('../kbChunking.service.js'), { hasKbChunks: async () => false, retrieveKbChunks: async () => [] });
mockModule(here('../../lib/latencyLog.js'), { logTurnLatency: (r) => { scenario.latency.push(r); } });

const { voiceTurnStream, converse } = await import('../agentRuntime.service.js');

let agentSeq = 0;
function agentWith(settings = {}) {
  agentSeq += 1;
  const agent = {
    id: `agent-${agentSeq}`, workspaceId: 'ws-1', name: 'Front Desk', welcomeMessage: 'Hello!',
    aiModel: 'Gemini 3.5 Flash Lite', voice: 'Sarvam - Test Voice', transcription: 'Deepgram',
    languages: '["English"]', flowItems: '[]', maxDuration: 30, silenceTimeout: 5,
    dynamicEnabled: true, interruptibleEnabled: true, settings: JSON.stringify(settings),
  };
  scenario.agents.set(agent.id, agent);
  return agent;
}
const HOLDING = { holdPauseSec: 5 };

/**
 * An LLM whose stream is scripted. `delays[i]` is the first-token delay of the
 * i-th stream request, so a test can make the primary slow and the hedge fast.
 */
function fakeLlm({ tokens, delays = [], buffered = 'Buffered reply.' } = {}) {
  const calls = { stream: [], buffered: [] };
  return {
    calls,
    supportsChatHistory: true,
    async* generateResponseStream(message, config, options) {
      const i = calls.stream.length;
      calls.stream.push({ message, config, options });
      await sleep(delays[i] ?? 0);
      for (const t of tokens) yield t;
    },
    async generateResponse(message, config, options) {
      calls.buffered.push({ message, config, options });
      return buffered;
    },
  };
}

const PRE_1 = 'Theek hai, ek minute, main manager se check karti hoon. ';
const PRE_2 = 'Line par rahiye. ';
const POST = ' Ji, manager se baat ho gayi. Deluxe Rs 1800 per night.';
// The marker deliberately split across two tokens.
const TOKENS = [PRE_1, `${PRE_2}[[HO`, `LD]]${POST.slice(0, 20)}`, POST.slice(20)];

/** Run one turn; the events come back as a compact, ordered list. */
async function runTurn(agent, opts = {}) {
  const events = [];
  const result = await voiceTurnStream('ws-1', agent.id, null, null,
    opts.history ?? [{ role: 'assistant', content: 'Hello!' }],
    {
      userText: 'can I get a better price',
      channel: 'web',
      ...opts,
      onEvent: (e) => { events.push(e); opts.onEvent?.(e); },
    });
  const log = events.map((e) => {
    if (e.type === 'audio-chunk') return `chunk:${String(e.chunk)}`;
    if (e.type === 'pause') return `pause:${e.ms}`;
    return e.type;
  });
  return { events, log, result };
}

/** The ordered list reduced to what was spoken and where the pause sits. */
const spoken = (log) => log.filter((l) => l.startsWith('chunk:') || l.startsWith('pause:'));

const noMarker = (s, what) => assert.ok(!/HOLD|\[\[|\]\]/.test(s), `${what} leaked the marker: ${s}`);

beforeEach(() => {
  scenario.overlap = false;
  scenario.sockets = [];
  scenario.ttsTexts = [];
  scenario.ttsDelay = () => 0;
  scenario.latency = [];
  delete process.env.VOICE_SENTENCE_SPLIT;
});

describe('a timed hold inside one reply', () => {
  test('split path: text before, then the pause, then text after — even when the text before synthesizes slowest', async () => {
    // Sentence two (the one right before the hold) is the slowest to synthesize,
    // so arrival order and emission order disagree; only segmentOrder fixes it.
    scenario.ttsDelay = (text) => (text.includes('rahiye') ? 150 : 0);
    scenario.llm = fakeLlm({ tokens: TOKENS });
    const { log, events, result } = await runTurn(agentWith(HOLDING));

    assert.deepEqual(spoken(log), [
      `chunk:<${PRE_1.trim()}>`,
      `chunk:<${PRE_2.trim()}>`,
      'pause:5000',
      `chunk:<${POST.trim()}>`,
    ]);
    // The pause sits between two whole segments, never inside one.
    const p = log.indexOf('pause:5000');
    assert.equal(log[p - 1], 'audio-end');
    assert.equal(log[p + 1], 'audio-start');
    assert.equal(events.filter((e) => e.type === 'pause').length, 1);

    for (const t of scenario.ttsTexts) noMarker(t, 'TTS text');
    noMarker(result.reply, 'the reply');
    assert.equal(result.reply, `${PRE_1}${PRE_2}${POST.trim()}`.replace(/\s+/g, ' '));
    const done = events.find((e) => e.type === 'done');
    noMarker(done.reply, 'the done event');
    const [record] = scenario.latency;
    noMarker(JSON.stringify(record).replace('"holdMs"', ''), 'the latency record');
    assert.equal(record.holdMs, 5000);
    assert.equal(record.mode, 'split');
  });

  test('socket path: the socket ends at the hold, and the answer follows the pause as its own segment', async () => {
    scenario.overlap = true;
    scenario.llm = fakeLlm({ tokens: TOKENS });
    const { log, result } = await runTurn(agentWith(HOLDING));

    const [socket] = scenario.sockets;
    assert.ok(socket.ended, 'the socket was ended');
    const intoSocket = socket.pushed.join('');
    noMarker(intoSocket, 'the socket text');
    assert.ok(!intoSocket.includes('manager se baat'), 'the answer must not be spoken before the hold');

    const seq = spoken(log);
    const p = seq.indexOf('pause:5000');
    assert.ok(p > 0, `no pause in ${JSON.stringify(seq)}`);
    assert.ok(seq.slice(0, p).every((l) => l.startsWith('chunk:~')), 'socket audio first');
    assert.deepEqual(seq.slice(p + 1), [`chunk:<${POST.trim()}>`]);
    noMarker(result.reply, 'the reply');
    assert.equal(scenario.latency[0].mode, 'ws-overlap');
  });

  test('hedge: a slow primary loses to the hedge, and the hedge\'s reply keeps its order', async () => {
    scenario.llm = fakeLlm({ tokens: TOKENS, delays: [600, 0] });
    const { log } = await runTurn(agentWith(HOLDING));
    assert.equal(scenario.llm.calls.stream.length, 2, 'the hedge ran');
    assert.ok(scenario.llm.calls.stream[1].options.systemPrompt.includes('[[HOLD]]'), 'the hedge asks with the hold rule too');
    assert.deepEqual(spoken(log), [
      `chunk:<${PRE_1.trim()}>`,
      `chunk:<${PRE_2.trim()}>`,
      'pause:5000',
      `chunk:<${POST.trim()}>`,
    ]);
  });

  test('buffered fallback: the finished reply is split at the hold', async () => {
    process.env.VOICE_SENTENCE_SPLIT = 'false';
    scenario.llm = fakeLlm({ tokens: [], buffered: 'Line par rahiye. [[HOLD]] Ji, manager se baat ho gayi.' });
    const { log, result } = await runTurn(agentWith(HOLDING));
    assert.equal(scenario.llm.calls.buffered.length, 1);
    assert.ok(scenario.llm.calls.buffered[0].options.systemPrompt.includes('[[HOLD]]'));
    assert.deepEqual(spoken(log), ['chunk:<Line par rahiye.>', 'pause:5000', 'chunk:<Ji, manager se baat ho gayi.>']);
    assert.equal(result.reply, 'Line par rahiye. Ji, manager se baat ho gayi.');
  });

  test('speculation hit: the pre-started stream is spoken in the same order', async () => {
    scenario.llm = fakeLlm({ tokens: ['never used'] });
    let i = 0;
    const iterator = {
      async next() { return i < TOKENS.length ? { value: TOKENS[i++], done: false } : { value: { provider: 'spec', model: 'm', ragMs: 0 }, done: true }; },
      async return() { return { value: undefined, done: true }; },
      [Symbol.asyncIterator]() { return this; },
    };
    const speculation = {
      hit: { iterator, text: 'can I get a better price', startedAt: performance.now(), firstTokenAt: null, bufferedChars: 0, trigger: 'candidate' },
      turn: { started: 1, wasted: 0, wastedChars: 0 }, mode: 'candidate',
    };
    const { log } = await runTurn(agentWith(HOLDING), { speculation });
    assert.equal(scenario.llm.calls.stream.length, 0, 'no fresh request');
    assert.deepEqual(spoken(log), [
      `chunk:<${PRE_1.trim()}>`,
      `chunk:<${PRE_2.trim()}>`,
      'pause:5000',
      `chunk:<${POST.trim()}>`,
    ]);
  });

  test('a hold at the very end of a reply is dropped, not played as trailing silence', async () => {
    scenario.llm = fakeLlm({ tokens: ['Please stay on the line for a moment. [[HOLD]]'] });
    const { log, result } = await runTurn(agentWith(HOLDING));
    assert.ok(!log.some((l) => l.startsWith('pause:')), JSON.stringify(log));
    assert.equal(result.reply, 'Please stay on the line for a moment.');
  });

  test('an agent without a hold length strips the marker and never pauses', async () => {
    scenario.llm = fakeLlm({ tokens: TOKENS });
    const { log, result } = await runTurn(agentWith({}));
    assert.ok(!log.some((l) => l.startsWith('pause:')), JSON.stringify(log));
    for (const t of scenario.ttsTexts) noMarker(t, 'TTS text');
    noMarker(result.reply, 'the reply');
    assert.ok(!scenario.llm.calls.stream[0].options.systemPrompt.includes('[[HOLD]]'), 'no rule without a hold length');
    assert.equal(scenario.latency[0].holdMs, null);
  });

  test('a barge before the hold reaches the wire cancels it and the answer behind it', async () => {
    let barged = false;
    let lastChunk = '';
    // Slow enough that the reply has finished generating — the pause and the
    // answer are already queued — by the time the sentence before them plays.
    scenario.ttsDelay = (text) => (text.includes('rahiye') ? 100 : 0);
    scenario.llm = fakeLlm({ tokens: TOKENS });
    const { log } = await runTurn(agentWith(HOLDING), {
      shouldAbort: () => barged,
      // The caller cuts in the moment the sentence before the hold has played.
      onEvent: (e) => {
        if (e.type === 'audio-chunk') lastChunk = String(e.chunk);
        if (e.type === 'audio-end' && lastChunk.includes('rahiye')) barged = true;
      },
    });
    assert.ok(!log.some((l) => l.startsWith('pause:')), JSON.stringify(log));
    assert.ok(!log.some((l) => l.includes('manager se baat')), 'nothing after the hold is spoken');
  });

  test('the prompt carries the rule on voice turns only, and chat replies never show the marker', async () => {
    scenario.llm = fakeLlm({ tokens: ['Okay.'], buffered: 'Sure, one moment. [[HOLD]] Done.' });
    const agent = agentWith(HOLDING);
    await runTurn(agent, { history: [{ role: 'assistant', content: 'Please hold. [[HOLD]] Thanks for waiting.' }] });
    const voiceCall = scenario.llm.calls.stream[0];
    assert.ok(voiceCall.options.systemPrompt.includes('about 5 seconds'), 'the voice turn is told the hold length');
    for (const m of voiceCall.options.chatHistory) noMarker(m.content, 'history sent to the model');

    const chat = await converse('ws-1', agent.id, [{ role: 'user', content: 'hi' }]);
    assert.ok(!scenario.llm.calls.buffered[0].options.systemPrompt.includes('[[HOLD]]'), 'a text chat has no hold rule');
    assert.equal(chat.reply, 'Sure, one moment. Done.');
  });

  test('the handover marker still works in a reply that also holds', async () => {
    scenario.llm = fakeLlm({ tokens: ['[[TRANS', 'FER]] Sure, one moment please. [[HOLD]] ', 'Connecting you to the front desk now.'] });
    const { events, log } = await runTurn(agentWith(HOLDING), { transfer: { available: true, condition: '', targetLabel: 'the front desk' } });
    const transfer = events.find((e) => e.type === 'transfer');
    assert.equal(transfer?.source, 'marker');
    assert.deepEqual(spoken(log), ['chunk:<Sure, one moment please.>', 'pause:5000', 'chunk:<Connecting you to the front desk now.>']);
    for (const t of scenario.ttsTexts) assert.ok(!/TRANSFER|HOLD/.test(t), t);
  });
});
