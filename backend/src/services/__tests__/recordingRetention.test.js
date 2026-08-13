// backend/src/services/__tests__/recordingRetention.test.js
//
// This module deletes files off disk, so the cases that matter are the ones
// where it must NOT delete: audio inside the window, and freshly written files
// whose owning row has not been updated yet.
//
// env.js throws on a missing DATABASE_URL/JWT secret at import time, so the
// fixtures below are set before the dynamic import — not because this test
// talks to a database (the db is stubbed), but because the import chain
// reaches config/env.js.

import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

let purgeExpiredRecordings;
let dir;
/** Every temp dir made, so a run does not leave one behind per test. */
const created = [];

const DAY_MS = 86_400_000;
const NOW = Date.parse('2026-08-14T12:00:00Z');

/**
 * Minimal stand-in for prisma.agentCallLog covering the two query shapes the
 * service issues: the expired scan (recordingPath not null + startedAt cutoff)
 * and the orphan lookup (recordingPath in [...]).
 */
const makeDb = (rows) => ({
  rows,
  agentCallLog: {
    async findMany({ where, take }) {
      if (where.recordingPath?.in) {
        return rows
          .filter((r) => r.recordingPath && where.recordingPath.in.includes(r.recordingPath))
          .map((r) => ({ recordingPath: r.recordingPath }));
      }
      return rows
        .filter((r) => r.recordingPath !== null && r.startedAt < where.startedAt.lt)
        .slice(0, take)
        .map((r) => ({ id: r.id, recordingPath: r.recordingPath }));
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of rows) {
        if (!where.id.in.includes(row.id)) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    },
  },
});

/** Write a file and backdate its mtime, so the orphan pass sees a real age. */
const writeAged = async (name, ageMs) => {
  const file = path.join(dir, name);
  await fs.writeFile(file, 'fake audio');
  const at = new Date(NOW - ageMs);
  await fs.utimes(file, at, at);
  return file;
};

const exists = async (name) =>
  fs.access(path.join(dir, name)).then(() => true, () => false);

before(async () => {
  ({ purgeExpiredRecordings } = await import('../recordingRetention.service.js'));
});

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rec-retention-'));
  created.push(dir);
});

after(async () => {
  await Promise.all(created.map((d) => fs.rm(d, { recursive: true, force: true }).catch(() => {})));
});

test('deletes audio older than the window and clears the pointer, keeping the call log', async () => {
  await writeAged('old.webm', 9 * DAY_MS);
  const db = makeDb([
    { id: 'c1', recordingPath: 'old.webm', recordingMime: 'audio/webm', startedAt: new Date(NOW - 9 * DAY_MS) },
  ]);

  const result = await purgeExpiredRecordings({ db, dir, days: 7, now: NOW });

  assert.equal(result.deleted, 1);
  assert.equal(result.failed, 0);
  assert.equal(await exists('old.webm'), false);
  // The row survives — only the audio pointer is cleared.
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].recordingPath, null);
  assert.equal(db.rows[0].recordingMime, null);
});

test('keeps audio inside the window', async () => {
  await writeAged('recent.webm', 2 * DAY_MS);
  const db = makeDb([
    { id: 'c1', recordingPath: 'recent.webm', recordingMime: 'audio/webm', startedAt: new Date(NOW - 2 * DAY_MS) },
  ]);

  const result = await purgeExpiredRecordings({ db, dir, days: 7, now: NOW });

  assert.equal(result.deleted, 0);
  assert.equal(result.orphansDeleted, 0);
  assert.equal(await exists('recent.webm'), true);
  assert.equal(db.rows[0].recordingPath, 'recent.webm');
});

test('reclaims an orphaned file no row points at', async () => {
  await writeAged('orphan.webm', 30 * DAY_MS);

  const result = await purgeExpiredRecordings({ db: makeDb([]), dir, days: 7, now: NOW });

  assert.equal(result.orphansDeleted, 1);
  assert.equal(await exists('orphan.webm'), false);
});

test('spares an unreferenced file still inside the orphan grace period', async () => {
  // The upload path writes the file and only then updates the row. A file that
  // has just been written has no row pointing at it yet, and deleting it would
  // destroy the recording of the call that just ended.
  await writeAged('just-uploaded.webm', 7 * DAY_MS + 60_000); // past cutoff, inside the 1-day grace

  const result = await purgeExpiredRecordings({ db: makeDb([]), dir, days: 7, now: NOW });

  assert.equal(result.orphansDeleted, 0);
  assert.equal(await exists('just-uploaded.webm'), true);
});

test('an aged file that a row still references is not treated as an orphan', async () => {
  await writeAged('kept.webm', 30 * DAY_MS);
  const db = makeDb([
    // Recent call, old file — the expired pass skips it, so the orphan pass
    // must not then delete it out from under the row.
    { id: 'c1', recordingPath: 'kept.webm', recordingMime: 'audio/webm', startedAt: new Date(NOW - 1 * DAY_MS) },
  ]);

  const result = await purgeExpiredRecordings({ db, dir, days: 7, now: NOW });

  assert.equal(result.deleted, 0);
  assert.equal(result.orphansDeleted, 0);
  assert.equal(await exists('kept.webm'), true);
});

test('days=0 disables deletion entirely', async () => {
  await writeAged('ancient.webm', 365 * DAY_MS);
  const db = makeDb([
    { id: 'c1', recordingPath: 'ancient.webm', recordingMime: 'audio/webm', startedAt: new Date(NOW - 365 * DAY_MS) },
  ]);

  const result = await purgeExpiredRecordings({ db, dir, days: 0, now: NOW });

  assert.equal(result.skipped, true);
  assert.equal(await exists('ancient.webm'), true);
  assert.equal(db.rows[0].recordingPath, 'ancient.webm');
});

test('a missing file does not fail the sweep', async () => {
  // Row points at a file a previous partial run already unlinked.
  const db = makeDb([
    { id: 'c1', recordingPath: 'gone.webm', recordingMime: 'audio/webm', startedAt: new Date(NOW - 9 * DAY_MS) },
  ]);

  const result = await purgeExpiredRecordings({ db, dir, days: 7, now: NOW });

  assert.equal(result.failed, 0);
  assert.equal(db.rows[0].recordingPath, null);
});
