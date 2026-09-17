import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { CAMPAIGN_STATUS } from '../constants/campaignStatus.js';
import { enqueueCampaign } from '../queues/campaign.queue.js';
import { runCampaign, requestStop, requestResume } from './campaignRunner.service.js';
import { resolveCallMode } from './outboundCall.service.js';
import { outboundRefusal } from './agentDirection.js';
import { resolveClusterContacts } from './contact.service.js';

export const listCampaigns = (workspaceId) =>
  prisma.campaign.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });

export const getCampaign = (workspaceId, campaignId) =>
  prisma.campaign.findFirstOrThrow({
    where: { id: campaignId, workspaceId },
  });

/**
 * Refuse an Inbound agent as a campaign's caller.
 *
 * Checked when the agent is chosen (create, edit) and again when dialling is
 * asked for (launch, start), because a draft can sit for days while its agent
 * is switched to Inbound. The dialler refuses it too; checking here says so on
 * the button press instead of in a FAILED campaign's lastError.
 */
async function assertDialingAgent(workspaceId, botId) {
  if (!botId) return;
  const agent = await prisma.agent.findFirst({
    where: { id: String(botId), workspaceId },
    select: { id: true, name: true, settings: true },
  });
  const refusal = outboundRefusal(agent);
  if (refusal) throw Object.assign(new Error(refusal), { statusCode: 409 });
}

export const createCampaign = async (workspaceId, data) => {
  await assertDialingAgent(workspaceId, data?.botId);
  return prisma.campaign.create({ data: { ...data, workspaceId, status: CAMPAIGN_STATUS.DRAFT } });
};

const RECIPIENT_CHUNK = 500;

/**
 * Create a VOICE campaign from one or more contact clusters.
 *
 * A campaign never reads a CSV directly any more: an upload is imported into a
 * cluster first (see contact.service) and the campaign is built from that. This
 * is what makes a list survive the campaign that introduced it, and it is why
 * opt-outs work — they live on the contact, so a person who said "stop calling
 * me" is absent from every future campaign built from any list they are on.
 *
 * The resolved contacts are written out as CampaignRecipient rows, which is what
 * makes the dispatcher resumable and idempotent (unique on campaignId +
 * phoneNumber): a crash or restart mid-campaign can never re-dial someone who
 * was already called. Those rows are a *snapshot* — later edits to the cluster
 * do not silently change a campaign that is already running.
 */
export const createBulkCampaign = async (workspaceId, data) => {
  const { clusterIds = [], ...rest } = data;
  await assertDialingAgent(workspaceId, rest.botId);
  const contacts = await resolveClusterContacts(workspaceId, clusterIds);
  if (!contacts.length) {
    throw Object.assign(
      new Error('The selected list has no dialable contacts. Contacts that opted out or failed validation are never dialled.'),
      { statusCode: 400 },
    );
  }

  const campaign = await prisma.campaign.create({
    data: {
      ...rest,
      clusterIds,
      // The dialled list, kept on the campaign as its own record so the
      // campaign reads correctly even if a cluster is deleted later.
      phoneNumbers: contacts.map((c) => c.phoneNumber),
      workspaceId,
      channel: 'VOICE',
      status: CAMPAIGN_STATUS.DRAFT,
      progress: 0,
      totalContacts: contacts.length,
    },
  });

  for (let i = 0; i < contacts.length; i += RECIPIENT_CHUNK) {
    await prisma.campaignRecipient.createMany({
      data: contacts.slice(i, i + RECIPIENT_CHUNK).map((c) => ({
        campaignId: campaign.id,
        phoneNumber: c.phoneNumber,
        contactId: c.id,
      })),
      skipDuplicates: true,
    });
  }
  return campaign;
};

/**
 * Pull in contacts added to this campaign's clusters since it was created.
 *
 * Recipients are a snapshot, which is right for a campaign in flight and wrong
 * for the common case of "I forgot 200 numbers". This makes topping up an
 * explicit action rather than an invisible one. Already-dialled recipients are
 * untouched — skipDuplicates on (campaignId, phoneNumber) guarantees it.
 */
const SYNCABLE = new Set([
  CAMPAIGN_STATUS.DRAFT,
  CAMPAIGN_STATUS.SCHEDULED,
  CAMPAIGN_STATUS.PAUSED,
  CAMPAIGN_STATUS.FAILED,
]);

export const syncCampaignList = async (workspaceId, campaignId) => {
  const campaign = await prisma.campaign.findFirstOrThrow({ where: { id: campaignId, workspaceId } });
  if (!SYNCABLE.has(campaign.status)) {
    throw Object.assign(
      new Error(`A ${campaign.status.toLowerCase()} campaign cannot take on new numbers — pause it first`),
      { statusCode: 409 },
    );
  }
  const clusterIds = Array.isArray(campaign.clusterIds) ? campaign.clusterIds : [];
  if (!clusterIds.length) {
    throw Object.assign(new Error('This campaign was not built from a cluster, so there is nothing to sync'), { statusCode: 400 });
  }

  const contacts = await resolveClusterContacts(workspaceId, clusterIds);
  let added = 0;
  for (let i = 0; i < contacts.length; i += RECIPIENT_CHUNK) {
    const { count } = await prisma.campaignRecipient.createMany({
      data: contacts.slice(i, i + RECIPIENT_CHUNK).map((c) => ({
        campaignId,
        phoneNumber: c.phoneNumber,
        contactId: c.id,
      })),
      skipDuplicates: true,
    });
    added += count;
  }

  const total = await prisma.campaignRecipient.count({ where: { campaignId } });
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { totalContacts: total },
  });
  return { ...updated, added };
};

// The fields a PUT may change. Picked explicitly rather than spreading the body:
// the validator is one layer, and a status or counter written straight from a
// request is how a campaign came to claim RUNNING with nothing dialling.
const EDITABLE = ['name', 'botId', 'fromNumber', 'concurrentCalls'];

export const updateCampaign = async (workspaceId, campaignId, data = {}) => {
  const patch = Object.fromEntries(EDITABLE.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
  await assertDialingAgent(workspaceId, patch.botId);
  return prisma.campaign.update({ where: { id: campaignId, workspaceId }, data: patch });
};

export const deleteCampaign = (workspaceId, campaignId) =>
  prisma.campaign.delete({ where: { id: campaignId, workspaceId } });

/**
 * Add known contacts to a campaign that has not finished.
 *
 * Two things were wrong here. The campaign was never looked up in the caller's
 * workspace, so any member could write recipients onto another workspace's
 * campaign by id. And the rows were created with no phone number — the dialling
 * truth — so each one was a recipient the dispatcher would try to call with
 * `toNumber: null`. Contacts are resolved in this workspace and only callable
 * ones are added, the same rule every cluster-built list follows.
 */
export const addRecipients = async (workspaceId, campaignId, contactIds = []) => {
  const campaign = await prisma.campaign.findFirstOrThrow({ where: { id: campaignId, workspaceId } });
  if (!SYNCABLE.has(campaign.status)) {
    throw Object.assign(
      new Error(`A ${campaign.status.toLowerCase()} campaign cannot take on new numbers — pause it first`),
      { statusCode: 409 },
    );
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds.map(String) }, workspaceId, status: 'ACTIVE' },
    select: { id: true, phoneNumber: true },
  });
  if (contacts.length) {
    await prisma.campaignRecipient.createMany({
      data: contacts.map((c) => ({ campaignId, contactId: c.id, phoneNumber: c.phoneNumber })),
      skipDuplicates: true,
    });
  }
  const count = await prisma.campaignRecipient.count({ where: { campaignId } });
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { totalContacts: count },
  });
  return { ...updated, added: contacts.length, ignored: contactIds.length - contacts.length };
};

export const launchCampaign = async (workspaceId, campaignId, scheduledAt) => {
  const campaign = await prisma.campaign.findFirstOrThrow({
    where: { id: campaignId, workspaceId },
  });

  if (campaign.status !== CAMPAIGN_STATUS.DRAFT && campaign.status !== CAMPAIGN_STATUS.SCHEDULED) {
    throw Object.assign(new Error('Campaign cannot be launched in its current state'), { statusCode: 409 });
  }
  if (campaign.channel === 'VOICE') await assertDialingAgent(workspaceId, campaign.botId);

  const status = scheduledAt ? CAMPAIGN_STATUS.SCHEDULED : CAMPAIGN_STATUS.RUNNING;
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status, scheduledAt: scheduledAt ? new Date(scheduledAt) : null, launchedAt: new Date() },
  });

  const delay = scheduledAt ? Math.max(new Date(scheduledAt).getTime() - Date.now(), 0) : 0;
  let queued = null;
  try {
    queued = await enqueueCampaign(campaignId, workspaceId, delay);
  } catch (err) {
    // Same fall-through startCampaign takes: an unreachable Redis is not a
    // reason to refuse the launch when this process can dispatch it itself.
    logger.warn({ campaignId, err: err.message }, 'Campaign queue unavailable — dispatching in-process');
  }

  // No queue. enqueueCampaign returns null without Redis, and this used to stop
  // there: RUNNING with nothing dialling, or SCHEDULED with nothing to fire it.
  if (!queued) {
    if (scheduledAt) {
      scheduleCampaignTimer(campaignId, workspaceId, delay);
    } else {
      runCampaign(campaignId, workspaceId).catch((err) =>
        logger.error({ campaignId, err }, 'In-process campaign dispatch failed'));
    }
  }

  return { ...updated, dispatch: queued ? 'queued' : 'in-process' };
};

// ── Scheduled campaigns without a queue ─────────────────────────────────────
// With Redis, a scheduled launch is a delayed BullMQ job and survives restarts.
// Without it, the timer lives in this process — the same arrangement broadcasts
// use — and sweepDueCampaigns re-arms it at boot. Keyed so re-scheduling
// replaces rather than stacks a second timer that would dial the list twice.
const campaignTimers = new Map();

function scheduleCampaignTimer(campaignId, workspaceId, delayMs) {
  clearTimeout(campaignTimers.get(campaignId));
  // setTimeout's delay is a signed 32-bit int; anything longer fires at once.
  // The boot sweep picks those up instead, well before they come due.
  if (delayMs > 2 ** 31 - 1) return;

  const timer = setTimeout(async () => {
    campaignTimers.delete(campaignId);
    try {
      // runCampaign refuses anything no longer SCHEDULED/RUNNING, so a launch
      // cancelled before its time simply does nothing here.
      await runCampaign(campaignId, workspaceId);
    } catch (err) {
      logger.error({ campaignId, err: err.message }, 'Scheduled campaign failed to start');
    }
  }, Math.max(0, delayMs));
  timer.unref?.();
  campaignTimers.set(campaignId, timer);
}

/**
 * Re-arm scheduled campaigns that have no queued job, and start the ones that
 * came due while the process was down. Called from server startup.
 *
 * @param {object} [deps]  tests only
 * @returns {Promise<number>} campaigns armed or started
 */
export async function sweepDueCampaigns({ queuedCampaignIds = async () => new Set() } = {}) {
  const scheduled = await prisma.campaign.findMany({
    where: { status: CAMPAIGN_STATUS.SCHEDULED },
    select: { id: true, workspaceId: true, scheduledAt: true },
  });
  if (!scheduled.length) return 0;

  let queued = null;
  try {
    queued = await queuedCampaignIds();
  } catch (err) {
    // Unknown means do nothing: a delayed job may well exist, and arming a
    // timer on top of it would dial the list twice when both fire.
    logger.warn({ err: err.message }, 'Could not read the campaign queue — scheduled campaigns not re-armed');
    return 0;
  }

  let armed = 0;
  for (const row of scheduled) {
    if (queued.has(row.id)) continue;
    scheduleCampaignTimer(row.id, row.workspaceId, (row.scheduledAt?.getTime() ?? 0) - Date.now());
    armed += 1;
  }
  return armed;
}

// A campaign can be started from DRAFT/FAILED (fresh) or PAUSED (resume).
const STARTABLE = new Set([
  CAMPAIGN_STATUS.DRAFT,
  CAMPAIGN_STATUS.SCHEDULED,
  CAMPAIGN_STATUS.PAUSED,
  CAMPAIGN_STATUS.FAILED,
]);

/**
 * Start (or resume) dialling a voice campaign.
 *
 * Prefers the BullMQ queue so dispatch survives this request, but falls back to
 * running in-process when Redis is unavailable — which it is in this deployment
 * whenever the connection drops to "memory mode". Without that fallback, Start
 * would return 200 and place no calls, which is precisely the behaviour of the
 * simulation this replaced.
 */
export const startCampaign = async (workspaceId, campaignId) => {
  const campaign = await prisma.campaign.findFirstOrThrow({
    where: { id: campaignId, workspaceId },
  });

  if (!STARTABLE.has(campaign.status)) {
    throw Object.assign(
      new Error(`Campaign cannot be started while it is ${campaign.status}`),
      { statusCode: 409 },
    );
  }
  if (campaign.channel === 'VOICE' && !campaign.botId) {
    throw Object.assign(new Error('Select a voice agent before starting this campaign'), { statusCode: 400 });
  }
  if (campaign.channel === 'VOICE') await assertDialingAgent(workspaceId, campaign.botId);

  const pending = await prisma.campaignRecipient.count({ where: { campaignId, status: 'pending' } });
  if (!pending) {
    throw Object.assign(new Error('This campaign has no pending recipients left to call'), { statusCode: 409 });
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CAMPAIGN_STATUS.RUNNING, lastError: null, launchedAt: campaign.launchedAt ?? new Date() },
  });

  // Started by hand ahead of its scheduled time: the in-process timer (if this
  // launch had no queue) must not start a second dispatch later.
  clearTimeout(campaignTimers.get(campaignId));
  campaignTimers.delete(campaignId);

  // This process's loop for the campaign is still stopping from a Pause a moment
  // ago. It picks the campaign straight back up once it has unwound; queueing a
  // second dispatch now would only be refused as already running.
  if (requestResume(campaignId)) {
    return { ...updated, dispatch: 'in-process', pending };
  }

  // A configured-but-unreachable Redis throws here rather than returning null,
  // and that must not turn into a 500 on Start — fall through to in-process.
  let queued = null;
  try {
    queued = await enqueueCampaign(campaignId, workspaceId);
  } catch (err) {
    logger.warn({ campaignId, err: err.message }, 'Campaign queue unavailable — dispatching in-process');
  }
  if (!queued) {
    // Fire-and-forget: the dispatcher paces itself over minutes/hours and must
    // not hold the HTTP response open.
    runCampaign(campaignId, workspaceId).catch((err) =>
      logger.error({ campaignId, err }, 'In-process campaign dispatch failed'));
  }

  return { ...updated, dispatch: queued ? 'queued' : 'in-process', pending };
};

/** Stop after the in-flight call; pending recipients stay pending so it can resume. */
export const pauseCampaign = async (workspaceId, campaignId) => {
  const campaign = await prisma.campaign.findFirstOrThrow({ where: { id: campaignId, workspaceId } });
  if (campaign.status !== CAMPAIGN_STATUS.RUNNING) {
    throw Object.assign(new Error(`Only a running campaign can be paused (this one is ${campaign.status})`), { statusCode: 409 });
  }
  requestStop(campaignId);
  return prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CAMPAIGN_STATUS.PAUSED },
  });
};

export const cancelCampaign = async (workspaceId, campaignId) => {
  await prisma.campaign.findFirstOrThrow({ where: { id: campaignId, workspaceId } });
  requestStop(campaignId);
  clearTimeout(campaignTimers.get(campaignId));
  campaignTimers.delete(campaignId);
  // Retire the queue so a resumed/duplicated dispatch cannot pick them up later.
  await prisma.campaignRecipient.updateMany({
    where: { campaignId, status: 'pending' },
    data: { status: 'skipped', failureReason: 'campaign_cancelled' },
  });
  return prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CAMPAIGN_STATUS.CANCELLED, completedAt: new Date() },
  });
};

/**
 * What will this agent's calls actually be? Answered before launch so the UI can
 * label the campaign and make greeting-only an explicit choice rather than a
 * surprise discovered after the calls go out.
 */
export const previewCampaignMode = async (workspaceId, agentId) => {
  if (!agentId) return { mode: null, reason: 'Select a voice agent.' };
  const agent = await prisma.agent.findFirst({ where: { id: String(agentId), workspaceId } });
  if (!agent) throw Object.assign(new Error('Agent not found in this workspace'), { statusCode: 404 });
  const { mode, engine, reason } = await resolveCallMode(agent);
  return { mode, engine, reason, agentName: agent.name };
};

export const getCampaignStats = async (workspaceId, campaignId) => {
  const campaign = await getCampaign(workspaceId, campaignId);
  const breakdown = await prisma.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { status: true },
  });
  return { campaign, breakdown };
};
