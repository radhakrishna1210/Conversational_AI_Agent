import { PrismaClient } from '@prisma/client';
import { signAccessToken } from '../src/lib/jwt.js';

const prisma = new PrismaClient();
const ws     = await prisma.workspace.findFirst();
const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: ws.id }, include: { user: true } });
const token  = signAccessToken({ userId: member.userId, email: member.user.email, workspaceId: ws.id, role: member.role });

const BASE    = `http://localhost:4000/api/v1/workspaces/${ws.id}`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

console.log(`\nWorkspace: ${ws.name}\n`);

// ── Bug 25: GET /integrations should not 500 ──────────────────────────────────
console.log('Testing GET /integrations (Bug 25)...');
const r1 = await fetch(`${BASE}/integrations`, { headers });
const d1 = await r1.json();
if (!r1.ok) {
  console.error(`❌  GET /integrations → HTTP ${r1.status}: ${JSON.stringify(d1)}`);
} else {
  console.log(`✅  GET /integrations → ${r1.status} | ${d1.integrations?.length} integrations | stats: connected=${d1.stats?.connected}`);
}

// ── Bug 26: POST /integrations/:provider/connect should not 500 ──────────────
const testProviders = ['google_calendar', 'google_meet', 'cal', 'salesforce', 'hubspot', 'slack', 'make', 'custom_api'];
console.log('\nTesting POST /connect (Bug 26)...');
for (const prov of testProviders) {
  const r = await fetch(`${BASE}/integrations/${prov}/connect`, { method: 'POST', headers, body: '{}' });
  const d = await r.json();
  if (!r.ok) {
    console.error(`❌  ${prov}/connect → HTTP ${r.status}: ${d.error || d.message || JSON.stringify(d)}`);
  } else {
    const status = d.connected ? 'connected✓' : d.requiresWebhookConfig ? 'webhook✓' : d.authorizationUrl ? 'oauth_url✓' : 'unknown';
    console.log(`✅  ${prov.padEnd(18)} → ${r.status} | ${status}`);
  }
}

// ── Disconnect test ──────────────────────────────────────────────────────────
console.log('\nTesting disconnect...');
const rd = await fetch(`${BASE}/integrations/google_calendar/disconnect`, { method: 'POST', headers, body: '{}' });
const dd = await rd.json();
console.log(rd.ok ? `✅  Disconnect → ${rd.status}` : `❌  Disconnect → ${rd.status}: ${dd.error}`);

await prisma.$disconnect();
console.log('\n✅  All integration tests complete.\n');
