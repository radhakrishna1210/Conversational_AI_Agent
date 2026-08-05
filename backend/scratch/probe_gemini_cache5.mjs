// Probe v5: v4 proved shape B (KB as a leading contents[] turn) caches at 99%.
// But that used a STATIC systemInstruction and a static contents prefix.
// Our real prompt is not static: agentRuntime appends the growing transcript
// (and a per-turn caller-affect line) to the SYSTEM PROMPT.
//
// Implicit caching matches on the longest common PREFIX of the request, and
// systemInstruction sits before contents[]. So this probe answers the one
// question that decides the implementation:
//
//   B1: static systemInstruction + history as growing contents[] turns
//       -> the target design. Expect hits.
//   B2: systemInstruction that CHANGES every turn (today's transcript-in-system
//       -prompt shape) + static KB contents prefix
//       -> does a mutating systemInstruction kill the contents[] cache?
import { GoogleGenerativeAI } from '@google/generative-ai';

const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!key) { console.error('No GEMINI_API_KEY'); process.exit(1); }

const MODEL = process.env.PROBE_MODEL || 'gemini-2.5-flash';
const GAP_MS = Number(process.env.PROBE_GAP_MS || 13_000);
const client = new GoogleGenerativeAI(key);

const kb = Array.from({ length: 300 }, (_, i) =>
  `Section ${i}: City Medical Hospital operates department ${i} with consulting hours 9am-5pm. ` +
  `The department head is Dr. Example ${i}. Standard consultation fee is ${500 + i} rupees. ` +
  `Appointments require 24 hours notice and can be rescheduled once without charge.`
).join('\n');
const kbBlock = `# Knowledge Base\n${kb}`;
const preamble = 'You are a voice agent for City Medical Hospital.';
const AFFECT = ['', '\n\n# Caller state\nThe caller sounds rushed — be brisk.',
  '\n\n# Caller state\nThe caller sounds hesitant — be patient.',
  '', '\n\n# Caller state\nThe caller sounds agitated — stay calm.', ''];

const turns = [
  'What are the consulting hours?',
  'Who heads department 12?',
  'What is the fee for department 40?',
  'Can I reschedule an appointment?',
  'How much notice do I need to give?',
  'Are you open on Sundays?',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try { return await fn(); }
    catch (e) {
      // 503 = model overloaded (transient), 429 = quota. Both worth retrying.
      if ((e?.status !== 429 && e?.status !== 503) || attempt === 6) throw e;
      const info = (e.errorDetails || []).find((d) => d['@type']?.endsWith('RetryInfo'));
      const wait = Math.max(15_000, (parseFloat(info?.retryDelay) || 15) * 1000 + 2000);
      console.log(`    (429 on ${label}, waiting ${(wait / 1000).toFixed(0)}s)`);
      await sleep(wait);
    }
  }
}

// Runs a realistic multi-turn call: history grows every turn, exactly like a
// live conversation, with the KB pinned as the first contents[] entry.
async function runCall(label, { mutateSystem }) {
  console.log(`\n--- ${label} ---`);
  const history = [
    { role: 'user', parts: [{ text: kbBlock }] },
    { role: 'model', parts: [{ text: 'Understood. I will ground my answers in this knowledge base.' }] },
  ];
  const rows = [];
  for (let i = 0; i < turns.length; i++) {
    // Today's shape rebuilds the system prompt every turn (affect line + transcript).
    const systemInstruction = mutateSystem
      ? `${preamble}${AFFECT[i % AFFECT.length]}\n\n# Conversation so far\n` +
        history.slice(2).map((m) => `${m.role}: ${m.parts[0].text}`).join('\n')
      : preamble;

    const model = client.getGenerativeModel({ model: MODEL, systemInstruction });
    const contents = [...history, { role: 'user', parts: [{ text: turns[i] }] }];
    const r = await withRetry(
      () => model.generateContent({ contents, generationConfig: { maxOutputTokens: 40, temperature: 0 } }),
      `${label} t${i + 1}`,
    );
    const u = r.response.usageMetadata || {};
    const prompt = u.promptTokenCount ?? 0;
    const cached = u.cachedContentTokenCount ?? 0;
    rows.push({ prompt, cached });
    console.log(`  t${i + 1}  prompt=${String(prompt).padStart(6)}  cached=${String(cached).padStart(6)} (${prompt ? ((cached / prompt) * 100).toFixed(0) : 0}%)`);

    const reply = r.response.text?.() || 'Noted.';
    history.push({ role: 'user', parts: [{ text: turns[i] }] });
    history.push({ role: 'model', parts: [{ text: reply }] });
    if (i < turns.length - 1) await sleep(GAP_MS);
  }
  const steady = rows.slice(1);
  const cached = steady.reduce((a, r) => a + r.cached, 0);
  const total = steady.reduce((a, r) => a + r.prompt, 0);
  const billed = rows.reduce((a, r) => a + (r.prompt - r.cached), 0);
  const listed = rows.reduce((a, r) => a + r.prompt, 0);
  console.log(`  => steady-state (t2+) cached ${((cached / total) * 100).toFixed(1)}%`);
  console.log(`  => full-price tokens over the call: ${billed} of ${listed} (${((billed / listed) * 100).toFixed(0)}%)`);
  return { label, rate: cached / total, billed, listed };
}

console.log(`model: ${MODEL} | KB ${(Buffer.byteLength(kbBlock) / 1024).toFixed(1)} KB | gap ${GAP_MS / 1000}s/req`);

const b1 = await runCall('B1: static system + history in contents[] (TARGET)', { mutateSystem: false });
await sleep(GAP_MS);
const b2 = await runCall('B2: system prompt mutates every turn (TODAY)', { mutateSystem: true });

console.log(`\n=== VERDICT (${MODEL}) ===`);
for (const r of [b1, b2]) {
  console.log(`  ${r.label.padEnd(48)} cached ${(r.rate * 100).toFixed(0).padStart(3)}%  |  billed ${r.billed} tok/call`);
}
const saved = b2.billed - b1.billed;
if (saved > 0) {
  console.log(`\n  Moving history into contents[] saves ${saved} full-price tokens per ${turns.length}-turn call ` +
    `(${((saved / b2.billed) * 100).toFixed(0)}% fewer).`);
}
