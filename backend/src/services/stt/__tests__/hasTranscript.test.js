// Can we ask "did the caller actually speak?" without destroying the answer?
//
// The web transport decides when a turn ends using an amplitude VAD in the
// browser. That heuristic gets it wrong in both directions, and when it wrongly
// said "silence" the client sent cancel-turn and the server discarded words
// Deepgram had already recognised — so the caller had to repeat the same
// sentence two or three times until one attempt happened to clear the bar.
//
// The fix lets the server override a cancel when the recogniser holds a
// transcript, which only works if asking is non-destructive: a check that
// consumed the words would leave runTurn with nothing to run.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DeepgramStreamSession } from '../deepgramStream.service.js';

// The constructor does not open a socket (connect() does), so a session can be
// inspected without touching the network.
const session = (finals) => {
  const s = new DeepgramStreamSession({ sampleRate: 16000 });
  s.finals = finals;
  return s;
};

describe('hasTranscript', () => {
  test('false when the caller really was silent', () => {
    assert.equal(session([]).hasTranscript(), false);
  });

  test('true as soon as there are words', () => {
    assert.equal(session(['हाँ बोलिए']).hasTranscript(), true);
  });

  test('whitespace-only finals are not speech', () => {
    assert.equal(session(['', '   ', '\n']).hasTranscript(), false);
  });

  test('finds words even when earlier finals are blank', () => {
    assert.equal(session(['', 'better', '']).hasTranscript(), true);
  });

  test('does NOT consume the transcript — the override still has words to run', () => {
    const s = session(['first', 'second']);
    assert.equal(s.hasTranscript(), true);
    assert.equal(s.hasTranscript(), true, 'asking twice must not empty it');
    assert.equal(s.takeTranscript(), 'first second');
    assert.equal(s.hasTranscript(), false, 'takeTranscript still consumes');
  });
});
