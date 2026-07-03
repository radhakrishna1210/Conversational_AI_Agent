/**
 * Simulates the full OAuth connect → callback flow directly
 * to find exactly why "OAuth session expired or invalid" appears
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const ws = await p.workspace.findFirst();
console.log('Workspace:', ws.id);

// Simulate what createOAuthConnectUrl stores
const state = 'test_state_' + Date.now();
const providerKey = 'google_calendar';

const session = await p.oAuthSession.create({
  data: {
    workspaceId: ws.id,
    provider: providerKey,
    userId: 'test',
    state,
    redirectUri: 'http://localhost:4000/api/v1/integrations/google_calendar/callback',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    metadata: JSON.stringify({ provider: providerKey, mock: true }),
  },
});
console.log('\nCreated OAuthSession:');
console.log('  id:', session.id);
console.log('  state:', session.state);
console.log('  provider:', session.provider);
console.log('  consumed:', session.consumedAt);
console.log('  expired:', session.expiresAt < new Date());

// Simulate what completeOAuthCallback checks
const found = await p.oAuthSession.findUnique({ where: { state } });
console.log('\nLookup by state:', found ? 'FOUND' : 'NOT FOUND');
if (found) {
  console.log('  provider match:', found.provider === providerKey);
  console.log('  consumed:', !!found.consumedAt);
  console.log('  expired:', found.expiresAt < new Date());
  console.log('  ALL CHECKS PASS:', found.provider === providerKey && !found.consumedAt && found.expiresAt >= new Date());
}

// Clean up
await p.oAuthSession.delete({ where: { id: session.id } });
console.log('\nClean - test session deleted');

await p.$disconnect();
