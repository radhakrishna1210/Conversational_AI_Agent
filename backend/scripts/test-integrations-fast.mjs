/**
 * Fast integration test — verifies all endpoints respond (no external API calls)
 * Tests: GET /integrations, GET /providers, disconnect, settings
 */
import { PrismaClient } from '@prisma/client';
import { signAccessToken } from '../src/lib/jwt.js';

const prisma = new PrismaClient();
const ws     = await prisma.workspace.findFirst();
const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: ws.id }, include: { user: true } });
const token  = signAccessToken({ userId: member.userId, email: member.user.email, workspaceId: ws.id, role: member.role });

const BASE    = `http://localhost:4000/api/v1/workspaces/${ws.id}`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const get  = (path)       => fetch(`${BASE}${path}`, { headers });
const post = (path, body) => fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });

console.log(`\n🧪 Integration Tests — Workspace: ${ws.name}\n`);

let pass = 0; let fail = 0;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`✅  ${name}`);
    pass++;
  } catch (e) {
    console.error(`❌  ${name}: ${e.message}`);
    fail++;
  }
};

// ── Test 1: GET /integrations dashboard ───────────────────────────────────────
await test('GET /integrations returns 200 with 15 providers', async () => {
  const r = await get('/integrations');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!d.integrations || d.integrations.length < 15) throw new Error(`Only ${d.integrations?.length} integrations returned`);
  if (d.stats === undefined) throw new Error('Missing stats');
});

// ── Test 2: GET /integrations/providers ───────────────────────────────────────
await test('GET /integrations/providers returns all provider configs', async () => {
  const r = await get('/integrations/providers');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!d.providers || d.providers.length < 15) throw new Error(`Only ${d.providers?.length} providers`);
});

// ── Test 3: GET /integrations/:provider ──────────────────────────────────────
await test('GET /integrations/calendly returns integration row', async () => {
  const r = await get('/integrations/calendly');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!d.provider) throw new Error('Missing provider field');
});

// ── Test 4: Webhook connect (make, zapier, n8n, ghl) ─────────────────────────
for (const prov of ['make', 'zapier', 'n8n', 'ghl']) {
  await test(`POST /integrations/${prov}/connect-token (webhook)`, async () => {
    const r = await post(`/integrations/${prov}/connect-token`, {
      integrationName: `Test ${prov}`,
      webhookUrl: 'egtjm0k5i7vyop13oot2mwu2f6pil7zt@hook.eu1.make.com',
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || `HTTP ${r.status}`); }
    const d = await r.json();
    if (!d.connected) throw new Error('connected flag not true');
  });
}

// ── Test 5: Custom API connect ────────────────────────────────────────────────
await test('POST /integrations/custom_api/connect-token', async () => {
  const r = await post('/integrations/custom_api/connect-token', {
    integrationName: 'Test Custom API',
    endpointUrl: 'https://httpbin.org/post',
    method: 'POST',
    authType: 'none',
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error || `HTTP ${r.status}`); }
  const d = await r.json();
  if (!d.connected) throw new Error('connected flag not true');
});

// ── Test 6: GET /integrations/logs ────────────────────────────────────────────
await test('GET /integrations/logs', async () => {
  const r = await get('/integrations/logs');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!Array.isArray(d.logs)) throw new Error('Missing logs array');
});

// ── Test 7: Disconnect ────────────────────────────────────────────────────────
await test('POST /integrations/make/disconnect', async () => {
  const r = await post('/integrations/make/disconnect', {});
  if (!r.ok) { const e = await r.json(); throw new Error(e.error || `HTTP ${r.status}`); }
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n─────────────────────────────────────`);
console.log(`✅ Passed: ${pass}  ❌ Failed: ${fail}`);
console.log(`─────────────────────────────────────`);

if (fail === 0) {
  console.log('\n🎉 All integration endpoints working correctly!\n');
} else {
  console.log('\n⚠️  Some tests failed — check errors above.\n');
}

await prisma.$disconnect();
