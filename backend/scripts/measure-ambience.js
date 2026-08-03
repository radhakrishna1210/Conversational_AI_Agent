#!/usr/bin/env node
/**
 * Ambience bench: per-preset levels, pump pacing, and WAV dumps so the phone bed
 * can be HEARD before anyone places a real call.
 *
 *   node scripts/measure-ambience.js [--dump] [--seconds=8]
 *
 * --dump writes 8kHz WAVs to backend/tmp/ambience/ — one bed-only file per
 * preset, plus a mixed file (speech over bed) so the two can be compared. The
 * things this CANNOT tell you are listed at the end; those need a real handset.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AMBIENT_PRESETS, ULAW_FRAME_BYTES, createAmbienceSource, renderAmbienceLoop,
  mixUlawFrame, decodeUlaw, encodeUlaw, rmsDbfs,
} from '../src/services/voice/ambience.js';
import { createAmbiencePump } from '../src/services/voice/ambiencePump.js';

const DUMP = process.argv.includes('--dump');
const SECONDS = Number((process.argv.find((a) => a.startsWith('--seconds=')) || '').split('=')[1]) || 8;
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tmp', 'ambience');

const peakDbfs = (a) => {
  let p = 0;
  for (const v of a) if (Math.abs(v) > p) p = Math.abs(v);
  return 20 * Math.log10(Math.max(p, 1) / 32768);
};

/** Minimal RIFF writer — mirrors pcm16ToWav in webCallModularRealtime.handler.js. */
function writeWav(file, int16, sampleRate) {
  const pcm = Buffer.alloc(int16.length * 2);
  for (let i = 0; i < int16.length; i++) pcm.writeInt16LE(int16[i], i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}

console.log('\n── Bed levels (8kHz, as heard on the phone leg) ──');
console.log('  preset         rms dBFS   peak dBFS   loop');
for (const preset of Object.keys(AMBIENT_PRESETS)) {
  const loop = renderAmbienceLoop(preset);
  console.log(
    `  ${preset.padEnd(13)} ${rmsDbfs(loop).toFixed(1).padStart(8)}   ${peakDbfs(loop).toFixed(1).padStart(9)}   ${(loop.length / 8000).toFixed(1)}s`,
  );
}
console.log('  (target ≈ -48 dBFS; Quiet Room deliberately lower. Speech peaks near -6.)');

console.log('\n── Pump pacing (realtime = 50 fps) ──');
for (const preset of ['Office']) {
  const stamps = [];
  const pump = createAmbiencePump({ presetName: preset, send: () => stamps.push(Date.now()) });
  pump.start();
  await new Promise((r) => setTimeout(r, 2000));
  pump.stop();
  const gaps = stamps.slice(1).map((t, i) => t - stamps[i]).sort((a, b) => a - b);
  const p = (q) => gaps[Math.floor(gaps.length * q)] ?? 0;
  console.log(`  ${preset}: ${stamps.length} frames in 2s (expect ~100)`);
  console.log(`  inter-frame gap ms — p50=${p(0.5)} p95=${p(0.95)} max=${gaps[gaps.length - 1]}`);
  console.log(`  stats: ${JSON.stringify(pump.stats())}`);
}

if (DUMP) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Bed only.
  for (const preset of Object.keys(AMBIENT_PRESETS)) {
    const src = createAmbienceSource(preset);
    const n = Math.ceil((SECONDS * 8000) / ULAW_FRAME_BYTES);
    const out = new Int16Array(n * ULAW_FRAME_BYTES);
    for (let f = 0; f < n; f++) {
      // Round-trip through µ-law so the file has the SAME grain the caller hears,
      // not the clean pre-companding signal.
      const frame = decodeUlaw(mixUlawFrame(null, src.nextFrame()));
      out.set(frame, f * ULAW_FRAME_BYTES);
    }
    writeWav(path.join(OUT_DIR, `${preset.replace(/\s+/g, '-').toLowerCase()}.wav`), out, 8000);
  }
  // Speech over bed, for judging whether the bed intrudes on intelligibility.
  const src = createAmbienceSource('Call Center');
  const n = Math.ceil((SECONDS * 8000) / ULAW_FRAME_BYTES);
  const out = new Int16Array(n * ULAW_FRAME_BYTES);
  for (let f = 0; f < n; f++) {
    const speech = new Int16Array(ULAW_FRAME_BYTES);
    // Talk for 1s, pause 1s, so bed-under-speech and bed-alone alternate.
    if (Math.floor((f * 20) / 1000) % 2 === 0) {
      for (let i = 0; i < speech.length; i++) {
        const t = (f * ULAW_FRAME_BYTES + i) / 8000;
        speech[i] = Math.round(9000 * Math.sin(2 * Math.PI * 220 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t)));
      }
    }
    out.set(decodeUlaw(mixUlawFrame(encodeUlaw(speech), src.nextFrame())), f * ULAW_FRAME_BYTES);
  }
  writeWav(path.join(OUT_DIR, 'call-center-with-speech.wav'), out, 8000);
  console.log(`\n  WAVs written to ${OUT_DIR}`);
}

console.log(`
── Still needs a REAL call (cannot be measured here) ──
  1. Handset AEC: the bed plays into the caller's ear and their mic may return
     it. If the engine's VAD reads that as speech you get phantom turns — BUG-001
     on the phone leg. Test on a handset AND on speakerphone (worst case).
  2. Perceived loudness on an earpiece, through the carrier's AGC.
  3. Whether the quiet bed sounds like a room or like a bad line.
  4. Jitter-buffer drift: is the agent later at minute 5 than at minute 1?
  5. Whether the 24s transient cycle reads as a loop.
  6. That barge-in still cuts the agent off crisply.
${DUMP ? '' : '\n  (re-run with --dump to write WAVs you can listen to)'}
`);
process.exit(0);
