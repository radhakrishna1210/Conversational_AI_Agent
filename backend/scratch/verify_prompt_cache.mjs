// Verifies the SHIPPED prompt shape actually caches, using a real agent, its
// real knowledge base, and the real buildRuntimeMessages() from agentRuntime —
// not a synthetic prompt. Run after any change to the prompt builder.
//
//   node --env-file=.env scratch/verify_prompt_cache.mjs [agentId]
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../src/config/prisma.js';
import { getAgentKbText, buildRuntimeMessages } from '../src/services/agentRuntime.service.js';

const MODEL = process.env.PROBE_MODEL || 'gemini-3.1-flash-lite';
const GAP_MS = Number(process.env.PROBE_GAP_MS || 5000);
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('No GEMINI_API_KEY'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pick the agent with the most KB text — the one where caching matters most.
const wanted = process.argv[2];
let agent;
if (wanted) {
  agent = await prisma.agent.findUnique({ where: { id: wanted } });
} else {
  const files = await prisma.kbFile.findMany({
    where: { textContent: { not: null }, agentId: { not: null } },
    select: { agentId: true, textContent: true },
  });
  const byAgent = new Map();
  for (const f of files) {
    byAgent.set(f.agentId, (byAgent.get(f.agentId) || 0) + (f.textContent?.length || 0));
  }
  const best = [...byAgent.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) agent = await prisma.agent.findUnique({ where: { id: best[0] } });
  if (!agent) agent = await prisma.agent.findFirst();
}
if (!agent) { console.error('No agent found'); process.exit(1); }

const { kbText } = await getAgentKbText(agent.workspaceId, agent.id);
// Must match agentRuntime's KB_VOICE_CHARS, or this measures a prompt we never send.
const promptKb = kbText.slice(0, Number(process.env.KB_VOICE_CHARS || 48_000));
console.log(`agent: ${agent.name} (${agent.id})`);
console.log(`KB: ${(Buffer.byteLength(promptKb) / 1024).toFixed(1)} KB | model: ${MODEL}\n`);

const turns = [
  'Hello, I have a question.',
  'What are your timings?',
  'How much does it cost?',
  'Can I book an appointment for tomorrow?',
  'And what about the weekend?',
];

const client = new GoogleGenerativeAI(key);
const prior = [];
const seen = [];
let firstSystemPrompt = null;

for (let i = 0; i < turns.length; i++) {
  const { systemPrompt, chatHistory, message } = buildRuntimeMessages({
    agent,
    kbText: promptKb,
    prior: [...prior],
    lastContent: turns[i],
    // Exercise the per-turn affect path — it must NOT break caching.
    affectNote: i % 2 === 1 ? 'The caller sounds rushed — be brisk and efficient.' : '',
    voiceMode: true,
    supportsChatHistory: true,
  });

  if (firstSystemPrompt === null) firstSystemPrompt = systemPrompt;
  else if (systemPrompt !== firstSystemPrompt) {
    console.error('\n✗ FAIL: system prompt changed between turns — caching cannot work.');
    process.exit(1);
  }

  // Mirrors gemini.service.formatMessages(message, chatHistory).
  const contents = [
    ...chatHistory.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  let res;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      res = await client.getGenerativeModel({ model: MODEL, systemInstruction: systemPrompt })
        .generateContent({ contents, generationConfig: { maxOutputTokens: 60, temperature: 0 } });
      break;
    } catch (e) {
      if ((e?.status !== 429 && e?.status !== 503) || attempt === 5) throw e;
      console.log(`    (${e.status}, retrying in 20s)`);
      await sleep(20_000);
    }
  }

  const u = res.response.usageMetadata || {};
  const cached = u.cachedContentTokenCount ?? 0;
  seen.push({ prompt: u.promptTokenCount ?? 0, cached });
  console.log(`  t${i + 1}  prompt=${String(u.promptTokenCount).padStart(6)}  cached=${String(cached).padStart(6)} (${u.promptTokenCount ? ((cached / u.promptTokenCount) * 100).toFixed(0) : 0}%)`);

  const reply = res.response.text?.() || '';
  prior.push({ role: 'user', content: turns[i] });
  prior.push({ role: 'assistant', content: reply });
  if (i < turns.length - 1) await sleep(GAP_MS);
}

const steady = seen.slice(1);
const rate = steady.reduce((a, r) => a + r.cached, 0) / steady.reduce((a, r) => a + r.prompt, 0);
const billed = seen.reduce((a, r) => a + (r.prompt - r.cached), 0);
const listed = seen.reduce((a, r) => a + r.prompt, 0);

console.log(`\nsteady-state (t2+) cached: ${(rate * 100).toFixed(1)}%`);
console.log(`full-price tokens: ${billed} of ${listed} (${((billed / listed) * 100).toFixed(0)}%)`);
console.log(rate > 0.5
  ? '\n✓ PASS — the shipped prompt shape is being cached.'
  : '\n✗ FAIL — no meaningful caching. Check that nothing per-turn leaked into the system prompt.');

await prisma.$disconnect();
process.exit(rate > 0.5 ? 0 : 1);
