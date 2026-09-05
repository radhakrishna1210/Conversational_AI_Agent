#!/usr/bin/env node
// backend/scripts/build-ambience-bed.mjs
//
// Turn a SOURCE RECORDING into an ambience bed asset, in exactly the shape
// services/voice/ambience.js#loadSampledBed already reads:
//
//   node scripts/build-ambience-bed.mjs --in room.wav --preset "Office"
//   → assets/ambience/office-1.8k.pcm   (phone mixer, 8kHz int16, 24s)
//   → assets/ambience/office-1.24k.wav  (browser, 24kHz mono WAV, 24s)
//   → assets/ambience/manifest.json     (merged, not overwritten)
//
// ── Why this exists next to build-chatter-bed.mjs ────────────────────────────
//
// That script RENDERS a bed from Fish Audio TTS. This one INGESTS one that
// already exists — a field recording, a library clip, anything the operator has
// the right to ship. The two converge on the same output because everything
// downstream (loadSampledBed, createAmbienceSource, ambiencePump, the browser's
// startSampledBed) is already written against that one shape; nothing below is
// a new format, it is the existing one reached from a different direction.
//
// The six synthesized presets (Quiet Room, Office, Call Center, Static, Cafe,
// Street) are white noise through a biquad — cheap and seam-free, but audibly
// synthetic. Replacing them with real room tone is a drop-in: an agent stores
// the preset NAME, and renderAmbienceLoop() checks SAMPLED_AMBIENT_PRESETS
// before AMBIENT_PRESETS, so a preset gains an asset without any agent changing.
//
// ── WAV in, deliberately ─────────────────────────────────────────────────────
//
// This backend has no audio library and adding one for an offline script would
// be the wrong trade. A RIFF/WAVE parser is ~60 lines and covers everything a
// person can produce with one ffmpeg command or a Save As in any editor:
//
//   ffmpeg -i whatever.mp3 -ac 1 -ar 48000 -c:a pcm_s16le room.wav
//
// Any sample rate, mono or stereo, 16/24/32-bit PCM or 32-bit float. MP3/OGG/
// FLAC are refused with that command in the error, rather than half-decoded.
//
// ── What it does to the audio, and why ───────────────────────────────────────
//
//  1. downmix to mono          the carrier leg is one mono track
//  2. resample to 24kHz        the browser bed's rate; 8k is decimated from it
//  3. band-limit 200-3400Hz    telephone band. The high-pass keeps a recording's
//                              rumble out of a signal that is about to be summed
//                              under speech; the low-pass is the anti-alias
//                              filter the 24k->8k step needs, and applying it to
//                              BOTH outputs is what keeps the browser bed and
//                              the phone bed sounding like each other (the same
//                              principle the whole voice pipeline is built on).
//  4. loop-crossfade to 24s    equal-power fold of the tail into the head, the
//                              same construction renderAmbienceLoop() uses, so
//                              the seam is inaudible on an endless loop.
//  5. level to -48 dBFS        TARGET_RMS_DBFS — ~42dB under speech peaks, which
//                              is what lets mixUlawFrame() skip ducking.
//
// Two variants are cut from non-overlapping windows when the source is long
// enough (>= 2 x 24s + fade), so two concurrent callers do not share a loop —
// the same reason the chatter presets have two.

import fs from 'node:fs';
import path from 'node:path';
import { makeBiquad, rmsDbfs } from '../src/services/voice/ambience.js';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(`--${k}`);

const IN = opt('in', null);
const PRESET = opt('preset', null);
const OUT = opt('out', path.resolve('assets/ambience'));
const RATE = 24000;
const LOOP_SECONDS = 24;
const TARGET_RMS_DBFS = -48;
const HIGHPASS_HZ = Number(opt('highpass', 200));
const LOWPASS_HZ = Number(opt('lowpass', 3400));
/** Where in the source to start reading, for trimming a noisy head. */
const OFFSET_SEC = Number(opt('offset', 0));
const DRY_RUN = has('dry-run');

if (!IN || !PRESET) {
  console.error(`usage: node scripts/build-ambience-bed.mjs --in <file.wav> --preset "<Preset Name>" [options]

  --in <file.wav>     source recording (WAV; see header for the ffmpeg one-liner)
  --preset "<name>"   preset name as stored on agents, e.g. "Office", "Cafe"
  --out <dir>         asset directory (default assets/ambience)
  --offset <sec>      skip this much of the source before reading (default 0)
  --highpass <hz>     default ${HIGHPASS_HZ}
  --lowpass <hz>      default ${LOWPASS_HZ} (also the 24k->8k anti-alias filter)
  --dry-run           analyse and report, write nothing`);
  process.exit(2);
}

/** "Call Center" -> "call-center". The asset basename, and stable: renaming it
 *  orphans every agent that stored the preset, which is what ambience.test.js
 *  pins the name set to prevent. */
const slug = String(PRESET).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
if (!slug) { console.error(`--preset "${PRESET}" has no usable characters`); process.exit(2); }

// ─── RIFF/WAVE reader ────────────────────────────────────────────────────────

/**
 * Chunks are WALKED, not assumed to sit at fixed offsets. An editor's export
 * routinely puts LIST/fact/bext between `fmt ` and `data`, and the fixed-offset
 * reader every quick script starts with then reads metadata as audio — which
 * sounds like a burst of noise at the head of the bed rather than failing.
 * @returns {{ channels: number, rate: number, samples: Float32Array }}
 */
function readWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file — convert first: ffmpeg -i <src> -ac 1 -ar 48000 -c:a pcm_s16le out.wav');
  }
  let fmt = null;
  let data = null;
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      const channels = buf.readUInt16LE(body + 2);
      const rate = buf.readUInt32LE(body + 4);
      const bits = buf.readUInt16LE(body + 14);
      // WAVE_FORMAT_EXTENSIBLE stores the real format in the subformat GUID's
      // first two bytes; without this a plain 24-bit export reads as "unknown".
      if (format === 0xfffe && size >= 40) format = buf.readUInt16LE(body + 24);
      fmt = { format, channels, rate, bits };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(body + size, buf.length));
    }
    pos = body + size + (size & 1); // chunks are word-aligned
  }
  if (!fmt) throw new Error('no fmt chunk');
  if (!data) throw new Error('no data chunk');

  const { format, channels, rate, bits } = fmt;
  const bytes = bits >> 3;
  const frames = Math.floor(data.length / (bytes * channels));
  const out = new Float32Array(frames * channels);

  // Everything is normalised to [-1, 1] here so the rest of the script never
  // has to care what the source was.
  const read = format === 3 && bits === 32 ? (o) => data.readFloatLE(o)
    : bits === 16 ? (o) => data.readInt16LE(o) / 32768
      : bits === 24 ? (o) => ((data[o] | (data[o + 1] << 8) | (data[o + 2] << 24 >> 8)) << 8 >> 8) / 8388608
        : bits === 32 ? (o) => data.readInt32LE(o) / 2147483648
          : bits === 8 ? (o) => (data[o] - 128) / 128 // 8-bit WAV is unsigned
            : null;
  if (!read) throw new Error(`unsupported WAV: format=${format} bits=${bits}`);

  for (let i = 0; i < out.length; i++) out[i] = read(i * bytes);
  return { channels, rate, samples: out };
}

function wav(int16, rate) {
  const pcm = Buffer.from(int16.buffer, int16.byteOffset, int16.length * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// ─── Signal path ─────────────────────────────────────────────────────────────

const toMono = (samples, channels) => {
  if (channels === 1) return samples;
  const frames = Math.floor(samples.length / channels);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += samples[i * channels + c];
    out[i] = s / channels;
  }
  return out;
};

/**
 * Resample to RATE.
 *
 * Anti-aliased then linearly interpolated. Linear interpolation is a poor
 * reconstruction filter in general and entirely adequate here: the signal has
 * already been low-passed well below the new Nyquist, so the error it makes
 * lives in a band this bed does not occupy. A windowed-sinc would be more
 * correct and inaudible at -48 dBFS under speech.
 */
function resample(mono, srcRate) {
  if (srcRate === RATE) return mono;
  let src = mono;
  if (srcRate > RATE) {
    // Two cascaded sections: one biquad's 12dB/octave is not enough to put a
    // 48kHz source's top octave under the noise floor before decimation.
    const a = makeBiquad('lowpass', RATE * 0.45, 0.707, srcRate);
    const b = makeBiquad('lowpass', RATE * 0.45, 0.707, srcRate);
    src = new Float32Array(mono.length);
    for (let i = 0; i < mono.length; i++) src[i] = b.process(a.process(mono[i]));
  }
  const ratio = srcRate / RATE;
  const n = Math.floor(src.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const frac = x - i0;
    const s0 = src[i0] ?? 0;
    const s1 = src[i0 + 1] ?? s0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

/** Telephone band-limit. Applied to both outputs — see the header. */
function bandLimit(mono) {
  const hp = makeBiquad('highpass', HIGHPASS_HZ, 0.707, RATE);
  const lp1 = makeBiquad('lowpass', LOWPASS_HZ, 0.707, RATE);
  const lp2 = makeBiquad('lowpass', LOWPASS_HZ, 0.707, RATE);
  const out = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) out[i] = lp2.process(lp1.process(hp.process(mono[i])));
  return out;
}

/**
 * One seamless LOOP_SECONDS loop starting at `from`.
 *
 * Equal-power fold of the tail into the head, identical to renderAmbienceLoop()
 * — a power-preserving fade is both sufficient and artifact-free on a signal
 * with no periodic structure to phase-match.
 * @returns {Float32Array|null} null when there is not enough source left
 */
function loopWindow(mono, from) {
  const n = RATE * LOOP_SECONDS;
  const fade = Math.floor(RATE * 0.25);
  if (from + n + fade > mono.length) return null;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = mono[from + i];
    if (i < fade) {
      const t = i / fade;
      out[i] = v * Math.sqrt(t) + mono[from + n + i] * Math.sqrt(1 - t);
    } else {
      out[i] = v;
    }
  }
  return out;
}

/** Level to TARGET_RMS_DBFS and quantise. */
function level(mono) {
  let s = 0;
  for (let i = 0; i < mono.length; i++) s += mono[i] * mono[i];
  const rms = Math.sqrt(s / mono.length) || 1e-9;
  const g = (10 ** (TARGET_RMS_DBFS / 20)) / rms;
  const out = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, Math.round(mono[i] * g * 32768)));
  }
  return out;
}

/** 24k → 8k. The band-limit above is the anti-alias filter; this averages. */
function downsample3(int16) {
  const out = new Int16Array(Math.floor(int16.length / 3));
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.round((int16[i * 3] + int16[i * 3 + 1] + int16[i * 3 + 2]) / 3);
  }
  return out;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const raw = readWav(fs.readFileSync(IN));
const srcSeconds = raw.samples.length / raw.channels / raw.rate;
console.log(`in:  ${path.basename(IN)} — ${raw.rate}Hz ${raw.channels}ch, ${srcSeconds.toFixed(1)}s`);

const mono = bandLimit(resample(toMono(raw.samples, raw.channels), raw.rate));
const offset = Math.floor(OFFSET_SEC * RATE);
const need = RATE * LOOP_SECONDS + Math.floor(RATE * 0.25);

if (offset + need > mono.length) {
  const have = ((mono.length - offset) / RATE).toFixed(1);
  console.error(
    `\nsource is too short: need ${(need / RATE).toFixed(1)}s after --offset ${OFFSET_SEC}, have ${have}s.\n`
    + 'A bed is a 24s loop; anything shorter would repeat audibly under a conversation.',
  );
  process.exit(1);
}

// A second variant only when it can come from a genuinely different stretch —
// two windows of the same audio would defeat the point of having two.
const windows = [offset];
if (offset + 2 * need <= mono.length) windows.push(offset + need);

fs.mkdirSync(OUT, { recursive: true });
const manifestPath = path.join(OUT, 'manifest.json');
// MERGED, never overwritten: this directory is shared with build-chatter-bed.mjs
// and clobbering its manifest would erase the provenance of assets this script
// did not build.
let manifest = { beds: [] };
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* first run */ }
if (!Array.isArray(manifest.beds)) manifest.beds = [];

const files = [];
windows.forEach((from, i) => {
  const variant = i + 1;
  const win = loopWindow(mono, from);
  const bed24 = level(win);
  const bed8 = downsample3(bed24);
  const base = `${slug}-${variant}`;

  const entry = {
    preset: slug,
    variant,
    source: path.basename(IN),
    sourceRate: raw.rate,
    sourceChannels: raw.channels,
    windowStartSec: +(from / RATE).toFixed(2),
    highpassHz: HIGHPASS_HZ,
    lowpassHz: LOWPASS_HZ,
    loopSeconds: LOOP_SECONDS,
    rmsDbfs8k: +rmsDbfs(bed8).toFixed(1),
    rmsDbfs24k: +rmsDbfs(bed24).toFixed(1),
    files: [`${base}.8k.pcm`, `${base}.24k.wav`],
    builtAt: new Date().toISOString(),
  };

  if (!DRY_RUN) {
    fs.writeFileSync(path.join(OUT, `${base}.8k.pcm`), Buffer.from(bed8.buffer, bed8.byteOffset, bed8.length * 2));
    fs.writeFileSync(path.join(OUT, `${base}.24k.wav`), wav(bed24, RATE));
    manifest.beds = manifest.beds.filter((b) => b.preset !== slug || b.variant !== variant);
    manifest.beds.push(entry);
  }
  files.push(...entry.files);
  console.log(JSON.stringify(entry));
});

if (DRY_RUN) {
  console.log('\n--dry-run: nothing written');
} else {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nwrote ${files.length} files to ${OUT}`);
  console.log(`\nNow register the preset in services/voice/ambience.js:\n`
    + `  '${PRESET}': { files: [${windows.map((_, i) => `'${slug}-${i + 1}'`).join(', ')}] },`);
}
