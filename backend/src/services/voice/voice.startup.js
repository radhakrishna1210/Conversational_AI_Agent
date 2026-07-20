// backend/src/services/voice/voice.startup.js
/**
 * Voice sync scheduler.
 *
 * The agent voice picker reads from the `Voice` table, which is only populated
 * by syncVoices(). Previously this ran solely via a manual POST /voices/sync
 * that nothing ever called, so a fresh DB showed only its seeded voices. This
 * module runs the sync automatically:
 *   - once on startup (if the data is stale / never synced), and
 *   - periodically thereafter.
 *
 * Everything is fire-and-forget so it never blocks server boot, and every
 * provider failure is already isolated inside syncVoices (Promise.allSettled),
 * so one missing API key can't stop the others.
 */

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { syncVoices } from './voice.sync.service.js';

// Voice catalogs change rarely; a twice-daily refresh is plenty.
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h

async function runSync(reason) {
  try {
    const results = await syncVoices();
    const total = results.filter((r) => !r.error).reduce((n, r) => n + r.total, 0);
    const summary = results
      .map((r) => `${r.provider}:${r.error ? 'skipped' : r.total}`)
      .join(' ');
    logger.info(`Voice sync (${reason}) → ${total} voices available [${summary}]`);
  } catch (err) {
    logger.warn(`Voice sync (${reason}) failed: ${err.message}`);
  }
}

/**
 * Stale when no provider has synced yet, or the most recent successful sync is
 * older than the refresh interval. Only ever returns true when the DB is
 * reachable and readable; otherwise skip and let the interval retry later.
 */
async function isStale() {
  try {
    const providers = await prisma.voiceProvider.findMany({
      select: { lastSyncedAt: true },
    });
    if (providers.length === 0) return true;
    const newest = providers.reduce((max, p) => {
      const t = p.lastSyncedAt ? new Date(p.lastSyncedAt).getTime() : 0;
      return Math.max(max, t);
    }, 0);
    return Date.now() - newest >= REFRESH_INTERVAL_MS;
  } catch {
    return false;
  }
}

export function startVoiceSyncScheduler() {
  // Initial sync on startup, in the background, only when data is stale. The
  // staleness gate avoids re-syncing on every `--watch` dev reload.
  (async () => {
    if (await isStale()) await runSync('startup');
  })().catch(() => {});

  const interval = setInterval(() => {
    runSync('scheduled').catch(() => {});
  }, REFRESH_INTERVAL_MS);
  // Don't keep the event loop alive just for the refresh timer.
  if (interval.unref) interval.unref();

  return { stop: () => clearInterval(interval) };
}
