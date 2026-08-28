// backend/src/services/__tests__/recordingReattach.test.js
//
// The recovery pass that stops a failed upload from costing the recording.
//
// The cases that matter are the ones where it must NOT write: a call that
// already has audio (its own client confirmed that one), and a file that could
// still be mid-upload. Both would replace a good recording with a worse or a
// broken one, which is a strictly worse failure than the one being fixed.
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

let reattachOrphanRecordings;
let recordingFilename;
let callIdFromRecordingFilename;

let dir;
const created = [];

const MINUTE = 60_000;
const NOW = Date.parse('2026-08-28T14:00:00Z');
/** Comfortably past REATTACH_MIN_AGE_MS (5 min), so the file counts as settled. */
const SETTLED_MS = 10 * MINUTE;

const CALL_A = 'cmtd07o4i0032hysygstrfy8r';
const CALL_B = 'cmtczqjun002ofu2c5cu4txh9';

/**
 * Stand-in for prisma.agentCallLog covering the two shapes this pass issues:
 * the "which of these calls is missing audio" scan, and the conditional attach.
 */
const makeDb = (rows) => ({
  rows,
  agentCallLog: {
    async findMany({ where }) {
      return rows
        .filter((r) => where.id.in.includes(r.id) && r.recordingPath === null)
        .map((r) => ({ id: r.id }));
    },
    async updateMany({ where, data }) {
      const row = rows.find((r) => r.id === where.id);
      // The `recordingPath: null` predicate is the whole point of updateMany
      // here — it is what makes losing a race with a late upload a no-op.
      if (!row || row.recordingPath !== null) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  },
});

/** Write a file and backdate its mtime, so the age filter sees a real age. */
const writeAged = async (name, ageMs) => {
  const file = path.join(dir, name);
  await fs.writeFile(file, 'fake audio');
  const at = new Date(NOW - ageMs);
  await fs.utimes(file, at, at);
  return name;
};

before(async () => {
  ({ reattachOrphanRecordings } = await import('../recordingRetention.service.js'));
  ({ recordingFilename, callIdFromRecordingFilename } = await import('../callRecordingStore.js'));
});

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rec-reattach-'));
  created.push(dir);
});

after(async () => {
  await Promise.all(created.map((d) => fs.rm(d, { recursive: true, force: true }).catch(() => {})));
});

test('a name written by recordingFilename round-trips back to its call id', () => {
  const name = recordingFilename(CALL_A, '.webm');
  assert.equal(callIdFromRecordingFilename(name), CALL_A);
  assert.match(name, /\.webm$/);
});

test('legacy names carry no call id', () => {
  // Everything uploaded before the format changed. Unattributable by design —
  // the retention orphan pass still reclaims these.
  assert.equal(callIdFromRecordingFilename('1787924793904-avdun6n8sm8.webm'), null);
});

test('attaches a stranded recording to the call it names', async () => {
  const name = await writeAged(`${CALL_A}--1787924793904-abc123.webm`, SETTLED_MS);
  const db = makeDb([{ id: CALL_A, recordingPath: null, recordingMime: null }]);

  const result = await reattachOrphanRecordings({ db, dir, now: NOW });

  assert.equal(result.reattached, 1);
  assert.equal(db.rows[0].recordingPath, name);
  assert.equal(db.rows[0].recordingMime, 'audio/webm');
});

test('a .wav from the phone bridge is attached with the right mime', async () => {
  await writeAged(`${CALL_A}--1787924793904-abc123.wav`, SETTLED_MS);
  const db = makeDb([{ id: CALL_A, recordingPath: null, recordingMime: null }]);

  await reattachOrphanRecordings({ db, dir, now: NOW });

  assert.equal(db.rows[0].recordingMime, 'audio/wav');
});

test('never overwrites a recording the call already has', async () => {
  await writeAged(`${CALL_A}--1787924793904-abc123.webm`, SETTLED_MS);
  const db = makeDb([{ id: CALL_A, recordingPath: 'confirmed.webm', recordingMime: 'audio/webm' }]);

  const result = await reattachOrphanRecordings({ db, dir, now: NOW });

  assert.equal(result.reattached, 0);
  assert.equal(db.rows[0].recordingPath, 'confirmed.webm');
});

test('leaves a file that could still be uploading', async () => {
  // Inside the settle window: a 100 MB upload over a slow link looks exactly
  // like this, and attaching a half-written file is worse than waiting.
  await writeAged(`${CALL_A}--1787924793904-abc123.webm`, 30_000);
  const db = makeDb([{ id: CALL_A, recordingPath: null, recordingMime: null }]);

  const result = await reattachOrphanRecordings({ db, dir, now: NOW });

  assert.equal(result.reattached, 0);
  assert.equal(db.rows[0].recordingPath, null);
});

test('when one call left several files, the newest wins', async () => {
  // A retried upload. The last one written is the one the browser finished.
  await writeAged(`${CALL_A}--1787924000000-older.webm`, 3 * SETTLED_MS);
  const newest = await writeAged(`${CALL_A}--1787924793904-newer.webm`, SETTLED_MS);
  const db = makeDb([{ id: CALL_A, recordingPath: null, recordingMime: null }]);

  await reattachOrphanRecordings({ db, dir, now: NOW });

  assert.equal(db.rows[0].recordingPath, newest);
});

test('ignores files whose call no longer exists', async () => {
  await writeAged(`${CALL_B}--1787924793904-abc123.webm`, SETTLED_MS);
  const db = makeDb([{ id: CALL_A, recordingPath: null, recordingMime: null }]);

  const result = await reattachOrphanRecordings({ db, dir, now: NOW });

  assert.equal(result.reattached, 0);
  assert.equal(db.rows[0].recordingPath, null);
});

test('running twice changes nothing the first run did not', async () => {
  await writeAged(`${CALL_A}--1787924793904-abc123.webm`, SETTLED_MS);
  const db = makeDb([{ id: CALL_A, recordingPath: null, recordingMime: null }]);

  const first = await reattachOrphanRecordings({ db, dir, now: NOW });
  const second = await reattachOrphanRecordings({ db, dir, now: NOW });

  assert.equal(first.reattached, 1);
  assert.equal(second.reattached, 0);
});

test('an empty or missing directory is not an error', async () => {
  const db = makeDb([]);
  assert.deepEqual(
    await reattachOrphanRecordings({ db, dir, now: NOW }),
    { reattached: 0, candidates: 0 },
  );
  assert.deepEqual(
    await reattachOrphanRecordings({ db, dir: path.join(dir, 'nope'), now: NOW }),
    { reattached: 0, candidates: 0 },
  );
});
