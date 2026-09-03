// What these pin: the interim-transcript hooks that feed speculative execution,
// the transport-driven ("local VAD") flush that replaces waiting for Deepgram's
// own speech_final, the per-turn timeline, and the stale-UtteranceEnd guard.
// All without a socket: _handleMessage is driven directly.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DeepgramStreamSession } from '../deepgramStream.service.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const result = (transcript, { is_final = false, speech_final = false, from_finalize = false, confidence = 0.95 } = {}) => ({
  channel: { alternatives: [{ transcript, confidence }] }, is_final, speech_final, from_finalize,
});

function session(opts = {}) {
  const events = [];
  const s = new DeepgramStreamSession({
    sampleRate: 16000, endpointingMs: 300, endpointGraceMs: 60, unfinishedGraceMs: 120, finishedGraceMs: 20,
    onTranscript: (text, meta) => events.push(['transcript', text, meta.isFinal]),
    onEndOfTurnCandidate: (text, tier) => events.push(['candidate', text, tier]),
    onCandidateCancelled: () => events.push(['cancelled']),
    onEndOfTurn: (reason) => events.push(['end', reason]),
    ...opts,
  });
  s.beginTurn();
  return { s, events };
}

describe('interim hooks', () => {
  test('onTranscript reports the whole turn so far — finals then the live interim — and never repeats words', () => {
    const { s, events } = session();
    s._handleMessage(result('what are'));
    s._handleMessage(result('what are your'));
    s._handleMessage(result('What are your hours', { is_final: true }));
    s._handleMessage(result('on'));
    s._handleMessage(result('on Sunday?', { is_final: true }));
    const texts = events.filter((e) => e[0] === 'transcript').map((e) => e[1]);
    assert.deepEqual(texts, ['what are', 'what are your', 'What are your hours', 'What are your hours on', 'What are your hours on Sunday?']);
    assert.equal(s.turnTextSoFar(), 'What are your hours on Sunday?');
  });

  test('speech_final arms the candidate AFTER the transcript hook, with the grace tier, and a resume cancels it', async () => {
    const { s, events } = session();
    s._handleMessage(result('book it for tomorrow', { is_final: true, speech_final: true }));
    const kinds = events.map((e) => e[0]);
    assert.deepEqual(kinds, ['transcript', 'candidate']);
    assert.equal(events[1][2], 'ordinary');
    s._handleMessage(result('at nine'));
    assert.ok(events.some((e) => e[0] === 'cancelled'), 'the resume cancelled the candidate');
    await sleep(100);
    assert.ok(!events.some((e) => e[0] === 'end'), 'a cancelled candidate never commits');
  });

  test('a question gets the finished tier; a dangling tail gets the unfinished tier', () => {
    const { s, events } = session();
    s._handleMessage(result('What are your hours?', { is_final: true, speech_final: true }));
    assert.equal(events.at(-1)[2], 'finished');
    const t2 = session();
    t2.s._handleMessage(result('I would like to book an appointment for', { is_final: true, speech_final: true }));
    assert.equal(t2.events.at(-1)[2], 'unfinished');
  });

  test('the committed turn exposes a timeline the transport can log', async () => {
    const { s, events } = session();
    s._handleMessage(result('hello there', { is_final: true, speech_final: true }));
    await sleep(120);
    assert.equal(events.at(-1)[0], 'end');
    const tl = s.lastTurnTimeline;
    assert.ok(tl.firstTranscriptAt <= tl.speechFinalAt);
    assert.ok(tl.candidateAt <= tl.commitAt);
    assert.equal(tl.tier, 'ordinary');
    assert.equal(tl.candidates, 1);
    assert.equal(tl.reason, 'speech_final');
    s.beginTurn();
    assert.equal(s.turnTextSoFar(), '');
  });
});

describe('empty speech_final', () => {
  test('a speech_final with no words this turn arms nothing (it is the silence after the previous turn)', async () => {
    const { s, events } = session();
    s._handleMessage({ channel: { alternatives: [{ transcript: '', confidence: 0 }] }, is_final: true, speech_final: true });
    assert.deepEqual(events, []);
    await sleep(100);
    assert.deepEqual(events, [], 'nothing committed');
    // A real turn afterwards still works.
    s._handleMessage(result('yes please', { is_final: true, speech_final: true }));
    assert.equal(events.at(-1)[0], 'candidate');
  });
});

describe('stale UtteranceEnd', () => {
  test('an UtteranceEnd with no words this turn is ignored instead of committing an empty turn', () => {
    const { s, events } = session();
    s._handleMessage({ type: 'UtteranceEnd' });
    assert.deepEqual(events, []);
    assert.equal(s._committed, false);
    // …and once words exist it behaves as before.
    s._handleMessage(result('yes please', { is_final: true }));
    s._handleMessage({ type: 'UtteranceEnd' });
    assert.equal(events.at(-1)[0], 'end');
    assert.equal(events.at(-1)[1], 'utterance_end');
  });
  test('an UtteranceEnd while this turn only has an interim, or whose last word predates the turn, is ignored', () => {
    const { s, events } = session();
    s._handleMessage({ ...result('yes please', { is_final: true }), start: 1.0, duration: 0.8 });
    s.beginTurn();
    s._handleMessage(result('no'));                      // interim only
    s._handleMessage({ type: 'UtteranceEnd', last_word_end: 1.8 });
    assert.ok(!events.some((e) => e[0] === 'end'));
    s._handleMessage({ ...result('no thanks', { is_final: true }), start: 3.0, duration: 0.6 });
    s._handleMessage({ type: 'UtteranceEnd', last_word_end: 1.8 }); // stale: before this turn's audio
    assert.ok(!events.some((e) => e[0] === 'end'));
    s._handleMessage({ type: 'UtteranceEnd', last_word_end: 3.6 });
    assert.equal(events.at(-1)[0], 'end');
  });
});

describe('noteLocalSilence — transport-driven flush', () => {
  const openSession = (opts) => {
    const { s, events } = session(opts);
    const sent = [];
    s._open = true;
    s.ws = { readyState: 1, send: (m) => sent.push(JSON.parse(m)) };
    return { s, events, sent };
  };

  test('sends Finalize once, arms the candidate when the flush lands, and reports the real dead air', async () => {
    const { s, events, sent } = openSession();
    s._handleMessage(result('what are your'));
    const speechEndAt = performance.now() - 300;
    s.noteLocalSilence({ speechEndAt });
    s.noteLocalSilence({ speechEndAt }); // idempotent while pending
    assert.deepEqual(sent, [{ type: 'Finalize' }]);
    assert.ok(!events.some((e) => e[0] === 'candidate'), 'no candidate until the flush lands');
    s._handleMessage(result('What are your hours?', { is_final: true, from_finalize: true }));
    const cand = events.find((e) => e[0] === 'candidate');
    assert.ok(cand);
    assert.equal(cand[1], 'What are your hours?');
    assert.equal(cand[2], 'finished');
    await sleep(60);
    const end = events.find((e) => e[0] === 'end');
    assert.equal(end[1], 'local_vad:finished');
    assert.ok(s.lastEndpointMs >= 300, `real dead air reported (${s.lastEndpointMs})`);
    assert.equal(s.lastTurnTimeline.localFlushResult, 'flushed');
  });

  test('ignored when nothing has been heard, when a candidate is already armed, and after commit', async () => {
    const { s, sent } = openSession();
    s.noteLocalSilence();
    assert.equal(sent.length, 0, 'no words yet');
    s._handleMessage(result('okay', { is_final: true, speech_final: true }));
    s.noteLocalSilence();
    assert.equal(sent.length, 0, 'Deepgram already armed a candidate');
    await sleep(60);
    s.noteLocalSilence();
    assert.equal(sent.length, 0, 'turn already committed');
  });

  test('a flush that never returns times out and still arms the candidate', async () => {
    process.env.DEEPGRAM_LOCAL_FLUSH_TIMEOUT_MS = '30';
    try {
      const { s, events, sent } = openSession();
      s._handleMessage(result('hello there', { is_final: true }));
      s.noteLocalSilence({ speechEndAt: performance.now() });
      assert.equal(sent.length, 1);
      await sleep(600); // module constant was read at import; the default 500ms bound applies
      assert.ok(events.some((e) => e[0] === 'candidate'), 'candidate armed after the timeout');
      assert.equal(s.lastTurnTimeline?.localFlushResult ?? s._timeline.localFlushResult, 'timeout');
    } finally {
      delete process.env.DEEPGRAM_LOCAL_FLUSH_TIMEOUT_MS;
    }
  });

  test('if the caller resumes during the flush, the candidate armed afterwards is cancelled by their words', async () => {
    const { s, events } = openSession();
    s._handleMessage(result('I want to book', { is_final: true }));
    s.noteLocalSilence({ speechEndAt: performance.now() });
    s._handleMessage(result('I want to book', { is_final: true, from_finalize: true }));
    assert.ok(events.some((e) => e[0] === 'candidate'));
    s._handleMessage(result('an appointment'));
    assert.ok(events.some((e) => e[0] === 'cancelled'), 'the resume cancelled the candidate');
    await sleep(150);
    assert.ok(!events.some((e) => e[0] === 'end'));
  });

  test('beginTurn and close clear a pending flush', () => {
    const { s } = openSession();
    s._handleMessage(result('hi there', { is_final: true }));
    s.noteLocalSilence();
    assert.ok(s._localFlush);
    s.beginTurn();
    assert.equal(s._localFlush, null);
    s._handleMessage(result('hi again', { is_final: true }));
    s.noteLocalSilence();
    assert.ok(s._localFlush);
    s.close();
    assert.equal(s._localFlush, null);
  });
});
