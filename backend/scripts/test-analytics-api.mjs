import { PrismaClient } from '@prisma/client';
import { signAccessToken } from '../src/lib/jwt.js';

const prisma = new PrismaClient();
const ws     = await prisma.workspace.findFirst();
const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: ws.id }, include: { user: true } });
const token  = signAccessToken({ userId: member.userId, email: member.user.email, workspaceId: ws.id, role: member.role });

const BASE    = `http://localhost:4000/api/v1/workspaces/${ws.id}`;
const headers = { Authorization: `Bearer ${token}` };

console.log(`\nWorkspace: ${ws.name} (${ws.id})\n`);

const endpoints = [
  '/analytics/calls/overview?range=7d',
  '/analytics/calls/overview?range=30d',
  '/analytics/calls/timeseries?range=7d&metric=volume',
  '/analytics/calls/outcomes?range=30d',
  '/analytics/calls/sentiment?range=30d',
  '/analytics/calls/logs?range=30d&page=1&limit=5',
  '/analytics/calls/assistants?range=30d',
  '/analytics/calls/assistants-list',
];

for (const ep of endpoints) {
  const r = await fetch(`${BASE}${ep}`, { headers });
  const d = await r.json();
  if (!r.ok) { console.log(`❌ ${ep}\n   ${JSON.stringify(d)}\n`); continue; }
  const data = d.data ?? d;
  if (ep.includes('overview')) {
    console.log(`✅ ${ep}`);
    console.log(`   totalCalls=${data.totalCalls}  totalAgents=${data.totalAgents}  successRate=${data.successRate}%\n`);
  } else if (ep.includes('logs')) {
    console.log(`✅ ${ep}`);
    console.log(`   total=${data.pagination?.total}  first call agent="${data.data?.[0]?.assistant}"\n`);
  } else if (ep.includes('assistants-list')) {
    console.log(`✅ ${ep}`);
    console.log(`   agents: ${data.map(a => a.name).join(', ')}\n`);
  } else {
    console.log(`✅ ${ep}  →  ${JSON.stringify(data).slice(0, 120)}\n`);
  }
}

await prisma.$disconnect();
