import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  signingString,
  validateV3Signature,
  plivoRequest,
  mainCredentials,
  isPlivoConfigured,
  PlivoError,
} from '../client.js';

const AUTH = 'MAxxxxxxxxxxxxxxxxxxSECRETtoken';
const NONCE = '12345678901234567890';
const CREDS = { authId: 'MAtest', authToken: 'tok' };

const sign = (method, url, params = {}) =>
  createHmac('sha256', AUTH).update(`${signingString(method, url, params)}.${NONCE}`).digest('base64');

describe('plivo V3 signing string', () => {
  // These four assertions are the whole point of the file. The values were
  // verified byte-for-byte against plivo-node's own v3Security.js across 16
  // request shapes; the prose docs do not state them unambiguously, and getting
  // any of them wrong rejects every genuine webhook (or, if implemented
  // permissively, accepts forged ones).

  test('POST with neither query nor params gets no "?"', () => {
    assert.equal(signingString('POST', 'https://x.io/hook', {}), 'https://x.io/hook');
  });

  test('POST with params but no query gets a BARE "?" before the params', () => {
    // Not "https://x.io/hookA1B2" — the "?" is emitted even with no query string.
    assert.equal(signingString('POST', 'https://x.io/hook', { B: '2', A: '1' }), 'https://x.io/hook?A1B2');
  });

  test('POST with query but no params gets no "." separator', () => {
    assert.equal(signingString('POST', 'https://x.io/hook?q=1', {}), 'https://x.io/hook?q=1');
  });

  test('POST with BOTH query and params gets a "." between them', () => {
    assert.equal(signingString('POST', 'https://x.io/hook?q=1', { A: '1' }), 'https://x.io/hook?q=1.A1');
  });

  test('params are sorted by key, and appended as key+value with no separator', () => {
    assert.equal(signingString('POST', 'https://x.io/hook', { Z: 'z', A: 'a', M: 'm' }), 'https://x.io/hook?AaMmZz');
  });

  test('array values are sorted within the key', () => {
    assert.equal(signingString('POST', 'https://x.io/hook', { K: ['b', 'a'] }), 'https://x.io/hook?KaKb');
  });

  test('GET sorts the query string and ignores the POST-param quirks', () => {
    assert.equal(signingString('GET', 'https://x.io/hook?b=2&a=1', {}), 'https://x.io/hook?a=1&b=2');
    assert.equal(signingString('GET', 'https://x.io/hook', {}), 'https://x.io/hook');
  });

  test('an unsupported method is rejected rather than silently signed', () => {
    assert.throws(() => signingString('PUT', 'https://x.io/hook', {}), PlivoError);
  });
});

describe('plivo V3 signature validation', () => {
  const url = 'https://x.io/hook';
  const params = { CallUUID: 'abc-123', Status: 'accepted' };

  test('accepts a correctly signed request', () => {
    assert.equal(
      validateV3Signature({
        method: 'POST', url, nonce: NONCE, signature: sign('POST', url, params), authToken: AUTH, params,
      }),
      true,
    );
  });

  test('accepts when one of several comma-separated signatures matches', () => {
    // Accounts with multiple auth tokens get one signature per token.
    assert.equal(
      validateV3Signature({
        method: 'POST', url, nonce: NONCE,
        signature: `bogus,${sign('POST', url, params)},alsobogus`,
        authToken: AUTH, params,
      }),
      true,
    );
  });

  for (const [label, mutate] of [
    ['tampered params', (a) => ({ ...a, params: { ...params, Status: 'approved' } })],
    ['replayed with a different nonce', (a) => ({ ...a, nonce: 'different' })],
    ['signed with the wrong token', (a) => ({ ...a, authToken: 'wrong' })],
    ['delivered to a different URL', (a) => ({ ...a, url: 'https://x.io/other' })],
    ['missing signature', (a) => ({ ...a, signature: '' })],
    ['missing nonce', (a) => ({ ...a, nonce: '' })],
    ['missing token', (a) => ({ ...a, authToken: '' })],
  ]) {
    test(`rejects: ${label}`, () => {
      const base = {
        method: 'POST', url, nonce: NONCE, signature: sign('POST', url, params), authToken: AUTH, params,
      };
      assert.equal(validateV3Signature(mutate(base)), false);
    });
  }

  test('a signature of the wrong length does not throw', () => {
    // timingSafeEqual throws on length mismatch if lengths are not checked first.
    assert.doesNotThrow(() => validateV3Signature({
      method: 'POST', url, nonce: NONCE, signature: 'short', authToken: AUTH, params,
    }));
  });
});

describe('plivo client configuration', () => {
  const saved = { id: process.env.PLIVO_AUTH_ID, token: process.env.PLIVO_AUTH_TOKEN };
  afterEach(() => {
    if (saved.id === undefined) delete process.env.PLIVO_AUTH_ID; else process.env.PLIVO_AUTH_ID = saved.id;
    if (saved.token === undefined) delete process.env.PLIVO_AUTH_TOKEN; else process.env.PLIVO_AUTH_TOKEN = saved.token;
  });

  test('reports unconfigured when either credential is missing', () => {
    delete process.env.PLIVO_AUTH_ID;
    delete process.env.PLIVO_AUTH_TOKEN;
    assert.equal(mainCredentials(), null);
    assert.equal(isPlivoConfigured(), false);

    process.env.PLIVO_AUTH_ID = 'MAonly';
    assert.equal(mainCredentials(), null, 'auth id alone is not configured');

    process.env.PLIVO_AUTH_TOKEN = 'tok';
    assert.deepEqual(mainCredentials(), { authId: 'MAonly', authToken: 'tok' });
  });
});

describe('plivoRequest', () => {
  let realFetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });

  const ok = (body) => async () => ({
    ok: true, status: 200, headers: new Map(), text: async () => JSON.stringify(body),
  });
  const fails = (status, body = {}) => ({
    ok: false, status, headers: { get: () => null }, text: async () => JSON.stringify(body),
  });

  test('sends basic auth and builds the account-scoped URL', async () => {
    let seen;
    globalThis.fetch = async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, headers: new Map(), text: async () => '{"ok":1}' };
    };
    await plivoRequest('/Subaccount/', { credentials: CREDS });
    assert.equal(seen.url, 'https://api.plivo.com/v1/Account/MAtest/Subaccount/');
    assert.equal(
      seen.init.headers.Authorization,
      `Basic ${Buffer.from('MAtest:tok').toString('base64')}`,
    );
  });

  test('refuses to call without credentials rather than sending an unauthenticated request', async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; return fails(401); };
    await assert.rejects(
      () => plivoRequest('/Subaccount/', { credentials: null }),
      (e) => e instanceof PlivoError && e.status === 503,
    );
    assert.equal(called, false, 'must not hit the network at all');
  });

  test('does NOT retry a non-idempotent POST on a 5xx', async () => {
    // A retried POST /Subaccount/ creates a SECOND real subaccount whose
    // auth_token we never see. Retrying here leaks billable resources.
    let attempts = 0;
    globalThis.fetch = async () => { attempts += 1; return fails(500, { error: 'boom' }); };
    await assert.rejects(
      () => plivoRequest('/Subaccount/', { method: 'POST', json: {}, credentials: CREDS }),
      PlivoError,
    );
    assert.equal(attempts, 1);
  });

  test('retries a GET on a 5xx and returns the eventual success', async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      if (attempts < 3) return fails(503);
      return { ok: true, status: 200, headers: new Map(), text: async () => '{"done":true}' };
    };
    const out = await plivoRequest('/Subaccount/', { credentials: CREDS });
    assert.deepEqual(out, { done: true });
    assert.equal(attempts, 3);
  });

  test('retries a 429 even on a non-idempotent POST', async () => {
    // 429 means the request was rejected, not performed — nothing was created,
    // so retrying cannot duplicate anything.
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      if (attempts === 1) return fails(429);
      return { ok: true, status: 201, headers: new Map(), text: async () => '{"auth_id":"SA1"}' };
    };
    const out = await plivoRequest('/Subaccount/', { method: 'POST', json: {}, credentials: CREDS });
    assert.equal(out.auth_id, 'SA1');
    assert.equal(attempts, 2);
  });

  test('does not retry a 4xx', async () => {
    let attempts = 0;
    globalThis.fetch = async () => { attempts += 1; return fails(400, { error: 'bad name' }); };
    await assert.rejects(
      () => plivoRequest('/Subaccount/', { method: 'POST', json: {}, credentials: CREDS }),
      (e) => e.status === 400 && /bad name/.test(e.message),
    );
    assert.equal(attempts, 1);
  });

  test('leaves Content-Type unset for multipart so fetch can add the boundary', async () => {
    let seen;
    globalThis.fetch = async (url, init) => {
      seen = init;
      return { ok: true, status: 200, headers: new Map(), text: async () => '{}' };
    };
    const form = new FormData();
    form.append('x', 'y');
    await plivoRequest('/PhoneNumber/Compliance/', { method: 'POST', form, credentials: CREDS });
    assert.equal(seen.headers['Content-Type'], undefined);
    assert.equal(seen.body, form);
  });

  test('a non-JSON error body still produces a useful PlivoError', async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 502, headers: { get: () => null }, text: async () => '<html>gateway</html>',
    });
    await assert.rejects(
      () => plivoRequest('/Subaccount/', { method: 'POST', credentials: CREDS }),
      (e) => e instanceof PlivoError && e.status === 502,
    );
  });
});
