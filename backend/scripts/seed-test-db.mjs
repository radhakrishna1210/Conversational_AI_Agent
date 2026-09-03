#!/usr/bin/env node
// backend/scripts/seed-test-db.mjs
//
// Seed a DISPOSABLE database with the minimum a modular web call needs: one
// workspace, one member, a funded wallet, one Sarvam voice and one agent.
//
//   TEST_DATABASE_URL=postgresql://... node scripts/seed-test-db.mjs
//
// REFUSES to run against anything that does not look like a test database.
// The production database was contaminated with test fixtures exactly because
// the integration suites had no such guard (see reports/OPEN_ISSUES.md D-8).
import { PrismaClient } from '@prisma/client';

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error('TEST_DATABASE_URL is required'); process.exit(2); }
if (/supabase\.com|supabase\.co|pooler|prod/i.test(url) || !/localhost|127\.0\.0\.1|hm_test|_test\b/i.test(url)) {
  console.error(`Refusing: "${url.replace(/:[^:@/]+@/, ':***@')}" does not look like a disposable test database`);
  process.exit(3);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const WS_ID = 'ws_test_latency';
const AGENT_ID = 'agent_test_latency';
const USER_ID = 'user_test_latency';

async function main() {
  const provider = await prisma.voiceProvider.upsert({
    where: { name: 'Sarvam' }, update: {}, create: { name: 'Sarvam', isActive: true },
  });
  const voice = await prisma.voice.upsert({
    where: { providerId_providerVoiceId: { providerId: provider.id, providerVoiceId: 'simran' } },
    update: {},
    create: { providerId: provider.id, providerVoiceId: 'simran', name: 'Simran', language: 'en-IN', gender: 'female', category: 'premade' },
  });
  const user = await prisma.user.upsert({
    where: { id: USER_ID }, update: {},
    create: { id: USER_ID, email: 'latency-harness@test.local', name: 'Latency Harness', passwordHash: null },
  });
  const ws = await prisma.workspace.upsert({
    where: { id: WS_ID }, update: {},
    create: { id: WS_ID, name: 'Latency Harness', slug: 'latency-harness' },
  });
  await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: ws.id } }, update: { role: 'Owner' },
    create: { userId: user.id, workspaceId: ws.id, role: 'Owner' },
  });
  await prisma.wallet.upsert({
    where: { workspaceId: ws.id }, update: { balanceCents: 10_000_00 },
    create: { workspaceId: ws.id, balanceCents: 10_000_00, currency: 'INR' },
  });
  const settings = {
    voiceEngine: 'modular',
    sttProvider: 'Deepgram',
    sttLanguage: 'English',
    turnEndSensitivity: process.env.SEED_TURN_END || 'balanced',
    ttsDelivery: 'auto',
    fillerWords: false,
    speculation: process.env.SEED_SPECULATION || 'candidate',
    callDirection: 'INBOUND',
  };
  const agent = await prisma.agent.upsert({
    where: { id: AGENT_ID },
    update: { settings: JSON.stringify(settings), voice: `Sarvam - ${voice.name}` },
    create: {
      id: AGENT_ID, workspaceId: ws.id, name: 'Latency Harness Agent',
      welcomeMessage: 'Hi, this is Riya from Sunrise Dental. How can I help you today?',
      aiModel: process.env.SEED_AI_MODEL || 'gemini-3.5-flash-lite',
      voice: `Sarvam - ${voice.name}`,
      transcription: 'Deepgram',
      languages: JSON.stringify(['English']),
      flowItems: JSON.stringify([{ title: 'Help', body: 'You are the receptionist for Sunrise Dental, open 9am-6pm Monday to Saturday, closed Sunday. A consultation costs 500 rupees. Book appointments and answer questions.', enabled: true }]),
      settings: JSON.stringify(settings),
    },
  });
  console.log(JSON.stringify({ workspaceId: ws.id, agentId: agent.id, userId: user.id, voice: agent.voice, model: agent.aiModel, settings }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
