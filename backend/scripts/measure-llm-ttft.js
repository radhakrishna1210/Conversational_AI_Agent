#!/usr/bin/env node
/**
 * Bake-off: time-to-first-token for every LLM the voice pipeline could use.
 *
 *   node --env-file=.env scripts/measure-llm-ttft.js
 *   node --env-file=.env scripts/measure-llm-ttft.js --runs 10
 *
 * WHY THIS EXISTS AS A BAKE-OFF RATHER THAN A SINGLE MEASUREMENT.
 *
 * On a voice call the LLM's first token is the whole latency budget: endpointing
 * and TTS are a few hundred milliseconds each and barely move, while the model's
 * first token has been observed anywhere from 1s to 20s. And the spread is not a
 * property of the prompt — a 343-token prompt produced an 8.9s first token on
 * the same endpoint that answered a 2,573-token one in 1.2s. It is capacity on
 * the provider's side, it differs per model, and it changes without notice.
 *
 * So the only way to choose the voice model is to measure it, and the number
 * that matters is the SPREAD, not the mean: a call is judged on its worst turns.
 * A model with a 1.05s p50 and a 1.2s max beats one with a 1.4s p50 and a 20s
 * max, every time, and averaging the two hides exactly that.
 *
 * Re-run this before changing VOICE_LLM_MODEL (see resolveLlmForAgent).
 */
import { geminiService } from '../src/services/gemini.service.js';
import { groqService } from '../src/services/groq.service.js';

const RUNS = Number(process.argv[process.argv.indexOf('--runs') + 1]) || 6;

// Voice-sized: the real system prompt for a live agent measures ~11.5k chars
// (~2.9k tokens) once persona, conversation rules and speech rules are built.
const systemPrompt =
  'You are Riya, a warm receptionist for a dental clinic. Keep replies to 1-2 short spoken sentences.'
  + ' Context filler.'.repeat(700);
const chatHistory = [
  { role: 'user', content: 'Hi, I wanted to ask about an appointment.' },
  { role: 'assistant', content: 'Of course — what day were you thinking of?' },
];
const message = 'What are your business hours on weekends?';

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];

async function probe(label, svc, model) {
  const ttfts = [];
  let failure = null;
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    let ttft = null;
    try {
      const stream = svc.generateResponseStream(
        message,
        { model, temperature: 0.7 },
        { systemPrompt, chatHistory, maxTokens: 320, thinkingBudget: 0 },
      );
      for await (const d of stream) {
        if (ttft == null && d) ttft = Math.round(performance.now() - t0);
      }
      if (ttft != null) ttfts.push(ttft);
    } catch (e) {
      failure = e.message.slice(0, 120).replace(/\s+/g, ' ');
      break;
    }
  }
  if (failure) { console.log(`${label.padEnd(34)} FAILED  ${failure}`); return; }
  if (!ttfts.length) { console.log(`${label.padEnd(34)} no tokens returned`); return; }
  const s = [...ttfts].sort((a, b) => a - b);
  console.log(
    `${label.padEnd(34)} min=${String(s[0]).padStart(6)}  p50=${String(pct(s, 0.5)).padStart(6)}`
    + `  p90=${String(pct(s, 0.9)).padStart(6)}  max=${String(s[s.length - 1]).padStart(6)}   [${s.join(' ')}]`,
  );
}

console.log(`time-to-first-token, ${RUNS} runs each, ms — lower AND tighter is better\n`);

// Candidates, not just the one in use: the point is the comparison.
const GEMINI = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
if (process.env.GEMINI_API_KEY) {
  for (const m of GEMINI) await probe(m, geminiService, m);
} else {
  console.log('GEMINI_API_KEY not set — skipping Gemini');
}

// Groq's catalogue turns over fast and it does NOT keep retired ids working —
// a decommissioned model is a 404 on every turn, i.e. a dead call, so the
// configured one is measured alongside the alternatives rather than assumed.
// `GET https://api.groq.com/openai/v1/models` lists what the key can reach.
const GROQ = [...new Set([
  process.env.GROQ_MODEL,
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
].filter(Boolean))];
if (process.env.GROQ_API_KEY) {
  for (const m of GROQ) await probe(`groq ${m}`, groqService, m);
} else {
  console.log('GROQ_API_KEY not set — skipping Groq');
}

console.log(`\nCurrently serving voice turns: ${process.env.VOICE_LLM_MODEL || 'gemini-3.5-flash-lite'}`);
process.exit(0);
