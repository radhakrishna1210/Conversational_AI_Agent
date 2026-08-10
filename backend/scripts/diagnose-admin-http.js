/**
 * Hit the six admin dashboard endpoints over real HTTP, through the running
 * server — auth middleware, controllers, error handler and all.
 *
 * The service-level diagnostic proves the queries work; this proves the
 * requests the browser actually makes now return 200 instead of 500.
 *
 * Mints a short-lived Superadmin token from the local JWT secret rather than
 * asking anyone for a password. Dev-environment diagnostic only.
 *
 *   node --env-file=.env scripts/diagnose-admin-http.js
 */
import { signAccessToken } from '../src/lib/jwt.js';

const BASE = process.env.DIAG_BASE ?? 'http://localhost:4000/api/v1/admin';
const token = signAccessToken({ sub: 'diagnostic', email: 'diagnostic@local', role: 'Superadmin' });

const PATHS = [
  '/analytics/overview',
  '/analytics/signups?days=30',
  '/analytics/workspace-growth?days=30',
  '/analytics/agent-creation?days=30',
  '/analytics/top-workspaces?limit=10',
  '/analytics/recent-users?limit=15',
];

let bad = 0;

for (const p of PATHS) {
  const started = Date.now();
  try {
    const res = await fetch(BASE + p, { headers: { Authorization: `Bearer ${token}` } });
    const ms = Date.now() - started;
    const body = await res.json().catch(() => null);

    if (res.ok) {
      const shape = Array.isArray(body) ? `array(${body.length})` : Object.keys(body ?? {}).join(',').slice(0, 60);
      console.log(`  ${res.status}  ${p.padEnd(38)} ${String(ms).padStart(5)}ms  ${shape}`);
    } else {
      bad++;
      console.log(`  ${res.status}  ${p}`);
      console.log(`       ${body?.error ?? ''} ${body?.message ?? ''}`.trimEnd());
    }
  } catch (err) {
    bad++;
    console.log(`  ERR  ${p}`);
    console.log(`       ${err.message}`);
  }
}

console.log(bad ? `\n${bad} of ${PATHS.length} not OK` : '\nall six return 200');
process.exit(bad ? 1 : 0);
