/**
 * seed-analytics.js  —  Seeds demo agents + calls into PostgreSQL for analytics
 *
 * Run:  node --env-file=.env prisma/seed-analytics.js
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const OUTCOMES   = ['interested', 'not_interested', 'callback', 'appointment_set', 'voicemail', 'no_answer'];
const SENTIMENTS = ['positive', 'negative', 'neutral'];
const STATUSES   = ['completed', 'failed', 'busy', 'no-answer'];
const DIRECTIONS = ['INBOUND', 'OUTBOUND'];

const AGENT_TEMPLATES = [
  { name: 'Sales Agent Alpha',    llm: 'gpt-4',    voice: 'echo',  language: 'en' },
  { name: 'Support Bot Beta',     llm: 'gpt-4',    voice: 'nova',  language: 'en' },
  { name: 'Lead Qualifier Gamma', llm: 'gemini',   voice: 'alloy', language: 'en' },
  { name: 'Appointment Setter',   llm: 'gpt-4',    voice: 'onyx',  language: 'en' },
  { name: 'Collections Agent',    llm: 'claude-3', voice: 'fable', language: 'en' },
];

async function seed() {
  // 1. Find workspace
  const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!workspace) {
    console.error('❌  No workspace found. Sign up at the app first, then re-run.');
    process.exit(1);
  }
  console.log(`\n✅  Workspace: "${workspace.name}" (${workspace.id})\n`);
  const workspaceId = workspace.id;

  // 2. Create agents (safe to re-run — skips existing by name)
  console.log('🤖  Creating agents...');
  const agents = [];
  for (const tmpl of AGENT_TEMPLATES) {
    const existing = await prisma.agent.findFirst({ where: { workspaceId, name: tmpl.name } });
    if (existing) {
      agents.push(existing);
      console.log(`   ↩  Reusing: ${tmpl.name}`);
    } else {
      const agent = await prisma.agent.create({
        data: { workspaceId, name: tmpl.name, llm: tmpl.llm, voice: tmpl.voice, language: tmpl.language, status: 'active', welcomeMessage: `Hi! I'm ${tmpl.name}.` },
      });
      agents.push(agent);
      console.log(`   ✅  Created: ${tmpl.name}`);
    }
  }

  // 3. Skip if already seeded
  const existing = await prisma.call.count({ where: { workspaceId } });
  if (existing >= 100) {
    console.log(`\n📞  ${existing} calls already exist — skipping.\n`);
  } else {
    console.log('\n📞  Generating 300 calls over 90 days...');
    const calls = [];
    for (let i = 0; i < 300; i++) {
      const daysAgo   = Math.floor(Math.random() * 90);
      const startedAt = new Date();
      startedAt.setDate(startedAt.getDate() - daysAgo);
      startedAt.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);

      const duration    = Math.floor(Math.random() * 600) + 30;
      const status      = STATUSES[Math.floor(Math.random() * STATUSES.length)];
      const isCompleted = status === 'completed';
      const agent       = agents[Math.floor(Math.random() * agents.length)];

      calls.push({
        workspaceId,
        assistantId:  agent.id,
        direction:    DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)],
        status,
        duration:     isCompleted ? duration : Math.floor(Math.random() * 60),
        cost:         Number(((duration / 60) * 0.05).toFixed(3)),
        fromNumber:   `+1${Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000}`,
        toNumber:     `+1${Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000}`,
        startedAt,
        answeredAt:   isCompleted ? new Date(startedAt.getTime() + 5_000) : null,
        endedAt:      isCompleted ? new Date(startedAt.getTime() + duration * 1_000) : null,
        sentiment:    isCompleted ? SENTIMENTS[Math.floor(Math.random() * SENTIMENTS.length)] : null,
        outcome:      isCompleted ? OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)]     : null,
        source:       Math.random() > 0.5 ? 'manual' : 'campaign',
        transcript:   isCompleted ? 'Agent: Hello!\nUser: I need help.' : null,
        summary:      isCompleted ? `${Math.round(duration / 60)} min call.` : null,
      });
    }
    for (let i = 0; i < calls.length; i += 50) {
      await prisma.call.createMany({ data: calls.slice(i, i + 50), skipDuplicates: true });
      process.stdout.write(`   ${Math.min(i + 50, calls.length)}/300\r`);
    }
    console.log('\n   ✅  300 calls seeded.');
  }

  const totalAgents = await prisma.agent.count({ where: { workspaceId } });
  const totalCalls  = await prisma.call.count({  where: { workspaceId } });
  console.log(`\n─────────────────────────────\nAgents: ${totalAgents}\nCalls:  ${totalCalls}\n─────────────────────────────\n🎉  Done!\n`);
}

seed()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
