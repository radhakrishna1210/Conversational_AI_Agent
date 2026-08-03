#!/usr/bin/env node
/**
 * Network RTT to each provider + Sarvam streaming-TTS TTFB under concurrency.
 *   node --env-file=.env scripts/measure-providers.js
 */
import prisma from '../src/config/prisma.js';
import { streamSynthesizeVoice } from '../src/services/voice.service.js';

const hosts = [
  'https://api.deepgram.com', 'https://api.sarvam.ai',
  'https://generativelanguage.googleapis.com', 'https://api.groq.com',
  'https://api.elevenlabs.io', 'https://api.cartesia.ai',
  'https://api.fish.audio',
];

// Provider names to benchmark, e.g. `node scripts/measure-providers.js Sarvam FishAudio`.
// Defaults to Sarvam so existing invocations keep their meaning.
const TARGETS = process.argv.slice(2).filter((a) => !a.startsWith('-'));
console.log('── HTTPS round-trip (2nd request, connection reused) ──');
for (const h of hosts) {
  try {
    await fetch(h, { method: 'HEAD' }).catch(() => {});
    const t = performance.now();
    await fetch(h, { method: 'HEAD' }).catch(() => {});
    console.log(`  ${h}: ${Math.round(performance.now() - t)}ms`);
  } catch { console.log(`  ${h}: unreachable`); }
}

const sentence = 'Sure, I can help you with that right away.';
for (const providerName of (TARGETS.length ? TARGETS : ['Sarvam'])) {
  const voice = await prisma.voice.findFirst({
    where: { provider: { name: providerName } },
    include: { provider: true },
  });
  if (!voice) {
    console.log(`  ${providerName}: no voices in the DB — run POST /voices/sync first`);
    continue;
  }
  console.log(`
  ${providerName} (${voice.name}) — streaming TTFB under concurrency`);
  for (const n of [1, 4, 8]) {
    const runs = await Promise.all(Array.from({ length: n }, async () => {
      const s = performance.now();
      try {
        const { stream } = await streamSynthesizeVoice(voice, sentence, { fast: true, pace: 1.05 });
        let first = null;
        for await (const c of stream) { if (first == null) first = Math.round(performance.now() - s); void c; }
        return first;
      } catch (err) { return `ERR:${err.message.slice(0, 40)}`; }
    }));
    console.log(`    x${n} concurrent: [${runs.join(', ')}]ms`);
  }
}
await prisma.$disconnect();
process.exit(0);
