#!/usr/bin/env node
// reports/scripts/matrix_to_csv.mjs — QA_FINAL_MATRIX.md → QA_FINAL_MATRIX.csv
// and an honest tally of the Status column (the markdown's summary table is
// rewritten from the same tally so the two can never disagree).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MD = path.join(here, '..', 'QA_FINAL_MATRIX.md');
const CSV = path.join(here, '..', 'QA_FINAL_MATRIX.csv');
const lines = fs.readFileSync(MD, 'utf8').split('\n');
const rows = [];
let section = '';
for (const l of lines) {
  const h = /^## (.+)/.exec(l); if (h) { section = h[1]; continue; }
  if (!/^\| T-\d+/.test(l)) continue;
  const cells = l.split('|').slice(1, -1).map((c) => c.trim());
  if (cells.length < 6) continue;
  const [id, test, command, evidence, status, blocker] = cells;
  rows.push({ section, id, test, command, evidence, status: status.replace(/\*\*/g, ''), blocker });
}
const bucket = (s) => {
  const u = s.toUpperCase();
  if (u.startsWith('PASS (')) return 'PASS (code/unit/probe/design)';
  if (u.startsWith('PASS')) return 'PASS (fresh executed evidence)';
  if (u.startsWith('FAIL')) return 'FAIL';
  if (u.startsWith('BLOCKED')) return 'BLOCKED';
  if (u.startsWith('OPEN')) return 'OPEN';
  if (u.startsWith('UNVERIFIED')) return 'UNVERIFIED';
  if (u.startsWith('PARTIAL')) return 'PARTIAL';
  if (u.startsWith('N/A')) return 'N/A';
  return 'OTHER';
};
const tally = {};
for (const r of rows) tally[bucket(r.status)] = (tally[bucket(r.status)] || 0) + 1;
const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(CSV, ['section,id,test_case,command_or_test,evidence,status,blocker', ...rows.map((r) => [r.section, r.id, r.test, r.command, r.evidence, r.status, r.blocker].map(esc).join(','))].join('\n') + '\n');
// Rewrite the summary table in the markdown from the tally.
const order = ['PASS (fresh executed evidence)', 'PASS (code/unit/probe/design)', 'FAIL', 'BLOCKED', 'OPEN', 'UNVERIFIED', 'PARTIAL', 'N/A', 'OTHER'];
const table = ['| Status | Count |', '|---|---:|', ...order.filter((k) => tally[k] || k !== 'OTHER').map((k) => `| ${k} | ${tally[k] || 0} |`), `| **Total rows** | **${rows.length}** |`].join('\n');
let md = fs.readFileSync(MD, 'utf8');
md = md.replace(/## 9\. Summary counts \(\d+ rows\)\n\n\| Status \| Count \|[\s\S]*?\| \*\*Total rows\*\* \| \*\*\d+\*\* \|/, `## 9. Summary counts (${rows.length} rows)\n\n${table}`);
fs.writeFileSync(MD, md);
console.log(JSON.stringify({ rows: rows.length, tally }));
