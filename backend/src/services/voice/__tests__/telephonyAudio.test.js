// Tests for the modular pipeline's telephony audio glue.
//
// These matter because every failure mode here is inaudible in code review and
// obvious on a live call: a wrong resample ratio makes the agent sound like a
// chipmunk, a short frame makes the far end stutter, and an unstripped WAV
// header is 44 bytes of white noise before every sentence.

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resamplePcm16,
  bufferToPcm16,
  parseWavOrRaw,
  pcmToTelephonyUlaw,
  createFrameSplitter,
  createPcmUlawConverter,
  supportsTelephony,
  telephonyOutputFormat,
  playableWithFormat,
  PHONE_SAMPLE_RATE,
  ULAW_FRAME_BYTES,
} from '../telephonyAudio.js';

const pcmBuffer = (samples) => {
  const buf = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => buf.writeInt16LE(s, i * 2));
  return buf;
};

/** Minimal RIFF/WAVE container, optionally with a junk chunk before `data`. */
function wav(pcm, sampleRate, { withListChunk = false } = {}) {
  const list = withListChunk
    ? Buffer.concat([
      Buffer.from('LIST', 'ascii'),
      (() => { const b = Buffer.alloc(4); b.writeUInt32LE(4); return b; })(),
      Buffer.from('INFO', 'ascii'),
    ])
    : Buffer.alloc(0);

  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0);
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(sampleRate * 2, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);

  const dataHeader = Buffer.alloc(8);
  dataHeader.write('data', 0);
  dataHeader.writeUInt32LE(pcm.length, 4);

  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), fmt, list, dataHeader, pcm]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0);
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

test('resamplePcm16 returns the same buffer when rates match', () => {
  const input = new Int16Array([1, 2, 3, 4]);
  assert.equal(resamplePcm16(input, 8000, 8000), input);
});

test('resamplePcm16 downsamples 24k to 8k at exactly one third the length', () => {
  const input = new Int16Array(2400);
  const out = resamplePcm16(input, 24000, PHONE_SAMPLE_RATE);
  assert.equal(out.length, 800);
});

test('resamplePcm16 never reads past the end (no NaN at the boundary)', () => {
  // 3 -> 2 samples forces the final interpolation to want input[idx + 1] on the
  // last sample. Reading undefined there yields NaN, which rounds to 0 after a
  // full-scale swing — an audible tick at every chunk seam.
  const out = resamplePcm16(new Int16Array([1000, 2000, 3000]), 3, 2);
  for (const s of out) assert.ok(Number.isFinite(s), `non-finite sample: ${s}`);
});

test('resamplePcm16 handles empty input', () => {
  assert.equal(resamplePcm16(new Int16Array(0), 24000, 8000).length, 0);
});

test('bufferToPcm16 drops a trailing half sample rather than throwing', () => {
  // A 16-bit sample split across two socket chunks leaves an odd byte count.
  const odd = Buffer.concat([pcmBuffer([100, 200]), Buffer.from([0x7f])]);
  const pcm = bufferToPcm16(odd);
  assert.equal(pcm.length, 2);
  assert.equal(pcm[0], 100);
  assert.equal(pcm[1], 200);
});

test('parseWavOrRaw reads the declared sample rate and strips the header', () => {
  const pcm = pcmBuffer([1, -1, 2, -2]);
  const { pcm: out, sampleRate } = parseWavOrRaw(wav(pcm, 22050));
  assert.equal(sampleRate, 22050);
  assert.deepEqual([...out], [1, -1, 2, -2]);
});

test('parseWavOrRaw walks past a LIST chunk to find data', () => {
  const pcm = pcmBuffer([5, 6, 7]);
  const { pcm: out } = parseWavOrRaw(wav(pcm, 24000, { withListChunk: true }));
  assert.deepEqual([...out], [5, 6, 7], 'metadata chunk was treated as audio');
});

test('parseWavOrRaw passes raw PCM through and reports no sample rate', () => {
  const { pcm, sampleRate } = parseWavOrRaw(pcmBuffer([9, 8]));
  assert.equal(sampleRate, null);
  assert.deepEqual([...pcm], [9, 8]);
});

test('pcmToTelephonyUlaw prefers the WAV header rate over the caller default', () => {
  // 2400 samples at 24k is 100ms => 800 bytes of 8k mu-law. If the header were
  // ignored and the (wrong) 8000 default used, we would get 2400 bytes and the
  // agent would sound three times too slow.
  const out = pcmToTelephonyUlaw(wav(pcmBuffer(new Array(2400).fill(0)), 24000), 8000);
  assert.equal(out.length, 800);
});

test('pcmToTelephonyUlaw falls back to the supplied rate for raw PCM', () => {
  const out = pcmToTelephonyUlaw(pcmBuffer(new Array(1600).fill(0)), 16000);
  assert.equal(out.length, 800);
});

test('createFrameSplitter emits only whole 20ms frames and holds the remainder', () => {
  const s = createFrameSplitter();
  const frames = s.push(Buffer.alloc(350));
  assert.equal(frames.length, 2);
  frames.forEach((f) => assert.equal(f.length, ULAW_FRAME_BYTES));
  assert.equal(s.pendingBytes, 350 - 2 * ULAW_FRAME_BYTES);
});

test('createFrameSplitter joins a sample split across two chunks', () => {
  const s = createFrameSplitter();
  assert.equal(s.push(Buffer.alloc(100)).length, 0);
  assert.equal(s.push(Buffer.alloc(100)).length, 1, 'buffered bytes were dropped');
});

test('createFrameSplitter flush pads with mu-law silence, not zeroes', () => {
  const s = createFrameSplitter();
  s.push(Buffer.alloc(10, 0x20));
  const tail = s.flush();
  assert.equal(tail.length, ULAW_FRAME_BYTES);
  // 0x00 is full-scale in mu-law; padding with it would emit a loud click.
  assert.equal(tail[ULAW_FRAME_BYTES - 1], 0xff);
  assert.equal(s.flush(), null, 'flush must be idempotent');
});

test('createFrameSplitter reset drops buffered audio for barge-in', () => {
  const s = createFrameSplitter();
  s.push(Buffer.alloc(100));
  s.reset();
  assert.equal(s.pendingBytes, 0);
  assert.equal(s.flush(), null);
});

test('telephony capability is case-insensitive and rejects unknowns', () => {
  assert.ok(supportsTelephony('ElevenLabs'));
  assert.ok(supportsTelephony('elevenlabs'));
  assert.equal(supportsTelephony('Whisper'), false);
  assert.equal(supportsTelephony(undefined), false);
});

test('ElevenLabs is native mu-law', () => {
  assert.equal(telephonyOutputFormat('ElevenLabs').kind, 'native');
  assert.equal(telephonyOutputFormat('ElevenLabs').format, 'ulaw_8000');
  assert.equal(telephonyOutputFormat('Nope'), null);
});

test('Sarvam is native mu-law', () => {
  // Added only after sarvam.provider.js was taught opts.audioFormat AND the
  // live endpoint was checked: output_audio_codec 'mulaw' + speech_sample_rate
  // 8000 returns raw headerless G.711 at 8000 bytes/second (audio/mulaw).
  // This row is what lets an Indian-language agent take a phone call at all —
  // every Sarvam-voiced agent was refused by the phone bridge without it.
  assert.ok(supportsTelephony('Sarvam'));
  assert.equal(telephonyOutputFormat('Sarvam').kind, 'native');
  assert.equal(telephonyOutputFormat('sarvam').format, 'mulaw');
});

test('a native bridge only plays segments synthesized in its own format', () => {
  const elevenlabs = telephonyOutputFormat('ElevenLabs');

  assert.equal(playableWithFormat('ulaw_8000', elevenlabs), true);

  // THE BUG THIS EXISTS FOR. The pre-synthesized ack clip ("Mm-hmm") was cached
  // without a format, so a phone call that had asked TTS for G.711 was handed
  // MP3 bytes and put them on the wire as if they were mu-law. The caller heard
  // static in front of every reply, and the real audio played behind it — which
  // is also most of why phone calls felt slower than web calls.
  assert.equal(playableWithFormat(null, elevenlabs), false);
  assert.equal(playableWithFormat(undefined, elevenlabs), false);
  assert.equal(playableWithFormat('mp3_44100_128', elevenlabs), false);

  // Two native providers, two names for mu-law. A segment made for one carrier
  // path is not playable on the other.
  assert.equal(playableWithFormat('mulaw', elevenlabs), false);
  assert.equal(playableWithFormat('ulaw_8000', telephonyOutputFormat('Sarvam')), false);

  // A CONVERTING bridge is now held to the same rule, and this assertion flipped
  // on purpose when Fish Audio became the first real `pcm` row. While the table
  // held only native providers, waving anything through here was harmless. It
  // stopped being harmless the moment a bridge existed that would take those
  // bytes and run them through the PCM converter: MP3 reinterpreted as 16-bit
  // PCM is white noise on the call, which is the exact failure the native half
  // of this test was written for.
  assert.equal(playableWithFormat(null, { kind: 'pcm', format: 'pcm_24000' }), false);
  assert.equal(playableWithFormat('pcm_24000', { kind: 'pcm', format: 'pcm_24000' }), true);

  // No format table at all (a transport that does no conversion) still opts out.
  assert.equal(playableWithFormat(null, null), true);
});

test('providers that ignore opts.audioFormat are NOT advertised as capable', () => {
  // Guard rail, not a preference. These modules hardcode MP3; if someone adds
  // them to TELEPHONY_TTS without teaching the provider the option first, the
  // bridge ships MP3 bytes as G.711 and every recipient of a campaign hears
  // noise. Adding a row here must be accompanied by a provider change — which
  // is exactly the sequence Sarvam went through above.
  //
  // Fish Audio was on this list until 2026-08-19 and graduated off it the right
  // way round: fishaudio.provider.js now honours opts.audioFormat (and the rate
  // that goes with it), verified against the live API, and only then was the row
  // added. See the 'Fish Audio on a carrier' suite below.
  for (const p of ['Cartesia', 'Google']) {
    assert.equal(
      supportsTelephony(p), false,
      `${p} is advertised as telephony-capable — does its provider honour opts.audioFormat yet?`,
    );
  }
});

describe('Fish Audio on a carrier', () => {
  it('is telephony-capable via raw PCM at the line rate', () => {
    const fmt = telephonyOutputFormat('FishAudio');
    assert.ok(fmt, 'FishAudio must resolve a telephony format');
    assert.deepEqual(fmt, { kind: 'pcm', format: 'pcm', rate: 8000 });
    assert.equal(supportsTelephony('fishaudio'), true, 'lookup is case-insensitive');
  });

  it('refuses a segment that came back in the wrong format on a pcm bridge', () => {
    const fmt = telephonyOutputFormat('FishAudio');
    // The whole point: MP3 bytes fed to the PCM converter are noise on the line.
    assert.equal(playableWithFormat('mp3', fmt), false);
    assert.equal(playableWithFormat(null, fmt), false);
    assert.equal(playableWithFormat('pcm', fmt), true);
  });
});

describe('createPcmUlawConverter', () => {
  /** 200ms of a 300Hz tone at 8kHz — real signal, so a byte shift is obvious. */
  const tone = () => {
    const samples = 1600;
    const buf = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i += 1) {
      buf.writeInt16LE(Math.round(12000 * Math.sin((2 * Math.PI * 300 * i) / 8000)), i * 2);
    }
    return buf;
  };

  it('matches whole-buffer conversion when chunks split mid-sample', () => {
    const pcm = tone();
    const expected = pcmToTelephonyUlaw(pcm, 8000);

    const conv = createPcmUlawConverter(8000);
    const parts = [];
    // 333 is odd on purpose: every chunk boundary lands inside a 16-bit sample.
    for (let i = 0; i < pcm.length; i += 333) parts.push(conv.push(pcm.subarray(i, i + 333)));

    assert.ok(Buffer.concat(parts).equals(expected), 'a carried byte must not shift the stream');
  });

  it('survives a Buffer whose byteOffset is odd', () => {
    // Int16Array throws on an odd byteOffset; a subarray at an odd index is the
    // ordinary way to get one out of a pooled Buffer.
    const backing = Buffer.concat([Buffer.from([0x00]), tone()]);
    const odd = backing.subarray(1);
    assert.equal(odd.byteOffset % 2, 1, 'the fixture must actually be misaligned');
    const conv = createPcmUlawConverter(8000);
    assert.doesNotThrow(() => conv.push(odd));
  });

  it('holds a lone byte back rather than emitting a bogus sample', () => {
    const conv = createPcmUlawConverter(8000);
    assert.equal(conv.push(Buffer.from([0x11])).length, 0, 'half a sample is not audio');
    assert.equal(conv.push(Buffer.from([0x22])).length, 1, 'completed by the next chunk');
  });

  it('drops the carry on reset so one segment cannot bleed into the next', () => {
    const conv = createPcmUlawConverter(8000);
    conv.push(Buffer.from([0x11]));
    conv.reset();
    assert.equal(conv.push(Buffer.from([0x22])).length, 0, 'the stale half sample is gone');
  });
});
