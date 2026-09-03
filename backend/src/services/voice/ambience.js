// backend/src/services/voice/ambience.js
/**
 * Synthesized background ambience for the PHONE leg, as 8kHz G.711 µ-law.
 *
 * The browser generates its own bed with Web Audio (client/src/services/
 * ambientSound.ts). Telephony has no such luxury: Twilio's media stream carries
 * µ-law and nothing in this backend has ever touched audio samples, so the
 * companding, filtering and synthesis all live here in plain JS. No dependency
 * is added — the backend has no audio library today and does not need one for
 * a few hundred lines of well-understood DSP.
 *
 * The PRESET TABLE below is duplicated from the client module named above,
 * because there is no shared package between client and backend. A test asserts
 * the exact preset-name set, so a rename fails CI instead of silently orphaning
 * every saved agent (an agent stores the preset NAME, not its parameters).
 *
 * Design notes that matter:
 *  - Beds are PRE-RENDERED once per preset and cached. Synthesizing per 20ms
 *    frame would burn CPU on every concurrent call for a signal that never
 *    changes.
 *  - Filters are RBJ biquads, the same family Web Audio's BiquadFilterNode
 *    implements, so the client's tuned preset values transfer directly and the
 *    phone bed sounds like the browser bed instead of needing a second tuning.
 *  - Randomness is a seeded PRNG, not Math.random, so tests are deterministic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Presets (KEEP IN SYNC with client/src/services/ambientSound.ts) ─────────
export const AMBIENT_PRESETS = {
  'Quiet Room': { type: 'lowpass', freq: 300, gain: 0.004 },
  Office: { type: 'lowpass', freq: 700, gain: 0.012 },
  'Call Center': { type: 'bandpass', freq: 1100, gain: 0.014 },
  Static: { type: 'highpass', freq: 2200, gain: 0.02 },
  Cafe: { type: 'lowpass', freq: 1000, gain: 0.018 },
  Street: { type: 'lowpass', freq: 400, gain: 0.022 },
};

/** 8kHz × 20ms = 160 samples/bytes — one Twilio media frame. */
export const ULAW_FRAME_BYTES = 160;
const PHONE_RATE = 8000;
/** Loop length. 24s is 3 whole cycles of the 0.125Hz murmur LFO, so the loop
 *  is phase-continuous, and long enough that baked-in transients don't read as
 *  repeating under speech. 24s × 8000 × 2B ≈ 384KB per preset. */
const LOOP_SECONDS = 24;
/** Bed level target. ~42dB below speech peaks, so no ducking is needed. */
const TARGET_RMS_DBFS = -48;

// ─── Pre-rendered VOICE beds (Mode B in reports/AMBIENCE_VOICE.md) ───────────
// Indistinct human chatter, rendered ONCE by scripts/build-chatter-bed.mjs
// from Fish Audio TTS (innocuous filler sentences, several voices layered at
// random offsets, band-limited, levelled to TARGET_RMS_DBFS) and stored under
// backend/assets/ambience. They go through exactly the same mixer as the
// synthesized beds above, so they cost nothing per turn and add nothing to the
// hot path. Two variants per preset: two simultaneous calls pick different
// loops. The name set is pinned by a test on both sides, like AMBIENT_PRESETS.
export const SAMPLED_AMBIENT_PRESETS = {
  'Office Chatter': { files: ['office-chatter-1', 'office-chatter-2'], tag: '[office chatter in the background]' },
  'Call Center Chatter': { files: ['call-center-chatter-1', 'call-center-chatter-2'], tag: '[busy call centre background, many people talking indistinctly]' },
};
export const ALL_AMBIENT_PRESET_NAMES = [...Object.keys(AMBIENT_PRESETS), ...Object.keys(SAMPLED_AMBIENT_PRESETS)];
const ASSET_DIR = process.env.AMBIENCE_ASSET_DIR
  || fileURLToPath(new URL('../../../assets/ambience/', import.meta.url));

/**
 * The three-state per-agent switch (Call Configuration → Background sound):
 *   'off'     no bed of any kind;
 *   'manual'  the pre-rendered bed named by `ambientSound` (noise or chatter),
 *             continuous, free per turn;
 *   'native'  Fish Audio generates the ambience WITH the speech via an S2
 *             inline tag — only while the agent speaks, only on a Fish voice.
 * Backwards compatible: an agent saved before the switch existed has no
 * `ambientMode`; it keeps whatever `ambientSound` did for it (a preset →
 * manual, 'None' or unset → off), so nothing changes for anyone until they
 * choose. A NEW agent's editor default is 'off'.
 */
export const AMBIENT_MODES = ['off', 'manual', 'native'];
export function resolveAmbientMode(settings = {}) {
  const mode = String(settings?.ambientMode || '').toLowerCase();
  if (AMBIENT_MODES.includes(mode)) return mode;
  const preset = settings?.ambientSound;
  return preset && preset !== 'None' ? 'manual' : 'off';
}

/**
 * The S2 inline tag that asks Fish Audio to generate the ambience itself
 * (Mode A). Null unless the agent is in 'native' mode with a preset that has
 * a tag. The tag is added at SYNTHESIS only (fishaudio.provider.js ttsBody) —
 * it never touches the reply text, the transcript or the history, so it can
 * never be echoed back to the model or shown to a person.
 */
export function ambienceTagFor(settings = {}) {
  if (resolveAmbientMode(settings) !== 'native') return null;
  const preset = settings?.ambientSound;
  return SAMPLED_AMBIENT_PRESETS[preset]?.tag
    ?? ({ Office: SAMPLED_AMBIENT_PRESETS['Office Chatter'].tag, 'Call Center': SAMPLED_AMBIENT_PRESETS['Call Center Chatter'].tag })[preset]
    ?? null;
}

const sampledCache = new Map(); // file -> Int16Array (8k)
/**
 * Load one pre-rendered 8kHz bed. Levelled at build time; re-levelled here to
 * TARGET_RMS_DBFS anyway so a hand-edited asset cannot arrive loud.
 * @returns {Int16Array|null} null when the asset is missing (logged once)
 */
export function loadSampledBed(file) {
  if (sampledCache.has(file)) return sampledCache.get(file);
  let out = null;
  try {
    const buf = fs.readFileSync(path.join(ASSET_DIR, `${file}.8k.pcm`));
    const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + (buf.length & ~1)));
    const scale = (32768 * 10 ** (TARGET_RMS_DBFS / 20)) / Math.max(rms(pcm), 1e-9);
    out = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * scale)));
  } catch (err) {
    out = null;
    if (!sampledCache.has(file)) console.warn(`[ambience] sampled bed "${file}" unavailable: ${err.message}`);
  }
  sampledCache.set(file, out);
  return out;
}

// ─── G.711 µ-law companding ──────────────────────────────────────────────────
// µ-law is logarithmic: byte values are NOT proportional to amplitude, so two
// µ-law streams cannot be added. Every mix must decode → sum → re-encode.

const ULAW_BIAS = 0x84;
const ULAW_CLIP = 32635;

/** One µ-law byte → linear PCM16. */
export function ulawToLinear(u8) {
  const u = (~u8) & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + ULAW_BIAS) << exponent;
  sample -= ULAW_BIAS;
  return sign ? -sample : sample;
}

/** Linear PCM16 → one µ-law byte. */
export function linearToUlaw(s16) {
  let sample = s16;
  let sign = 0;
  if (sample < 0) { sample = -sample; sign = 0x80; }
  if (sample > ULAW_CLIP) sample = ULAW_CLIP;
  sample += ULAW_BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1) { /* find MSB */ }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

// Precomputed both directions: a call emits 50 frames/second and each frame is
// 160 samples, so this runs hot enough to be worth 256 + 65536 entries.
//
// NOTE µ-law has TWO zero codes — 0x7F (-0) and 0xFF (+0) — so byte-for-byte
// round-tripping every code is impossible by design; 0x7F decodes to -0 and
// re-encodes as 0xFF. The meaningful invariant is decode-stability
// (decode(encode(decode(c))) === decode(c)), which does hold for all 256 codes.
// Storing into an Int16Array also normalises -0 to 0, so nothing downstream
// ever sees a negative zero.
const ULAW_TO_LINEAR = new Int16Array(256);
for (let i = 0; i < 256; i++) ULAW_TO_LINEAR[i] = ulawToLinear(i);
const LINEAR_TO_ULAW = new Uint8Array(65536);
for (let i = 0; i < 65536; i++) LINEAR_TO_ULAW[i] = linearToUlaw((i << 16) >> 16);

const encodeSample = (s16) => LINEAR_TO_ULAW[(Math.max(-32768, Math.min(32767, s16 | 0)) + 65536) & 0xffff];

/** µ-law Buffer → Int16Array. */
export function decodeUlaw(buf) {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = ULAW_TO_LINEAR[buf[i]];
  return out;
}

/**
 * Int16Array → µ-law Buffer.
 * @param {{ dither?: boolean }} [opts] TPDF dither of ±1 LSB. The bed sits near
 *   µ-law's coarsest region (steps around zero are ~±8 linear), so without
 *   dither a quiet bed quantizes into a gritty, "bad line" texture rather than
 *   smooth room tone. Costs nothing and only applies to the bed path.
 */
export function encodeUlaw(int16, { dither = false } = {}) {
  const out = Buffer.allocUnsafe(int16.length);
  for (let i = 0; i < int16.length; i++) {
    let s = int16[i];
    if (dither) s += (Math.random() - Math.random()) * 2;
    out[i] = encodeSample(s);
  }
  return out;
}

// ─── RBJ biquad (matches Web Audio's BiquadFilterNode) ───────────────────────

/**
 * @param {'lowpass'|'highpass'|'bandpass'} type
 * @returns {{ process(x: number): number }} stateful, mono
 */
export function makeBiquad(type, freq, q, sampleRate) {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  let b0; let b1; let b2; let a0; let a1; let a2;

  if (type === 'lowpass') {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else { // bandpass (constant 0dB peak gain), Web Audio's variant
    b0 = alpha; b1 = 0; b2 = -alpha;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  }

  const nb0 = b0 / a0; const nb1 = b1 / a0; const nb2 = b2 / a0;
  const na1 = a1 / a0; const na2 = a2 / a0;
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;

  return {
    process(x) {
      const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    },
  };
}

// ─── Deterministic PRNG ──────────────────────────────────────────────────────
function xorshift32(seed) {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

const rms = (arr) => {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
  return Math.sqrt(sum / arr.length);
};

/** Linear RMS (int16 scale) → dBFS. */
export const rmsDbfs = (arr) => 20 * Math.log10(Math.max(rms(arr), 1e-9) / 32768);

// ─── Bed synthesis ───────────────────────────────────────────────────────────

const loopCache = new Map(); // `${preset}|${rate}|${seconds}` -> Int16Array

/**
 * Render (and cache) one seamless ambience loop as PCM16.
 * @returns {Int16Array|null} null for 'None'/unknown — the single guard that
 *   turns the entire feature off everywhere downstream.
 */
export function renderAmbienceLoop(presetName, { sampleRate = PHONE_RATE, seconds = LOOP_SECONDS, seed = 0x1234567, variant = null } = {}) {
  const sampled = SAMPLED_AMBIENT_PRESETS[presetName];
  if (sampled) {
    // Pre-rendered voice bed: 8kHz only (the phone mixer's rate); the browser
    // fetches the 24kHz WAV itself. Variant chosen by the caller (per call) or
    // by the seed, so two concurrent callers rarely share a loop.
    if (sampleRate !== PHONE_RATE) return null;
    const idx = variant != null ? (variant % sampled.files.length) : (seed % sampled.files.length);
    return loadSampledBed(sampled.files[Math.abs(idx)]);
  }
  const cfg = AMBIENT_PRESETS[presetName];
  if (!cfg) return null;

  const key = `${presetName}|${sampleRate}|${seconds}`;
  const hit = loopCache.get(key);
  if (hit) return hit;

  const n = Math.floor(sampleRate * seconds);
  const rand = xorshift32(seed);
  const buf = new Float32Array(n);

  // Base bed: white noise through the preset's filter.
  // Static's 2200Hz corner leaves almost nothing above µ-law's ~3.4kHz ceiling,
  // so on the phone it degrades into thin hiss that callers read as a line
  // fault. Pull the corner down for the narrowband path only.
  const corner = presetName === 'Static' && sampleRate <= 8000 ? 1800 : cfg.freq;
  const base = makeBiquad(cfg.type, Math.min(corner, sampleRate * 0.45), 0.707, sampleRate);
  for (let i = 0; i < n; i++) buf[i] = base.process(rand() * 2 - 1);

  if (presetName === 'Call Center') addCallCentreLayers(buf, sampleRate, rand);

  // Normalize to the target level. Doing this by measurement rather than by
  // trusting the client's gain constants matters because those were tuned for
  // 24kHz speaker playback, not an 8kHz earpiece.
  const targetLinear = 32768 * 10 ** (TARGET_RMS_DBFS / 20);
  const quietTrim = presetName === 'Quiet Room' ? 0.35 : 1; // stays near-silent by design
  const scale = (targetLinear * quietTrim) / Math.max(rms(buf), 1e-9);

  // Equal-power crossfade of the tail into the head so the loop seam is
  // inaudible. Noise has no phase to match, so a power-preserving fade is both
  // sufficient and artifact-free.
  const fade = Math.min(Math.floor(sampleRate * 0.25), Math.floor(n / 4));
  const out = new Int16Array(n - fade);
  for (let i = 0; i < out.length; i++) {
    let v = buf[i];
    if (i < fade) {
      const t = i / fade;
      v = buf[i] * Math.sqrt(t) + buf[n - fade + i] * Math.sqrt(1 - t);
    }
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v * scale)));
  }

  loopCache.set(key, out);
  return out;
}

/**
 * Call-centre character: a slow swelling murmur (distant chatter) plus sparse
 * keyboard ticks and a faint far-off ring. Baked into the loop rather than
 * scheduled by timers — the browser can afford a timer per event, but the
 * server would be running one per concurrent call for no benefit.
 */
function addCallCentreLayers(buf, sampleRate, rand) {
  const n = buf.length;

  // Distant chatter: narrow band-passed noise whose level wanders on an LFO.
  const murmurFilter = makeBiquad('bandpass', 320, 1.6, sampleRate);
  const lfoHz = 0.125; // exactly 3 cycles in 24s → loop stays phase-continuous
  for (let i = 0; i < n; i++) {
    const lfo = 0.6 + 0.4 * Math.sin((2 * Math.PI * lfoHz * i) / sampleRate);
    buf[i] += murmurFilter.process(rand() * 2 - 1) * 0.55 * lfo;
  }

  // Keyboard bursts: 3-6 short high-passed clicks, every 4-13s.
  for (let t = rand() * 6 * sampleRate; t < n; t += (4 + rand() * 9) * sampleRate) {
    if (rand() < 0.85) {
      const ticks = 3 + Math.floor(rand() * 4);
      for (let k = 0; k < ticks; k++) {
        const at = Math.floor(t + k * (0.09 + rand() * 0.07) * sampleRate);
        const len = Math.floor(0.03 * sampleRate);
        const hp = makeBiquad('highpass', 3000, 0.707, sampleRate);
        for (let i = 0; i < len && at + i < n; i++) {
          const env = Math.exp(-i / (len * 0.25));           // sharp click decay
          buf[at + i] += hp.process(rand() * 2 - 1) * env * 0.5;
        }
      }
    } else {
      // Distant phone: two soft muffled bursts of a 950Hz tone.
      for (let r = 0; r < 2; r++) {
        const at = Math.floor(t + r * 0.5 * sampleRate);
        const len = Math.floor(0.35 * sampleRate);
        for (let i = 0; i < len && at + i < n; i++) {
          const env = Math.sin((Math.PI * i) / len);          // fade in and out
          buf[at + i] += Math.sin((2 * Math.PI * 950 * i) / sampleRate) * env * 0.22;
        }
      }
    }
  }
}

/**
 * An endless frame source over the cached loop.
 * @returns {{ nextFrame(): Int16Array }|null} null when ambience is off.
 */
export function createAmbienceSource(presetName, { sampleRate = PHONE_RATE, frameSamples = ULAW_FRAME_BYTES, seed } = {}) {
  const loop = renderAmbienceLoop(presetName, seed == null ? { sampleRate } : { sampleRate, seed });
  if (!loop) return null;

  let pos = 0;
  const frame = new Int16Array(frameSamples);
  return {
    nextFrame() {
      for (let i = 0; i < frameSamples; i++) {
        frame[i] = loop[pos];
        pos += 1;
        if (pos >= loop.length) pos = 0;
      }
      return frame;
    },
  };
}

/**
 * Mix one frame of engine speech (µ-law, may be null when idle) with one frame
 * of bed (PCM16) and return µ-law ready for Twilio.
 *
 * No ducking: the bed sits ~42dB under speech, and a duck envelope would itself
 * be audible as pumping — the very artifact that rules out gating the bed to
 * only play while the agent talks.
 */
export function mixUlawFrame(engineUlaw, bedInt16) {
  const n = bedInt16.length;
  const mixed = new Int16Array(n);
  if (!engineUlaw || engineUlaw.length === 0) {
    mixed.set(bedInt16);
    return encodeUlaw(mixed, { dither: true });
  }
  for (let i = 0; i < n; i++) {
    const speech = i < engineUlaw.length ? ULAW_TO_LINEAR[engineUlaw[i]] : 0;
    mixed[i] = Math.max(-32768, Math.min(32767, speech + bedInt16[i]));
  }
  // No dither when speech is present: the speech itself already dithers the
  // quantizer, and adding noise on top would only degrade it.
  return encodeUlaw(mixed);
}

/** Is this a preset we can actually synthesize? ('None'/undefined → false) */
export const isAmbienceEnabled = (presetName) => Boolean(AMBIENT_PRESETS[presetName]);
