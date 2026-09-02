#!/usr/bin/env node
// backend/scripts/latency-report.mjs
//
// Turns backend/logs/latency.log into the numbers a latency verdict needs:
// sample count, p50/p90/p95/p99/max and failure rate, per channel and per
// stage, with the three record kinds (pipeline / wire / audible) joined by
// turnId so "end-of-speech → first audible audio" can be read off one row.
//
//   node scripts/latency-report.mjs [--log path] [--since ISO] [--out dir] [--label text]
//
// Writes <out>/latency_rows.jsonl (joined rows), <out>/latency_summary.csv and
// prints a markdown table. Never modifies the log.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const here = path.dirname(fileURLToPath(import.meta.url));
const LOG = opt('log', path.join(here, '..', 'logs', 'latency.log'));
const SINCE = opt('since', null);
const OUT = opt('out', null);
const LABEL = opt('label', '');

if (!fs.existsSync(LOG)) { console.error(`no log at ${LOG}`); process.exit(2); }

const rows = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((r) => r && (!SINCE || r.ts >= SINCE));

// ── join by turnId ──────────────────────────────────────────────────────────
const byTurn = new Map();
const legacy = [];
for (const r of rows) {
  if (!r.turnId) { legacy.push(r); continue; }
  const t = byTurn.get(r.turnId) ?? { turnId: r.turnId };
  if (r.kind === 'wire') Object.assign(t, { wireMs: r.wireMs, pacerMaxQueueMs: r.pacerMaxQueueMs, pacerDropped: r.pacerDropped, wireTs: r.ts });
  else if (r.kind === 'audible') Object.assign(t, { speechEndToAudibleMs: r.speechEndToAudibleMs, endTurnToAudibleMs: r.endTurnToAudibleMs, clientEndpointMs: r.clientEndpointMs, audibleFiller: r.filler, audibleTs: r.ts });
  else Object.assign(t, r); // pipeline record: channel, model, stages, elLag*
  byTurn.set(r.turnId, t);
}
const joined = [...byTurn.values()];

// ── stats ────────────────────────────────────────────────────────────────────
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const stats = (arr) => ({ n: arr.length, p50: pct(arr, .5), p90: pct(arr, .9), p95: pct(arr, .95), p99: pct(arr, .99), max: arr.length ? Math.max(...arr) : null });
const num = (rs, k) => rs.map((r) => r[k]).filter((v) => typeof v === 'number' && Number.isFinite(v));

const STAGES = ['endpointMs', 'preLlmMs', 'prepMs', 'ragMs', 'llmTtftMs', 'llmMs', 'ttsTtfaMs', 'ttfaMs', 'waitMs', 'totalMs', 'wireMs', 'clientEndpointMs', 'endTurnToAudibleMs', 'speechEndToAudibleMs', 'elLagP99Ms', 'elLagMaxMs'];
const groups = {};
for (const r of [...joined, ...legacy]) {
  const key = `${r.channel ?? 'unknown'}${r.model ? ' · ' + r.model : ''}`;
  (groups[key] ??= []).push(r);
}

const lines = [];
lines.push(`# Latency report${LABEL ? ` — ${LABEL}` : ''}`);
lines.push(`log: ${LOG}  ·  rows: ${rows.length}  ·  turns with turnId: ${joined.length}  ·  legacy rows: ${legacy.length}${SINCE ? `  ·  since ${SINCE}` : ''}`);
lines.push('');
const csv = [['group', 'stage', 'n', 'p50', 'p90', 'p95', 'p99', 'max'].join(',')];
for (const [g, rs] of Object.entries(groups)) {
  const failures = rs.filter((r) => r.kind == null && r.ttfaMs == null && r.wireMs == null && r.speechEndToAudibleMs == null).length;
  const filler = rs.filter((r) => r.filler).length;
  lines.push(`## ${g}  (turns=${rs.length}, filler-ack played=${filler}, no-audio turns=${failures})`);
  lines.push('| stage | n | p50 | p90 | p95 | p99 | max |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const k of STAGES) {
    const s = stats(num(rs, k));
    if (!s.n) continue;
    lines.push(`| ${k} | ${s.n} | ${s.p50} | ${s.p90} | ${s.p95} | ${s.p99} | ${s.max} |`);
    csv.push([JSON.stringify(g), k, s.n, s.p50, s.p90, s.p95, s.p99, s.max].join(','));
  }
  lines.push('');
}
lines.push('Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).');
lines.push('`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).');
lines.push('`elLagP99Ms` = event-loop delay p99 since the previous record.');

const md = lines.join('\n');
console.log(md);
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'latency_rows.jsonl'), [...joined, ...legacy].map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'latency_summary.csv'), csv.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'latency_summary.md'), md + '\n');
  console.error(`wrote ${OUT}/latency_{rows.jsonl,summary.csv,summary.md}`);
}
