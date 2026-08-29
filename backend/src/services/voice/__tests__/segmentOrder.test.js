// The bug these pin: a reply is spoken as more than one segment, and the only
// way the pipeline could guarantee those segments reached the listener in order
// was to synthesize them one at a time. That serialisation put a full TTS
// time-to-first-byte (~600ms p50, measured) in the middle of every reply, as an
// audible gap where sentence two should have started — while the caller was
// still listening to sentence one and the connection had nothing else to do.
//
// createSegmentOrder separates the two concerns: work overlaps, emission does
// not. What has to hold is that a LATER segment can never emit before an
// earlier one has finished, no matter which of them finishes synthesizing first
// — because on the wire those bytes are one continuous audio stream, and two
// segments interleaved is noise on a live call rather than a clean failure.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSegmentOrder } from '../segmentOrder.js';

/** Resolve after `n` microtask ticks, to interleave the fake segments. */
const ticks = async (n) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

describe('createSegmentOrder', () => {
  test('a later segment waits even when it finishes synthesizing first', async () => {
    const order = createSegmentOrder();
    const emitted = [];

    // Claimed in reply order, exactly as streamTtsForText does — synchronously,
    // before either "request" starts.
    const slotA = order.claim();
    const slotB = order.claim();

    // B is fast (short sentence, warm connection); A is slow. Without the gate
    // B's bytes would go out first and the caller would hear the reply
    // backwards.
    const b = (async () => {
      await ticks(1);
      await slotB.floor;
      emitted.push('B-start', 'B-end');
      slotB.release();
    })();
    const a = (async () => {
      await ticks(20);
      await slotA.floor;
      emitted.push('A-start', 'A-end');
      slotA.release();
    })();

    await Promise.all([a, b]);
    assert.deepEqual(emitted, ['A-start', 'A-end', 'B-start', 'B-end']);
  });

  test('the first segment is never made to wait', async () => {
    const order = createSegmentOrder();
    const slot = order.claim();
    let got = false;
    await slot.floor.then(() => { got = true; });
    assert.equal(got, true, 'sentence one must emit as soon as its bytes arrive');
  });

  test('a failed segment still hands the wire on', async () => {
    // The alternative is a reply that stops halfway through: one provider error
    // on sentence one would silence every sentence after it.
    const order = createSegmentOrder();
    const emitted = [];
    const slotA = order.claim();
    const slotB = order.claim();

    const a = (async () => {
      try {
        await slotA.floor;
        throw new Error('TTS failed');
      } catch {
        emitted.push('A-failed');
      } finally {
        slotA.release();
      }
    })();
    const b = (async () => {
      await slotB.floor;
      emitted.push('B-emitted');
      slotB.release();
    })();

    await Promise.all([a, b]);
    assert.deepEqual(emitted, ['A-failed', 'B-emitted']);
  });

  test('three segments keep reply order under mixed timings', async () => {
    const order = createSegmentOrder();
    const emitted = [];
    const slots = [order.claim(), order.claim(), order.claim()];
    const delays = [12, 1, 5]; // middle sentence returns first

    await Promise.all(slots.map((slot, i) => (async () => {
      await ticks(delays[i]);
      await slot.floor;
      emitted.push(i);
      slot.release();
    })()));

    assert.deepEqual(emitted, [0, 1, 2]);
  });

  test('a segment claimed later still lands last', async () => {
    // Claims made mid-reply (the remainder is only known once the model has
    // finished) must queue behind what is already speaking.
    const order = createSegmentOrder();
    const emitted = [];
    const first = order.claim();

    const a = (async () => {
      await first.floor;
      emitted.push('first');
      await ticks(5);
      first.release();
    })();

    await ticks(1);
    const second = order.claim();
    const b = (async () => {
      await second.floor;
      emitted.push('second');
      second.release();
    })();

    await Promise.all([a, b]);
    assert.deepEqual(emitted, ['first', 'second']);
  });
});
