// backend/src/services/voice/__tests__/ambiencePump.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAmbiencePump } from '../ambiencePump.js';
import { ULAW_FRAME_BYTES, decodeUlaw, encodeUlaw, rmsDbfs } from '../ambience.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Loud tone standing in for engine speech, as µ-law. */
const speechFrames = (n) => {
  const s = new Int16Array(ULAW_FRAME_BYTES * n);
  for (let i = 0; i < s.length; i++) s[i] = Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / 8000));
  return encodeUlaw(s);
};

describe('ambiencePump', () => {
  it('returns null for a non-synthesizable preset so the caller keeps passthrough', () => {
    assert.equal(createAmbiencePump({ presetName: 'None', send: () => {} }), null);
    assert.equal(createAmbiencePump({ presetName: undefined, send: () => {} }), null);
  });

  it('emits realtime-paced 160-byte frames', async () => {
    const frames = [];
    const pump = createAmbiencePump({ presetName: 'Office', send: (f) => frames.push(f) });
    pump.start();
    await sleep(1000);
    pump.stop();
    // 50 fps; allow generous slack for timer jitter on a loaded machine.
    assert.ok(frames.length >= 35 && frames.length <= 60, `emitted ${frames.length} frames in 1s`);
    for (const f of frames) assert.equal(f.length, ULAW_FRAME_BYTES);
  });

  it('plays the bed continuously while the engine is idle', async () => {
    const frames = [];
    const pump = createAmbiencePump({ presetName: 'Office', send: (f) => frames.push(f) });
    pump.start();
    await sleep(200);
    pump.stop();
    assert.ok(frames.length > 0);
    // Every frame carries signal — silence here would mean the bed stopped.
    for (const f of frames) assert.ok(rmsDbfs(decodeUlaw(f)) > -70, 'bed frame was silent');
  });

  it('mixes engine audio in, at engine level', async () => {
    const frames = [];
    const pump = createAmbiencePump({ presetName: 'Office', send: (f) => frames.push(f) });
    pump.start();
    pump.push(speechFrames(5));
    await sleep(200);
    pump.stop();
    const loud = frames.filter((f) => rmsDbfs(decodeUlaw(f)) > -25);
    assert.ok(loud.length >= 3, `expected speech-level frames, got ${loud.length}`);
  });

  it('flush() drops queued speech so barge-in cannot resurrect it', async () => {
    const frames = [];
    const pump = createAmbiencePump({ presetName: 'Office', send: (f) => frames.push(f) });
    pump.start();
    pump.push(speechFrames(100)); // 2s of speech queued
    pump.flush();                 // caller interrupts immediately
    frames.length = 0;
    await sleep(200);
    pump.stop();
    assert.ok(frames.length > 0, 'bed must keep playing through a barge-in');
    for (const f of frames) {
      assert.ok(rmsDbfs(decodeUlaw(f)) < -25, 'interrupted speech was emitted after flush');
    }
  });

  it('caps the queue instead of growing without bound', () => {
    const pump = createAmbiencePump({ presetName: 'Office', send: () => {} });
    pump.start();
    for (let i = 0; i < 40; i++) pump.push(speechFrames(50)); // 2000 frames pushed
    pump.stop();
    const s = pump.stats();
    assert.ok(s.queuedFrames <= 500, `queue grew to ${s.queuedFrames} frames`);
    assert.ok(s.dropped > 0, 'expected overflow to be counted');
  });

  it('stop() is idempotent and silences the pump', async () => {
    let count = 0;
    const pump = createAmbiencePump({ presetName: 'Office', send: () => { count += 1; } });
    pump.start();
    await sleep(100);
    pump.stop();
    pump.stop();               // cleanup() re-enters; must not throw
    assert.equal(pump.isRunning(), false);
    const after = count;
    await sleep(100);
    assert.equal(count, after, 'frames were emitted after stop()');
  });

  it('does not leak a timer across many start/stop cycles', async () => {
    for (let i = 0; i < 100; i++) {
      const pump = createAmbiencePump({ presetName: 'Office', send: () => {} });
      pump.start();
      pump.stop();
      assert.equal(pump.isRunning(), false);
    }
    // If intervals leaked, this many live timers would keep firing.
    await sleep(60);
    assert.ok(true);
  });

  it('stops itself when the socket keeps rejecting frames', async () => {
    const pump = createAmbiencePump({
      presetName: 'Office',
      send: () => { throw new Error('socket closed'); },
      onError: () => {},
    });
    pump.start();
    await sleep(150);
    assert.equal(pump.isRunning(), false, 'pump should give up after repeated send failures');
  });

  it('ignores push() before start and after stop', () => {
    const pump = createAmbiencePump({ presetName: 'Office', send: () => {} });
    pump.push(speechFrames(1));
    assert.equal(pump.stats().queuedFrames, 0);
    pump.start();
    pump.stop();
    pump.push(speechFrames(1));
    assert.equal(pump.stats().queuedFrames, 0);
  });

  // ── The bed must not read as "the agent is speaking" ──────────────────────
  //
  // THE REGRESSION. This clock never stops, so it emits a frame every 20ms for
  // the whole call whether or not there is anything to say. The modular phone
  // bridge fed every one of those frames to playoutWindow.noteFrame(), which
  // pushes `endsAt` 20ms further out each time — so isSpeaking() was true for
  // the entire call on any agent with an ambience preset. That flag gates
  // end-of-turn, caller-audio capture and the noise floor, so the agent spoke
  // its greeting and then never heard another word. Phone only; the browser
  // bridge has no pump.
  it('marks bed-only frames as speech:false and mixed frames as speech:true', async () => {
    const seen = [];
    const pump = createAmbiencePump({
      presetName: 'Office',
      send: (f, meta) => seen.push(meta),
    });
    pump.start();
    await sleep(120);
    const quiet = seen.length;
    assert.ok(quiet > 0, 'the bed should be playing');
    assert.ok(seen.every((m) => m && m.speech === false),
      'a bed-only frame carries no agent audio and must not count as playout');

    // Now the agent actually says something.
    pump.push(speechFrames(3));
    await sleep(120);
    const withSpeech = seen.slice(quiet);
    assert.ok(withSpeech.some((m) => m.speech === true),
      'frames carrying engine audio must be reported as speech');

    // ...and once it runs out, the bed goes back to being just a bed, which is
    // what lets isSpeaking() fall false and the caller be heard again.
    await sleep(150);
    assert.equal(seen[seen.length - 1].speech, false);
    pump.stop();
  });
});
