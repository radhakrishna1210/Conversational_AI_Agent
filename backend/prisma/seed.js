import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin user
  const passwordHash = await bcrypt.hash('password123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: { name: 'Demo Admin', email: 'admin@demo.com', passwordHash },
  });

  // Workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'demo-workspace' },
    update: {},
    create: {
      name: 'Demo Workspace',
      slug: 'demo-workspace',
      planName: 'Pro',
      members: { create: { userId: user.id, role: 'Admin' } },
      settings: { create: {} },
    },
  });

  // Sample template
  await prisma.template.upsert({
    where: { workspaceId_name_language: { workspaceId: workspace.id, name: 'order_confirmation', language: 'en' } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: 'order_confirmation',
      category: 'UTILITY',
      language: 'en',
      bodyText: 'Hello {{1}}, your order #{{2}} has been confirmed.',
      status: 'APPROVED',
    },
  });

  // Sample invoice
  await prisma.invoice.create({
    data: {
      workspaceId: workspace.id,
      planName: 'Pro Plan',
      amountCents: 349900,
      currency: 'INR',
      status: 'Paid',
      invoiceDate: new Date('2026-03-01'),
    },
  });

  console.log(`Seeded workspace: ${workspace.id}`);
  console.log('Login: admin@demo.com / password123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
