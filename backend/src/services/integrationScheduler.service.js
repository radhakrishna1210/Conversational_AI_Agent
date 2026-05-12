import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { processPendingSyncJobs, createSyncJob } from './integrations.service.js';

const AUTO_SYNC_MS = 60 * 1000;

export const startIntegrationScheduler = () => {
  const tick = async () => {
    try {
      await processPendingSyncJobs();

      const integrations = await prisma.integration.findMany({
        where: { connected: true },
        include: { settings: true },
      });

      const now = Date.now();
      for (const integration of integrations) {
        const intervalMinutes = Number(integration.settings?.settingsJson?.syncIntervalMinutes ?? 30);
        const lastSync = integration.lastSyncAt ? new Date(integration.lastSyncAt).getTime() : 0;
        if (!lastSync || now - lastSync >= intervalMinutes * 60 * 1000) {
          await createSyncJob(integration.workspaceId, integration.provider, 'scheduled', integration.id);
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Integration scheduler tick failed');
    }
  };

  const interval = setInterval(() => {
    tick().catch(() => {});
  }, AUTO_SYNC_MS);

  tick().catch(() => {});

  return {
    stop: () => clearInterval(interval),
  };
};
