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
/**
 * Bed level target, in dBFS RMS — the ONE place the loudness of every bed is
 * decided, now on both transports.
 *
 * It was -48, justified as "~42dB below speech peaks, so no ducking is needed".
 * That is sound reasoning about ducking and says nothing about whether anybody
 * can HEAR the room, which is the entire purpose of the feature. Reported from
 * a live test: only Street was audible at all, and only barely.
 *
 * -42 is still ~26dB under speech — unmistakably background, and present.
 *
 * ── The phone-side risk, stated plainly ─────────────────────────────────────
 *
 * The bed goes out on the outbound leg and comes back up the inbound one as
 * acoustic echo. The argument that it cannot trip barge-in or reach STT is made
 * by construction (it sits below bargeThreshold's noise-floor-relative
 * threshold) and has NEVER been confirmed on a live call — BUG-003 is open on
 * exactly that. +6dB does not invalidate the argument, but it does spend some
 * of its margin.
 *
 * Hence the env var. If a live call shows phantom turns or the agent barging
 * itself, AMBIENCE_BED_DBFS=-48 restores the previous behaviour with no deploy.
 */
export const TARGET_RMS_DBFS = Number(process.env.AMBIENCE_BED_DBFS) || -42;

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

  PRESET_LAYERS[presetName]?.(buf, sampleRate, rand);

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

// ─── Layer primitives ────────────────────────────────────────────────────────
//
// Four shapes cover every layer below: a wandering bed (the continuous
// "presence" of a room), and three kinds of discrete event. They exist because
// Office, Cafe and Street were, for their whole life, the base filter and
// nothing else — bare filtered white noise, which is why they read as an effect
// rather than a place while Call Center reads as a call centre. That difference
// was never a property of the presets, only of which one had had layers written
// for it.
//
// addCallCentreLayers above is DELIBERATELY not re-expressed through these.
// Its output is what has been shipping; routing it through a helper would
// change the samples for the one preset that already sounds right, to buy
// nothing but uniformity.
//
// ── What these are tuned against ─────────────────────────────────────────────
//
// The phone leg, not a laptop speaker. Frequencies are chosen to land inside
// the ~300-3400Hz telephone band: real HVAC rumble lives near 100Hz and real
// traffic lower still, and a carrier deletes both, so a layer placed where the
// sound actually is would be inaudible on the transport that matters. Each one
// is therefore written at the lowest frequency that SURVIVES rather than the
// one that is literally true.
//
// ── HOW LOUD AN EVENT HAS TO BE, WHICH IS THE PART THAT IS COUNTERINTUITIVE ──
//
// Event gains here look enormous next to the bed gains. They have to be, and
// the first version of these layers was rewritten because they were not.
//
// renderAmbienceLoop normalises the FINISHED loop to TARGET_RMS_DBFS, and the
// continuous beds carry almost all of a loop's energy. So an event written at
// "about the same gain as the bed" is scaled down alongside it and lands at
// roughly 1x the bed's RMS — which, against noise with a crest factor near 4,
// is quieter than the bed's own peaks. Measured on the first attempt: Cafe's
// crockery reached 1.6x the median envelope while Quiet Room, which has no
// events at all, reached 1.9x on pure noise. The events were inaudible, and no
// amount of choosing better sounds would have fixed a level error.
//
// A real transient sits 10-15dB above the room it happens in. That is 3-5x the
// bed's RMS, not 1x, and it is what these gains are set to produce.
// `ambience.test.js` asserts it per preset so the calibration cannot silently
// rot: an event layer that stops standing out has stopped existing.

/**
 * Filtered noise whose level wanders on an LFO — a room's continuous presence.
 *
 * `lfoHz` should be a whole number of cycles per loop (k / LOOP_SECONDS), or
 * the level is discontinuous across the wrap. That is not a click — the
 * crossfade joins two adjacent samples, so it survives as a slow lurch in
 * volume instead, which is harder to notice and much harder to stop noticing.
 */
function addWanderingBed(buf, sampleRate, rand, { type, freq, q = 0.9, gain, lfoHz, depth = 0.3 }) {
  const filter = makeBiquad(type, Math.min(freq, sampleRate * 0.45), q, sampleRate);
  for (let i = 0; i < buf.length; i++) {
    const lfo = (1 - depth) + depth * Math.sin((2 * Math.PI * lfoHz * i) / sampleRate);
    buf[i] += filter.process(rand() * 2 - 1) * gain * lfo;
  }
}

/**
 * Walk sparse events across the loop, calling `emit(at)` at each.
 *
 * Events that run past the end are truncated rather than wrapped, which is
 * safe here and only here: renderAmbienceLoop fades the last 0.25s out
 * underneath the head, so an event cut by the buffer edge is already at
 * zero weight exactly where it was cut.
 */
function scheduleEvents(n, sampleRate, rand, { firstMaxSec, minGapSec, maxGapSec }, emit) {
  for (
    let t = rand() * firstMaxSec * sampleRate;
    t < n;
    t += (minGapSec + rand() * (maxGapSec - minGapSec)) * sampleRate
  ) {
    emit(Math.floor(t));
  }
}

/** A short burst of filtered noise with an exponential decay: a click, a clink,
 *  a rustle. Smaller `decay` is sharper. */
function addNoiseBurst(buf, sampleRate, rand, at, { type = 'highpass', freq, q = 0.707, seconds, gain, decay = 0.25 }) {
  const n = buf.length;
  const len = Math.floor(seconds * sampleRate);
  const filter = makeBiquad(type, Math.min(freq, sampleRate * 0.45), q, sampleRate);
  for (let i = 0; i < len && at + i < n; i++) {
    buf[at + i] += filter.process(rand() * 2 - 1) * Math.exp(-i / (len * decay)) * gain;
  }
}

/** Filtered noise that swells and fades — something passing, or a machine
 *  running for a second or two. `skew` moves the peak (0.5 is centred). */
function addNoiseSwell(buf, sampleRate, rand, at, { freq, q = 0.7, seconds, gain, skew = 0.5 }) {
  const n = buf.length;
  const len = Math.floor(seconds * sampleRate);
  const peak = Math.max(1, Math.floor(len * skew));
  const filter = makeBiquad('bandpass', Math.min(freq, sampleRate * 0.45), q, sampleRate);
  for (let i = 0; i < len && at + i < n; i++) {
    const ramp = i < peak ? i / peak : (len - i) / Math.max(1, len - peak);
    buf[at + i] += filter.process(rand() * 2 - 1) * Math.sin((Math.PI * ramp) / 2) * gain;
  }
}

/**
 * A struck resonance — ceramic, glass, a spoon on a saucer.
 *
 * Deliberately NOT a noise burst, which is what this started as. A cup has a
 * PITCH, and at telephone bandwidth the pitch is most of what survives: a
 * filtered-noise "clink" measured 1.9x the median in its own band while the
 * same event as a decaying tone measures several times that, because the
 * energy is concentrated at one frequency instead of spread across a decade of
 * spectrum the bed already occupies. It is also simply what the object does.
 *
 * The second partial is inharmonic (x2.76 — a struck plate, not a string),
 * which is what keeps it from reading as a musical note, and it is dropped
 * rather than aliased when it would land above Nyquist.
 */
function addRing(buf, sampleRate, at, { freq, seconds, gain, decay = 0.28 }) {
  const n = buf.length;
  const len = Math.floor(seconds * sampleRate);
  const partial = freq * 2.76;
  const withPartial = partial < sampleRate * 0.45;
  // ~2ms, enough to stop the onset itself being a click.
  const attackSamples = Math.max(1, Math.floor(sampleRate * 0.002));
  for (let i = 0; i < len && at + i < n; i++) {
    const env = Math.exp(-i / (len * decay)) * Math.min(1, i / attackSamples);
    let v = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    if (withPartial) v += 0.45 * Math.sin((2 * Math.PI * partial * i) / sampleRate);
    buf[at + i] += v * env * gain;
  }
}

/** A tone under a raised-cosine envelope: a distant ring, one note of a horn. */
function addTone(buf, sampleRate, at, { freq, seconds, gain }) {
  const n = buf.length;
  const len = Math.floor(seconds * sampleRate);
  for (let i = 0; i < len && at + i < n; i++) {
    buf[at + i] += Math.sin((2 * Math.PI * freq * i) / sampleRate)
      * Math.sin((Math.PI * i) / len) * gain;
  }
}

// ─── Per-preset layers ───────────────────────────────────────────────────────

/**
 * Office character: the BUILDING, not the people in it.
 *
 * The division of labour matters, because there are two office presets. "Office
 * Chatter" is the pre-rendered bed for an office you can hear colleagues in;
 * this one is the office you can hear the air handling in, with only the
 * occasional sign that somebody else is present. Making this one chatter too
 * would leave the picker offering the same room twice.
 */
function addOfficeLayers(buf, sampleRate, rand) {
  // HVAC — the one sound every office has all day. Written at 260Hz rather
  // than the ~110Hz it really occupies: see the band note above.
  addWanderingBed(buf, sampleRate, rand, {
    type: 'bandpass', freq: 260, q: 0.9, gain: 0.70, lfoHz: 1 / 24, depth: 0.22,
  });
  // Voices two rooms away — an order quieter than Call Center's murmur, and
  // narrower, so it reads as "somebody is somewhere" rather than as speech.
  addWanderingBed(buf, sampleRate, rand, {
    type: 'bandpass', freq: 520, q: 1.4, gain: 0.16, lfoHz: 3 / 24, depth: 0.35,
  });

  scheduleEvents(buf.length, sampleRate, rand, { firstMaxSec: 6, minGapSec: 6, maxGapSec: 16 }, (at) => {
    const roll = rand();
    if (roll < 0.55) {
      // A short flurry of typing. Quieter than the call centre's, where the
      // keyboard is the room's defining sound rather than an interruption.
      // A BANDPASS at 2200, not a highpass at 2800, and the difference is
      // audibility rather than timbre. A highpass at 2800 puts most of a tick's
      // energy between 2800Hz and Nyquist — and the telephone band stops around
      // 3400Hz, so the carrier deleted over half of every tick. Measured: not
      // one Office event cleared 5x the bed's RMS while Cafe and Street both
      // did. Centred at 2200 the whole burst survives the line, and it still
      // reads as a click against a bed that is lowpassed at 700.
      const ticks = 4 + Math.floor(rand() * 5);
      for (let k = 0; k < ticks; k++) {
        addNoiseBurst(buf, sampleRate, rand, Math.floor(at + k * (0.08 + rand() * 0.06) * sampleRate), {
          type: 'bandpass', freq: 2200, q: 0.8, seconds: 0.025, gain: 2.2, decay: 0.22,
        });
      }
    } else if (roll < 0.85) {
      // Paper, a sleeve, a chair — broadband, soft-edged, over in a moment.
      addNoiseBurst(buf, sampleRate, rand, at, {
        type: 'bandpass', freq: 1600, q: 0.8, seconds: 0.18 + rand() * 0.14, gain: 1.3, decay: 0.45,
      });
    } else {
      // A phone somewhere down the corridor — further away and rarer than the
      // call centre's, so it stays at the quiet end of the event range.
      for (let r = 0; r < 2; r++) {
        addTone(buf, sampleRate, Math.floor(at + r * 0.5 * sampleRate), { freq: 950, seconds: 0.35, gain: 0.5 });
      }
    }
  });
}

/**
 * Cafe character: a crowd, crockery, and the machine behind the counter.
 *
 * The crockery is what makes it a cafe. A crowd alone is any busy room, and the
 * base lowpass alone is any quiet one; the clinks are the only part a listener
 * can actually name, so they carry the identification and everything else sets
 * the scale of the room around them.
 */
function addCafeLayers(buf, sampleRate, rand) {
  // Crowd babble. Two beds at different rates rather than one, so the room's
  // density has no single obvious cycle to lock onto over a long call.
  addWanderingBed(buf, sampleRate, rand, {
    type: 'bandpass', freq: 480, q: 1.2, gain: 0.72, lfoHz: 2 / 24, depth: 0.30,
  });
  addWanderingBed(buf, sampleRate, rand, {
    type: 'bandpass', freq: 760, q: 1.0, gain: 0.28, lfoHz: 6 / 24, depth: 0.40,
  });

  scheduleEvents(buf.length, sampleRate, rand, { firstMaxSec: 4, minGapSec: 3, maxGapSec: 8 }, (at) => {
    if (rand() < 0.72) {
      // Cup on saucer, spoon, a plate stacked — one to three, close together,
      // each at its own pitch so a repeat of the loop is not a repeat of a
      // recognisable phrase. The pitch range is bounded above so the inharmonic
      // partial (x2.76) still fits under Nyquist at the 8kHz line rate.
      const clinks = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < clinks; k++) {
        addRing(buf, sampleRate, Math.floor(at + k * (0.11 + rand() * 0.13) * sampleRate), {
          freq: 1080 + rand() * 380, seconds: 0.13, gain: 0.85 + rand() * 0.35, decay: 0.26,
        });
      }
    } else {
      // The steam wand. A texture rather than a transient, so it sits lower
      // than the crockery — it is meant to be noticed as the room, not as an
      // event happening to the caller.
      addNoiseSwell(buf, sampleRate, rand, at, {
        freq: 2100, q: 0.7, seconds: 0.9 + rand() * 0.9, gain: 0.70, skew: 0.35,
      });
    }
  });
}

/**
 * Street character: traffic, and things going past.
 *
 * A passing vehicle is the whole point — a street without one is just rumble,
 * and rumble is what the preset already was.
 */
function addStreetLayers(buf, sampleRate, rand) {
  // The road itself: constant, barely modulated.
  addWanderingBed(buf, sampleRate, rand, {
    type: 'bandpass', freq: 220, q: 0.8, gain: 0.85, lfoHz: 1 / 24, depth: 0.18,
  });
  // Middle distance — tyre noise and general city hiss, which is what actually
  // survives the telephone band once the rumble below has been filtered out.
  addWanderingBed(buf, sampleRate, rand, {
    type: 'bandpass', freq: 900, q: 0.9, gain: 0.30, lfoHz: 3 / 24, depth: 0.35,
  });

  scheduleEvents(buf.length, sampleRate, rand, { firstMaxSec: 5, minGapSec: 4, maxGapSec: 10 }, (at) => {
    if (rand() < 0.80) {
      // ── A vehicle passing, and the cheap way to imply Doppler ────────────
      //
      // A real pass shifts DOWN in frequency as it goes by, and a static
      // biquad cannot sweep — the coefficients are fixed when it is built.
      // Rebuilding one per sample to chase the pitch would cost more than the
      // entire bed does.
      //
      // Two fixed bands with offset envelopes give the same impression for
      // almost nothing: the higher band peaks early (approaching), the lower
      // one late (receding), so the centre of energy travels downward across
      // the pass exactly as it should, without anything actually sweeping.
      const seconds = 1.8 + rand() * 1.4;
      const gain = 0.75 + rand() * 0.45;
      addNoiseSwell(buf, sampleRate, rand, at, { freq: 950, q: 0.7, seconds, gain: gain * 0.8, skew: 0.35 });
      addNoiseSwell(buf, sampleRate, rand, at, { freq: 420, q: 0.7, seconds, gain, skew: 0.62 });
    } else {
      // A horn a street away. Two notes, because a car horn is a chord (a
      // rough major third) and a single tone reads as a test signal.
      const at2 = Math.floor(at);
      const seconds = 0.28 + rand() * 0.16;
      addTone(buf, sampleRate, at2, { freq: 440, seconds, gain: 0.40 });
      addTone(buf, sampleRate, at2, { freq: 554, seconds, gain: 0.30 });
    }
  });
}

/**
 * Which presets get layers. Quiet Room and Static deliberately get none:
 * Quiet Room's entire job is to be almost nothing (it is additionally trimmed
 * to 35% in renderAmbienceLoop), and Static is not a room at all — it is line
 * noise, which is exactly what unlayered filtered noise already is.
 */
const PRESET_LAYERS = {
  'Call Center': addCallCentreLayers,
  Office: addOfficeLayers,
  Cafe: addCafeLayers,
  Street: addStreetLayers,
};

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

// ─── Serving the same bed to the browser ─────────────────────────────────────
//
// ── WHY THE CLIENT NO LONGER SYNTHESIZES ITS OWN ────────────────────────────
//
// It used to, in Web Audio, from the preset table duplicated in
// client/src/services/ambientSound.ts — a BufferSource of white noise through a
// BiquadFilterNode at a hardcoded `gain`. Those gain constants were the final
// level in the browser, and nothing measured or normalised them, so what a
// caller heard depended on how much energy each filter happened to pass at the
// browser's own sample rate. A lowpass at 700Hz keeps ~18% of the spectrum at
// the 8kHz line rate and ~3% at a 48kHz AudioContext, and nothing accounted for
// the difference. Measured across the six presets:
//
//   Quiet Room -71.2 dBFS   Office -58.1   Street -55.2
//   Cafe       -53.0        Call Center -52.2   Static -39.2
//
// A 23dB spread that nobody chose, against a phone leg where every preset is
// normalised to exactly TARGET_RMS_DBFS. Office was 10dB below the phone and
// simply inaudible; Static was 9dB ABOVE it. That is also why the layers added
// to Office, Cafe and Street measured correctly on the phone and could not be
// heard in the tester — the tester was never playing the same thing.
//
// So the browser now plays the bed this module renders, as a 24kHz WAV, and
// there is one implementation of level, layers and loop length instead of two
// that were never equal. The client keeps only the preset NAMES.
//
// The WAV encoding itself lives in ambienceBed.js, not here: encodeWav() sits
// in callRecorder.js, which reaches telephonyAudio.js, which imports encodeUlaw
// and ULAW_FRAME_BYTES back out of THIS module. Importing it here closes that
// loop and Node fails the whole module graph with a TDZ error on
// ULAW_FRAME_BYTES before any test runs.
export const BROWSER_BED_RATE = 24000;

/** "Call Center" -> "call-center". Also how build-ambience-bed.mjs names files,
 *  so a synthesized preset and an ingested recording share a URL shape. */
export const bedSlug = (name) => String(name || '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const PRESET_BY_SLUG = new Map(Object.keys(AMBIENT_PRESETS).map((n) => [bedSlug(n), n]));

/** Which synthesized preset a bed URL names, if any. */
export const presetForSlug = (slug) => PRESET_BY_SLUG.get(String(slug || '')) || null;
