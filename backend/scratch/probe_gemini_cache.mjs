// Probe: does Gemini implicit caching engage on our system-prompt shape?
// Sends the SAME large systemInstruction twice with different user turns —
// exactly how agentRuntime resends the KB every turn — and reports usageMetadata.
import { GoogleGenerativeAI } from '@google/generative-ai';

const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!key) { console.error('No GEMINI_API_KEY in env'); process.exit(1); }

const MODEL = process.env.PROBE_MODEL || 'gemini-2.5-flash';
const client = new GoogleGenerativeAI(key);

// ~6k tokens of stable prefix, mimicking a KB-loaded system prompt (~24 KB).
const kb = Array.from({ length: 300 }, (_, i) =>
  `Section ${i}: City Medical Hospital operates department ${i} with consulting hours 9am-5pm. ` +
  `The department head is Dr. Example ${i}. Standard consultation fee is ${500 + i} rupees. ` +
  `Appointments require 24 hours notice and can be rescheduled once without charge.`
).join('\n');
const systemPrompt = `You are a voice agent for City Medical Hospital.\n\n# Knowledge Base\n${kb}`;

console.log(`system prompt: ${systemPrompt.length} chars (~${Math.round(systemPrompt.length / 4)} tok)`);
console.log(`model: ${MODEL}\n`);

const model = client.getGenerativeModel({ model: MODEL, systemInstruction: systemPrompt });

const ask = async (label, text) => {
  const r = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { maxOutputTokens: 40, temperature: 0 },
  });
  const u = r.response.usageMetadata || {};
  console.log(`[${label}] prompt=${u.promptTokenCount} cached=${u.cachedContentTokenCount ?? 0} out=${u.candidatesTokenCount} total=${u.totalTokenCount}`);
  return u;
};

// Turn 1 populates the implicit cache; turns 2-4 should hit it if it engages.
const a = await ask('turn 1', 'What are the consulting hours?');
await new Promise((r) => setTimeout(r, 1500));
const b = await ask('turn 2', 'Who heads department 12?');
await new Promise((r) => setTimeout(r, 1500));
const c = await ask('turn 3', 'What is the fee for department 40?');
await new Promise((r) => setTimeout(r, 1500));
const d = await ask('turn 4', 'Can I reschedule my appointment?');

const hits = [b, c, d].filter((u) => (u.cachedContentTokenCount ?? 0) > 0);
console.log(`\n=== VERDICT ===`);
if (hits.length) {
  const avg = hits.reduce((s, u) => s + u.cachedContentTokenCount, 0) / hits.length;
  const share = avg / (b.promptTokenCount || 1);
  console.log(`Implicit caching ENGAGED on ${hits.length}/3 follow-up turns.`);
  console.log(`avg cached ${Math.round(avg)} tok = ${(share * 100).toFixed(0)}% of prompt -> ~${(share * 75).toFixed(0)}% saving on the input line`);
} else {
  console.log(`Implicit caching did NOT engage — cachedContentTokenCount = 0 on all follow-ups.`);
  console.log(`Every turn bills the full ${a.promptTokenCount} prompt tokens at list price.`);
}
