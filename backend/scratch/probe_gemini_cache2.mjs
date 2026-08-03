// Probe v2: can we make KB cost FLAT regardless of size?
// Compares three prompt shapes on identical KB text:
//   A) KB in systemInstruction   (what we do today)
//   B) KB as leading contents[] turn  (implicit-cache candidate)
//   C) KB in an explicit CachedContent (guaranteed discount, has storage cost)
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';

const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!key) { console.error('No GEMINI_API_KEY'); process.exit(1); }
const MODEL = 'gemini-2.5-flash';
const client = new GoogleGenerativeAI(key);

const kb = Array.from({ length: 300 }, (_, i) =>
  `Section ${i}: City Medical Hospital operates department ${i} with consulting hours 9am-5pm. ` +
  `The department head is Dr. Example ${i}. Standard consultation fee is ${500 + i} rupees. ` +
  `Appointments require 24 hours notice and can be rescheduled once without charge.`
).join('\n');
const preamble = 'You are a voice agent for City Medical Hospital.';
const turns = ['What are the consulting hours?', 'Who heads department 12?', 'What is the fee for department 40?'];

const show = (label, u) =>
  console.log(`  [${label}] prompt=${u.promptTokenCount} cached=${u.cachedContentTokenCount ?? 0} out=${u.candidatesTokenCount}`);

const run = async (label, makeReq, model) => {
  console.log(`\n--- ${label} ---`);
  const seen = [];
  for (let i = 0; i < turns.length; i++) {
    const r = await model.generateContent(makeReq(turns[i]));
    const u = r.response.usageMetadata || {};
    show(`turn ${i + 1}`, u);
    seen.push(u);
    await new Promise((res) => setTimeout(res, 1500));
  }
  const follow = seen.slice(1);
  const avgCached = follow.reduce((s, u) => s + (u.cachedContentTokenCount ?? 0), 0) / follow.length;
  const avgPrompt = follow.reduce((s, u) => s + u.promptTokenCount, 0) / follow.length;
  console.log(`  => avg cached ${Math.round(avgCached)} / ${Math.round(avgPrompt)} prompt tok = ${((avgCached / avgPrompt) * 100).toFixed(0)}% cached`);
  return { avgCached, avgPrompt };
};

// A) today's shape
const modelA = client.getGenerativeModel({ model: MODEL, systemInstruction: `${preamble}\n\n# Knowledge Base\n${kb}` });
const A = await run('A: KB in systemInstruction (current)', (t) => ({
  contents: [{ role: 'user', parts: [{ text: t }] }],
  generationConfig: { maxOutputTokens: 40, temperature: 0 },
}), modelA);

// B) KB as the leading contents turn
const modelB = client.getGenerativeModel({ model: MODEL, systemInstruction: preamble });
const B = await run('B: KB as leading contents[] turn', (t) => ({
  contents: [
    { role: 'user', parts: [{ text: `# Knowledge Base\n${kb}` }] },
    { role: 'model', parts: [{ text: 'Understood. I will ground my answers in this knowledge base.' }] },
    { role: 'user', parts: [{ text: t }] },
  ],
  generationConfig: { maxOutputTokens: 40, temperature: 0 },
}), modelB);

// C) explicit CachedContent
let C = null;
try {
  const cm = new GoogleAICacheManager(key);
  const cache = await cm.create({
    model: `models/${MODEL}`,
    systemInstruction: preamble,
    contents: [{ role: 'user', parts: [{ text: `# Knowledge Base\n${kb}` }] }],
    ttlSeconds: 300,
  });
  console.log(`\n(created explicit cache ${cache.name}, ${cache.usageMetadata?.totalTokenCount} tok, ttl 300s)`);
  const modelC = client.getGenerativeModelFromCachedContent(cache);
  C = await run('C: explicit CachedContent', (t) => ({
    contents: [{ role: 'user', parts: [{ text: t }] }],
    generationConfig: { maxOutputTokens: 40, temperature: 0 },
  }), modelC);
  await cm.delete(cache.name);
  console.log('  (cache deleted)');
} catch (e) {
  console.log(`\n--- C: explicit CachedContent --- FAILED: ${e.message}`);
}

console.log(`\n=== VERDICT ===`);
for (const [n, r] of [['A (current)', A], ['B (contents prefix)', B], ['C (explicit cache)', C]]) {
  if (!r) { console.log(`${n}: n/a`); continue; }
  const billedFull = r.avgPrompt - r.avgCached;
  const inr = (billedFull * 0.30 / 1e6 + r.avgCached * 0.075 / 1e6) * 96 * 3; // 3 turns/min, cached at 25% of $0.30
  console.log(`${n}: ${Math.round(r.avgCached)} cached -> ~Rs ${inr.toFixed(2)}/min for this KB`);
}
