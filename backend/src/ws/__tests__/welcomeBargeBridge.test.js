// The welcome message on a real phone bridge: "hello?" must not cut it off.
//
// Drives the actual runModularMediaBridge with a fake carrier socket and a fake
// Deepgram session, so the whole path is exercised: the echo grace, the
// measured noise floor, the barge block, playout draining, harvestOverlap and
// the turn that follows. On origin/main before this fix, the first test fails
// with the welcome cut on the caller's "hello".
//
// Needs module mocking, which `npm run test:ws` does not enable, so it skips
// there. Run it directly (Node 22.3+), e.g. after merging a change to the bridge:
//
//   node --test --experimental-test-module-mocks src/ws/__tests__/welcomeBargeBridge.test.js
//
// Timing is real (the bridge's windows are wall-clock), about 20s in all.
// See docs/WELCOME_BARGE_IN.md.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

if (typeof mock.module !== 'function') {
  test('welcome barge-in on the phone bridge (run with --experimental-test-module-mocks)', { skip: true }, () => {});
} else {
  // Read by the bridge at import time.
  process.env.PHONE_BARGE_GRACE_MS = '40';
  process.env.PHONE_WELCOME_REPLY_MS = '1500';

  const src = (p) => new URL(`../../${p}`, import.meta.url).href;
  const { encodeUlaw } = await import(src('services/voice/ambience.js'));

  const WELCOME = "Hi, this is Priya from Sunrise Loans. I'm calling about your personal loan application. Is this a good time to talk?";
  const logs = [];
  const log = (lvl) => (a, b) => logs.push(`${lvl} ${typeof a === 'string' ? a : `${b} ${JSON.stringify(a)}`}`);
  const turns = [];

  /** Stands in for Deepgram: `text` is whatever it has heard this turn. */
  let dg = null;
  class FakeDeepgram {
    constructor(opts) {
      Object.assign(this, { opts, text: '', seq: 0, isAlive: true, isConnected: true, lastEndpointMs: null, lastTurnTimeline: null });
      dg = this;
    }
    connect() {}
    beginTurn() { this.text = ''; this.seq += 1; return this.seq; }
    send() {}
    turnTextSoFar() { return this.text; }
    takeTranscript() { const t = this.text; this.text = ''; return t; }
    hasTranscript() { return Boolean(this.text); }
    async finalizeTurn() { return this.takeTranscript(); }
    close() { this.isAlive = false; }
  }

  const tone = (freq, ms, amp) => {
    const pcm = new Int16Array(Math.round((8000 * ms) / 1000));
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(amp * Math.sin((2 * Math.PI * freq * i) / 8000));
    return encodeUlaw(pcm);
  };
  const GREETING_AUDIO = tone(440, 3000, 6000); // a 3s welcome
  const QUIET = tone(300, 20, 30);
  const LOUD = tone(1200, 20, 9000);

  mock.module(src('lib/logger.js'), { defaultExport: { info: log('info'), warn: log('warn'), error: log('error'), debug: () => {} } });
  mock.module(src('config/prisma.js'), { defaultExport: { agentCallLog: { update: async () => ({}), findUnique: async () => null } } });
  mock.module(src('lib/latencyLog.js'), { namedExports: { logTurnLatency: () => {} } });
  mock.module(src('services/agentRuntime.service.js'), {
    namedExports: {
      loadAgent: async () => ({ name: 'Priya', voice: 'v1', settings: '{}', languages: '["English"]', interruptibleEnabled: true, maxDuration: 0 }),
      getRenderedWelcome: async () => ({ welcome: WELCOME }),
      warmVoiceTurn: () => {},
      converseStream: async function* none() {},
      neutralGreeting: () => 'Hello.',
      voiceTurnStream: async (_w, _a, _audio, _mime, history, opts) => {
        turns.push({ history: structuredClone(history), userText: opts.userText, spokenWelcome: opts.spokenWelcome });
        opts.onEvent({ type: 'done', reply: 'OK' });
      },
    },
  });
  mock.module(src('services/billing/callBudget.js'), { namedExports: { openCallBudget: async () => ({ allowed: true, budget: { stop() {} } }) } });
  mock.module(src('services/plivo/subaccount.service.js'), { namedExports: { subaccountCredentials: async () => null } });
  mock.module(src('services/stt/deepgramStream.service.js'), {
    namedExports: { DeepgramStreamSession: FakeDeepgram, isDeepgramConfigured: () => true, toDeepgramLanguage: () => 'en' },
  });
  mock.module(src('services/telephony/transfer.service.js'), {
    namedExports: {
      transferAvailability: () => ({ available: false, config: {} }),
      transferLiveCall: async () => ({}),
      registerPendingTransfer: () => {},
      failureLineFor: () => '',
    },
  });
  mock.module(src('services/voice.service.js'), {
    namedExports: { resolveAgentVoice: async () => ({ name: 'v1', provider: { name: 'ElevenLabs' } }), streamSynthesizeVoice: async () => { throw new Error('unused'); } },
  });
  mock.module(src('services/voice/telephonyVoice.js'), {
    namedExports: { telephonyFormatForVoice: () => ({ kind: 'native', format: 'ulaw_8000' }), synthesisProviderForVoice: () => 'ElevenLabs' },
  });
  mock.module(src('services/voice/greetingAudio.js'), {
    namedExports: {
      getGreetingAudio: () => ({ buf: GREETING_AUDIO, contentType: 'audio/basic' }),
      rememberGreetingAudio: () => {},
      greetingSynthesisOpts: () => ({}),
    },
  });
  mock.module(src('ws/callFinalizer.js'), { namedExports: { createCallFinalizer: () => () => {} } });
  mock.module(src('ws/callRecordingTap.js'), { namedExports: { createRecordingTap: () => ({ inbound() {}, outbound() {}, barge() {}, save() {} }) } });

  const { runModularMediaBridge } = await import(src('ws/modularMediaBridge.js'));
  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  /** One call on an unpaced (Twilio-style) carrier. Frames go in at ~real time. */
  const makeCall = () => {
    const ws = new EventEmitter();
    Object.assign(ws, { OPEN: 1, readyState: 1, close: () => { ws.readyState = 3; ws.emit('close'); } });
    const carrier = {
      id: 'TWILIO', label: 'TestCarrier', pacedOutbound: false, sent: 0, clears: 0,
      readStart: () => ({ streamId: 'S1', callLogId: null }),
      sendAudio: () => { carrier.sent += 1; },
      clearAudio: () => { carrier.clears += 1; },
    };
    runModularMediaBridge(ws, { workspaceId: 'w', agentId: 'a', carrier, direction: 'OUTBOUND' });
    const media = (buf) => ws.emit('message', Buffer.from(JSON.stringify({ event: 'media', media: { payload: buf.toString('base64') } })));
    const frames = async (buf, n) => {
      for (let i = 0; i < n; i++) {
        media(buf);
        if (i % 5 === 4) await sleep(100);
      }
    };
    return {
      carrier,
      /** Answer, measure the line while the bridge sets up, and wait for the welcome. */
      async open() {
        ws.emit('message', Buffer.from(JSON.stringify({ event: 'start', start: {} })));
        // Synchronously, so they land while 'start' awaits its setup — on a live
        // call the database round trips give the bridge this long to measure.
        for (let i = 0; i < 40; i++) media(QUIET);
        for (let i = 0; i < 50 && carrier.sent === 0; i++) await sleep(10);
        assert.ok(carrier.sent > 0, 'the welcome reached the carrier');
        await sleep(120); // past the echo grace
      },
      quiet: (n) => frames(QUIET, n),
      loud: (n) => frames(LOUD, n),
      end: () => ws.close(),
    };
  };

  const withCall = (name, body) => test(name, async () => {
    logs.length = 0;
    turns.length = 0;
    const call = makeCall();
    try {
      await call.open();
      await body(call);
    } finally {
      call.end();
      await sleep(50);
    }
  });
  const bridgeLog = () => logs.filter((l) => l.includes('TestCarrier')).join('\n');

  withCall('a "hello" over the welcome does not cut it, and is not answered straight away', async (call) => {
    dg.text = 'Hello?';
    await call.loud(20); // 400ms of "hello"
    await call.quiet(10);
    assert.equal(call.carrier.clears, 0, 'the welcome was not cut');
    assert.ok(logs.some((l) => l.includes('welcome barge held')), bridgeLog());

    await call.quiet(125); // the rest of the welcome plays out
    await sleep(100);
    assert.ok(logs.some((l) => l.includes('caller greeted over the welcome')), bridgeLog());
    assert.equal(turns.length, 0, 'the hello is not answered the instant the welcome ends');

    await sleep(1600); // the caller stays silent past PHONE_WELCOME_REPLY_MS
    assert.equal(turns.length, 1, bridgeLog());
    assert.equal(turns[0].userText, 'Hello?');
    assert.equal(turns[0].spokenWelcome, WELCOME, 'the welcome counts as delivered');
    assert.equal(turns[0].history[0].content, WELCOME);
  });

  withCall('a caller who answers the welcome after their "hello" is answered, not the hello', async (call) => {
    dg.text = 'hello';
    await call.loud(15);
    await call.quiet(135);
    await sleep(100);
    assert.ok(logs.some((l) => l.includes('caller greeted over the welcome')), bridgeLog());

    dg.text = 'yes tell me';
    await call.loud(10);
    dg.opts.onEndOfTurn('speech_final');
    await sleep(1700);
    assert.equal(turns.length, 1, bridgeLog());
    assert.equal(turns[0].userText, 'yes tell me');
  });

  withCall('a real interruption still cuts the welcome, and the model is told what was heard', async (call) => {
    await sleep(600);
    dg.text = 'Hello? Sorry, I am driving right now';
    await call.loud(10);
    assert.equal(call.carrier.clears, 1, 'the welcome was cut');
    await call.quiet(10);
    dg.opts.onEndOfTurn('speech_final');
    await sleep(300);
    assert.ok(logs.some((l) => l.includes('welcome cut by the caller')), bridgeLog());
    assert.equal(turns.length, 1, bridgeLog());
    const [turn] = turns;
    assert.equal(turn.spokenWelcome?.interrupted, true);
    assert.ok(WELCOME.startsWith(turn.spokenWelcome.heard), turn.spokenWelcome.heard);
    assert.ok(turn.spokenWelcome.heard.length < WELCOME.length / 2, turn.spokenWelcome.heard);
    assert.equal(turn.history[0].content, `${turn.spokenWelcome.heard}—`);
  });

  withCall("an answer over the welcome's last words is carried as before", async (call) => {
    await call.quiet(125);
    dg.text = 'yes';
    await call.loud(10); // "yes" over the tail of "…is this a good time to talk?"
    await call.quiet(40);
    await sleep(1200);
    assert.ok(!logs.some((l) => l.includes('caller greeted over the welcome')), bridgeLog());
    assert.equal(turns.length, 1, bridgeLog());
    assert.equal(turns[0].userText, 'yes');
  });
}
