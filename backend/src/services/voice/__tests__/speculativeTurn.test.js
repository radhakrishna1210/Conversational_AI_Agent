// What these pin: a speculative LLM request may run ahead of the turn, but it
// must never SPEAK ahead of it, must be discarded the moment its transcript is
// superseded or fails to match the committed one, and must be cancelled at the
// provider (AbortSignal) rather than left to finish in the background on a
// metered quota. And the accounting has to be right, because the owner decides
// how aggressive to be from the wasted-request column.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSpeculator, speculationMatches, normalizeForMatch, speculationModeFor,
  SPECULATION_MODES, DEFAULT_SPECULATION_MODE,
} from '../speculativeTurn.js';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A fake converseStream: yields `tokens` one per macrotask, records aborts. */
function fakeStart(tokens, { returnValue = { provider: 'fake', model: 'm', ragMs: 0 }, hang = false } = {}) {
  const calls = [];
  const start = (messages, { signal }) => {
    const call = { messages, aborted: false, yielded: 0 };
    calls.push(call);
    signal.addEventListener('abort', () => { call.aborted = true; });
    let i = 0;
    return {
      async next() {
        await tick(1);
        if (signal.aborted) return { value: undefined, done: true };
        if (i < tokens.length) { call.yielded += 1; return { value: tokens[i++], done: false }; }
        if (hang) { await new Promise(() => {}); }
        return { value: returnValue, done: true };
      },
      async return() { call.returned = true; return { value: undefined, done: true }; },
      [Symbol.asyncIterator]() { return this; },
    };
  };
  return { start, calls };
}

const drain = async (it) => {
  const out = [];
  for (;;) { const r = await it.next(); if (r.done) return { out, ret: r.value }; out.push(r.value); }
};

describe('speculationMatches', () => {
  test('ignores case, punctuation and whitespace — Deepgram finals differ from interims in exactly those', () => {
    assert.equal(speculationMatches('what are your hours', 'What are your hours?'), true);
    assert.equal(speculationMatches('book it for  tomorrow', 'Book it for tomorrow.'), true);
    assert.equal(speculationMatches('हाँ', 'हाँ।'), true);
  });
  test('a different or extra word is a different question', () => {
    assert.equal(speculationMatches('what are your hours', 'what are your hours on sunday'), false);
    assert.equal(speculationMatches('book it', 'cancel it'), false);
    assert.equal(speculationMatches('', ''), false);
  });
  test('normalizeForMatch collapses to words only', () => {
    assert.equal(normalizeForMatch('  Hi, there!! '), 'hi there');
  });
});

describe('speculationModeFor', () => {
  const saved = process.env.VOICE_SPECULATION;
  afterEach(() => { if (saved === undefined) delete process.env.VOICE_SPECULATION; else process.env.VOICE_SPECULATION = saved; });
  test('default is candidate; agent setting wins; env is the fallback and the kill switch', () => {
    delete process.env.VOICE_SPECULATION;
    assert.equal(DEFAULT_SPECULATION_MODE, 'candidate');
    assert.equal(speculationModeFor({}), 'candidate');
    assert.equal(speculationModeFor({ speculation: 'interim' }), 'interim');
    assert.equal(speculationModeFor({ speculation: 'nonsense' }), 'candidate');
    process.env.VOICE_SPECULATION = 'interim';
    assert.equal(speculationModeFor({}), 'interim');
    assert.equal(speculationModeFor({ speculation: 'off' }), 'off');
    process.env.VOICE_SPECULATION = 'off';
    assert.equal(speculationModeFor({ speculation: 'interim' }), 'off', 'env off is platform-wide');
    assert.deepEqual(SPECULATION_MODES, ['off', 'candidate', 'interim']);
  });
});

describe('createSpeculator — candidate mode', () => {
  test('off mode never starts a request and take() reports none', async () => {
    const { start, calls } = fakeStart(['a']);
    const s = createSpeculator({ mode: 'off', start });
    s.beginTurn();
    s.onTranscript('hello', { isFinal: false });
    s.onCandidate('hello');
    const r = s.take('hello');
    assert.equal(calls.length, 0);
    assert.equal(r.hit, null);
    assert.deepEqual(r.turn, { started: 0, wasted: 0, wastedChars: 0 });
  });

  test('starts on the candidate with the history in front, buffers tokens, and hands them over on a match', async () => {
    const { start, calls } = fakeStart(['Hello', ' there', '.']);
    const s = createSpeculator({ mode: 'candidate', start, history: () => [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yes?' }] });
    s.beginTurn();
    s.onTranscript('what are your hours', { isFinal: false });
    assert.equal(calls.length, 0, 'candidate mode ignores interims');
    s.onCandidate('what are your hours');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].messages.map((m) => m.role), ['user', 'assistant', 'user']);
    assert.equal(calls[0].messages[2].content, 'what are your hours');
    await tick(20); // tokens accumulate while nobody is consuming
    const r = s.take('What are your hours?');
    assert.ok(r.hit, 'punctuation-only difference is a hit');
    assert.equal(r.hit.trigger, 'candidate');
    assert.ok(r.hit.bufferedChars >= 5);
    assert.ok(r.hit.firstTokenAt >= r.hit.startedAt);
    const { out, ret } = await drain(r.hit.iterator);
    assert.deepEqual(out, ['Hello', ' there', '.']);
    assert.deepEqual(ret, { provider: 'fake', model: 'm', ragMs: 0 });
    assert.deepEqual(r.turn, { started: 1, wasted: 0, wastedChars: 0 });
    assert.equal(s.stats().hits, 1);
  });

  test('a mismatch aborts the request at the provider and counts the waste', async () => {
    const { start, calls } = fakeStart(['Some', ' reply']);
    const s = createSpeculator({ mode: 'candidate', start });
    s.beginTurn();
    s.onCandidate('book it for tomorrow');
    await tick(15);
    const r = s.take('book it for tomorrow at nine');
    assert.equal(r.hit, null);
    assert.equal(calls[0].aborted, true, 'AbortSignal fired');
    assert.equal(r.turn.started, 1);
    assert.equal(r.turn.wasted, 1);
    assert.ok(r.turn.wastedChars > 0);
    assert.equal(s.stats().misses, 1);
  });

  test('a second candidate with different words supersedes (and aborts) the first', async () => {
    const { start, calls } = fakeStart(['x']);
    const s = createSpeculator({ mode: 'candidate', start });
    s.beginTurn();
    s.onCandidate('yes');
    s.onCandidateCancelled();          // caller resumed
    s.onCandidate('yes and also tuesday');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].aborted, true);
    assert.equal(calls[1].aborted, false);
    const r = s.take('yes and also tuesday');
    assert.ok(r.hit);
    assert.deepEqual(r.turn, { started: 2, wasted: 1, wastedChars: calls[0].yielded });
  });

  test('a candidate repeating the same words keeps the running request', () => {
    const { start, calls } = fakeStart(['x']);
    const s = createSpeculator({ mode: 'candidate', start });
    s.beginTurn();
    s.onCandidate('hello there');
    s.onCandidate('Hello there.');
    assert.equal(calls.length, 1);
  });

  test('beginTurn / abort discard anything in flight; nothing from an old turn can be taken', async () => {
    const { start, calls } = fakeStart(['x']);
    const s = createSpeculator({ mode: 'candidate', start });
    s.beginTurn();
    s.onCandidate('first turn');
    s.beginTurn();
    assert.equal(calls[0].aborted, true);
    assert.equal(s.take('first turn').hit, null);
    s.beginTurn();
    s.onCandidate('second');
    s.abort();
    assert.equal(calls[1].aborted, true);
    assert.equal(s.take('second').hit, null);
    assert.equal(s.stats().wasted, 2);
  });

  test('nothing is started before beginTurn and nothing after take()', () => {
    const { start, calls } = fakeStart(['x']);
    const s = createSpeculator({ mode: 'candidate', start });
    s.onCandidate('early');
    assert.equal(calls.length, 0);
    s.beginTurn();
    s.onCandidate('now');
    s.take('now');
    s.onCandidate('late');
    assert.equal(calls.length, 1);
  });

  test('a stream that errored is not handed over; the ordinary path runs', async () => {
    const start = (m, { signal }) => ({
      async next() { await tick(1); throw new Error('boom'); },
      async return() { return { done: true }; },
    });
    const s = createSpeculator({ mode: 'candidate', start });
    s.beginTurn();
    s.onCandidate('hi');
    await tick(10);
    const r = s.take('hi');
    assert.equal(r.hit, null);
    assert.equal(r.turn.wasted, 1);
  });

  test('the handed-over iterator continues live after the buffer, and return() aborts the provider', async () => {
    const { start, calls } = fakeStart(['a', 'b', 'c', 'd'], { hang: true });
    const s = createSpeculator({ mode: 'candidate', start });
    s.beginTurn();
    s.onCandidate('q');
    await tick(3); // some tokens buffered; the provider then hangs until aborted
    const r = s.take('q');
    const first = await r.hit.iterator.next();
    assert.equal(first.value, 'a');
    await r.hit.iterator.return();
    assert.equal(calls[0].aborted, true);
    const after = await r.hit.iterator.next();
    assert.equal(after.done, true);
  });
});

describe('createSpeculator — interim mode', () => {
  test('debounces interims, launches finals immediately, and restarts only on a meaningful delta', async () => {
    const { start, calls } = fakeStart(['x']);
    const s = createSpeculator({ mode: 'interim', start, debounceMs: 20, minDeltaChars: 4 });
    s.beginTurn();
    s.onTranscript('what', { isFinal: false });
    s.onTranscript('what are', { isFinal: false });
    s.onTranscript('what are your', { isFinal: false });
    assert.equal(calls.length, 0, 'still inside the debounce');
    await tick(40);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].messages.at(-1).content, 'what are your');
    s.onTranscript('what are your h', { isFinal: false }); // 2-char delta: ignored
    await tick(40);
    assert.equal(calls.length, 1);
    s.onTranscript('what are your hours', { isFinal: true }); // a final launches now
    assert.equal(calls.length, 2);
    assert.equal(calls[0].aborted, true);
    s.onCandidate('what are your hours');
    assert.equal(calls.length, 2, 'candidate with the same words reuses the interim request');
    const r = s.take('What are your hours?');
    assert.ok(r.hit);
    assert.equal(r.hit.trigger, 'interim');
    assert.deepEqual(r.turn, { started: 2, wasted: 1, wastedChars: calls[0].yielded });
  });

  test('a pending debounce is dropped by take() so no request starts after the turn', async () => {
    const { start, calls } = fakeStart(['x']);
    const s = createSpeculator({ mode: 'interim', start, debounceMs: 20 });
    s.beginTurn();
    s.onTranscript('hello', { isFinal: false });
    s.take('hello');
    await tick(40);
    assert.equal(calls.length, 0);
  });
});
