import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { createPcmStreamPacer, PCM_FRAME_ALIGN_BYTES } from '../pcmStreamPacer.js';

/**
 * The pacer exists because raw-PCM carrier streams drop audio that is blasted rather than
 * paced, and rejects frames that are not 320-byte multiples. Both of those
 * failures show up as a call that hangs up seconds in — nothing logs "your
 * frames were the wrong size" — so the invariants are pinned here instead.
 */

const RATE = 24000;                 // bytes per second of PCM16 = RATE * 2
const secondsOfAudio = (s) => Buffer.alloc(RATE * 2 * s, 1);

/** Collect what actually went on the wire. */
const recorder = () => {
  const frames = [];
  return {
    frames,
    send: (frame, meta) => frames.push({ bytes: frame.length, meta }),
    totalBytes: () => frames.reduce((n, f) => n + f.bytes, 0),
  };
};

/**
 * Advance the clock the way real timers do.
 *
 * `mock.timers.tick(n)` jumps Date.now() straight to the end of the window and
 * only THEN runs every interval callback that came due, so all of them observe
 * the same final timestamp. The pacer schedules against the wall clock, so a
 * single large tick reads to it as one long event-loop stall. Stepping by the
 * interval period reproduces what actually happens at runtime: one callback,
 * one clock advance.
 */
const advance = (ms, step = 50) => {
  for (let t = 0; t < ms; t += step) mock.timers.tick(step);
};

beforeEach(() => mock.timers.enable({ apis: ['setInterval', 'Date'] }));
afterEach(() => mock.timers.reset());

describe('frame geometry', () => {
  test('every frame is a whole multiple of 320 bytes, at every supported rate', () => {
    for (const sampleRate of [8000, 16000, 24000]) {
      for (const frameMs of [20, 100]) {
        const rec = recorder();
        const pacer = createPcmStreamPacer({ sampleRate, frameMs, send: rec.send });
        pacer.start();
        pacer.push(Buffer.alloc(sampleRate * 2, 1));   // 1 second
        advance(2000);
        pacer.stop();

        assert.equal(pacer.stats().frameBytes % PCM_FRAME_ALIGN_BYTES, 0);
        assert.ok(rec.frames.length > 0, `${sampleRate}@${frameMs}ms emitted nothing`);
        for (const f of rec.frames) {
          assert.equal(f.bytes % PCM_FRAME_ALIGN_BYTES, 0,
            `${sampleRate}@${frameMs}ms emitted a ${f.bytes}-byte frame`);
        }
      }
    }
  });

  test('an unaligned frameMs rounds DOWN rather than padding every frame', () => {
    // Padding up to alignment would inject silence into continuous speech once
    // per frame for the whole call.
    const pacer = createPcmStreamPacer({ sampleRate: 8000, frameMs: 33, send: () => {} });
    // 33ms @ 8kHz = 264 samples = 528 bytes -> one whole 320-byte frame.
    assert.equal(pacer.stats().frameBytes, 320);
  });

  test('the tick derives from the frame actually emitted, not the requested ms', () => {
    // Emitting slightly fast is not a rounding detail here: the excess
    // accumulates in its playout buffer as ever-growing latency.
    const pacer = createPcmStreamPacer({ sampleRate: 8000, frameMs: 33, send: () => {} });
    assert.equal(pacer.stats().frameDurationMs, 20);   // 320 bytes = 160 samples @ 8k
  });
});

describe('pacing', () => {
  test('a burst of engine audio goes out at realtime, not all at once', () => {
    // A realtime engine emits a whole sentence in a few hundred ms. Forwarding
    // that verbatim is exactly the burst the carrier drops.
    const rec = recorder();
    const pacer = createPcmStreamPacer({ sampleRate: RATE, frameMs: 100, send: rec.send });
    pacer.start();
    pacer.push(secondsOfAudio(5));

    advance(500);
    const after500ms = rec.totalBytes() / (RATE * 2) * 1000;
    assert.ok(after500ms <= 700, `emitted ${after500ms}ms of audio in 500ms of wall clock`);
    assert.ok(after500ms >= 300, `emitted only ${after500ms}ms of audio in 500ms`);

    advance(5000);
    pacer.stop();
    const total = rec.totalBytes() / (RATE * 2) * 1000;
    assert.ok(total >= 4900 && total <= 5100, `expected ~5000ms of audio out, got ${total}`);
  });

  test('media metadata increments monotonically from 1', () => {
    // The carrier reference bridge is explicit that omitting chunk / timestamp /
    // sequenceNumber makes Connect streams drop or end early.
    const rec = recorder();
    const pacer = createPcmStreamPacer({ sampleRate: RATE, frameMs: 100, send: rec.send });
    pacer.start();
    pacer.push(secondsOfAudio(1));
    advance(2000);
    pacer.stop();

    rec.frames.forEach((f, i) => {
      assert.equal(f.meta.sequenceNumber, i + 1);
      assert.equal(f.meta.chunk, i + 1);
      assert.ok(f.meta.timestampMs >= 0);
    });
    assert.ok(rec.frames.at(-1).meta.timestampMs > rec.frames[0].meta.timestampMs);
  });

  test('nothing is emitted before start or after stop', () => {
    const rec = recorder();
    const pacer = createPcmStreamPacer({ sampleRate: RATE, frameMs: 100, send: rec.send });

    pacer.push(secondsOfAudio(1));       // queued before start: dropped on the floor
    advance(1000);
    assert.equal(rec.frames.length, 0);

    pacer.start();
    pacer.push(secondsOfAudio(1));
    advance(300);
    const midCall = rec.frames.length;
    assert.ok(midCall > 0);

    pacer.stop();
    advance(5000);
    assert.equal(rec.frames.length, midCall, 'a stopped pacer must not keep emitting');
  });

  test('stop() is idempotent, because cleanup() is reachable twice', () => {
    const pacer = createPcmStreamPacer({ sampleRate: RATE, send: () => {} });
    pacer.start();
    pacer.stop();
    assert.doesNotThrow(() => pacer.stop());
    assert.equal(pacer.isRunning(), false);
  });
});

describe('utterance tails', () => {
  test('a partial tail is padded to alignment and sent once the audio stops', () => {
    const rec = recorder();
    const pacer = createPcmStreamPacer({ sampleRate: RATE, frameMs: 100, send: rec.send });
    pacer.start();
    pacer.push(Buffer.alloc(1000, 1));   // far short of a 4800-byte frame
    advance(1000);
    pacer.stop();

    assert.equal(rec.frames.length, 1, 'the last syllable must not be stranded in the queue');
    assert.equal(rec.frames[0].bytes % PCM_FRAME_ALIGN_BYTES, 0);
    assert.equal(rec.frames[0].bytes, 1280, '1000 bytes padded up to the next 320 multiple');
    assert.equal(pacer.stats().padded, 1);
  });

  test('a tail that is merely mid-stream waits for its rest instead of fragmenting', () => {
    const rec = recorder();
    const pacer = createPcmStreamPacer({ sampleRate: RATE, frameMs: 100, send: rec.send });
    pacer.start();
    // Audio arriving steadily in chunks smaller than a frame must still come
    // out as whole frames, or every frame would carry padding silence.
    for (let i = 0; i < 20; i++) {
      pacer.push(Buffer.alloc(2400, 1));   // 50ms each
      advance(50);
    }
    advance(2000);
    pacer.stop();

    assert.equal(pacer.stats().padded, 0, 'no mid-stream frame should have been padded');
    assert.equal(rec.totalBytes(), 48000, 'exactly the 1s of audio pushed');
  });
});

describe('barge-in and overrun', () => {
  test('flush() drops audio the caller interrupted', () => {
    // A carrier's own `clear` only flushes what the carrier holds; anything still
    // queued here would go out afterwards and resurrect the sentence.
    const rec = recorder();
    const pacer = createPcmStreamPacer({ sampleRate: RATE, frameMs: 100, send: rec.send });
    pacer.start();
    pacer.push(secondsOfAudio(5));
    advance(300);
    const beforeBarge = rec.frames.length;

    pacer.flush();
    advance(5000);
    pacer.stop();
    assert.equal(rec.frames.length, beforeBarge, 'interrupted audio must never surface later');
  });

  test('an over-full queue drops the OLDEST audio, keeping the freshest', () => {
    // Whatever is stale is already wrong to play; the newest audio is the reply
    // the caller is waiting for.
    const rec = recorder();
    const pacer = createPcmStreamPacer({ sampleRate: RATE, frameMs: 100, send: rec.send });
    pacer.start();
    pacer.push(secondsOfAudio(30));       // cap is 10s
    assert.ok(pacer.stats().dropped > 0);
    assert.ok(pacer.stats().queuedMs <= 10_100, `queue held ${pacer.stats().queuedMs}ms`);
    advance(60_000);
    pacer.stop();
    const total = rec.totalBytes() / (RATE * 2) * 1000;
    assert.ok(total <= 10_200, `emitted ${total}ms from a 10s-capped queue`);
  });

  test('a socket that throws on every frame stops the pacer instead of looping', () => {
    let calls = 0;
    const errors = [];
    const pacer = createPcmStreamPacer({
      sampleRate: RATE,
      frameMs: 100,
      send: () => { calls += 1; throw new Error('socket closed'); },
      onError: (e) => errors.push(e.message),
    });
    pacer.start();
    pacer.push(secondsOfAudio(10));
    advance(10_000);

    assert.equal(calls, 3, 'gives up after 3 consecutive failures');
    assert.equal(errors.length, 3);
    assert.equal(pacer.isRunning(), false);
  });
});
