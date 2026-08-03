#!/usr/bin/env node
/**
 * Measures LLM time-to-first-token vs full completion for the configured
 * providers (Gemini flash-lite and Groq), with a voice-sized system prompt.
 *   node --env-file=.env scripts/measure-llm-ttft.js
 */
import { geminiService } from '../src/services/gemini.service.js';
import { groqService } from '../src/services/groq.service.js';

const systemPrompt = 'You are Riya, a warm receptionist for a dental clinic. Keep replies to 1-2 short spoken sentences.' + ' Context filler.'.repeat(200);
const message = 'What are your business hours on weekends?';

async function probe(name, svc, model) {
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    let ttft = null; let chars = 0;
    try {
      for await (const d of svc.generateResponseStream(message, { model, temperature: 0.7 }, { systemPrompt, maxTokens: 320, thinkingBudget: 0 })) {
        if (ttft == null) ttft = Math.round(performance.now() - t0);
        chars += d.length;
      }
      console.log(`${name} run${i + 1}: TTFT=${ttft}ms total=${Math.round(performance.now() - t0)}ms chars=${chars}`);
    } catch (e) { console.log(`${name} run${i + 1}: FAILED ${e.message.slice(0, 100)}`); }
  }
}

await probe('gemini flash-lite', geminiService, 'gemini-3.1-flash-lite');
if (process.env.GROQ_API_KEY) await probe('groq ' + (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'), groqService, process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');
process.exit(0);
