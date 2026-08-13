// backend/src/services/recordingRetention.service.js
/**
 * Time-based deletion of call recordings from local disk.
 *
 * Recordings are the only upload that grows without bound: every call adds a
 * file and nothing ever removed them except deleting the agent
 * (agent.controller.js:247). On the VPS they live in shared/uploads, on the
 * same disk as five other production apps, so unbounded growth there is a
 * shared-disk outage waiting to happen rather than just this app's problem.
 *
 * What is deleted is the AUDIO ONLY. The AgentCallLog row — transcript,
 * duration, extracted variables, billing columns — is left untouched, because
 * those are what the Recent Calls tab, post-call extraction and the invoice
 * trail are built on. Deleting rows here would silently rewrite billing
 * history. After a sweep the call still lists, it just reports
 * `hasRecording: false`, which every consumer already handles (the API returns
 * 404 "This call has no recording" and the UI omits the player).
 *
 * Two passes, because there are two ways disk leaks:
 *   1. Expired  — a row still points at a file older than the retention window.
 *   2. Orphaned — a file no row points at. Left behind by an upload whose row
 *      write failed, or by a delete that cleared the pointer and then crashed
 *      before unlink. Without this pass those files are unreachable AND
 *      undeletable, since nothing knows they exist.
 *
 * The sweeps take `db` and `dir` rather than closing over the imported client
 * and resolved path: this module deletes files, and a seam that lets a test
 * drive it against a temp directory is worth more than the brevity.
 */

import fs from 'fs/promises';
import path from 'path';
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';
import { RECORDINGS_DIR } from './callRecordingStore.js';

export { RECORDINGS_DIR };

/** Rows per pass. Bounded so a first run over a large backlog cannot load the whole table. */
const BATCH_SIZE = 500;

/** Stops a bug that never shrinks the candidate set from looping forever. */
const MAX_BATCHES = 200;

const DAY_MS = 86_400_000;

/**
 * Grace period added on top of the retention window before a file with no
 * owning row is considered orphaned.
 *
 * Without it this pass races the upload path: multer writes the file to disk
 * and only then does the handler update the row (agentCallLog.controller.js:317),
 * so for a moment a perfectly good recording has no row pointing at it. A sweep
 * landing in that gap would delete the file out from under the call that just
 * finished. A day is far longer than that window could ever be.
 */
const ORPHAN_GRACE_MS = DAY_MS;

/** Retention in days. 0 (or negative, or unparseable) disables deletion entirely. */
export const retentionDays = () => env.RECORDING_RETENTION_DAYS;

/**
 * Delete audio for calls older than the retention window.
 *
 * Pointer first, file second, deliberately. If the process dies between the
 * two, the leftover file is an orphan — invisible but reclaimable by the pass
 * below. The reverse order would leave a row advertising a recording that no
 * longer exists, which surfaces to the user as a player that 404s.
 */
export async function sweepExpired(cutoff, { db = prisma, dir = RECORDINGS_DIR } = {}) {
  let deleted = 0;
  let failed = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const rows = await db.agentCallLog.findMany({
      // startedAt, not endedAt: endedAt is null on any call that never reached
      // a clean hangup (crash, dropped socket), and those rows would then never
      // match a cutoff and never have their audio reclaimed. startedAt is
      // always set, and a call's own duration is minutes — irrelevant next to a
      // multi-day window.
      where: { recordingPath: { not: null }, startedAt: { lt: cutoff } },
      select: { id: true, recordingPath: true },
      take: BATCH_SIZE,
    });
    if (rows.length === 0) break;

    await db.agentCallLog.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { recordingPath: null, recordingMime: null },
    });

    for (const row of rows) {
      // basename() so a stored value containing path separators cannot escape
      // the recordings directory — the same guard the read paths use.
      try {
        await fs.unlink(path.join(dir, path.basename(row.recordingPath)));
        deleted += 1;
      } catch (err) {
        // Already gone is the expected case after a partial previous run, not
        // a failure worth reporting.
        if (err.code === 'ENOENT') continue;
        failed += 1;
        logger.warn({ callId: row.id, err: err.message }, 'Recording retention: unlink failed');
      }
    }

    if (rows.length < BATCH_SIZE) break;
  }

  return { deleted, failed };
}

/** Delete files on disk that no AgentCallLog row points at. */
export async function sweepOrphans(cutoff, { db = prisma, dir = RECORDINGS_DIR } = {}) {
  let deleted = 0;

  let names;
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    // Nothing has been uploaded yet on a fresh box — not an error.
    if (err.code === 'ENOENT') return { deleted: 0 };
    throw err;
  }

  // Age-filter on disk BEFORE querying, so the referenced-set lookup stays
  // proportional to deletion candidates rather than to everything ever stored.
  const stale = [];
  for (const name of names) {
    try {
      const { mtimeMs } = await fs.stat(path.join(dir, name));
      if (mtimeMs < cutoff.getTime() - ORPHAN_GRACE_MS) stale.push(name);
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn({ file: name, err: err.message }, 'Recording retention: stat failed');
    }
  }
  if (stale.length === 0) return { deleted: 0 };

  for (let i = 0; i < stale.length; i += BATCH_SIZE) {
    const chunk = stale.slice(i, i + BATCH_SIZE);
    const referenced = new Set(
      (await db.agentCallLog.findMany({
        where: { recordingPath: { in: chunk } },
        select: { recordingPath: true },
      })).map((r) => r.recordingPath),
    );

    for (const name of chunk) {
      if (referenced.has(name)) continue;
      try {
        await fs.unlink(path.join(dir, name));
        deleted += 1;
      } catch (err) {
        if (err.code !== 'ENOENT') logger.warn({ file: name, err: err.message }, 'Recording retention: orphan unlink failed');
      }
    }
  }

  return { deleted };
}

/**
 * Run one full retention pass. Safe to call concurrently with itself and with
 * live calls: every delete targets a file older than the window, so nothing an
 * in-flight call is writing can be in scope.
 */
export async function purgeExpiredRecordings({
  db = prisma,
  dir = RECORDINGS_DIR,
  days = retentionDays(),
  now = Date.now(),
} = {}) {
  if (!days || days <= 0) return { skipped: true, deleted: 0, orphansDeleted: 0, failed: 0 };

  const cutoff = new Date(now - days * DAY_MS);
  const expired = await sweepExpired(cutoff, { db, dir });
  const orphans = await sweepOrphans(cutoff, { db, dir });

  return {
    skipped: false,
    retentionDays: days,
    deleted: expired.deleted,
    orphansDeleted: orphans.deleted,
    failed: expired.failed,
  };
}

/**
 * Start the periodic sweep. Returns { stop() }, mirroring the other schedulers
 * so shutdown can clear it.
 */
export function startRecordingRetention() {
  const days = retentionDays();
  if (!days || days <= 0) {
    // Reports the raw value rather than assuming 0: a typo'd
    // RECORDING_RETENTION_DAYS parses to NaN and lands here too, and
    // "disabled" with no cause is how a disk quietly fills up.
    logger.warn(
      { RECORDING_RETENTION_DAYS: process.env.RECORDING_RETENTION_DAYS ?? '(unset)' },
      'Recording retention disabled — call audio will be kept forever',
    );
    return { stop: () => {} };
  }

  const run = async () => {
    try {
      const result = await purgeExpiredRecordings();
      if (result.deleted || result.orphansDeleted || result.failed) {
        logger.info(result, 'Recording retention sweep complete');
      }
    } catch (err) {
      // Never fatal: losing a sweep costs disk, and crashing the process over
      // it would drop every live call on the box.
      logger.error({ err: err.message }, 'Recording retention sweep failed');
    }
  };

  const timer = setInterval(run, env.RECORDING_RETENTION_SWEEP_INTERVAL_MS);
  timer.unref?.();

  // One pass after boot so a box that was down past a cutoff catches up instead
  // of waiting a full interval. Delayed so it does not compete with startup.
  setTimeout(run, 60_000).unref?.();

  logger.info(
    { retentionDays: days, intervalMs: env.RECORDING_RETENTION_SWEEP_INTERVAL_MS },
    'Recording retention scheduler started',
  );
  return { stop: () => clearInterval(timer) };
}
