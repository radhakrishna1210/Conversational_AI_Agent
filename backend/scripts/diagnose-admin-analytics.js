/**
 * Isolate which admin dashboard query is failing.
 *
 * The console loads its overview with six parallel requests, so a single
 * failing one collapses the whole Promise.all into one "Internal server error"
 * with no indication of which. This calls each underlying service function on
 * its own and reports them individually.
 *
 *   node --env-file=.env scripts/diagnose-admin-analytics.js
 */
import * as svc from '../src/services/adminAnalytics.service.js';

const CALLS = [
  ['GET /analytics/overview',          () => svc.getPlatformOverview()],
  ['GET /analytics/signups',           () => svc.getUserSignupChart(30)],
  ['GET /analytics/workspace-growth',  () => svc.getWorkspaceGrowthChart(30)],
  ['GET /analytics/agent-creation',    () => svc.getAgentCreationChart(30)],
  ['GET /analytics/top-workspaces',    () => svc.getTopWorkspacesByAgents(10)],
  ['GET /analytics/recent-users',      () => svc.getRecentUsers(15)],
];

let failed = 0;

for (const [label, fn] of CALLS) {
  const started = Date.now();
  try {
    const out = await fn();
    const ms = Date.now() - started;
    const shape = Array.isArray(out) ? `array(${out.length})` : typeof out;
    console.log(`  OK    ${label.padEnd(34)} ${String(ms).padStart(5)}ms  ${shape}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${label}`);
    console.log(`        ${err.name}: ${err.message.split('\n')[0]}`);
    if (err.code) console.log(`        prisma code: ${err.code}`);
    // Prisma puts the useful part several lines down.
    const detail = String(err.message).split('\n').slice(1, 6).filter(Boolean);
    detail.forEach((l) => console.log(`        ${l.trim()}`));
  }
}

console.log(failed ? `\n${failed} of ${CALLS.length} failing` : '\nall six OK');
process.exit(failed ? 1 : 0);
