// Run by voiceTurnStreamFallbacks.test.js, in a child process with module mocks.
//
// voiceTurnStream's fallback paths — the ones that run when the model is slow,
// throttled or stuck — are the ones no live call exercises on purpose, so each
// shipped a different system prompt or an unbounded wait. These drive the real
// runtime with the database, the LLM provider and TTS replaced.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mockModule } from '../../ws/__tests__/support/mockedHarness.js';

process.env.VOICE_LLM_FIRST_TOKEN_TIMEOUT_MS = '120';
process.env.VOICE_LLM_SPIKE_TIMEOUT_MS = '400';
process.env.VOICE_LLM_STALL_TIMEOUT_MS = '250';
process.env.VOICE_TTS_DRAIN_TIMEOUT_MS = '300';
process.env.VOICE_FILLER = 'false';
process.env.GEMINI_API_KEY = 'fake-key';

const here = (rel) => new URL(rel, import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Everything the mocks read; each test sets what it needs. */
const scenario = {
  agents: new Map(),
  llm: null,
  overlap: false,
  ttsOpts: [],
  makeTts: null,
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
  resolveAgentVoice: async () => ({ id: 'voice-1', name: 'Test Voice', provider: { name: 'ElevenLabs' } }),
  streamSynthesizeVoice: async () => ({ stream: Readable.from([Buffer.from('audio')]), contentType: 'audio/mpeg' }),
});
mockModule(here('../voice/ttsStreamFactory.js'), {
  supportsTokenStreaming: () => scenario.overlap,
  createTokenTtsStream: (_voice, opts) => { scenario.ttsOpts.push(opts); return scenario.makeTts(); },
  synthesisProviderName: () => 'FakeTTS',
  supportsSsmlBreaks: () => false,
});
mockModule(here('../groq.service.js'), { groqService: {} });
mockModule(here('../stt.service.js'), { transcribeAudio: async () => ({ text: '', provider: 'none' }) });
mockModule(here('../kbChunking.service.js'), { hasKbChunks: async () => false, retrieveKbChunks: async () => [] });
mockModule(here('../../lib/latencyLog.js'), { logTurnLatency: () => {} });

const { voiceTurnStream } = await import('../agentRuntime.service.js');
const { TRANSFER_MARKER } = await import('../voice/transferIntent.js');
const { ambienceTagFor } = await import('../voice/ambience.js');

let agentSeq = 0;
/** A fresh agent id per test, so the runtime's 5-minute agent cache cannot bleed between them. */
function agentWith(settings = {}) {
  agentSeq += 1;
  const agent = {
    id: `agent-${agentSeq}`, workspaceId: 'ws-1', name: 'Front Desk', welcomeMessage: 'Hello!',
    aiModel: 'Gemini 3.5 Flash Lite', voice: 'ElevenLabs - Test Voice', transcription: 'Deepgram',
    languages: '["English"]', flowItems: '[]', maxDuration: 30, silenceTimeout: 5,
    dynamicEnabled: true, interruptibleEnabled: true, settings: JSON.stringify(settings),
  };
  scenario.agents.set(agent.id, agent);
  return agent;
}

/** An LLM whose stream and buffered call are scripted per test. */
function fakeLlm({ tokens = ['Our hours are nine to six. ', 'Anything else?'], firstTokenDelayMs = 0, hangAfter = null, bufferedError = null } = {}) {
  const calls = { stream: [], buffered: [] };
  return {
    calls,
    supportsChatHistory: true,
    async* generateResponseStream(message, config, options) {
      calls.stream.push({ message, config, options });
      await sleep(firstTokenDelayMs);
      for (let i = 0; i < tokens.length; i++) {
        if (hangAfter === i) await new Promise(() => {});
        yield tokens[i];
      }
    },
    async generateResponse(message, config, options) {
      calls.buffered.push({ message, config, options });
      if (bufferedError) throw bufferedError;
      return 'Buffered reply.';
    },
  };
}

/** A token TTS socket. `finishes: false` models one that never reports done. */
function fakeTts({ finishes = true } = {}) {
  return () => {
    const s = new EventEmitter();
    s.connect = () => {};
    s.pushText = () => { s.emit('audio', Buffer.from('a')); };
    s.end = () => { if (finishes) setImmediate(() => s.emit('done')); };
    s.close = () => setImmediate(() => s.emit('done'));
    return s;
  };
}

const TRANSFER = { available: true, condition: '', targetLabel: 'the front desk' };

const runTurn = (agent, opts = {}) => voiceTurnStream('ws-1', agent.id, null, null,
  [{ role: 'assistant', content: 'Hello!' }],
  { userText: 'what are your hours', channel: 'web', transfer: TRANSFER, spokenWelcome: 'Hello from Acme!', ...opts });

describe('voiceTurnStream fallbacks', () => {
  test('the buffered fallback asks with the same prompt as every other path', async () => {
    scenario.overlap = false;
    process.env.VOICE_SENTENCE_SPLIT = 'false'; // straight to buffered
    try {
      scenario.llm = fakeLlm();
      await runTurn(agentWith());
      const [call] = scenario.llm.calls.buffered;
      assert.ok(call, 'the buffered path ran');
      assert.ok(call.options.systemPrompt.includes(TRANSFER_MARKER), 'handover rules must be in the prompt');
      assert.ok(call.options.systemPrompt.includes('Hello from Acme!'), 'the greeting actually spoken must be named');
    } finally {
      delete process.env.VOICE_SENTENCE_SPLIT;
    }
  });

  test('a rate-limited buffered call is not asked again', async () => {
    scenario.overlap = false;
    process.env.VOICE_SENTENCE_SPLIT = 'false';
    try {
      scenario.llm = fakeLlm({ bufferedError: new Error('[429 Too Many Requests] RESOURCE_EXHAUSTED') });
      await assert.rejects(runTurn(agentWith()), /429/);
      assert.equal(scenario.llm.calls.buffered.length, 1, 'a second ask of an exhausted model only adds dead air');
    } finally {
      delete process.env.VOICE_SENTENCE_SPLIT;
    }
  });

  test('a slow first token on the socket path keeps the speculation instead of starting over', async () => {
    scenario.overlap = true;
    scenario.makeTts = fakeTts();
    // The hedge is slower than the speculation, so the speculation must win.
    scenario.llm = fakeLlm({ tokens: ['From the hedge.'], firstTokenDelayMs: 1500 });

    let closed = false;
    let i = 0;
    const specTokens = ['We are open nine to six. ', 'See you soon.'];
    const iterator = {
      async next() {
        if (i === 0) await sleep(250); // slower than the 120ms first-token budget
        if (closed) return { value: undefined, done: true };
        return i < specTokens.length ? { value: specTokens[i++], done: false } : { value: { provider: 'spec', model: 'm', ragMs: 0 }, done: true };
      },
      async return() { closed = true; return { value: undefined, done: true }; },
      [Symbol.asyncIterator]() { return this; },
    };
    const speculation = {
      hit: { iterator, text: 'what are your hours', startedAt: performance.now(), firstTokenAt: null, bufferedChars: 0, trigger: 'candidate' },
      turn: { started: 1, wasted: 0, wastedChars: 0 },
      mode: 'candidate',
    };

    const result = await runTurn(agentWith(), { speculation });
    assert.match(result.reply, /open nine to six/, `the speculated reply is spoken, got "${result.reply}"`);
    assert.equal(scenario.llm.calls.buffered.length, 0, 'no whole fresh generation');
  });

  test('a stream that stalls mid-reply ends the turn with what arrived', { timeout: 5000 }, async () => {
    scenario.overlap = false;
    scenario.llm = fakeLlm({ tokens: ['Our hours are nine to six on weekdays. ', 'and on'], hangAfter: 1 });
    const result = await runTurn(agentWith());
    assert.match(result.reply, /nine to six/);
  });

  test('a TTS socket that never reports done does not hold the turn', { timeout: 5000 }, async () => {
    scenario.overlap = true;
    scenario.makeTts = fakeTts({ finishes: false });
    scenario.llm = fakeLlm();
    const result = await runTurn(agentWith());
    assert.match(result.reply, /nine to six/);
  });

  test('the token TTS stream is given the agent\'s native ambience tag', async () => {
    scenario.overlap = true;
    scenario.makeTts = fakeTts();
    scenario.llm = fakeLlm();
    scenario.ttsOpts = [];
    const settings = { ambientMode: 'native', ambientSound: 'Office Chatter' };
    await runTurn(agentWith(settings));
    assert.ok(ambienceTagFor(settings), 'fixture sanity: the preset has a tag');
    assert.equal(scenario.ttsOpts[0]?.ambienceTag, ambienceTagFor(settings));
  });
});
