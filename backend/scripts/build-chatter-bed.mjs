#!/usr/bin/env node
// backend/scripts/build-chatter-bed.mjs
//
// Mode B background voice (reports/AMBIENCE_VOICE.md): render an indistinct
// office / call-centre chatter bed ONCE, offline, and store it as an asset the
// ambience mixer loops — zero synthesis on the hot path.
//
//   node --env-file=.env scripts/build-chatter-bed.mjs --voices id1,id2,id3 --out assets/ambience [--seed 7]
//
// Unintelligible by construction:
//   • several voices speaking innocuous, non-identifying filler sentences,
//     layered at random offsets so no single sentence is ever in the clear;
//   • band-limited to telephone bandwidth and low-passed further (speech
//     consonants live above 2kHz — removing them is what turns words into
//     murmur);
//   • normalised to the same level as the existing synthesized beds
//     (TARGET_RMS_DBFS in services/voice/ambience.js), ~42dB under speech
//     peaks, so no ducking is needed and STT cannot pick words out of it;
//   • two variants per preset, so two simultaneous calls do not share a loop.
// Deterministic for a given seed. Writes 8kHz int16 loops (phone mixer) and
// 24kHz WAVs (browser), plus a manifest with the measured levels.
import fs from 'node:fs';
import path from 'node:path';
import { makeBiquad, rmsDbfs } from '../src/services/voice/ambience.js';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const VOICES = String(opt('voices', '')).split(',').filter(Boolean);
const OUT = opt('out', path.resolve('assets/ambience'));
const SEED = Number(opt('seed', 7));
const RATE = 24000;
const LOOP_SECONDS = 24;
const TARGET_RMS_DBFS = -48;
const KEY = process.env.FISH_API_KEY;
const MODEL = process.env.FISH_TTS_MODEL || 's2.1-pro';
if (!KEY || VOICES.length < 2) { console.error('FISH_API_KEY and at least two --voices are required'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

// Neutral filler. Nothing that resembles a customer, an order, a name, a
// number or an address; generic workplace talk.
const SENTENCES = [
  'Could you send that over when you get a chance?', 'The meeting moved to three, I think.', 'Yes, that should be fine for next week.',
  'Let me check the schedule and get back to you.', 'We can go over it this afternoon.', 'Thanks, I will have a look at it later today.',
  'That sounds good, let us do it that way.', 'I will forward it to the team after lunch.', 'Do you know if the printer is working again?',
  'It is on the shared drive under this month.', 'Sure, put it on the calendar for Friday.', 'Right, I will update the notes before the call.',
];

function xorshift(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; }; }

async function synth(voice, text) {
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', model: MODEL },
    body: JSON.stringify({ text, reference_id: voice, format: 'pcm', sample_rate: RATE, latency: 'normal' }),
  });
  if (!res.ok) throw new Error(`Fish ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const chunks = []; for await (const c of res.body) chunks.push(Buffer.from(c));
  const buf = Buffer.concat(chunks);
  return new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
}

function wav(int16, rate) {
  const pcm = Buffer.from(int16.buffer, int16.byteOffset, int16.length * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Layer clips into a phase-continuous loop: clips wrap around the end. */
function layer(clips, { rand, voicesAtOnce, n }) {
  const mix = new Float32Array(n);
  let placed = 0;
  // Enough placements that on average `voicesAtOnce` voices overlap at any moment.
  const totalClipSamples = clips.reduce((a, c) => a + c.length, 0);
  const avgClip = totalClipSamples / clips.length;
  const placements = Math.round((voicesAtOnce * n) / avgClip);
  for (let i = 0; i < placements; i++) {
    const clip = clips[Math.floor(rand() * clips.length)];
    const start = Math.floor(rand() * n);
    const gain = 0.6 + rand() * 0.4;
    // Short fade in/out so a clip boundary never clicks.
    const fade = Math.round(RATE * 0.05);
    for (let j = 0; j < clip.length; j++) {
      const env = Math.min(1, j / fade, (clip.length - j) / fade);
      mix[(start + j) % n] += (clip[j] / 32768) * gain * env;
    }
    placed += 1;
  }
  return { mix, placed };
}

function filterAndLevel(mix, { lowpassHz }) {
  // Telephone band-limit, then the murmur low-pass (kills consonants), then a
  // gentle high-pass so the bed never rumbles.
  const hp = makeBiquad('highpass', 250, 0.7, RATE);
  const lp1 = makeBiquad('lowpass', lowpassHz, 0.7, RATE);
  const lp2 = makeBiquad('lowpass', lowpassHz, 0.7, RATE);
  const out = new Int16Array(mix.length);
  const tmp = new Float32Array(mix.length);
  for (let i = 0; i < mix.length; i++) tmp[i] = lp2.process(lp1.process(hp.process(mix[i])));
  // Level to the target RMS.
  let s = 0; for (let i = 0; i < tmp.length; i++) s += tmp[i] * tmp[i];
  const rms = Math.sqrt(s / tmp.length) || 1e-9;
  const target = Math.pow(10, TARGET_RMS_DBFS / 20);
  const g = target / rms;
  for (let i = 0; i < tmp.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(tmp[i] * g * 32768)));
  return out;
}

/** 24k → 8k: average every 3 samples (the low-pass above already removed >4kHz). */
function downsample3(int16) {
  const out = new Int16Array(Math.floor(int16.length / 3));
  for (let i = 0; i < out.length; i++) out[i] = Math.round((int16[i * 3] + int16[i * 3 + 1] + int16[i * 3 + 2]) / 3);
  return out;
}

const PRESETS = [
  { name: 'office-chatter', voicesAtOnce: 2.0, lowpassHz: 1400 },
  { name: 'call-center-chatter', voicesAtOnce: 3.5, lowpassHz: 1600 },
];

(async () => {
  console.log(`synthesizing ${SENTENCES.length} sentences × ${VOICES.length} voices on ${MODEL}…`);
  const clips = [];
  for (const v of VOICES) {
    for (const t of SENTENCES) {
      try { clips.push(await synth(v, t)); process.stdout.write('.'); }
      catch (e) { console.log(`\nskip (${e.message})`); }
    }
  }
  console.log(`\n${clips.length} clips, ${(clips.reduce((a, c) => a + c.length, 0) / RATE).toFixed(1)}s of speech`);
  if (clips.length < 6) { console.error('too few clips'); process.exit(1); }
  const n = RATE * LOOP_SECONDS;
  const manifest = { model: MODEL, voices: VOICES.length, sentences: SENTENCES.length, clips: clips.length, seed: SEED, loopSeconds: LOOP_SECONDS, targetRmsDbfs: TARGET_RMS_DBFS, beds: [] };
  for (const p of PRESETS) {
    for (const variant of [1, 2]) {
      const rand = xorshift(SEED * 1000 + variant * 17 + p.name.length);
      const { mix, placed } = layer(clips, { rand, voicesAtOnce: p.voicesAtOnce, n });
      const bed24 = filterAndLevel(mix, { lowpassHz: p.lowpassHz });
      const bed8 = downsample3(bed24);
      const base = `${p.name}-${variant}`;
      fs.writeFileSync(path.join(OUT, `${base}.8k.pcm`), Buffer.from(bed8.buffer, bed8.byteOffset, bed8.length * 2));
      fs.writeFileSync(path.join(OUT, `${base}.24k.wav`), wav(bed24, RATE));
      const entry = { preset: p.name, variant, placements: placed, rmsDbfs8k: +rmsDbfs(bed8).toFixed(1), rmsDbfs24k: +rmsDbfs(bed24).toFixed(1), files: [`${base}.8k.pcm`, `${base}.24k.wav`] };
      manifest.beds.push(entry);
      console.log(JSON.stringify(entry));
    }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`wrote ${OUT}/manifest.json`);
})().catch((e) => { console.error(e); process.exit(1); });
