// backend/src/services/voice/__tests__/ulawPacer.test.js
//
// The property under test is a RATE, so these tests drive a fake clock rather
// than sleeping: a real-timer test of a 20ms pacer is both slow and flaky, and
// the failure it is guarding against (emitting faster than realtime) is exactly
// the kind that a generous timing tolerance hides.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createUlawPacer } from '../ulawPacer.js';

const FRAME = 160;
const FRAME_MS = 20;

/**
 * Installs fake setInterval/clearInterval/Date.now and returns a handle that
 * advances them together. The pacer schedules against the wall clock, so both
 * have to move or it resyncs and the test proves nothing.
 */
function withFakeClock(run) {
  const realSetInterval = global.setInterval;
  const realClearInterval = global.clearInterval;
  const realNow = Date.now;

  let now = 1_000_000;
  const timers = new Map();
  let nextId = 1;

  global.setInterval = (fn, ms) => {
    const id = nextId++;
    timers.set(id, { fn, ms, nextAt: now + ms });
    return { id, unref() { return this; } };
  };
  global.clearInterval = (handle) => {
    if (handle && typeof handle === 'object') timers.delete(handle.id);
  };
  Date.now = () => now;

  const advance = (ms) => {
    const target = now + ms;
    // Step timer-by-timer so callbacks observe a moving Date.now(), the same
    // way they would in a real event loop.
    for (;;) {
      let due = null;
      for (const t of timers.values()) if (!due || t.nextAt < due.nextAt) due = t;
      if (!due || due.nextAt > target) break;
      now = due.nextAt;
      due.nextAt += due.ms;
      due.fn();
    }
    now = target;
  };

  try {
    return run({ advance });
  } finally {
    global.setInterval = realSetInterval;
    global.clearInterval = realClearInterval;
    Date.now = realNow;
  }
}

/** A whole number of frames of arbitrary non-silent mu-law. */
const speech = (frames) => Buffer.alloc(frames * FRAME, 0x7f);

test('a burst is emitted at realtime, not as fast as it was pushed', () => {
  withFakeClock(({ advance }) => {
    const sent = [];
    const pacer = createUlawPacer({ send: (f) => sent.push(f) });
    pacer.start();

    // One second of speech, handed over in a single push — the TTS burst this
    // whole module exists to absorb.
    pacer.push(speech(50));
    assert.equal(sent.length, 0, 'push alone must not emit');

    advance(100);
    assert.equal(sent.length, 5, '100ms of wall clock is 5 frames, not 50');

    advance(400);
    assert.equal(sent.length, 25, 'still exactly realtime half a second in');

    advance(500);
    assert.equal(sent.length, 50, 'the full second drains in a full second');

    advance(1000);
    assert.equal(sent.length, 50, 'and nothing is invented once the queue empties');

    pacer.stop();
  });
});

test('every emitted frame is exactly 160 bytes', () => {
  withFakeClock(({ advance }) => {
    const sent = [];
    const pacer = createUlawPacer({ send: (f) => sent.push(f) });
    pacer.start();

    // Deliberately not frame-aligned: 250 bytes is one frame plus 90.
    pacer.push(Buffer.alloc(250, 0x7f));
    advance(200);

    assert.ok(sent.length >= 2, 'the tail must not be stranded');
    for (const f of sent) assert.equal(f.length, FRAME);
    pacer.stop();
  });
});

test('a short tail is padded with mu-law silence, not zeroes', () => {
  withFakeClock(({ advance }) => {
    const sent = [];
    const pacer = createUlawPacer({ send: (f) => sent.push(f) });
    pacer.start();

    pacer.push(Buffer.alloc(40, 0x7f));   // a quarter of a frame
    advance(200);

    assert.equal(sent.length, 1);
    const tail = sent[0];
    assert.equal(tail.length, FRAME);
    assert.equal(tail[0], 0x7f, 'the real audio survives');
    // 0xFF is mu-law silence; 0x00 is full-scale, i.e. an audible click.
    assert.equal(tail[FRAME - 1], 0xff, 'padding must be mu-law silence');
    pacer.stop();
  });
});

test('a mid-stream partial frame waits one tick for the rest of itself', () => {
  withFakeClock(({ advance }) => {
    const sent = [];
    const pacer = createUlawPacer({ send: (f) => sent.push(f) });
    pacer.start();

    // Half a frame arrives, then the other half before the next tick. It must
    // come out as ONE frame of speech, never as two half-padded ones — that
    // would insert 10ms of silence into the middle of a word.
    pacer.push(Buffer.alloc(80, 0x7f));
    advance(FRAME_MS);
    pacer.push(Buffer.alloc(80, 0x7f));
    advance(FRAME_MS * 3);

    assert.equal(sent.length, 1);
    assert.ok(sent[0].every((b) => b === 0x7f), 'no silence spliced into speech');
    pacer.stop();
  });
});

test('flush drops queued audio so a barge-in cannot resurrect the sentence', () => {
  withFakeClock(({ advance }) => {
    const sent = [];
    const pacer = createUlawPacer({ send: (f) => sent.push(f) });
    pacer.start();

    pacer.push(speech(50));
    advance(100);
    assert.equal(sent.length, 5);

    pacer.flush();
    advance(2000);
    assert.equal(sent.length, 5, 'nothing queued may be emitted after a flush');

    // And the pacer is still usable for the next turn.
    pacer.push(speech(2));
    advance(100);
    assert.equal(sent.length, 7);
    pacer.stop();
  });
});

test('an event-loop stall resyncs instead of bursting the backlog', () => {
  withFakeClock(({ advance }) => {
    const sent = [];
    const pacer = createUlawPacer({ send: (f) => sent.push(f) });
    pacer.start();
    pacer.push(speech(200));            // 4s of audio, plenty of backlog

    // A 2-second stall. Catching up would mean 100 frames at once — precisely
    // the burst Plivo penalises, arriving as a consequence of the fix itself.
    advance(2000);

    assert.ok(sent.length <= 105, `resync expected, got a burst of ${sent.length}`);
    pacer.stop();
  });
});

test('stop is idempotent and halts emission', () => {
  withFakeClock(({ advance }) => {
    const sent = [];
    const pacer = createUlawPacer({ send: (f) => sent.push(f) });
    pacer.start();
    pacer.push(speech(50));
    advance(40);
    const atStop = sent.length;

    pacer.stop();
    pacer.stop();                        // cleanup() is reachable more than once
    advance(1000);

    assert.equal(sent.length, atStop);
    assert.equal(pacer.isRunning(), false);

    // Audio queued BEFORE the stop is still held — that is not a leak, the
    // buffer simply dies with the object. What must not happen is new audio
    // accumulating in a pacer that will never drain it again.
    const strandedFrames = pacer.stats().queuedFrames;
    pacer.push(speech(5));
    assert.equal(pacer.stats().queuedFrames, strandedFrames);
  });
});

test('a socket that throws on every frame makes the pacer give up', () => {
  withFakeClock(({ advance }) => {
    let attempts = 0;
    const errors = [];
    const pacer = createUlawPacer({
      send: () => { attempts += 1; throw new Error('socket closed'); },
      onError: (e) => errors.push(e),
    });
    pacer.start();
    pacer.push(speech(50));
    advance(1000);

    assert.equal(attempts, 3, 'stops after MAX_CONSECUTIVE_SEND_FAILURES');
    assert.equal(errors.length, 3);
    assert.equal(pacer.isRunning(), false);
  });
});

test('the queue is bounded, and drops the oldest audio rather than the newest', () => {
  withFakeClock(({ advance }) => {
    const sent = [];
    const pacer = createUlawPacer({ send: (f) => sent.push(f) });
    pacer.start();

    // 600 frames = 12s, past the ~10s cap.
    pacer.push(Buffer.concat([Buffer.alloc(100 * FRAME, 0x11), Buffer.alloc(500 * FRAME, 0x22)]));

    assert.ok(pacer.stats().queuedFrames <= 500);
    assert.ok(pacer.stats().dropped > 0);

    advance(FRAME_MS);
    assert.equal(sent[0][0], 0x22, 'the surviving audio is the freshest');
    pacer.stop();
  });
});
