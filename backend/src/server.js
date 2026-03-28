import './config/env.js';
import { mkdirSync } from 'fs';
import app from './app.js';
import { env } from './config/env.js';
import prisma from './config/prisma.js';
import logger from './lib/logger.js';
import { SSE_KEEPALIVE_INTERVAL_MS, SHUTDOWN_GRACE_PERIOD_MS } from './constants/limits.js';
import { createCampaignWorker } from './workers/campaign.worker.js';

mkdirSync(env.UPLOAD_DIR, { recursive: true });

const campaignWorker = createCampaignWorker();
if (campaignWorker) {
  campaignWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'Campaign job completed'));
  campaignWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Campaign job failed'));
  logger.info('Campaign worker started');
}

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

// SSE keepalive heartbeat
setInterval(() => {}, SSE_KEEPALIVE_INTERVAL_MS);

const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Shutdown complete');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_PERIOD_MS);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
