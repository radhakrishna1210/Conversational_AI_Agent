import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  const workspaces = await prisma.workspace.findMany();
  const members = await prisma.workspaceMember.findMany();
  
  console.log('--- DB STATE ---');
  console.log('Users:', users.map(u => ({ id: u.id, email: u.email })));
  console.log('Workspaces:', workspaces.map(w => ({ id: w.id, name: w.name })));
  console.log('Members:', members.map(m => ({ userId: m.userId, workspaceId: m.workspaceId, role: m.role })));
  console.log('----------------');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
