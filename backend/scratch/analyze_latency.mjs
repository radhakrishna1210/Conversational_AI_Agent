import fs from 'fs';

const logFile = './logs/latency.log';
const lines = fs.readFileSync(logFile, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map(line => {
    try { return JSON.parse(line); } catch(e) { return null; }
  })
  .filter(Boolean);

const sarvamLogs = lines.filter(l => l.llmProvider === 'sarvam');
const models = [...new Set(sarvamLogs.map(l => l.model))];

function stats(arr) {
  if (!arr.length) return { count: 0, avg: 0, median: 0, min: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { count: sorted.length, avg: Math.round(avg), median: Math.round(median), min, max };
}

console.log('=== SARVAM CALL LATENCY ANALYSIS ===\n');

for (const model of models) {
  const modelLogs = sarvamLogs.filter(l => l.model === model);
  console.log(`### Model: ${model} (${modelLogs.length} test turns)`);
  
  const preLlm = stats(modelLogs.map(l => l.preLlmMs));
  const llmTtft = stats(modelLogs.map(l => l.llmTtftMs));
  const llmTotal = stats(modelLogs.map(l => l.llmMs));
  const ttsTtfa = stats(modelLogs.map(l => l.ttsTtfaMs));
  const ttsTotal = stats(modelLogs.map(l => l.ttsMs));
  const e2eTtfa = stats(modelLogs.map(l => l.ttfaMs));
  const totalRoundtrip = stats(modelLogs.map(l => l.totalMs));

  console.log('Turn details:');
  modelLogs.forEach((l, i) => {
    console.log(`  Turn #${i+1}: PreLLM=${l.preLlmMs}ms, LLM_TTFT=${l.llmTtftMs}ms, LLM_Total=${l.llmMs}ms, TTS_TTFA=${l.ttsTtfaMs}ms, TTS_Total=${l.ttsMs}ms, E2E_TTFA=${l.ttfaMs}ms, Total=${l.totalMs}ms, Mode=${l.mode}`);
  });

  console.log('\nAggregated Averages:');
  console.log(JSON.stringify({
    preLlm,
    llmTtft,
    llmTotal,
    ttsTtfa,
    ttsTotal,
    e2eTtfa,
    totalRoundtrip
  }, null, 2));
  console.log('\n-------------------------------------------------------------\n');
}
