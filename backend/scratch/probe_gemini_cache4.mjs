// Probe v4: same question as v2/v3 (which prompt shape gets cached?) but paced
// and 429-retrying, because the project's GEMINI_API_KEY is on the FREE TIER
// (5 requests/min/model) and v2 died on quota after 2 calls.
//
// Shapes, all on identical KB text:
//   A) KB in systemInstruction         (what agentRuntime does today)
//   B) KB as a leading contents[] turn (implicit-cache candidate)
//   C) KB in an explicit CachedContent (guaranteed discount, has storage cost)
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';

const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!key) { console.error('No GEMINI_API_KEY'); process.exit(1); }

const MODEL = process.env.PROBE_MODEL || 'gemini-2.5-flash';
const GAP_MS = Number(process.env.PROBE_GAP_MS || 13_000); // 5 RPM free tier
const client = new GoogleGenerativeAI(key);

const kb = Array.from({ length: 300 }, (_, i) =>
  `Section ${i}: City Medical Hospital operates department ${i} with consulting hours 9am-5pm. ` +
  `The department head is Dr. Example ${i}. Standard consultation fee is ${500 + i} rupees. ` +
  `Appointments require 24 hours notice and can be rescheduled once without charge.`
).join('\n');
const preamble = 'You are a voice agent for City Medical Hospital.';
const kbBlock = `# Knowledge Base\n${kb}`;
const turns = [
  'What are the consulting hours?',
  'Who heads department 12?',
  'What is the fee for department 40?',
  'Can I reschedule an appointment?',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Free tier returns 429 with a RetryInfo delay; honour it and retry.
async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e?.status !== 429 || attempt === 6) throw e;
      const info = (e.errorDetails || []).find((d) => d['@type']?.endsWith('RetryInfo'));
      const wait = Math.max(15_000, (parseFloat(info?.retryDelay) || 15) * 1000 + 2000);
      console.log(`    (429 on ${label}, waiting ${(wait / 1000).toFixed(0)}s — attempt ${attempt})`);
      await sleep(wait);
    }
  }
}

const usage = (u = {}) => ({
  prompt: u.promptTokenCount ?? 0,
  cached: u.cachedContentTokenCount ?? 0,
  out: u.candidatesTokenCount ?? 0,
});

async function runShape(label, model, makeReq) {
  console.log(`\n--- ${label} ---`);
  const rows = [];
  for (let i = 0; i < turns.length; i++) {
    const r = await withRetry(
      () => model.generateContent(makeReq(turns[i])),
      `${label} t${i + 1}`,
    );
    const u = usage(r.response.usageMetadata);
    rows.push(u);
    const pct = u.prompt ? ((u.cached / u.prompt) * 100).toFixed(0) : '0';
    console.log(`  t${i + 1}  prompt=${String(u.prompt).padStart(6)}  cached=${String(u.cached).padStart(6)} (${pct}%)  out=${u.out}`);
    if (i < turns.length - 1) await sleep(GAP_MS);
  }
  // Turn 1 can never be a hit — judge steady state on turns 2..n.
  const steady = rows.slice(1);
  const cached = steady.reduce((a, r) => a + r.cached, 0);
  const total = steady.reduce((a, r) => a + r.prompt, 0);
  const rate = total ? cached / total : 0;
  console.log(`  => steady-state cached: ${(rate * 100).toFixed(1)}%`);
  return { label, rate, rows };
}

const gen = { maxOutputTokens: 30, temperature: 0 };
const results = [];

console.log(`model: ${MODEL} | KB ${(Buffer.byteLength(kbBlock) / 1024).toFixed(1)} KB | gap ${GAP_MS / 1000}s/req`);

// A — KB in systemInstruction (today's shape)
const modelA = client.getGenerativeModel({ model: MODEL, systemInstruction: `${preamble}\n\n${kbBlock}` });
results.push(await runShape('A: KB in systemInstruction (current)', modelA,
  (t) => ({ contents: [{ role: 'user', parts: [{ text: t }] }], generationConfig: gen })));

await sleep(GAP_MS);

// B — KB as a leading contents[] turn
const modelB = client.getGenerativeModel({ model: MODEL, systemInstruction: preamble });
const historyB = [
  { role: 'user', parts: [{ text: kbBlock }] },
  { role: 'model', parts: [{ text: 'Understood. I will ground my answers in this knowledge base.' }] },
];
results.push(await runShape('B: KB as leading contents[] turn', modelB,
  (t) => ({ contents: [...historyB, { role: 'user', parts: [{ text: t }] }], generationConfig: gen })));

await sleep(GAP_MS);

// C — explicit CachedContent
let cacheInfo = null;
try {
  const cm = new GoogleAICacheManager(key);
  const cache = await withRetry(() => cm.create({
    model: `models/${MODEL}`,
    systemInstruction: preamble,
    contents: [{ role: 'user', parts: [{ text: kbBlock }] }],
    ttlSeconds: 600,
  }), 'cache create');
  cacheInfo = cache;
  console.log(`\n(explicit cache created: ${cache.name}, ${cache.usageMetadata?.totalTokenCount ?? '?'} tokens, ttl 600s)`);
  const modelC = client.getGenerativeModelFromCachedContent(cache);
  results.push(await runShape('C: explicit CachedContent', modelC,
    (t) => ({ contents: [{ role: 'user', parts: [{ text: t }] }], generationConfig: gen })));
  await new GoogleAICacheManager(key).delete(cache.name);
  console.log('(explicit cache deleted)');
} catch (e) {
  console.log(`\n--- C: explicit CachedContent ---\n  FAILED: ${e?.status || ''} ${e?.message?.split('\n')[0] || e}`);
  results.push({ label: 'C: explicit CachedContent', rate: null, error: e?.message?.split('\n')[0] });
}

console.log(`\n=== VERDICT (${MODEL}) ===`);
for (const r of results) {
  const v = r.rate === null ? `UNAVAILABLE — ${r.error}`
    : r.rate > 0.5 ? `CACHING WORKS — ${(r.rate * 100).toFixed(0)}% of prompt tokens cached`
    : r.rate > 0 ? `PARTIAL — ${(r.rate * 100).toFixed(0)}%`
    : 'NO CACHING — 0% cached';
  console.log(`  ${r.label.padEnd(38)} ${v}`);
}
if (cacheInfo) console.log(`\nNote: explicit-cache storage bills per token-hour while it lives.`);
