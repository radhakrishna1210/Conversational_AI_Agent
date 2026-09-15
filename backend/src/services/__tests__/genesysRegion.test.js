// A Genesys region is tenant text spliced into `https://login.<region>/…`. What
// this pins: only a bare domain gets through, so the region cannot rewrite the
// URL's host (the `x@127.0.0.1:6379` trick) or path.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { assertGenesysRegion } = await import('../integrations.service.js');

test('real Genesys regions pass, normalised', () => {
  for (const r of ['mypurecloud.com', 'mypurecloud.ie', 'usw2.pure.cloud', 'use2.us-gov-pure.cloud', ' MyPureCloud.de ']) {
    assert.match(assertGenesysRegion(r), /^[a-z0-9.-]+$/);
  }
});

test('anything that could change the host or path is refused', () => {
  for (const r of ['x@127.0.0.1:6379', 'evil.com/path', 'mypurecloud.com#', 'localhost', '169.254.169.254:80', 'a b.com', '', null]) {
    assert.throws(() => assertGenesysRegion(r), (e) => e.statusCode === 400, String(r));
  }
});

test('the URL it builds keeps login.<region> as the host', () => {
  const host = new URL(`https://login.${assertGenesysRegion('mypurecloud.com')}/oauth/token`).hostname;
  assert.equal(host, 'login.mypurecloud.com');
});
