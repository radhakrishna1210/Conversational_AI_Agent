import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { CAMPAIGN_STATUS } from '../constants/campaignStatus.js';
import { enqueueCampaign } from '../queues/campaign.queue.js';
import { runCampaign, requestStop } from './campaignRunner.service.js';
import { resolveCallMode } from './outboundCall.service.js';
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

export const createCampaign = (workspaceId, data) =>
  prisma.campaign.create({ data: { ...data, workspaceId, status: CAMPAIGN_STATUS.DRAFT } });

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

export const updateCampaign = (workspaceId, campaignId, data) =>
  prisma.campaign.update({ where: { id: campaignId, workspaceId }, data });

export const deleteCampaign = (workspaceId, campaignId) =>
  prisma.campaign.delete({ where: { id: campaignId, workspaceId } });

export const addRecipients = async (workspaceId, campaignId, contactIds) => {
  const rows = contactIds.map((contactId) => ({ campaignId, contactId }));
  await prisma.campaignRecipient.createMany({ data: rows, skipDuplicates: true });
  const count = await prisma.campaignRecipient.count({ where: { campaignId } });
  return prisma.campaign.update({
    where: { id: campaignId },
    data: { totalContacts: count },
  });
};

export const launchCampaign = async (workspaceId, campaignId, scheduledAt) => {
  const campaign = await prisma.campaign.findFirstOrThrow({
    where: { id: campaignId, workspaceId },
  });

  if (campaign.status !== CAMPAIGN_STATUS.DRAFT && campaign.status !== CAMPAIGN_STATUS.SCHEDULED) {
    throw Object.assign(new Error('Campaign cannot be launched in its current state'), { statusCode: 409 });
  }

  const status = scheduledAt ? CAMPAIGN_STATUS.SCHEDULED : CAMPAIGN_STATUS.RUNNING;
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status, scheduledAt: scheduledAt ? new Date(scheduledAt) : null, launchedAt: new Date() },
  });

  try {
    if (!scheduledAt) {
      await enqueueCampaign(campaignId, workspaceId);
    } else {
      const delay = new Date(scheduledAt).getTime() - Date.now();
      await enqueueCampaign(campaignId, workspaceId, Math.max(delay, 0));
    }
  } catch (err) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: campaign.status },
    });
    const error = new Error('Failed to enqueue campaign job. Please try again later.');
    error.statusCode = 503;
    error.cause = err;
    throw error;
  }

  return updated;
};

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

  const pending = await prisma.campaignRecipient.count({ where: { campaignId, status: 'pending' } });
  if (!pending) {
    throw Object.assign(new Error('This campaign has no pending recipients left to call'), { statusCode: 409 });
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CAMPAIGN_STATUS.RUNNING, lastError: null, launchedAt: campaign.launchedAt ?? new Date() },
  });

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
  const { mode, engine, reason } = resolveCallMode(agent);
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
