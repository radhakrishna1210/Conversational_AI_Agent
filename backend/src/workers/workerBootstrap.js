import '../config/env.js'; // validate env on startup
import { createCampaignWorker } from './campaign.worker.js';
import { createContactImportWorker } from './contactImport.worker.js';
import logger from '../lib/logger.js';

const workers = [
  createCampaignWorker(),
  createContactImportWorker(),
].filter(Boolean);

if (workers.length === 0) {
  logger.warn('No Redis connection — workers not started. Set REDIS_URL to enable.');
  process.exit(0);
}

for (const worker of workers) {
  worker.on('completed', (job) => logger.info({ jobId: job.id, queue: worker.name }, 'Job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, queue: worker.name, err }, 'Job failed'));
}

logger.info(`${workers.length} worker(s) started`);

const shutdown = async () => {
  logger.info('Shutting down workers...');
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
