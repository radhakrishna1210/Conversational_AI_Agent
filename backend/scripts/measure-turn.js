#!/usr/bin/env node
/**
 * Latency waterfall harness — runs REAL voiceTurnStream turns against a real
 * agent (real LLM + TTS providers, real network) and prints a per-hop
 * millisecond waterfall, plus isolated TTS time-to-first-byte per provider.
 *
 *   node --env-file=.env scripts/measure-turn.js [agentId] [turns]
 *
 * STT is exercised separately in production logs (Deepgram streaming, sttMs≈0);
 * here we inject the transcript (providedText) exactly the way the WS handler
 * does after a streaming-STT turn, so the numbers isolate LLM + TTS.
 */

import prisma from '../src/config/prisma.js';
import { voiceTurnStream } from '../src/services/agentRuntime.service.js';
import { resolveAgentVoice, streamSynthesizeVoice } from '../src/services/voice.service.js';

const agentIdArg = process.argv[2];
const TURNS = Number(process.argv[3]) || 3;

const PROMPTS = [
  'Hi, what services do you offer?',
  'What are your business hours on weekends?',
  'Okay, can you book me an appointment for tomorrow morning?',
  'How much does that cost?',
  'Thanks, that is all I needed.',
];

// 200ms of silence @24kHz — satisfies the audioBuffer param; providedText
// short-circuits STT the same way the WS handler does.
function silentWav() {
  const sampleRate = 24000;
  const pcm = Buffer.alloc(Math.round(sampleRate * 0.2) * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function main() {
  const agent = agentIdArg
    ? await prisma.agent.findFirst({ where: { id: agentIdArg } })
    : await prisma.agent.findFirst({ where: { voice: { not: null } }, orderBy: { updatedAt: 'desc' } });
  if (!agent) throw new Error('No agent found');
  const voice = await resolveAgentVoice(agent.voice).catch(() => null);
  console.log(`Agent: ${agent.name} (${agent.id})`);
  console.log(`  voice label: ${agent.voice}`);
  console.log(`  resolved voice: ${voice ? `${voice.provider?.name} / ${voice.name} (${voice.providerVoiceId})` : 'NONE'}`);
  console.log(`  VOICE_TTS_OVERLAP=${process.env.VOICE_TTS_OVERLAP} ELEVENLABS_TTS_MODEL=${process.env.ELEVENLABS_TTS_MODEL}`);

  const wav = silentWav();
  let history = [];

  for (let i = 0; i < TURNS; i++) {
    const userText = PROMPTS[i % PROMPTS.length];
    const t0 = performance.now();
    let firstEventAt = null; let firstAudioChunkAt = null; let audioBytes = 0; let doneTimings = null; let replyText = '';
    console.log(`\n── Turn ${i + 1}: "${userText}"`);
    await voiceTurnStream(agent.workspaceId, agent.id, wav, 'audio/wav', history, {
      userText,
      audioHadSpeech: true,
      affect: i === 2 ? 'agitated' : null, // exercise the affect path once
      onEvent: (e) => {
        const t = Math.round(performance.now() - t0);
        if (firstEventAt == null) firstEventAt = t;
        if (e.type === 'audio-start') console.log(`  +${t}ms audio-start (${e.contentType})`);
        else if (e.type === 'audio-chunk') {
          if (firstAudioChunkAt == null) { firstAudioChunkAt = t; console.log(`  +${t}ms FIRST AUDIO CHUNK`); }
          audioBytes += Buffer.from(e.data, 'base64').length;
        } else if (e.type === 'audio-end') { console.log(`  +${t}ms audio-end (${audioBytes} bytes total)`); replyText = e.text || ''; }
        else if (e.type === 'done') { doneTimings = e.timings; }
      },
    });
    console.log(`  timings: ${JSON.stringify(doneTimings)}`);
    console.log(`  PERCEIVED (end-of-speech→first audio, excl. endpointing): ${firstAudioChunkAt}ms`);
    history = [...history, { role: 'user', content: userText }, { role: 'assistant', content: replyText || '(reply)' }];
  }

  // ── Isolated TTS TTFB per configured provider ─────────────────────────────
  console.log('\n── Isolated TTS time-to-first-byte (fixed sentence) ──');
  const sentence = 'Sure, I can help you with that right away.';
  const voices = await prisma.voice.findMany({ include: { provider: true }, take: 200 });
  const byProvider = new Map();
  for (const v of voices) if (!byProvider.has(v.provider?.name)) byProvider.set(v.provider?.name, v);
  for (const [name, v] of byProvider) {
    try {
      const s = performance.now();
      const { stream } = await streamSynthesizeVoice(v, sentence, { fast: true, pace: 1.05 });
      let first = null; let bytes = 0;
      for await (const c of stream) { if (first == null) first = Math.round(performance.now() - s); bytes += c.length; }
      const total = Math.round(performance.now() - s);
      console.log(`  ${name} (${v.name}): TTFB=${first}ms total=${total}ms bytes=${bytes}`);
    } catch (err) {
      console.log(`  ${name}: FAILED — ${err.message.slice(0, 120)}`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
