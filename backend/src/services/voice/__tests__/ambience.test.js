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
        assert.ok(Math.abs(db - (-48)) < 1, `${name}: level ${db.toFixed(1)} dBFS is at the bed target`);
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
    for (const p of PRESETS) {
      const db = rmsDbfs(renderAmbienceLoop(p));
      const [lo, hi] = p === 'Quiet Room' ? [-62, -52] : [-52, -44];
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
    // The bed peaks around -37dBFS (~460 linear); allow headroom for one
    // mu-law quantisation step on top, but nothing near speech level.
    assert.ok(maxDelta < 1500, `speech altered by ${maxDelta}, bed is too loud or mixing is wrong`);
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
