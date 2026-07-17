import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

try {
  const sessionCount = await p.oAuthSession.count();
  console.log('OAuthSession rows:', sessionCount);

  // Show recent sessions
  const sessions = await p.oAuthSession.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
  console.log('Recent sessions:');
  sessions.forEach(s => {
    console.log(`  provider=${s.provider}  state=${s.state.slice(0,8)}...  consumed=${s.consumedAt ? 'YES' : 'NO'}  expired=${s.expiresAt < new Date() ? 'YES' : 'NO'}  expiresAt=${s.expiresAt}`);
  });

  const wsCount = await p.workspace.count();
  console.log('\nWorkspaces:', wsCount);
} catch (e) {
  console.error('DB Error:', e.message);
} finally {
  await p.$disconnect();
}
