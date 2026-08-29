import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { processPendingSyncJobs, createSyncJob } from './integrations.service.js';
import {
  noteIntegrationFailure,
  noteIntegrationSuccess,
  isBackingOff,
  backingOffIds,
} from './integrationBackoff.js';

/**
 * Integration auto-sync.
 *
 * ── THE RUNAWAY THIS FIXES ──────────────────────────────────────────────────
 *
 * The tick ran every 60s, listed every connected integration, and queued a job
 * for any whose `lastSyncAt` was older than its interval. A FAILED job never
 * advances `lastSyncAt`. So a broken integration was re-queued on every single
 * tick, forever, with no backoff, no attempt cap and no circuit breaker.
 *
 * Measured on this deployment before the fix: 241,776 failed jobs —
 * 162,944 google_sheets and 78,832 google_calendar — the oldest dated 41 days
 * back, with new failures landing several times a second. Each attempt costs
 * roughly nine queries, and on a pgbouncer transaction pool every query is four
 * round trips, so this saturated the Prisma connection pool. The collateral was
 * not limited to integrations: `/auth/refresh` shares that pool, its first
 * query started timing out, and because the browser treats a failed refresh as
 * a dead session, users were being logged out mid-work. A background sweep was
 * denying service to the foreground application.
 *
 * Three things stop it, and all three are needed:
 *   1. never queue a job for an integration that already has one outstanding;
 *   2. back off exponentially while an integration keeps failing;
 *   3. retire the queued backlog for a backing-off integration instead of
 *      replaying it (see processPendingSyncJobs).
 *
 * The backoff is deliberately IN MEMORY. It needs no migration, and a restart
 * resetting it is the correct behaviour — a redeploy is exactly when someone
 * has probably just fixed the credentials.
 */

const AUTO_SYNC_MS = Number(process.env.INTEGRATION_SYNC_INTERVAL_MS) || 60 * 1000;

/** Consecutive failures after which the slow-down is worth saying out loud. */
const ALERT_AFTER_FAILURES = 5;

// Track if DB is reachable to avoid log spam
let _dbAvailable = true;

export const startIntegrationScheduler = () => {
  const tick = async () => {
    try {
      const nowMs = Date.now();
      const skipIntegrationIds = backingOffIds(nowMs);

      const results = await processPendingSyncJobs({ skipIntegrationIds });
      for (const r of results) {
        // A database failure is not the integration's fault — see the
        // `infrastructure` flag in processPendingSyncJobs. Backing off a
        // provider because Postgres was busy would turn a transient blip into
        // hours of not syncing.
        if (r.skipped || r.infrastructure) continue;
        if (r.ok) { noteIntegrationSuccess(r.integrationId); continue; }
        const { failures, delayMs } = noteIntegrationFailure(r.integrationId, r.error);
        // Said once, at the threshold. Silence is how this ran unnoticed for 41
        // days; a line per failure is how you get 241,776 nobody reads.
        if (failures === ALERT_AFTER_FAILURES) {
          logger.warn(
            { integrationId: r.integrationId, failures, retryInMinutes: Math.round(delayMs / 60000), error: r.error },
            'Integration has failed repeatedly — auto-sync is backing off. Reconnect it to resume.',
          );
        }
      }

      const integrations = await prisma.integration.findMany({
        where: { connected: true },
        include: { settings: true },
      });

      // Restore DB availability flag on success
      _dbAvailable = true;

      // Everything already queued or mid-flight. Queueing on top of these is
      // what let the backlog grow without bound: the sweep only ever looked at
      // `lastSyncAt`, which a failing integration never updates.
      const outstanding = await prisma.syncJob.findMany({
        where: { status: { in: ['queued', 'running'] }, integrationId: { in: integrations.map((i) => i.id) } },
        select: { integrationId: true },
        distinct: ['integrationId'],
      });
      const hasOutstanding = new Set(outstanding.map((j) => j.integrationId));

      for (const integration of integrations) {
        if (hasOutstanding.has(integration.id)) continue;

        if (isBackingOff(integration.id, nowMs)) continue;

        const intervalMinutes = Number(integration.settings?.settingsJson?.syncIntervalMinutes ?? 30);
        const lastSync = integration.lastSyncAt ? new Date(integration.lastSyncAt).getTime() : 0;
        if (!lastSync || nowMs - lastSync >= intervalMinutes * 60 * 1000) {
          await createSyncJob(integration.workspaceId, integration.provider, 'scheduled', integration.id);
        }
      }
    } catch (err) {
      // Only log on first DB failure to avoid log spam
      if (_dbAvailable) {
        logger.warn(`Integration scheduler paused: database unreachable. Will retry automatically. (${err.message})`);
        _dbAvailable = false;
      }
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
