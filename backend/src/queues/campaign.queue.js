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

/**
 * Campaigns the queue still holds an unfinished job for.
 *
 * Read at boot so the restart sweeps leave those to BullMQ: a job whose worker
 * died with the old process is moved back to waiting and re-run, and a delayed
 * launch fires on its own. Bounded, because a Redis that is configured but
 * unreachable would otherwise hold boot on a command that never returns.
 * Throws when the answer is unknown; callers decide what unknown means.
 *
 * @returns {Promise<Set<string>>}
 */
export async function queuedCampaignIds({ timeoutMs = 5000 } = {}) {
  if (!campaignQueue) return new Set();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`campaign queue did not answer in ${timeoutMs}ms`)), timeoutMs);
    timer.unref?.();
  });
  try {
    const jobs = await Promise.race([
      campaignQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized', 'paused']),
      timeout,
    ]);
    return new Set(jobs.filter(Boolean).map((job) => job.data?.campaignId).filter(Boolean));
  } finally {
    clearTimeout(timer);
  }
}
