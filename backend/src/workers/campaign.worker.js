import { Worker } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { env } from '../config/env.js';
import prisma from '../config/prisma.js';
import { sendMessage } from '../services/whatsapp.service.js';
import { CAMPAIGN_STATUS } from '../constants/campaignStatus.js';
import logger from '../lib/logger.js';

const processCampaign = async (job) => {
  const { campaignId, workspaceId } = job.data;
  logger.info({ campaignId }, 'Campaign worker: processing');

  const campaign = await prisma.campaign.findFirstOrThrow({
    where: { id: campaignId, workspaceId },
    include: { template: true, whatsappNumber: true },
  });

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: CAMPAIGN_STATUS.RUNNING } });

  while (true) {
    const batch = await prisma.campaignRecipient.findMany({
      where: { campaignId, status: 'pending' },
      include: { contact: true },
      take: env.CAMPAIGN_BATCH_SIZE,
    });

    if (batch.length === 0) break;

    for (const recipient of batch) {
      if (recipient.contact.optedOut) {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'skipped', failureReason: 'opted_out' },
        });
        continue;
      }

      try {
        const msgPayload = {
          type: 'template',
          template: { name: campaign.template.name, language: { code: campaign.template.language } },
        };
        const result = await sendMessage(workspace, recipient.contact.phoneNumber, msgPayload);

        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'sent', metaMessageId: result?.messages?.[0]?.id, sentAt: new Date() },
        });
        await prisma.campaign.update({ where: { id: campaignId }, data: { sent: { increment: 1 } } });
      } catch (err) {
        logger.warn({ err, recipientId: recipient.id }, 'Failed to send campaign message');
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'failed', failureReason: err.message },
        });
        await prisma.campaign.update({ where: { id: campaignId }, data: { failed: { increment: 1 } } });
      }
    }
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CAMPAIGN_STATUS.COMPLETED, completedAt: new Date() },
  });

  logger.info({ campaignId }, 'Campaign worker: completed');
};

export const createCampaignWorker = () => {
  if (!bullConnection) return null;
  return new Worker('campaign-dispatch', processCampaign, {
    ...bullConnection,
    concurrency: env.CAMPAIGN_WORKER_CONCURRENCY,
  });
};
