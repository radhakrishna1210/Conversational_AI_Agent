// The shared 20ms ticker.
//
// What this protects: 45 concurrent calls used to mean 45 timers on one event
// loop, and when the loop slipped they all came due at once and every call's
// playback queue deepened together. Collapsing them to one ticker is only safe
// while the two properties below hold — a subscriber that throws must not stop
// the others, and the timer must not outlive its last subscriber.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { subscribeFrameClock, frameClockSubscribers } from '../frameClock.js';

const nextTicks = (ms) => new Promise((r) => setTimeout(r, ms));

describe('frameClock', () => {
  test('ticks every subscriber', async () => {
    let a = 0;
    let b = 0;
    const offA = subscribeFrameClock(() => { a += 1; });
    const offB = subscribeFrameClock(() => { b += 1; });
    await nextTicks(120);
    offA();
    offB();
    assert.ok(a >= 3, `expected several ticks, got ${a}`);
    assert.ok(b >= 3, `expected several ticks, got ${b}`);
  });

  test('one throwing subscriber does not stop the others', async () => {
    let healthy = 0;
    const offBad = subscribeFrameClock(() => { throw new Error('socket gone'); });
    const offGood = subscribeFrameClock(() => { healthy += 1; });
    await nextTicks(120);
    offBad();
    offGood();
    assert.ok(healthy >= 3, `a failing pacer starved a healthy one (${healthy})`);
  });

  test('unsubscribe stops that subscriber and is idempotent', async () => {
    let n = 0;
    const off = subscribeFrameClock(() => { n += 1; });
    await nextTicks(60);
    off();
    off();  // must not throw or double-remove someone else
    const settled = n;
    await nextTicks(60);
    assert.equal(n, settled);
  });

  test('the timer is released once the last subscriber leaves', async () => {
    assert.equal(frameClockSubscribers(), 0);
    const off = subscribeFrameClock(() => {});
    assert.equal(frameClockSubscribers(), 1);
    off();
    assert.equal(frameClockSubscribers(), 0);
  });
});
