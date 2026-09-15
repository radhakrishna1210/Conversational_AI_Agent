// The web call's barge race: one call-wide `bargeRequested` flag, reset by the
// next turn, could un-abort a reply that had not yet noticed it was barged —
// two replies streaming into one socket — and the older reply's cleanup marked
// the call idle while the newer one was still speaking.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createReplyTurns } from '../replyTurns.js';

describe('reply turns', () => {
  test('a barge stops the reply streaming now', () => {
    const turns = createReplyTurns();
    const reply = turns.begin();
    assert.equal(turns.active, true);
    assert.equal(turns.barge(), true);
    assert.equal(reply.aborted, true);
  });

  test('a barge with nothing streaming is a no-op', () => {
    const turns = createReplyTurns();
    assert.equal(turns.barge(), false);
    assert.equal(turns.active, false);
  });

  // THE RACE. Reply 1 is barged but has not unwound yet (it is awaiting the LLM
  // or TTS) when the caller's next turn starts reply 2.
  test('the next reply cannot un-abort one that was barged', () => {
    const turns = createReplyTurns();
    const first = turns.begin();
    turns.barge();
    const second = turns.begin();

    assert.equal(first.aborted, true, 'the barged reply must stay stopped');
    assert.equal(second.aborted, false);
  });

  test('a new reply supersedes one that is still streaming, barged or not', () => {
    const turns = createReplyTurns();
    const first = turns.begin();
    const second = turns.begin();
    assert.equal(first.aborted, true, 'two replies must never stream at once');
    assert.equal(second.aborted, false);
  });

  test('the older reply finishing does not mark the call idle', () => {
    const turns = createReplyTurns();
    const first = turns.begin();
    const second = turns.begin();
    turns.end(first);             // reply 1's finally runs after reply 2 began

    assert.equal(turns.active, true, 'reply 2 is still speaking');
    assert.equal(turns.barge(), true, 'so a barge must still reach it');
    assert.equal(second.aborted, true);

    turns.end(second);
    assert.equal(turns.active, false);
  });
});
