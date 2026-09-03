#!/usr/bin/env node
// client/scripts/lint-ratchet.mjs
//
// The lint gate, made honest without being silenced.
//
// The rules are NOT relaxed: `npm run lint` still reports every violation.
// This script runs the same ESLint and compares the per-file count of
// `@typescript-eslint/no-explicit-any` against lint-baseline.json. It FAILS
// when any file's count grows or a new file appears with violations, and
// PASSES when counts are equal or lower — and when they are lower it rewrites
// the baseline downward, so the number can only ever ratchet toward zero.
// Every other rule must be clean: any non-baselined error fails outright.
//
//   node scripts/lint-ratchet.mjs          # check (CI)
//   node scripts/lint-ratchet.mjs --update # accept the current counts (review!)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const BASELINE = path.join(root, 'lint-baseline.json');
const RATCHETED_RULE = '@typescript-eslint/no-explicit-any';
const update = process.argv.includes('--update');

const eslint = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const r = spawnSync(eslint, ['eslint', '.', '--ext', 'ts,tsx', '--report-unused-disable-directives', '-f', 'json'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
let results;
try { results = JSON.parse(r.stdout || '[]'); } catch { console.error(r.stdout, r.stderr); process.exit(2); }

const counts = {};
let otherErrors = 0;
const otherLines = [];
for (const f of results) {
  const rel = path.relative(root, f.filePath).replace(/\\/g, '/');
  for (const m of f.messages) {
    if (m.ruleId === RATCHETED_RULE) counts[rel] = (counts[rel] || 0) + 1;
    else if (m.severity === 2) { otherErrors += 1; otherLines.push(`${rel}:${m.line} ${m.ruleId} ${m.message}`); }
  }
}
const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { rule: RATCHETED_RULE, files: {} };
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const baseTotal = Object.values(baseline.files || {}).reduce((a, b) => a + b, 0);

let failed = false;
if (otherErrors) { failed = true; console.error(`${otherErrors} non-baselined lint error(s):\n  ${otherLines.join('\n  ')}`); }
for (const [file, n] of Object.entries(counts)) {
  const allowed = baseline.files?.[file] ?? 0;
  if (n > allowed) { failed = true; console.error(`${file}: ${n} × ${RATCHETED_RULE} (baseline ${allowed}) — grew`); }
}
console.log(`${RATCHETED_RULE}: ${total} (baseline ${baseTotal}) across ${Object.keys(counts).length} files`);
if (update || (!failed && total < baseTotal)) {
  fs.writeFileSync(BASELINE, JSON.stringify({ rule: RATCHETED_RULE, updated: new Date().toISOString(), total, files: Object.fromEntries(Object.entries(counts).sort()) }, null, 2) + '\n');
  console.log(`baseline ${update ? 'updated' : 'ratcheted down'} → ${total}`);
}
process.exit(failed && !update ? 1 : 0);
