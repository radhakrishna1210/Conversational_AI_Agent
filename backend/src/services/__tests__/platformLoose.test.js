// Two small platform fixes, database and Redis stubbed:
//
//  1. A WhatsApp queue that exists but refuses the job answers null, so the
//     confirmation is sent inline instead of failing outright.
//  2. Listing KB files never loads their extracted text, yet still reports which
//     files have some.
//
// Lives under services/ because `npm test` only globs services/**/__tests__.

import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.REDIS_URL;
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { default: prisma } = await import('../../config/prisma.js');
const { enqueueWith } = await import('../../queues/whatsappPostCall.queue.js');
const { list: listKbFiles } = await import('../../controllers/kbFile.controller.js');

const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

describe('enqueueWith', () => {
  const payload = { callLogId: 'call_1', postCallConfigId: 'cfg_1' };

  test('no queue: null', async () => {
    assert.equal(await enqueueWith(null, payload), null);
  });

  test('a queue whose Redis connection is closed: null, not a throw', async () => {
    const closed = { add: async () => { throw new Error('Connection is closed.'); } };
    assert.equal(await enqueueWith(closed, payload), null);
  });

  test('a working queue: the job, keyed so a replay dedupes', async () => {
    let seen;
    const queue = { add: async (name, data, opts) => { seen = opts; return { id: opts.jobId }; } };
    const job = await enqueueWith(queue, payload);
    assert.equal(job.id, 'call_1__cfg_1');
    assert.equal(seen.jobId, 'call_1__cfg_1');
  });
});

describe('KB file list', () => {
  test('never selects textContent, and still reports hasText', async () => {
    const queries = [];
    stub(prisma.kbFile, 'findMany', async (args) => {
      queries.push(args);
      if (args.select?.fileName) {
        return [
          { id: 'kb_1', fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10, agentId: null, createdAt: new Date(0), status: 'ready', chunked: false, embeddingError: null },
          { id: 'kb_2', fileName: 'scan.pdf', mimeType: 'application/pdf', sizeBytes: 10, agentId: null, createdAt: new Date(0), status: 'ready', chunked: false, embeddingError: null },
        ];
      }
      return [{ id: 'kb_1' }];
    });

    const res = { json: (b) => { res.body = b; }, status: () => res };
    await listKbFiles({ params: { workspaceId: 'ws_1' }, query: {} }, res);

    for (const q of queries) assert.equal(q.select?.textContent, undefined, 'textContent is never loaded');
    assert.ok(queries[0].select, 'the listing query uses an explicit select');
    assert.deepEqual(res.body.files.map((f) => [f.id, f.hasText]), [['kb_1', true], ['kb_2', false]]);
  });
});
