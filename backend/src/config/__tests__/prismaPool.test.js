// What this pins: the boot-time check that catches a DATABASE_URL limited to one
// connection — the setting under which every query in the process, from every
// live call and the campaign dialer, waits for the one before it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { connectionLimitOf } = await import('../prisma.js');

test('reads connection_limit wherever it sits in the query string', () => {
  const base = 'postgresql://postgres.ref:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
  assert.equal(connectionLimitOf(`${base}?pgbouncer=true&connection_limit=1`), 1);
  assert.equal(connectionLimitOf(`${base}?connection_limit=5&pgbouncer=true`), 5);
  assert.equal(connectionLimitOf(`${base}?pgbouncer=true&connection_limit=10&pool_timeout=20`), 10);
});

test('no setting reads as none, not as one', () => {
  assert.equal(connectionLimitOf('postgresql://u:p@localhost:5432/test'), null);
  assert.equal(connectionLimitOf(undefined), null);
  // A password that happens to contain the words must not be mistaken for the param.
  assert.equal(connectionLimitOf('postgresql://u:connection_limit=1@host:6543/db?pgbouncer=true'), null);
});
