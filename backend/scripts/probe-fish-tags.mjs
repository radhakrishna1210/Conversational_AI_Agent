#!/usr/bin/env node
// backend/scripts/probe-fish-tags.mjs
//
// Mode A evaluation for background voice ambience (reports/AMBIENCE_VOICE.md):
// does the Fish Audio model this deployment actually uses (FISH_TTS_MODEL)
// honour an S2 inline tag asking for background chatter — and, the dominant
// risk, does it ever READ THE TAG ALOUD?
//
//   node --env-file=.env scripts/probe-fish-tags.mjs --voice <reference_id> --out <dir> [--runs 3]
//
// For each variant (plain sentence, sentence with a leading tag, sentence with
// a mid tag) it synthesizes PCM, measures time-to-first-byte, saves a WAV, then:
//   • sends the WAV to Deepgram's prerecorded endpoint and checks the
//     transcript for the tag's words ("office", "chatter", "crowd", "murmur",
//     "background") — a leak is a hard fail;
//   • measures the RMS of the quietest 300ms windows (the "floor") — a working
//     background bed raises the floor relative to the plain sentence.
// Costs: Fish TTS credits and a few Deepgram prerecorded seconds per run.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const VOICE = opt('voice', null);
const OUT = opt('out', null);
const RUNS = Number(opt('runs', 2));
const RATE = 24000;
if (!VOICE || !OUT) { console.error('--voice and --out are required'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const MODEL = process.env.FISH_TTS_MODEL || 's2.1-pro';
const KEY = process.env.FISH_API_KEY;
if (!KEY) { console.error('FISH_API_KEY not set'); process.exit(2); }

const SENTENCE = 'Thanks for calling Sunrise Dental, this is Riya. How can I help you today?';
const VARIANTS = [
  { id: 'plain', text: SENTENCE },
  { id: 'lead_office', text: `[office chatter in the background] ${SENTENCE}` },
  { id: 'lead_callcenter', text: `[busy call centre background, many people talking indistinctly] ${SENTENCE}` },
  { id: 'mid_crowd', text: `Thanks for calling Sunrise Dental, this is Riya. [crowd murmur] How can I help you today?` },
  { id: 'lead_rustle', text: `[rustling sound] ${SENTENCE}` },
];
const LEAK_WORDS = ['office', 'chatter', 'background', 'call centre', 'call center', 'people talking', 'crowd', 'murmur', 'rustling', 'indistinct'];

async function synth(text) {
  const t0 = performance.now();
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', model: MODEL },
    body: JSON.stringify({ text, reference_id: VOICE, format: 'pcm', sample_rate: RATE, latency: 'balanced', chunk_length: 150 }),
  });
  if (!res.ok) throw new Error(`Fish ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const chunks = []; let ttfb = null;
  for await (const c of res.body) { if (ttfb == null) ttfb = Math.round(performance.now() - t0); chunks.push(Buffer.from(c)); }
  return { pcm: Buffer.concat(chunks), ttfbMs: ttfb, totalMs: Math.round(performance.now() - t0) };
}
function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
function floorDbfs(pcm) {
  const win = Math.round(RATE * 0.3) * 2; const r = [];
  for (let i = 0; i + win <= pcm.length; i += win / 2) {
    let s = 0; const n = win / 2;
    for (let j = 0; j < win; j += 2) { const v = pcm.readInt16LE(i + j) / 32768; s += v * v; }
    r.push(20 * Math.log10(Math.max(Math.sqrt(s / n), 1e-6)));
  }
  r.sort((a, b) => a - b);
  const q = (p) => r[Math.min(r.length - 1, Math.floor(p * r.length))];
  return { p10: +q(0.1).toFixed(1), p50: +q(0.5).toFixed(1), windows: r.length };
}
async function transcribe(w) {
  if (!process.env.DEEPGRAM_API_KEY) return null;
  const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
    method: 'POST', headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'audio/wav' }, body: w,
  });
  if (!res.ok) return `(deepgram ${res.status})`;
  const j = await res.json();
  return j?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
}

const rows = [];
for (const v of VARIANTS) {
  for (let r = 0; r < RUNS; r++) {
    try {
      const { pcm, ttfbMs, totalMs } = await synth(v.text);
      const w = wav(pcm);
      const file = path.join(OUT, `${v.id}_${r}.wav`);
      fs.writeFileSync(file, w);
      const transcript = await transcribe(w);
      const leaked = transcript ? LEAK_WORDS.filter((k) => transcript.toLowerCase().includes(k)) : [];
      const row = { variant: v.id, run: r, model: MODEL, ttfbMs, totalMs, seconds: +(pcm.length / 2 / RATE).toFixed(2), floor: floorDbfs(pcm), transcript, leaked, file: path.basename(file) };
      rows.push(row);
      console.log(`${v.id.padEnd(16)} run${r} ttfb=${ttfbMs}ms len=${row.seconds}s floor p10=${row.floor.p10}dBFS leak=${leaked.length ? leaked.join('|') : 'none'} :: "${transcript}"`);
    } catch (e) {
      rows.push({ variant: v.id, run: r, model: MODEL, error: e.message });
      console.log(`${v.id.padEnd(16)} run${r} ERROR ${e.message}`);
    }
  }
}
fs.writeFileSync(path.join(OUT, 'probe_fish_tags.json'), JSON.stringify(rows, null, 2));
const plain = rows.filter((r) => r.variant === 'plain' && r.floor).map((r) => r.floor.p10);
console.log(JSON.stringify({ model: MODEL, voice: VOICE, plainFloorP10: plain, leaks: rows.filter((r) => r.leaked?.length).map((r) => `${r.variant}#${r.run}`), errors: rows.filter((r) => r.error).length }));
