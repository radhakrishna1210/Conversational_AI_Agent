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
    assert.equal(out.length, 1);
    assert.equal(out[0].content, 'recent');
  });

  test('keeps the newest message even when it alone exceeds the budget', () => {
    const out = windowHistory(
      [{ role: 'user', content: 'z'.repeat(9000) }],
      { maxMessages: 60, maxChars: 8000 },
    );
    assert.equal(out.length, 1);
  });

  // With a chat-history provider `prior` is appended straight after the
  // synthetic KB exchange, whose last entry is an assistant ack. A window that
  // opened on another assistant turn would put two in a row, which Gemini
  // rejects as a malformed contents array.
  test('opens the window on a caller turn, never an assistant turn', () => {
    const out = windowHistory(turns(40), { maxMessages: 9, maxChars: 8000 });
    assert.equal(out[0].role, 'user');
    assert.equal(out[out.length - 1].content, 'm39');
  });

  test('never empties the window for a non-empty conversation', () => {
    const out = windowHistory(turns(3), { maxMessages: 1, maxChars: 1 });
    assert.ok(out.length > 0);
  });
});
