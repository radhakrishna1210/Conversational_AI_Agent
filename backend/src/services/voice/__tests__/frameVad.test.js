// What these pin: the server-side frame VAD must report the caller's speech
// end from energy alone, adapt to a noisy line without calling the noise
// speech, and never count a silent line's dither as a voice.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameVad } from '../frameVad.js';

const RATE = 24000;
const FRAME = (RATE * 20) / 1000; // samples per 20ms
function frame(amplitude, seed = 1) {
  const b = Buffer.alloc(FRAME * 2);
  let x = seed;
  for (let i = 0; i < FRAME; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff; // deterministic noise
    const n = (x / 0x7fffffff) * 2 - 1;
    const v = Math.round(amplitude * n * 32767);
    b.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i * 2);
  }
  return b;
}
const clock = () => { let t = 0; return { now: () => t, tick: (ms = 20) => { t += ms; } }; };

describe('createFrameVad', () => {
  test('silence stays silence; speech is detected after a short onset; silenceMs counts from the last voiced frame', () => {
    const c = clock();
    const vad = createFrameVad({ now: c.now });
    for (let i = 0; i < 25; i++) { vad.push(frame(0.001, i)); c.tick(); }
    assert.equal(vad.heardSpeech(), false);
    assert.equal(vad.silenceMs(), null);
    // 300ms of speech-level energy
    for (let i = 0; i < 15; i++) { vad.push(frame(0.2, 100 + i)); c.tick(); }
    assert.equal(vad.heardSpeech(), true);
    const end = vad.lastVoicedAt();
    // then quiet again
    for (let i = 0; i < 20; i++) { vad.push(frame(0.001, 200 + i)); c.tick(); }
    assert.equal(vad.lastVoicedAt(), end, 'speech end does not move during silence');
    // 20 quiet frames plus the tick after the last voiced one.
    assert.equal(vad.silenceMs(), 21 * 20);
  });

  test('a single loud click is not speech', () => {
    const c = clock();
    const vad = createFrameVad({ now: c.now });
    for (let i = 0; i < 10; i++) { vad.push(frame(0.001, i)); c.tick(); }
    vad.push(frame(0.5, 99)); c.tick();
    for (let i = 0; i < 10; i++) { vad.push(frame(0.001, 300 + i)); c.tick(); }
    assert.equal(vad.heardSpeech(), false);
  });

  test('a noisy line raises the floor; speech must clear it, and the noise itself does not count', () => {
    const c = clock();
    const vad = createFrameVad({ now: c.now });
    for (let i = 0; i < 100; i++) { vad.push(frame(0.02, i)); c.tick(); }
    assert.equal(vad.heardSpeech(), false, 'steady noise learned as floor');
    assert.ok(vad.noiseFloor() > 0.01);
    for (let i = 0; i < 10; i++) { vad.push(frame(0.3, 500 + i)); c.tick(); }
    assert.equal(vad.heardSpeech(), true);
  });

  test('resetTurn forgets speech but keeps the learned floor', () => {
    const c = clock();
    const vad = createFrameVad({ now: c.now });
    for (let i = 0; i < 50; i++) { vad.push(frame(0.02, i)); c.tick(); }
    for (let i = 0; i < 10; i++) { vad.push(frame(0.3, 500 + i)); c.tick(); }
    const floor = vad.noiseFloor();
    vad.resetTurn();
    assert.equal(vad.heardSpeech(), false);
    assert.equal(vad.noiseFloor(), floor);
  });

  // The phone bridge drives the detector through pushRms(), because it already
  // took an RMS off the frame for barge-in and holds its samples as an
  // Int16Array. If the two entry points could disagree, a phone call would
  // endpoint differently from a web call on identical audio — the exact
  // divergence wiring the detector into the bridge was meant to remove.
  test('pushRms decides identically to push, frame for frame', () => {
    const rmsOf = (buf) => {
      let acc = 0;
      const n = buf.length >> 1;
      for (let i = 0; i < buf.length - 1; i += 2) {
        const v = buf.readInt16LE(i) / 32768;
        acc += v * v;
      }
      return Math.sqrt(acc / n);
    };

    const cA = clock();
    const cB = clock();
    const viaBuf = createFrameVad({ now: cA.now });
    const viaRms = createFrameVad({ now: cB.now });

    // A realistic turn: room tone, speech, then the pause we speculate on.
    const script = [
      ...Array.from({ length: 30 }, (_, i) => [0.015, i]),
      ...Array.from({ length: 20 }, (_, i) => [0.25, 100 + i]),
      ...Array.from({ length: 25 }, (_, i) => [0.015, 300 + i]),
    ];

    for (const [amp, seed] of script) {
      const f = frame(amp, seed);
      const a = viaBuf.push(f);
      const b = viaRms.pushRms(rmsOf(f));
      assert.equal(b.voiced, a.voiced);
      assert.equal(b.speaking, a.speaking);
      assert.equal(b.floor, a.floor);
      cA.tick(); cB.tick();
    }

    assert.equal(viaRms.heardSpeech(), viaBuf.heardSpeech());
    assert.equal(viaRms.silenceMs(), viaBuf.silenceMs());
    assert.equal(viaRms.lastVoicedAt(), viaBuf.lastVoicedAt());
    // And the pause is long enough that the bridge would have speculated.
    assert.ok(viaRms.silenceMs() >= 300, 'a 500ms pause clears the balanced endpointing window');
  });
});
