// backend/src/services/voice/__tests__/ambience.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIENT_PRESETS,
  ULAW_FRAME_BYTES,
  ulawToLinear,
  linearToUlaw,
  decodeUlaw,
  encodeUlaw,
  renderAmbienceLoop,
  createAmbienceSource,
  mixUlawFrame,
  isAmbienceEnabled,
  rmsDbfs,
  SAMPLED_AMBIENT_PRESETS,
  ALL_AMBIENT_PRESET_NAMES,
  loadSampledBed,
  resolveAmbientMode,
  ambienceTagFor,
  TARGET_RMS_DBFS,
  bedSlug,
  presetForSlug,
} from '../ambience.js';

const PRESETS = Object.keys(AMBIENT_PRESETS);

describe('preset table', () => {
  it('matches the client list exactly', () => {
    // Duplicated in client/src/services/ambientSound.ts because there is no
    // shared package. Agents store the preset NAME, so a rename on either side
    // silently orphans saved agents — fail CI here instead.
    assert.deepEqual(PRESETS, ['Quiet Room', 'Office', 'Call Center', 'Static', 'Cafe', 'Street']);
  });
  it('pins the pre-rendered voice beds too — the client picker offers exactly these', () => {
    assert.deepEqual(Object.keys(SAMPLED_AMBIENT_PRESETS), ['Office Chatter', 'Call Center Chatter']);
    assert.deepEqual(ALL_AMBIENT_PRESET_NAMES, ['Quiet Room', 'Office', 'Call Center', 'Static', 'Cafe', 'Street', 'Office Chatter', 'Call Center Chatter']);
  });
});

describe('pre-rendered voice beds (Mode B)', () => {
  it('load at the bed level, are 24s, differ per variant, and are seam-free', () => {
    for (const [name, cfg] of Object.entries(SAMPLED_AMBIENT_PRESETS)) {
      const beds = cfg.files.map((f) => loadSampledBed(f));
      for (const b of beds) {
        assert.ok(b, `${name}: asset present`);
        assert.equal(b.length, 8000 * 24, `${name}: 24s at 8kHz`);
        const db = rmsDbfs(b);
        // Against the constant, not a literal: loadSampledBed re-levels every
        // asset to TARGET_RMS_DBFS on load precisely so a bed built when the
        // target was different still plays at today's level.
        assert.ok(
          Math.abs(db - TARGET_RMS_DBFS) < 1,
          `${name}: level ${db.toFixed(1)} dBFS is not at the bed target ${TARGET_RMS_DBFS}`,
        );
        // Loop seam: the wrap-around layering makes the last and first
        // samples continuous, so the step across the seam stays inside the
        // bed's ordinary sample-to-sample range.
        let maxStep = 0; for (let i = 1; i < b.length; i++) maxStep = Math.max(maxStep, Math.abs(b[i] - b[i - 1]));
        assert.ok(Math.abs(b[0] - b[b.length - 1]) <= maxStep, `${name}: no seam click`);
      }
      let diff = 0; for (let i = 0; i < beds[0].length; i++) if (beds[0][i] !== beds[1][i]) diff += 1;
      assert.ok(diff > beds[0].length * 0.9, `${name}: the two variants are different loops`);
    }
  });
  it('renderAmbienceLoop serves them through the same mixer path, 8kHz only', () => {
    assert.ok(renderAmbienceLoop('Office Chatter', { variant: 0 }));
    assert.equal(renderAmbienceLoop('Office Chatter', { sampleRate: 16000 }), null);
    assert.strictEqual(createAmbienceSource('Call Center Chatter').nextFrame().length, 160);
  });
  it('resolveAmbientMode keeps existing agents as they were and defaults new ones to off', () => {
    assert.equal(resolveAmbientMode({}), 'off');
    assert.equal(resolveAmbientMode({ ambientSound: 'None' }), 'off');
    assert.equal(resolveAmbientMode({ ambientSound: 'Office' }), 'manual');
    assert.equal(resolveAmbientMode({ ambientSound: 'Office', ambientMode: 'off' }), 'off');
    assert.equal(resolveAmbientMode({ ambientSound: 'Office', ambientMode: 'native' }), 'native');
  });
  it('the native tag exists only in native mode and never for a noise-only preset', () => {
    assert.equal(ambienceTagFor({ ambientSound: 'Office Chatter' }), null, 'manual by default');
    assert.equal(ambienceTagFor({ ambientMode: 'native', ambientSound: 'Office Chatter' }), '[office chatter in the background]');
    assert.equal(ambienceTagFor({ ambientMode: 'native', ambientSound: 'Office' }), '[office chatter in the background]');
    assert.equal(ambienceTagFor({ ambientMode: 'native', ambientSound: 'Static' }), null);
  });
});

describe('the bed the browser fetches', () => {
  it('slugs every preset to a distinct name that round-trips', () => {
    // The slug is in a URL and in an asset filename, so a collision would have
    // one preset served as another. Round-tripping is what the route relies on.
    const slugs = ALL_AMBIENT_PRESET_NAMES.map(bedSlug);
    assert.equal(new Set(slugs).size, slugs.length, 'two presets share a slug');
    for (const name of Object.keys(AMBIENT_PRESETS)) {
      assert.equal(presetForSlug(bedSlug(name)), name, `${name} does not round-trip through its slug`);
    }
    assert.equal(bedSlug('Call Center'), 'call-center');
    // A chatter bed is a FILE, not a synthesized preset: the route must fall
    // through to disk for it rather than rendering something.
    assert.equal(presetForSlug('office-chatter-1'), null);
    assert.equal(presetForSlug('../../etc/passwd'), null);
  });

  it('renders each synthesized preset as a 24kHz WAV at the bed level', async () => {
    // Imported here rather than at the top of the file: ambienceBed.js reaches
    // callRecorder.js, and the whole reason it is a separate module is that
    // ambience.js must not.
    const { synthesizedBedWav } = await import('../ambienceBed.js');
    for (const name of Object.keys(AMBIENT_PRESETS)) {
      const wav = synthesizedBedWav(bedSlug(name));
      assert.ok(Buffer.isBuffer(wav), `${name}: no bed rendered`);
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
      assert.equal(wav.readUInt16LE(22), 1, `${name}: must be mono`);
      assert.equal(wav.readUInt32LE(24), 24000, `${name}: must be 24kHz`);
      // 24s of 16-bit mono at 24kHz, plus the header.
      assert.equal(wav.length, 44 + 24 * 24000 * 2 - 24000 * 0.25 * 2, `${name}: wrong loop length`);
      // Same level as the phone plays it — the entire point of serving it.
      const pcm = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) / 2);
      const db = rmsDbfs(pcm);
      const expected = name === 'Quiet Room' ? TARGET_RMS_DBFS - 9.1 : TARGET_RMS_DBFS;
      assert.ok(Math.abs(db - expected) < 1.5, `${name}: browser bed at ${db.toFixed(1)} dBFS, phone plays ${expected}`);
    }
    // Cached, so a web call does not re-encode ~1.1MB per request.
    assert.strictEqual(synthesizedBedWav('office'), synthesizedBedWav('office'));
    assert.equal(synthesizedBedWav('office-chatter-1'), null);
  });
});

describe('G.711 mu-law companding', () => {
  it('is decode-stable across all 256 codes', () => {
    // NOT byte-identity: mu-law has two zero codes (0x7F = -0, 0xFF = +0), so
    // 0x7F necessarily re-encodes to 0xFF. Decode-stability is the real invariant.
    for (let c = 0; c < 256; c++) {
      const lin = ulawToLinear(c);
      const back = ulawToLinear(linearToUlaw(lin));
      // `===` on purpose, not assert.equal: strict-mode equal() uses Object.is,
      // which reports -0 !== 0. Numerically they are the same sample, and the
      // LUT normalises -0 away before anything downstream sees it.
      assert.ok(back === lin, `code ${c} is not decode-stable: ${lin} -> ${back}`);
    }
  });

  it('saturates instead of wrapping past full scale', () => {
    assert.equal(linearToUlaw(40000), linearToUlaw(32635));
    assert.equal(linearToUlaw(-40000), linearToUlaw(-32635));
    // Wrapping would flip the sign — the audible failure this guards against.
    assert.ok(ulawToLinear(linearToUlaw(40000)) > 0);
    assert.ok(ulawToLinear(linearToUlaw(-40000)) < 0);
  });

  it('never yields a negative zero through the LUT path', () => {
    const dec = decodeUlaw(Buffer.from([0x7f, 0xff]));
    assert.ok(!Object.is(dec[0], -0));
    assert.equal(dec[0], 0);
    assert.equal(dec[1], 0);
  });

  it('round-trips a buffer through decode/encode within one code', () => {
    const src = Buffer.from(Array.from({ length: 160 }, (_, i) => (i * 7) % 256));
    const back = encodeUlaw(decodeUlaw(src));
    for (let i = 0; i < src.length; i++) {
      assert.ok(
        Math.abs(ulawToLinear(back[i]) - ulawToLinear(src[i])) <= 1,
        `sample ${i} drifted`,
      );
    }
  });
});

describe('bed synthesis', () => {
  it('returns null for None/unknown — the single off-switch', () => {
    assert.equal(renderAmbienceLoop('None'), null);
    assert.equal(renderAmbienceLoop(undefined), null);
    assert.equal(renderAmbienceLoop('Nonexistent'), null);
    assert.equal(createAmbienceSource('None'), null);
    assert.equal(isAmbienceEnabled('None'), false);
    assert.equal(isAmbienceEnabled('Office'), true);
  });

  it('renders every preset in an audible-but-unobtrusive level band', () => {
    // Expressed as offsets from the target rather than as absolute dBFS, so
    // AMBIENCE_BED_DBFS moves the whole feature without editing a test. Quiet
    // Room is deliberately below the rest — renderAmbienceLoop trims it to 35%
    // (-9.1dB) because staying near-silent is its entire purpose.
    for (const p of PRESETS) {
      const db = rmsDbfs(renderAmbienceLoop(p));
      const [lo, hi] = p === 'Quiet Room'
        ? [TARGET_RMS_DBFS - 13, TARGET_RMS_DBFS - 5]
        : [TARGET_RMS_DBFS - 4, TARGET_RMS_DBFS + 4];
      assert.ok(db >= lo && db <= hi, `${p} RMS ${db.toFixed(1)}dBFS outside ${lo}..${hi}`);
    }
  });

  it('caches: the same preset returns the identical buffer', () => {
    assert.strictEqual(renderAmbienceLoop('Office'), renderAmbienceLoop('Office'));
  });

  it('is deterministic for a given seed', () => {
    const a = renderAmbienceLoop('Cafe', { seed: 42, seconds: 2 });
    const b = renderAmbienceLoop('Cafe', { seed: 42, seconds: 2 });
    assert.deepEqual(Array.from(a.slice(0, 500)), Array.from(b.slice(0, 500)));
  });

  /**
   * Peak, RMS and the count of samples clearing a multiple of RMS — i.e. "is
   * anything actually HAPPENING in this room, and how far above the room is it".
   */
  const excursions = (preset) => {
    const b = renderAmbienceLoop(preset);
    let peak = 0;
    let sum = 0;
    for (const v of b) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    const rms = Math.sqrt(sum / b.length);
    let over5 = 0;
    for (const v of b) if (Math.abs(v) > 5 * rms) over5 += 1;
    return { crest: peak / rms, over5 };
  };

  it('gives the layered presets events that stand above their own room', () => {
    // THE FAILURE THIS EXISTS FOR. renderAmbienceLoop normalises the finished
    // loop to a fixed RMS, so an event written at "about the same gain as the
    // bed" is scaled down with it and lands at roughly 1x the bed's RMS —
    // quieter than the bed's own noise peaks. The first version of these
    // layers did exactly that: Cafe's crockery reached 1.6x the median
    // envelope while Quiet Room, which has no events at all, reached 1.9x.
    //
    // Every other assertion in this file still passed. Level was correct, the
    // seam was correct, the preset names were correct, determinism was
    // correct — and not one event was audible. Nothing but a direct measure
    // of prominence can catch that, which is why it is measured here.
    for (const p of ['Office', 'Cafe', 'Street']) {
      const { crest, over5 } = excursions(p);
      assert.ok(crest > 4.5, `${p}: crest ${crest.toFixed(2)} — events are buried in the bed`);
      assert.ok(over5 >= 5, `${p}: only ${over5} samples clear 5x RMS — the event layer is inaudible`);
    }
  });

  it('leaves the deliberately featureless presets featureless', () => {
    // Quiet Room's whole job is to be almost nothing and Static is line noise,
    // not a room. Both are unlayered on purpose, so an event appearing in
    // either means a layer has been wired to the wrong preset.
    for (const p of ['Quiet Room', 'Static']) {
      const { over5 } = excursions(p);
      assert.equal(over5, 0, `${p} should have no events, but ${over5} samples clear 5x RMS`);
    }
  });

  it('has no click at the loop seam', () => {
    // A seam discontinuity is a periodic click, the most obvious "this is a
    // loop" artifact. Compare the wrap delta against the interior distribution.
    const loop = renderAmbienceLoop('Office');
    const deltas = [];
    for (let i = 1; i < loop.length; i++) deltas.push(Math.abs(loop[i] - loop[i - 1]));
    deltas.sort((x, y) => x - y);
    const p999 = deltas[Math.floor(deltas.length * 0.999)];
    const seam = Math.abs(loop[0] - loop[loop.length - 1]);
    assert.ok(seam <= p999, `seam delta ${seam} exceeds interior p99.9 ${p999}`);
  });
});

describe('frame source', () => {
  it('yields fixed-size frames indefinitely, wrapping the loop', () => {
    const src = createAmbienceSource('Office');
    const loop = renderAmbienceLoop('Office');
    const framesToCoverLoop = Math.ceil(loop.length / ULAW_FRAME_BYTES);
    for (let i = 0; i < framesToCoverLoop * 3; i++) {
      const f = src.nextFrame();
      assert.equal(f.length, ULAW_FRAME_BYTES);
    }
  });

  it('keeps producing signal after wrapping (does not run into silence)', () => {
    const src = createAmbienceSource('Office');
    const loop = renderAmbienceLoop('Office');
    for (let i = 0; i < Math.ceil(loop.length / ULAW_FRAME_BYTES) + 5; i++) src.nextFrame();
    assert.ok(rmsDbfs(src.nextFrame()) > -70, 'bed went silent after the wrap');
  });
});

describe('mixUlawFrame', () => {
  const bed = () => createAmbienceSource('Office').nextFrame();

  it('emits bed-only when the engine is idle', () => {
    const out = mixUlawFrame(null, bed());
    assert.equal(out.length, ULAW_FRAME_BYTES);
    assert.ok(rmsDbfs(decodeUlaw(out)) > -70);
  });

  it('preserves engine speech when mixing (bed is far below it)', () => {
    // Full-scale-ish tone as stand-in for speech.
    const speech = new Int16Array(ULAW_FRAME_BYTES);
    for (let i = 0; i < speech.length; i++) speech[i] = Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / 8000));
    const engine = encodeUlaw(speech);
    const mixed = decodeUlaw(mixUlawFrame(engine, bed()));
    const original = decodeUlaw(engine);
    let maxDelta = 0;
    for (let i = 0; i < mixed.length; i++) maxDelta = Math.max(maxDelta, Math.abs(mixed[i] - original[i]));
    // Derived from the bed target rather than hardcoded, so raising
    // AMBIENCE_BED_DBFS cannot quietly turn this into a test of nothing. A
    // frame's peak runs a few times its RMS (noise plus, on a layered preset,
    // an event), and mu-law adds one quantisation step on top — but the result
    // must still be nowhere near the 12000 speech level below.
    const bedRms = 32768 * 10 ** (TARGET_RMS_DBFS / 20);
    const allowed = bedRms * 6 + 64;
    assert.ok(
      maxDelta < allowed,
      `speech altered by ${maxDelta} (allowed ${Math.round(allowed)}) — bed is too loud or mixing is wrong`,
    );
  });

  it('does not clip when speech is already at full scale', () => {
    const loud = new Int16Array(ULAW_FRAME_BYTES).fill(32000);
    const out = decodeUlaw(mixUlawFrame(encodeUlaw(loud), bed()));
    for (const v of out) assert.ok(v > 0, 'sign flipped — mix overflowed instead of clamping');
  });

  it('always returns exactly one Twilio frame', () => {
    assert.equal(mixUlawFrame(Buffer.alloc(80, 0xff), bed()).length, ULAW_FRAME_BYTES);
    assert.equal(mixUlawFrame(Buffer.alloc(0), bed()).length, ULAW_FRAME_BYTES);
  });
});
