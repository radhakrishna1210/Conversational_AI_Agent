// A short answer after a long agent reply is still speech.
//
// The failure these pin, measured on a live web call: the caller answers a
// question with one word, Deepgram transcribes it correctly, and the server
// throws the transcript away because its acoustic check reported the segment as
// silent. The agent then says nothing at all, so the caller repeats themselves
// two or three times until one attempt happens to be long enough.
//
// The cause was a statistic, not a threshold. peakRms was the 95th percentile
// of the WHOLE segment, which stops describing speech once speech is under 5%
// of it — the percentile lands inside the silence and reports the loudest thing
// in the buffer as the quietest. That became the NORMAL case when the caller's
// microphone started staying open during the agent's reply, because every
// turn's buffer then begins with the whole reply.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSpeech } from '../speechGate.js';

const SR = 48000;

/** Voiced-ish: a 140Hz buzz with harmonics under a syllable-rate envelope. */
const speech = (ms, amp = 0.25) => {
  const n = Math.floor((SR * ms) / 1000);
  const a = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const env = 0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t);
    const s = Math.sin(2 * Math.PI * 140 * t)
      + 0.5 * Math.sin(2 * Math.PI * 280 * t)
      + 0.25 * Math.sin(2 * Math.PI * 560 * t);
    a[i] = Math.max(-1, Math.min(1, (s / 1.75) * amp * env)) * 32767;
  }
  return Buffer.from(a.buffer);
};

/** What the caller's mic holds while the agent talks: near-nothing, post-AEC. */
const quiet = (ms, amp = 0.001) => {
  const n = Math.floor((SR * ms) / 1000);
  const a = new Int16Array(n);
  for (let i = 0; i < n; i += 1) a[i] = (Math.random() * 2 - 1) * amp * 32767;
  return Buffer.from(a.buffer);
};

describe('analyzeSpeech — low speech duty cycle', () => {
  test('a 1s reply after an 8s agent turn is speech', () => {
    const r = analyzeSpeech(Buffer.concat([quiet(8000), speech(1000)]), SR);
    assert.equal(r.hasSpeech, true);
  });

  test('a 400ms reply after an 8s agent turn is speech', () => {
    // 4.8% duty cycle — under the 5% at which the 95th percentile stops
    // measuring the speech at all. This is the exact case that was discarded.
    const r = analyzeSpeech(Buffer.concat([quiet(8000), speech(400)]), SR);
    assert.equal(r.hasSpeech, true, `discarded a real word (contrast=${r.contrast.toFixed(2)})`);
  });

  test('a 250ms reply after a 15s agent turn is speech', () => {
    const r = analyzeSpeech(Buffer.concat([quiet(15000), speech(250)]), SR);
    assert.equal(r.hasSpeech, true);
  });

  test('the loud level reflects the speech, not the silence around it', () => {
    const withPad = analyzeSpeech(Buffer.concat([quiet(8000), speech(400)]), SR);
    const without = analyzeSpeech(Buffer.concat([quiet(200), speech(400)]), SR);
    // Padding must not move the measured loud level by much; it used to collapse
    // it by two orders of magnitude.
    assert.ok(withPad.peakRms > without.peakRms * 0.5,
      `padding collapsed peakRms: ${without.peakRms.toFixed(4)} -> ${withPad.peakRms.toFixed(4)}`);
  });
});

describe('analyzeSpeech — still rejects what it always rejected', () => {
  test('pure silence is not speech', () => {
    assert.equal(analyzeSpeech(quiet(5000), SR).hasSpeech, false);
  });

  test('steady broadband noise is not speech', () => {
    // BUG-001: batch STT hallucinates stock filler on this, so it must not pass
    // just because the loud-frame population is now measured separately.
    assert.equal(analyzeSpeech(quiet(5000, 0.05), SR).hasSpeech, false);
  });

  test('a lone transient does not become a turn', () => {
    const r = analyzeSpeech(Buffer.concat([quiet(4000), speech(20), quiet(4000)]), SR);
    assert.equal(r.hasSpeech, false, 'a click must not clear the sustained-run bar');
  });
});
