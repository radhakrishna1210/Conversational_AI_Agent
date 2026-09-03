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
});
