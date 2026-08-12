import { Worker } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { env } from '../config/env.js';
import { runCampaign } from '../services/campaignRunner.service.js';
import logger from '../lib/logger.js';

// Campaigns are voice-only. The WhatsApp template broadcast that used to live
// here — batch over CampaignRecipient, look up each Contact, send a Template
// through the Meta API — went with the WhatsApp models; all three of those
// tables are gone from the database.
const processCampaign = async (job) => {
  const { campaignId, workspaceId } = job.data;
  logger.info({ campaignId }, 'Campaign worker: processing');
  await runCampaign(campaignId, workspaceId);
};

export const createCampaignWorker = () => {
  if (!bullConnection) return null;
  return new Worker('campaign-dispatch', processCampaign, {
    ...bullConnection,
    concurrency: env.CAMPAIGN_WORKER_CONCURRENCY,
  });
};
