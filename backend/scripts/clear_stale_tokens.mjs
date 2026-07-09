// Script to clear stale integration tokens that can't be decrypted with current ENCRYPTION_KEY
import prisma from '../src/config/prisma.js';

const bad = await prisma.integrationToken.findMany({
  where: { provider: { in: ['google_calendar', 'google_meet', 'google_sheets'] } },
  select: { id: true, integrationId: true, provider: true },
});

console.log('Found stale tokens:', bad.length);

if (bad.length > 0) {
  await prisma.integrationToken.deleteMany({
    where: { id: { in: bad.map((t) => t.id) } },
  });
  await prisma.integration.updateMany({
    where: { id: { in: bad.map((t) => t.integrationId) } },
    data: { connected: false, status: 'disconnected', lastError: null, accountLabel: null },
  });
  console.log('Cleared', bad.length, 'stale token(s). Integrations reset to disconnected.');
} else {
  console.log('No stale tokens found.');
}

await prisma.$disconnect();
