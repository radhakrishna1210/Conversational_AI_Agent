import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const providers = ['google_calendar', 'calendly'];

for (const provider of providers) {
  const workspace = await prisma.workspace.findFirst();
  const state = `oauth-test-${provider}-${Date.now()}`;

  const session = await prisma.oAuthSession.create({
    data: {
      workspaceId: workspace.id,
      provider,
      userId: 'test-user',
      state,
      redirectUri: `http://localhost:4000/api/v1/integrations/${provider}/callback`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      metadata: JSON.stringify({ provider, test: true }),
    },
  });

  console.log(`\n[${provider}] created OAuth session: ${session.state}`);

  const found = await prisma.oAuthSession.findUnique({ where: { state } });
  console.log(`[${provider}] lookup ok:`, !!found);
  console.log(`[${provider}] session provider matches:`, found?.provider === provider);

  await prisma.oAuthSession.delete({ where: { id: session.id } });
}

await prisma.$disconnect();
console.log('\nOAuth callback session checks completed.');
