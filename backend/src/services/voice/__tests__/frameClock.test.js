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

// Deliberately loose. These assert that the shared ticker DELIVERS to every
// subscriber, not that it hits 50Hz — the whole point of the clock is that the
// pacers read the wall clock and tolerate a starved loop, and the suite itself
// starves it when several hundred tests share the process. Pinning a tick COUNT
// here would fail for the one reason the design already handles.
const SOME_TICKS = 1;

describe('frameClock', () => {
  test('ticks every subscriber', async () => {
    let a = 0;
    let b = 0;
    const offA = subscribeFrameClock(() => { a += 1; });
    const offB = subscribeFrameClock(() => { b += 1; });
    await nextTicks(250);
    offA();
    offB();
    assert.ok(a >= SOME_TICKS, `subscriber A never ticked (${a})`);
    assert.ok(b >= SOME_TICKS, `subscriber B never ticked (${b})`);
  });

  test('one throwing subscriber does not stop the others', async () => {
    let healthy = 0;
    const offBad = subscribeFrameClock(() => { throw new Error('socket gone'); });
    const offGood = subscribeFrameClock(() => { healthy += 1; });
    await nextTicks(250);
    offBad();
    offGood();
    assert.ok(healthy >= SOME_TICKS, `a failing pacer starved a healthy one (${healthy})`);
  });

  test('unsubscribe stops that subscriber and is idempotent', async () => {
    let n = 0;
    const off = subscribeFrameClock(() => { n += 1; });
    await nextTicks(150);
    off();
    off();  // must not throw or double-remove someone else
    const settled = n;
    await nextTicks(150);
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
