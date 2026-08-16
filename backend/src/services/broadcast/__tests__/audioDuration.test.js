// Duration parsing. Pure functions over synthetic bytes, no DB, no network.
//
// This matters more than its size suggests: duration is what every broadcast
// cost estimate, every charge and the dispatcher's pacing are computed from. A
// silent zero here would quote every send as free.

import test from 'node:test';
import assert from 'node:assert/strict';
import { wavDurationSec, mp3DurationSec, measureDurationSec } from '../audioDuration.js';

/** Minimal PCM WAV: 8kHz, mono, 16-bit, `seconds` long. */
function makeWav(seconds, { sampleRate = 8000, channels = 1, bits = 16, extraChunk = false } = {}) {
  const byteRate = sampleRate * channels * (bits / 8);
  const dataBytes = Math.round(byteRate * seconds);
  const pad = extraChunk ? 12 : 0;
  const buf = Buffer.alloc(44 + pad + dataBytes);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + pad + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');

  let o = 12;
  if (extraChunk) {
    // A LIST chunk before `fmt `, which a real exporter will happily write and
    // a parser that assumes the layout will choke on.
    buf.write('LIST', o, 'ascii');
    buf.writeUInt32LE(4, o + 4);
    buf.write('INFO', o + 8, 'ascii');
    o += 12;
  }

  buf.write('fmt ', o, 'ascii');
  buf.writeUInt32LE(16, o + 4);
  buf.writeUInt16LE(1, o + 8);            // PCM
  buf.writeUInt16LE(channels, o + 10);
  buf.writeUInt32LE(sampleRate, o + 12);
  buf.writeUInt32LE(byteRate, o + 16);
  buf.writeUInt16LE(channels * (bits / 8), o + 20);
  buf.writeUInt16LE(bits, o + 22);
  o += 24;

  buf.write('data', o, 'ascii');
  buf.writeUInt32LE(dataBytes, o + 4);
  return buf;
}

/** `frames` MPEG-1 Layer III frames at 128kbps/44.1kHz — 1152 samples each. */
function makeMp3(frames, { withId3 = false } = {}) {
  const frameBytes = Math.floor((1152 / 8) * 128_000 / 44_100); // 417
  const id3 = withId3 ? 10 + 100 : 0;
  const buf = Buffer.alloc(id3 + frameBytes * frames);

  if (withId3) {
    buf.write('ID3', 0, 'ascii');
    // Syncsafe size of the tag body: 100 bytes.
    buf[6] = 0; buf[7] = 0; buf[8] = 0; buf[9] = 100;
  }

  for (let i = 0; i < frames; i += 1) {
    const at = id3 + i * frameBytes;
    buf[at] = 0xff;
    buf[at + 1] = 0xfb;      // MPEG-1, Layer III, no CRC
    buf[at + 2] = 0x90;      // bitrate index 9 (128k), sample rate index 0 (44.1k)
    buf[at + 3] = 0xc0;
  }
  return buf;
}

test('WAV duration comes from the header, exactly', () => {
  assert.equal(wavDurationSec(makeWav(30)), 30);
  assert.equal(wavDurationSec(makeWav(2.5)), 2.5);
});

test('WAV parsing walks the chunk list rather than assuming the layout', () => {
  // A file with a LIST chunk before `fmt ` is valid audio. Assuming fmt sits at
  // byte 12 reports it as unreadable, and an unreadable recording is refused at
  // upload — so this is the difference between accepting and rejecting a file
  // that plays fine.
  assert.equal(wavDurationSec(makeWav(10, { extraChunk: true })), 10);
});

test('WAV parsing rejects non-RIFF bytes rather than guessing', () => {
  assert.equal(wavDurationSec(Buffer.from('not audio at all, really')), null);
});

test('MP3 duration is summed from frame headers', () => {
  // 1152 samples / 44100 Hz = 26.12ms per frame.
  const seconds = mp3DurationSec(makeMp3(100));
  assert.ok(Math.abs(seconds - (100 * 1152) / 44_100) < 0.001, `got ${seconds}`);
});

test('MP3 parsing skips an ID3v2 tag instead of hunting through it', () => {
  const tagged = mp3DurationSec(makeMp3(50, { withId3: true }));
  const bare = mp3DurationSec(makeMp3(50));
  assert.ok(Math.abs(tagged - bare) < 0.001, `tagged ${tagged} vs bare ${bare}`);
});

test('measure rounds UP — a 30.2s clip must never be priced as 30s', () => {
  assert.equal(measureDurationSec(makeWav(30.2), 'audio/wav'), 31);
  assert.equal(measureDurationSec(makeWav(30), 'audio/wav'), 30);
});

test('measure takes the longer of parsed and browser-reported', () => {
  const wav = makeWav(10);
  // Under-stating duration under-quotes the cost and under-paces the dialer;
  // both failures cost money, so the longer value wins.
  assert.equal(measureDurationSec(wav, 'audio/wav', 42), 42);
  assert.equal(measureDurationSec(wav, 'audio/wav', 3), 10);
});

test('measure falls back to sniffing when the MIME type is wrong', () => {
  // Browsers send 'application/octet-stream' for a .wav often enough that
  // trusting the header alone would reject real uploads.
  assert.equal(measureDurationSec(makeWav(5), 'application/octet-stream'), 5);
});

test('unreadable audio measures 0, so the caller can refuse it', () => {
  assert.equal(measureDurationSec(Buffer.alloc(64), 'audio/mpeg'), 0);
});
