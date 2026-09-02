import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOriginsFrom, corsOriginFor, buildCorsOptions } from '../cors.js';

const decide = (fn, origin) => new Promise((resolve) => fn(origin, (err, allow) => resolve({ err, allow })));

describe('allowed origins', () => {
  test('splits and trims CLIENT_URL, adds local dev origins outside production', () => {
    assert.deepEqual(
      allowedOriginsFrom({ clientUrl: 'https://app.example.com, https://www.example.com ,', nodeEnv: 'development' }),
      ['https://app.example.com', 'https://www.example.com', 'http://localhost:5173', 'http://localhost:5174'],
    );
  });
  test('production lists only CLIENT_URL', () => {
    assert.deepEqual(allowedOriginsFrom({ clientUrl: 'https://app.example.com', nodeEnv: 'production' }), ['https://app.example.com']);
  });
  test('an unset CLIENT_URL in production allows nothing cross-origin', () => {
    assert.deepEqual(allowedOriginsFrom({ clientUrl: null, nodeEnv: 'production' }), []);
  });
});

describe('origin decision', () => {
  const fn = corsOriginFor(['https://app.example.com']);

  test('a listed origin is allowed', async () => {
    assert.deepEqual(await decide(fn, 'https://app.example.com'), { err: null, allow: true });
  });
  test('no Origin header (same-origin, curl, server-to-server) is allowed', async () => {
    assert.deepEqual(await decide(fn, undefined), { err: null, allow: true });
  });
  test('an unlisted origin is REFUSED WITHOUT AN ERROR — no 500, no reason leaked', async () => {
    // This is the bug: the old callback threw, and the `cors` package turned
    // that into a 500 whose body echoed the allow-list decision.
    const r = await decide(fn, 'https://evil.example');
    assert.equal(r.err, null);
    assert.equal(r.allow, false);
  });
  test('matching is exact — scheme, host and port all count', async () => {
    for (const o of ['http://app.example.com', 'https://app.example.com:8443', 'https://app.example.com.evil']) {
      assert.equal((await decide(fn, o)).allow, false, o);
    }
  });
});

describe('cors options', () => {
  test('carries credentials and the header/method allow-lists the client relies on', () => {
    const o = buildCorsOptions({ clientUrl: 'https://app.example.com', nodeEnv: 'production' });
    assert.equal(o.credentials, true);
    assert.deepEqual(o.methods, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
    assert.deepEqual(o.allowedHeaders, ['Content-Type', 'Authorization']);
    assert.equal(typeof o.origin, 'function');
  });
});
