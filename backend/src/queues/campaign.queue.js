import { Queue } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { JOB_MAX_ATTEMPTS, JOB_BACKOFF_DELAY_MS } from '../constants/limits.js';

export const campaignQueue = bullConnection
  ? new Queue('campaign-dispatch', bullConnection)
  : null;

export const enqueueCampaign = (campaignId, workspaceId, delay = 0) => {
  if (!campaignQueue) return null;
  return campaignQueue.add('dispatch', { campaignId, workspaceId }, {
    delay,
    attempts: JOB_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: JOB_BACKOFF_DELAY_MS },
  });
};
