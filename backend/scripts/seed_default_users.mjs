// Seeds the default dev users into the real DB so login works with USE_MOCK_AUTH=false
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const defaultUsers = [
  { email: 'test@example.com',  name: 'Test User',  password: 'password123', wsSlug: 'test-user-workspace',  wsName: "Test User's Workspace" },
  { email: 'admin@example.com', name: 'Admin User', password: 'admin123',     wsSlug: 'admin-user-workspace', wsName: "Admin User's Workspace" },
];

for (const u of defaultUsers) {
  const passwordHash = await bcrypt.hash(u.password, 12);

  // Upsert user (without specifying id — let DB assign or find existing)
  let user = await prisma.user.findUnique({ where: { email: u.email } });
  if (user) {
    user = await prisma.user.update({ where: { email: u.email }, data: { passwordHash } });
  } else {
    user = await prisma.user.create({ data: { email: u.email, name: u.name, passwordHash } });
  }

  // Upsert workspace (without specifying id)
  let workspace = await prisma.workspace.findUnique({ where: { slug: u.wsSlug } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: { name: u.wsName, slug: u.wsSlug, planName: 'Free' },
    });
  }

  // Ensure workspace settings
  await prisma.workspaceSettings.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: { workspaceId: workspace.id },
  });

  // Upsert membership
  await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    update: {},
    create: { userId: user.id, workspaceId: workspace.id, role: 'Admin' },
  });

  console.log(`✓ ${u.email} / ${u.password}  →  workspace: ${workspace.id}`);
}

await prisma.$disconnect();
console.log('\nDone. You can now log in with the above credentials.');
