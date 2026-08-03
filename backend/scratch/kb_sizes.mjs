// READ-ONLY: measures real KB text sizes to ground the per-minute LLM cost model.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const KBs = (n) => (n / 1024).toFixed(1);
const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;

const rows = await prisma.kbFile.findMany({
  select: { id: true, workspaceId: true, agentId: true, fileName: true, mimeType: true, sizeBytes: true, textContent: true },
});

console.log(`\n=== KbFile rows: ${rows.length} ===\n`);
if (!rows.length) { await prisma.$disconnect(); process.exit(0); }

const withText = rows.filter((r) => r.textContent && r.textContent.length > 0);
console.log(`rows with extracted text: ${withText.length} / ${rows.length} (${((withText.length / rows.length) * 100).toFixed(0)}%)`);

// Per-file extracted text size
const lens = withText.map((r) => r.textContent.length).sort((a, b) => a - b);
if (lens.length) {
  console.log(`\n--- per-FILE extracted text (KB) ---`);
  console.log(`min ${KBs(lens[0])} | p25 ${KBs(pct(lens, .25))} | median ${KBs(pct(lens, .5))} | p75 ${KBs(pct(lens, .75))} | p90 ${KBs(pct(lens, .9))} | max ${KBs(lens[lens.length - 1])}`);
  console.log(`mean ${KBs(lens.reduce((a, b) => a + b, 0) / lens.length)}`);
}

// Extraction efficiency: uploaded bytes -> extracted text bytes
console.log(`\n--- uploaded file size vs extracted text ---`);
for (const r of rows.slice(0, 15)) {
  const t = r.textContent ? r.textContent.length : 0;
  const ratio = r.sizeBytes ? ((t / r.sizeBytes) * 100).toFixed(1) : 'n/a';
  console.log(`  ${(r.fileName || '').slice(0, 34).padEnd(34)} ${String(r.mimeType || '').slice(0, 24).padEnd(24)} upload ${KBs(r.sizeBytes).padStart(8)} KB -> text ${KBs(t).padStart(8)} KB (${ratio}%)`);
}

// THE number that matters: total KB text pasted into ONE agent's prompt.
// Mirrors getAgentKbText: agent-linked files + workspace-wide (agentId null).
const byWs = new Map();
for (const r of rows) {
  if (!byWs.has(r.workspaceId)) byWs.set(r.workspaceId, []);
  byWs.get(r.workspaceId).push(r);
}
const agentTotals = [];
for (const [wsId, files] of byWs) {
  const wsWide = files.filter((f) => !f.agentId);
  const agentIds = [...new Set(files.filter((f) => f.agentId).map((f) => f.agentId))];
  const scopes = agentIds.length ? agentIds : [null];
  for (const agentId of scopes) {
    const set = [...wsWide, ...files.filter((f) => f.agentId === agentId)];
    const total = set.reduce((a, f) => a + (f.textContent?.length || 0), 0);
    agentTotals.push({ wsId, agentId, files: set.length, total });
  }
}
agentTotals.sort((a, b) => b.total - a.total);

console.log(`\n=== PER-AGENT prompt payload (what gets resent every turn) ===`);
console.log(`agent scopes: ${agentTotals.length}\n`);
for (const a of agentTotals.slice(0, 20)) {
  const tokens = Math.round(a.total / 4);
  const llmPerMin = 0.125 + 0.0221 * (a.total / 1024);
  console.log(`  ws ${a.wsId.slice(0, 10)} agent ${String(a.agentId || '(none)').slice(0, 12).padEnd(12)} ${String(a.files).padStart(2)} files  ${KBs(a.total).padStart(8)} KB  ~${String(tokens).padStart(7)} tok  -> LLM Rs ${llmPerMin.toFixed(2)}/min`);
}

const totals = agentTotals.map((a) => a.total).sort((x, y) => x - y);
console.log(`\n--- per-AGENT total KB text (KB) ---`);
console.log(`min ${KBs(totals[0])} | median ${KBs(pct(totals, .5))} | p75 ${KBs(pct(totals, .75))} | p90 ${KBs(pct(totals, .9))} | max ${KBs(totals[totals.length - 1])}`);
console.log(`over 32k-token (~122 KB) mark: ${totals.filter((t) => t / 4 > 32000).length} / ${totals.length} agents`);

await prisma.$disconnect();
