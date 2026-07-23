// TEMP read-only analysis: real agent/user characters-per-minute from stored
// voice-call transcripts. No writes. Safe to delete after running.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ log: [] });

const clen = (s) => (typeof s === 'string' ? s.trim().length : 0);
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.floor((p / 100) * a.length));
  return a[i];
};
const r1 = (n) => Math.round(n * 10) / 10;
const r3 = (n) => Math.round(n * 1000) / 1000;

async function main() {
  // Row counts by type (context)
  const byType = await prisma.agentCallLog.groupBy({
    by: ['type'],
    _count: { _all: true },
  }).catch(() => []);

  // Pull voice calls with real duration + transcript
  const rows = await prisma.agentCallLog.findMany({
    where: { type: { in: ['WEB_CALL', 'PHONE_CALL'] }, durationSec: { gt: 0 } },
    select: { id: true, type: true, durationSec: true, transcript: true, status: true },
    orderBy: { id: 'desc' },
    take: 5000,
  });

  let totAgentChars = 0, totUserChars = 0, totDur = 0;
  let totAgentTurns = 0, totUserTurns = 0;
  const perCallAgentCpm = [];   // agent chars/min per call
  const perCallTotalCpm = [];   // (agent+user) chars/min per call
  const agentReplyLens = [];    // every agent reply length
  let usable = 0, skippedShort = 0, skippedNoTurns = 0, skippedBadJson = 0;

  for (const row of rows) {
    let turns;
    try {
      turns = JSON.parse(row.transcript);
      if (!Array.isArray(turns)) { skippedBadJson++; continue; }
    } catch { skippedBadJson++; continue; }
    if (row.durationSec < 10) { skippedShort++; continue; }

    let aChars = 0, uChars = 0, aTurns = 0, uTurns = 0;
    for (const t of turns) {
      if (!t || typeof t.content !== 'string') continue;
      const c = clen(t.content);
      if (t.role === 'assistant') { aChars += c; aTurns++; if (c) agentReplyLens.push(c); }
      else if (t.role === 'user') { uChars += c; uTurns++; }
    }
    if (aTurns === 0) { skippedNoTurns++; continue; }

    const min = row.durationSec / 60;
    usable++;
    totAgentChars += aChars; totUserChars += uChars; totDur += row.durationSec;
    totAgentTurns += aTurns; totUserTurns += uTurns;
    perCallAgentCpm.push(aChars / min);
    perCallTotalCpm.push((aChars + uChars) / min);
  }

  const mins = totDur / 60;
  const pooledAgentCpm = mins ? totAgentChars / mins : 0;   // pooled = total chars / total minutes
  const pooledUserCpm = mins ? totUserChars / mins : 0;
  const pooledTotalCpm = pooledAgentCpm + pooledUserCpm;
  const avgAgentReply = totAgentTurns ? totAgentChars / totAgentTurns : 0;
  const avgUserMsg = totUserTurns ? totUserChars / totUserTurns : 0;
  const turnsPerMin = mins ? (totAgentTurns + totUserTurns) / mins : 0;
  const agentSharePct = pooledTotalCpm ? (pooledAgentCpm / pooledTotalCpm) * 100 : 0;

  console.log('\n=== ROW COUNTS BY TYPE ===');
  for (const t of byType) console.log(`  ${t.type.padEnd(12)} ${t._count._all}`);

  console.log('\n=== SAMPLE ===');
  console.log(`  voice-call rows w/ duration>0 : ${rows.length}`);
  console.log(`  usable (>=10s, has agent turn): ${usable}`);
  console.log(`  skipped short(<10s)/noturns/badjson: ${skippedShort}/${skippedNoTurns}/${skippedBadJson}`);
  console.log(`  total minutes analyzed        : ${r1(mins)}`);

  if (!usable) {
    console.log('\n>>> NO USABLE VOICE TRANSCRIPTS FOUND. Falling back to assumption model.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n=== REAL CHARACTERS PER MINUTE (pooled: total chars / total minutes) ===');
  console.log(`  AGENT (TTS load)  : ${r1(pooledAgentCpm)} chars/min   << the billable number`);
  console.log(`  USER  (STT text)  : ${r1(pooledUserCpm)} chars/min`);
  console.log(`  TOTAL spoken      : ${r1(pooledTotalCpm)} chars/min`);
  console.log(`  agent talk share  : ${r1(agentSharePct)}%`);
  console.log(`  ~tokens (chars/4) : agent ${r1(pooledAgentCpm / 4)} tok/min, total ${r1(pooledTotalCpm / 4)} tok/min`);

  console.log('\n=== SHAPE ===');
  console.log(`  avg agent reply   : ${r1(avgAgentReply)} chars (${r1(avgAgentReply / 4)} tok)`);
  console.log(`  avg user message  : ${r1(avgUserMsg)} chars`);
  console.log(`  turns/min (both)  : ${r1(turnsPerMin)}`);

  console.log('\n=== DISTRIBUTION of per-call AGENT chars/min (spread across calls) ===');
  console.log(`  min ${r1(pct(perCallAgentCpm, 0))} | p25 ${r1(pct(perCallAgentCpm, 25))} | median ${r1(pct(perCallAgentCpm, 50))} | p75 ${r1(pct(perCallAgentCpm, 75))} | p90 ${r1(pct(perCallAgentCpm, 90))} | max ${r1(pct(perCallAgentCpm, 100))}`);

  console.log('\n=== vs ASSUMPTION (450 agent chars/min) ===');
  const ratio = pooledAgentCpm / 450;
  console.log(`  real / assumed    : ${r3(ratio)}x  → TTS & LLM-output lines should scale by ${r3(ratio)}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('ANALYSIS ERROR:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
