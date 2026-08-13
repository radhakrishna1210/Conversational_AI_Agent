// backend/src/services/voice/__tests__/callRecorder.test.js
//
// The failure this guards against is not "no file" — it is a file that plays
// but lies about the call: the agent's speech stacked into the front of a turn
// because outbound audio ships ~5x faster than it plays. That is invisible
// unless the sample OFFSETS are asserted, so these tests read the rendered PCM
// back rather than checking sizes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCallRecorder, encodeWav } from '../callRecorder.js';
import { encodeUlaw, decodeUlaw } from '../ambience.js';

const RATE = 8000;
const HEADER = 44;

/** `ms` of mu-law at a constant amplitude, so a region is identifiable by level. */
const tone = (ms, amplitude) =>
  encodeUlaw(Int16Array.from({ length: Math.round((ms / 1000) * RATE) }, () => amplitude));

/** Rendered WAV -> Int16Array of samples. */
const samplesOf = (wav) => {
  const pcm = new Int16Array(wav.length - HEADER >> 1);
  for (let i = 0; i < pcm.length; i++) pcm[i] = wav.readInt16LE(HEADER + i * 2);
  return pcm;
};

const atMs = (ms) => Math.round((ms / 1000) * RATE);

/** Peak absolute level over a window, used to say "there is audio here". */
const peak = (pcm, fromMs, toMs) => {
  let max = 0;
  for (let i = atMs(fromMs); i < Math.min(atMs(toMs), pcm.length); i++) {
    max = Math.max(max, Math.abs(pcm[i]));
  }
  return max;
};

test('produces a valid PCM16 mono WAV header at 8kHz', () => {
  const rec = createCallRecorder();
  rec.writeInbound(tone(100, 8000), 0);
  const wav = rec.toWav();

  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1, 'format should be uncompressed PCM');
  assert.equal(wav.readUInt16LE(22), 1, 'should be mono');
  assert.equal(wav.readUInt32LE(24), RATE);
  assert.equal(wav.readUInt16LE(34), 16, 'bits per sample');
  // Declared sizes must match the real payload or players read past the end.
  assert.equal(wav.readUInt32LE(40), wav.length - HEADER);
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
});

test('places audio at its stated offset, leaving silence in the gaps', () => {
  const rec = createCallRecorder();
  // Caller speaks at 0-100ms, agent replies at 500-600ms.
  rec.writeInbound(tone(100, 6000), 0);
  rec.writeOutbound(tone(100, 6000), 500);

  const pcm = samplesOf(rec.toWav());

  assert.ok(peak(pcm, 0, 100) > 5000, 'caller audio missing at 0ms');
  assert.equal(peak(pcm, 150, 450), 0, 'the gap between turns should be silent');
  assert.ok(peak(pcm, 500, 600) > 5000, 'agent audio missing at 500ms');
});

test('outbound written at playout time does not stack into the send moment', () => {
  // The real bug this prevents: a 3-second reply generated in ~600ms. If the
  // recorder used send time, all of it would land in the first 600ms and the
  // recording would have the agent talking over the caller.
  const rec = createCallRecorder();
  for (let i = 0; i < 15; i++) rec.writeOutbound(tone(200, 6000), 1000 + i * 200);

  const pcm = samplesOf(rec.toWav());

  // Audio should span 1000ms -> 4000ms, continuously.
  assert.equal(peak(pcm, 0, 990), 0, 'nothing should precede the reply');
  assert.ok(peak(pcm, 1000, 1200) > 5000);
  assert.ok(peak(pcm, 2400, 2600) > 5000, 'middle of the reply is missing');
  assert.ok(peak(pcm, 3800, 4000) > 5000, 'end of the reply is missing');
  assert.ok(Math.abs(pcm.length - atMs(4000)) < atMs(20), 'recording should end at ~4000ms');
});

test('overlapping speech is summed, not replaced', () => {
  const rec = createCallRecorder();
  rec.writeInbound(tone(100, 4000), 0);
  rec.writeOutbound(tone(100, 4000), 0);

  const pcm = samplesOf(rec.toWav());
  // mu-law is lossy, so assert the sum is clearly above either part alone
  // rather than exactly 8000.
  assert.ok(peak(pcm, 0, 100) > 6500, 'both directions should be audible together');
});

test('summing does not wrap around on loud simultaneous speech', () => {
  const rec = createCallRecorder();
  rec.writeInbound(tone(100, 30000), 0);
  rec.writeOutbound(tone(100, 30000), 0);

  const pcm = samplesOf(rec.toWav());
  // Without clamping, 30000+30000 overflows Int16 to a large NEGATIVE value —
  // heard as a violent crackle exactly where two people talk over each other.
  for (let i = 0; i < atMs(100); i++) assert.ok(pcm[i] > 0, `sample ${i} wrapped negative`);
  assert.ok(peak(pcm, 0, 100) >= 32000, 'should clamp to full scale');
});

test('dropOutboundAfter removes barged audio the caller never heard', () => {
  const rec = createCallRecorder();
  rec.writeOutbound(tone(500, 6000), 1000);   // agent speaks 1000-1500ms
  rec.dropOutboundAfter(1200);                // caller interrupts at 1200ms

  const pcm = samplesOf(rec.toWav());
  assert.ok(peak(pcm, 1000, 1150) > 5000, 'audio before the barge should survive');
  assert.equal(peak(pcm, 1250, 1500), 0, 'audio after the barge should be gone');
});

test('dropOutboundAfter leaves caller audio untouched', () => {
  const rec = createCallRecorder();
  rec.writeInbound(tone(500, 6000), 1000);
  rec.writeOutbound(tone(500, 6000), 1000);
  rec.dropOutboundAfter(1100);

  const pcm = samplesOf(rec.toWav());
  // The caller is the one still talking through a barge — cutting their audio
  // would delete the interruption itself.
  assert.ok(peak(pcm, 1300, 1500) > 5000, 'caller audio was wrongly truncated');
});

test('frames are copied, so a reused caller buffer cannot corrupt the recording', () => {
  // createFrameSplitter hands out subarray views onto a buffer it reuses; the
  // bridge passes those straight in.
  const rec = createCallRecorder();
  const shared = tone(100, 6000);
  rec.writeInbound(shared, 0);
  shared.fill(0xff); // mu-law silence — what a reused buffer would look like

  const pcm = samplesOf(rec.toWav());
  assert.ok(peak(pcm, 0, 100) > 5000, 'recording was aliased to the caller buffer');
});

test('reports no audio for a call where nothing was captured', () => {
  const rec = createCallRecorder();
  assert.equal(rec.hasAudio, false);
  assert.equal(rec.toWav(), null);
});

test('refuses writes past the length cap instead of growing without bound', () => {
  const rec = createCallRecorder({ maxMs: 1000 });
  rec.writeInbound(tone(100, 6000), 0);
  rec.writeInbound(tone(100, 6000), 5000); // past the cap

  assert.equal(rec.wasCapped, true);
  const pcm = samplesOf(rec.toWav());
  assert.ok(pcm.length <= atMs(1000), 'recording exceeded the cap');
  assert.ok(peak(pcm, 0, 100) > 5000, 'audio before the cap should still be kept');
});

test('encodeWav round-trips sample values', () => {
  const pcm = Int16Array.from([0, 1000, -1000, 32767, -32768]);
  const wav = encodeWav(pcm, RATE);
  const out = samplesOf(wav);
  assert.deepEqual(Array.from(out), Array.from(pcm));
});

test('mu-law decode of silence is silent', () => {
  // 0xFF is mu-law zero; the frame splitter pads short tails with it, so a
  // non-zero decode here would put a DC click at the end of every utterance.
  const decoded = decodeUlaw(Buffer.alloc(160, 0xff));
  assert.ok(Math.max(...decoded.map(Math.abs)) <= 8, 'mu-law silence should decode near zero');
});
