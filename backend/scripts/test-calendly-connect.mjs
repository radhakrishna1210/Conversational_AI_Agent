import { PrismaClient } from '@prisma/client';
import { signAccessToken } from '../src/lib/jwt.js';

const prisma = new PrismaClient();
const ws     = await prisma.workspace.findFirst();
const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: ws.id }, include: { user: true } });
const token  = signAccessToken({ userId: member.userId, email: member.user.email, workspaceId: ws.id, role: member.role });

const BASE    = `http://localhost:4000/api/v1/workspaces/${ws.id}`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

console.log(`\nTesting Calendly connect for workspace: ${ws.name}\n`);

const res = await fetch(`${BASE}/integrations/calendly/connect`, {
  method: 'POST',
  headers,
  body: '{}',
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
try {
  const json = JSON.parse(text);
  console.log(JSON.stringify(json, null, 2));
} catch {
  console.log(text);
}

await prisma.$disconnect();
