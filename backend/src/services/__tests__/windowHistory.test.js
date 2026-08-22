// How much of a live call the model is allowed to remember.
//
// The bug these pin: voice turns were capped at a flat 12 messages — six
// exchanges. A two-minute call runs 12-24 turns, so the agent lost the start of
// a conversation it was still having, and re-asked questions the caller had
// already answered. The failure grew with call length, which is how it was
// reported from the field.
//
// The window is budgeted by characters as well as message count because the
// other half of the same complaint is latency: prompt size drives TTFT hard on
// this pipeline, so "remember everything" is not a free fix.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { windowHistory } from '../agentRuntime.service.js';

const turns = (n) => Array.from({ length: n }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: `m${i}`,
}));

describe('windowHistory', () => {
  test('keeps a whole ordinary call, not the last six exchanges', () => {
    const out = windowHistory(turns(40), { maxMessages: 60, maxChars: 8000 });
    assert.equal(out.length, 40);
    assert.equal(out[0].content, 'm0');
  });

  test('drops oldest first when the message cap binds', () => {
    const out = windowHistory(turns(40), { maxMessages: 10, maxChars: 8000 });
    assert.equal(out.length, 10);
    assert.equal(out[out.length - 1].content, 'm39');
  });

  test('drops oldest first when the character budget binds', () => {
    const big = [
      { role: 'user', content: 'x'.repeat(5000) },
      { role: 'assistant', content: 'y'.repeat(5000) },
      { role: 'user', content: 'recent' },
    ];
    const out = windowHistory(big, { maxMessages: 60, maxChars: 6000 });
    // The 5000-char assistant turn still fits alongside 'recent'; the oldest
    // one does not, so it is the only casualty.
    assert.equal(out.length, 2);
    assert.equal(out[out.length - 1].content, 'recent');
    assert.ok(!out.some((m) => m.content.startsWith('x')), 'oldest must be dropped first');
  });

  test('keeps the newest message even when it alone exceeds the budget', () => {
    const out = windowHistory(
      [{ role: 'user', content: 'z'.repeat(9000) }],
      { maxMessages: 60, maxChars: 8000 },
    );
    assert.equal(out.length, 1);
  });

  // A call legitimately OPENS with the agent speaking, so a leading assistant
  // turn is the greeting. An earlier version of this function shifted it off to
  // force strict alternation, which is precisely how an agent ends up greeting
  // the same caller three times — it could no longer see that it had greeted.
  test('never drops a leading assistant turn: that is the greeting', () => {
    const withGreeting = [
      { role: 'assistant', content: 'THE GREETING' },
      { role: 'user', content: 'haan bolo' },
    ];
    const out = windowHistory(withGreeting, { maxMessages: 60, maxChars: 8000 });
    assert.equal(out.length, 2);
    assert.equal(out[0].content, 'THE GREETING');
  });

  test('keeps the newest turns when the cap binds, whatever role leads', () => {
    const out = windowHistory(turns(40), { maxMessages: 9, maxChars: 8000 });
    assert.equal(out.length, 9);
    assert.equal(out[out.length - 1].content, 'm39');
  });

  test('never empties the window for a non-empty conversation', () => {
    const out = windowHistory(turns(3), { maxMessages: 1, maxChars: 1 });
    assert.ok(out.length > 0);
  });
});
