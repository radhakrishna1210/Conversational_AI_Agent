import prisma from '../config/prisma.js';
import { CAMPAIGN_STATUS } from '../constants/campaignStatus.js';
import { enqueueCampaign } from '../queues/campaign.queue.js';

export const listCampaigns = (workspaceId) =>
  prisma.campaign.findMany({
    where: { workspaceId },
    include: { template: { select: { name: true } }, whatsappNumber: { select: { phoneNumber: true } } },
    orderBy: { createdAt: 'desc' },
  });

export const getCampaign = (workspaceId, campaignId) =>
  prisma.campaign.findFirstOrThrow({
    where: { id: campaignId, workspaceId },
    include: { template: true, whatsappNumber: true },
  });

export const createCampaign = (workspaceId, data) =>
  prisma.campaign.create({ data: { ...data, workspaceId, status: CAMPAIGN_STATUS.DRAFT } });

export const updateCampaign = (workspaceId, campaignId, data) =>
  prisma.campaign.update({ where: { id: campaignId, workspaceId }, data });

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

export const cancelCampaign = (workspaceId, campaignId) =>
  prisma.campaign.update({
    where: { id: campaignId, workspaceId },
    data: { status: CAMPAIGN_STATUS.CANCELLED },
  });

export const getCampaignStats = async (workspaceId, campaignId) => {
  const campaign = await getCampaign(workspaceId, campaignId);
  const breakdown = await prisma.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { status: true },
  });
  return { campaign, breakdown };
};
