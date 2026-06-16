import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const usersData = [
    { id: 'user-demo', name: 'Demo Admin', email: 'admin@demo.com', password: 'password123' },
    { id: '1', name: 'Test User', email: 'test@example.com', password: 'password123' },
    { id: '2', name: 'Admin User', email: 'admin@example.com', password: 'admin123' },
  ];

  const workspacesData = [
    { id: 'demo-workspace', name: 'Demo Workspace', slug: 'demo-workspace', userId: 'user-demo' },
    { id: 'ws-1', name: "Test User's Workspace", slug: 'test-user', userId: '1' },
    { id: 'ws-2', name: "Admin User's Workspace", slug: 'admin-user', userId: '2' },
  ];

  // Seed Users
  for (const u of usersData) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, passwordHash },
      create: { id: u.id, name: u.name, email: u.email, passwordHash },
    });
  }

  // Seed Workspaces and their relationships
  for (const w of workspacesData) {
    const ws = await prisma.workspace.upsert({
      where: { id: w.id },
      update: { name: w.name, slug: w.slug },
      create: {
        id: w.id,
        name: w.name,
        slug: w.slug,
        planName: 'Pro',
        settings: { create: {} },
      },
    });

    // Membership
    await prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: w.userId, workspaceId: w.id } },
      update: { role: 'Admin' },
      create: { userId: w.userId, workspaceId: w.id, role: 'Admin' },
    });

    // Sample template
    await prisma.template.upsert({
      where: { workspaceId_name_language: { workspaceId: w.id, name: 'order_confirmation', language: 'en' } },
      update: {},
      create: {
        workspaceId: w.id,
        name: 'order_confirmation',
        category: 'UTILITY',
        language: 'en',
        bodyText: 'Hello {{1}}, your order #{{2}} has been confirmed.',
        status: 'APPROVED',
      },
    });

    // WhatsApp Number seed
    await prisma.whatsappNumber.upsert({
      where: { workspaceId_phoneNumber: { workspaceId: w.id, phoneNumber: '+1234567890' } },
      update: {},
      create: {
        workspaceId: w.id,
        phoneNumber: '+1234567890',
        displayName: 'Demo Support',
        status: 'Approved',
        wabaId: 'waba-123456',
        accessToken: 'token-123456',
        category: 'Support',
      },
    });

    // Contacts seed
    await prisma.contact.upsert({
      where: { workspaceId_phoneNumber: { workspaceId: w.id, phoneNumber: '+919876543210' } },
      update: {},
      create: {
        workspaceId: w.id,
        phoneNumber: '+919876543210',
        name: 'John Doe',
        email: 'john@example.com',
        tags: JSON.stringify(['VIP', 'Lead']),
      },
    });

    await prisma.contact.upsert({
      where: { workspaceId_phoneNumber: { workspaceId: w.id, phoneNumber: '+919876543211' } },
      update: {},
      create: {
        workspaceId: w.id,
        phoneNumber: '+919876543211',
        name: 'Jane Smith',
        email: 'jane@example.com',
        tags: JSON.stringify(['Customer']),
      },
    });
  }

  console.log('Seeding completed successfully.');
  console.log('Available Logins:');
  console.log(' - admin@demo.com / password123 (demo-workspace)');
  console.log(' - test@example.com / password123 (ws-1)');
  console.log(' - admin@example.com / admin123 (ws-2)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
