// Deleting an agent removes the KB chunks of the files it owned.
//
// A KbChunk has no foreign key back to its KbFile, so deleting the files left
// every chunk (and its embedding) behind for good. Database stubbed.
//
// Lives under services/ because `npm test` only globs services/**/__tests__.

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { default: prisma } = await import('../../config/prisma.js');
const { deleteAgent } = await import('../../controllers/agent.controller.js');

const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

const fakeRes = () => {
  const res = { statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = () => res;
  res.json = (b) => { res.body = b; return res; };
  return res;
};

test('every KB file the agent owned has its chunks deleted', async () => {
  const chunkDeletes = [];
  stub(prisma.agent, 'deleteMany', async () => ({ count: 1 }));
  stub(prisma.kbFile, 'findMany', async () => [{ id: 'kb_1', storedPath: null }, { id: 'kb_2', storedPath: null }]);
  stub(prisma.agentCallLog, 'findMany', async () => []);
  stub(prisma.kbFile, 'deleteMany', async () => ({ count: 2 }));
  stub(prisma.agentCallLog, 'deleteMany', async () => ({ count: 0 }));
  // deleteKbChunks issues a tagged-template $executeRaw; the file id is its only value.
  stub(prisma, '$executeRaw', async (_strings, ...values) => { chunkDeletes.push(values[0]); return 1; });

  const res = fakeRes();
  await deleteAgent({ params: { agentId: 'agent_1', workspaceId: 'ws_1' } }, res);

  assert.equal(res.statusCode, 204);
  assert.deepEqual(chunkDeletes.sort(), ['kb_1', 'kb_2']);
});
