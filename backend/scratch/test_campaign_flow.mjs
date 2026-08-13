// End-to-end check of the voice campaign path against the real database.
//
// SAFETY: the caller ID is a number this account does not own, so Twilio rejects
// every call at the API boundary — nobody's phone rings and nothing is billed.
// The destinations sit in country code +999, which the ITU has never assigned,
// so no carrier on earth can route them either. They must still be *shaped* like
// real E.164 numbers because contacts are validated on the way in now; that is
// why they are no longer '+1', '+2', '+3'. Do not change any of these to real
// numbers.
import prisma from '../src/config/prisma.js';
import * as svc from '../src/services/campaign.service.js';
import * as contacts from '../src/services/contact.service.js';
import { runCampaign, callerRotation } from '../src/services/campaignRunner.service.js';
import { resolveCallMode } from '../src/services/outboundCall.service.js';

const INVALID_NUMBERS = ['+999000000001', '+999000000002', '+999000000003'];
const CANCEL_NUMBERS = ['+999000000004', '+999000000005'];
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

console.log('\n2. import a cluster, then create a campaign from it');
const imported = await contacts.importContacts(
  workspaceId,
  INVALID_NUMBERS.map((phone, i) => ({ phone, name: `__test__ contact ${i + 1}` })),
  { clusterName: '__test__ cluster flow', csvFileName: 'test.csv' },
);
check('cluster created', Boolean(imported.cluster.id));
check('every number parsed', imported.summary.parsed === INVALID_NUMBERS.length, `${imported.summary.parsed}`);
check('no rows rejected', imported.summary.invalid === 0, `${imported.summary.invalid}`);

const campaign = await svc.createBulkCampaign(workspaceId, {
  name: '__test__ campaign flow',
  botId: agent.id,
  clusterIds: [imported.cluster.id],
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
check('every recipient links back to a contact', recips.every((r) => r.contactId));
check('caller rotation resolves', callerRotation(campaign)[0] === FAKE_CALLER);

console.log('\n2b. opting a contact out removes it from the next campaign');
await contacts.setContactStatus(workspaceId, [recips[0].contactId], 'OPTED_OUT');
const afterOptOut = await contacts.previewClusters(workspaceId, [imported.cluster.id]);
check('preview drops the opted-out contact',
  afterOptOut.dialable === INVALID_NUMBERS.length - 1, `${afterOptOut.dialable} dialable`);
check('preview still counts them', afterOptOut.optedOut === 1, `${afterOptOut.optedOut} opted out`);
await contacts.setContactStatus(workspaceId, [recips[0].contactId], 'ACTIVE');

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
const cancelCluster = await contacts.importContacts(
  workspaceId,
  CANCEL_NUMBERS.map((phone) => ({ phone })),
  { clusterName: '__test__ cluster cancel', csvFileName: 't.csv' },
);
const c2 = await svc.createBulkCampaign(workspaceId, {
  name: '__test__ campaign cancel', botId: agent.id, clusterIds: [cancelCluster.cluster.id],
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
  where: { workspaceId, agentId: agent.id, phoneNumber: { in: [...INVALID_NUMBERS, ...CANCEL_NUMBERS] } },
});
// Contacts first: the cluster rows cascade from them either way, but deleting
// the people is what stops a re-run from finding them already imported.
await prisma.contact.deleteMany({
  where: { workspaceId, phoneNumber: { in: [...INVALID_NUMBERS, ...CANCEL_NUMBERS] } },
});
await prisma.contactCluster.deleteMany({
  where: { workspaceId, id: { in: [imported.cluster.id, cancelCluster.cluster.id] } },
});
console.log('  test campaigns, recipients, contacts, clusters and call logs removed');

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed');
await prisma.$disconnect();
process.exit(failures ? 1 : 0);
