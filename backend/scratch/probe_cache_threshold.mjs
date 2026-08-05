// Implicit caching has a MINIMUM cacheable prefix. The shipped prompt shape is
// correct (verify_prompt_cache.mjs proves the prefix is stable) but a real agent
// with a small KB produced 0% cached at ~2.8k prompt tokens, while the synthetic
// 18.6k-token probe cached 87%. This finds the cutoff, so we know which agents
// actually benefit and how large the KB budget needs to be.
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL = process.env.PROBE_MODEL || 'gemini-3.1-flash-lite';
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('No GEMINI_API_KEY'); process.exit(1); }
const client = new GoogleGenerativeAI(key);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const section = (i) =>
  `Section ${i}: City Medical Hospital operates department ${i} with consulting hours 9am-5pm. ` +
  `The department head is Dr. Example ${i}. Standard consultation fee is ${500 + i} rupees. ` +
  `Appointments require 24 hours notice and can be rescheduled once without charge.`;

const preamble = 'You are Purva, a receptionist for City Medical Hospital. Answer briefly.';
const turns = ['What are the consulting hours?', 'Who heads department 3?', 'What is the fee for department 5?'];

async function call(systemInstruction, contents) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await client.getGenerativeModel({ model: MODEL, systemInstruction })
        .generateContent({ contents, generationConfig: { maxOutputTokens: 20, temperature: 0 } });
    } catch (e) {
      if ((e?.status !== 429 && e?.status !== 503) || attempt === 5) throw e;
      await sleep(20_000);
    }
  }
}

const results = [];
for (const sections of [40, 80, 160, 320]) {
  const kb = Array.from({ length: sections }, (_, i) => section(i)).join('\n');
  const history = [
    { role: 'user', parts: [{ text: `# Knowledge Base\n${kb}` }] },
    { role: 'model', parts: [{ text: 'Understood.' }] },
  ];
  const rows = [];
  for (let i = 0; i < turns.length; i++) {
    const r = await call(preamble, [...history, { role: 'user', parts: [{ text: turns[i] }] }]);
    const u = r.response.usageMetadata || {};
    rows.push({ prompt: u.promptTokenCount ?? 0, cached: u.cachedContentTokenCount ?? 0 });
    await sleep(4000);
  }
  const steady = rows.slice(1);
  const rate = steady.reduce((a, r) => a + r.cached, 0) / steady.reduce((a, r) => a + r.prompt, 0);
  results.push({ tokens: rows[0].prompt, rate });
  console.log(`  prompt ~${String(rows[0].prompt).padStart(6)} tok  ->  steady cached ${(rate * 100).toFixed(0).padStart(3)}%`);
}

console.log(`\n=== ${MODEL} ===`);
const hits = results.filter((r) => r.rate > 0.3);
const misses = results.filter((r) => r.rate <= 0.3);
if (hits.length && misses.length) {
  console.log(`caching kicks in between ~${Math.max(...misses.map((m) => m.tokens))} and ~${Math.min(...hits.map((h) => h.tokens))} prompt tokens`);
} else if (!hits.length) {
  console.log('no caching at any size tested');
} else {
  console.log(`caching active at every size tested (from ~${Math.min(...hits.map((h) => h.tokens))} tokens)`);
}
