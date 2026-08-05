// End-to-end check of the voice campaign path against the real database.
//
// SAFETY: every destination here is deliberately INVALID, and the caller ID is a
// number this account does not own. Twilio rejects both at the API boundary, so
// no call is ever connected, nobody's phone rings, and nothing is billed. Do not
// change these to real numbers.
import prisma from '../src/config/prisma.js';
import * as svc from '../src/services/campaign.service.js';
import { runCampaign, callerRotation } from '../src/services/campaignRunner.service.js';
import { resolveCallMode } from '../src/services/outboundCall.service.js';

const INVALID_NUMBERS = ['+1', '+2', '+3'];
const FAKE_CALLER = '+15005550006'; // not owned by this account -> Twilio 21210

const ok = (label, cond, extra = '') =>
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
let failures = 0;
const check = (label, cond, extra) => { if (!cond) failures++; ok(label, cond, extra); };

const agent = await prisma.agent.findFirst({ where: { name: { contains: 'Purva' } } });
if (!agent) { console.error('No agent to test with'); process.exit(1); }
const workspaceId = agent.workspaceId;
console.log(`agent: ${agent.name} (${agent.id})\n`);

console.log('1. call-mode preview');
const mode = resolveCallMode(agent);
check('resolves a mode', ['conversation', 'greeting'].includes(mode.mode), mode.mode);
check('greeting mode explains why', mode.mode !== 'greeting' || Boolean(mode.reason));

console.log('\n2. create campaign (CSV -> recipients)');
const campaign = await svc.createBulkCampaign(workspaceId, {
  name: '__test__ campaign flow',
  botId: agent.id,
  phoneNumbers: INVALID_NUMBERS,
  fromNumbers: [FAKE_CALLER],
  fromNumber: FAKE_CALLER,
  csvFileName: 'test.csv',
  concurrentCalls: 2,
  progress: 0,
  status: 'DRAFT',
});
check('campaign created', Boolean(campaign.id));
check('channel is VOICE', campaign.channel === 'VOICE', campaign.channel);
const recips = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id } });
check('one recipient row per number', recips.length === INVALID_NUMBERS.length, `${recips.length}`);
check('all start pending', recips.every((r) => r.status === 'pending'));
check('caller rotation resolves', callerRotation(campaign)[0] === FAKE_CALLER);

console.log('\n3. re-creating the same numbers does not duplicate');
await prisma.campaignRecipient.createMany({
  data: INVALID_NUMBERS.map((phoneNumber) => ({ campaignId: campaign.id, phoneNumber })),
  skipDuplicates: true,
});
const afterDupe = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } });
check('unique(campaignId, phoneNumber) holds', afterDupe === INVALID_NUMBERS.length, `${afterDupe}`);

console.log('\n4. dispatch (Twilio rejects every number — no call connects)');
await runCampaign(campaign.id, workspaceId);
const done = await prisma.campaign.findUnique({ where: { id: campaign.id } });
const finalRecips = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id } });
check('campaign reached a terminal state', ['COMPLETED', 'FAILED', 'PAUSED'].includes(done.status), done.status);
check('no recipient left pending or stuck calling',
  finalRecips.every((r) => !['pending', 'calling'].includes(r.status)),
  finalRecips.map((r) => r.status).join(','));
check('failures carry a reason', finalRecips.filter((r) => r.status === 'failed').every((r) => r.failureReason));
check('progress reflects the rows', done.progress === 100 || done.status !== 'COMPLETED', `${done.progress}%`);
console.log(`     campaign: status=${done.status} sent=${done.sent} failed=${done.failed} progress=${done.progress}%`);
console.log(`     lastError: ${done.lastError ?? '(none)'}`);
console.log(`     first failure: ${finalRecips.find((r) => r.failureReason)?.failureReason?.slice(0, 120) ?? '(none)'}`);

console.log('\n5. restarting a finished campaign is refused');
try {
  await svc.startCampaign(workspaceId, campaign.id);
  check('start with no pending recipients rejected', false, 'it was allowed');
} catch (e) {
  check('start with no pending recipients rejected', e.statusCode === 409 || e.statusCode === 400, e.message);
}

console.log('\n6. cancel retires pending recipients');
const c2 = await svc.createBulkCampaign(workspaceId, {
  name: '__test__ campaign cancel', botId: agent.id, phoneNumbers: ['+4', '+5'],
  fromNumbers: [FAKE_CALLER], fromNumber: FAKE_CALLER, csvFileName: 't.csv',
  concurrentCalls: 1, progress: 0, status: 'DRAFT',
});
await svc.cancelCampaign(workspaceId, c2.id);
const cancelled = await prisma.campaignRecipient.findMany({ where: { campaignId: c2.id } });
check('pending recipients skipped on cancel', cancelled.every((r) => r.status === 'skipped'));

console.log('\ncleanup');
await prisma.campaignRecipient.deleteMany({ where: { campaignId: { in: [campaign.id, c2.id] } } });
await prisma.campaign.deleteMany({ where: { id: { in: [campaign.id, c2.id] } } });
await prisma.agentCallLog.deleteMany({
  where: { workspaceId, agentId: agent.id, phoneNumber: { in: [...INVALID_NUMBERS, '+4', '+5'] } },
});
console.log('  test campaigns, recipients and call logs removed');

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed');
await prisma.$disconnect();
process.exit(failures ? 1 : 0);
