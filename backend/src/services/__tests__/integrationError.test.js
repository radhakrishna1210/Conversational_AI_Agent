// The bug these pin, and it is the reason a 41-day outage went unseen.
//
// runSyncJob stored `err.message` into SyncJob.error. Several provider paths
// build their error as `new Error(data.error)`, and on Google's APIs
// `data.error` is an OBJECT:
//
//   { error: { code: 401, message: "Invalid Credentials", status: "UNAUTHENTICATED" } }
//
// JavaScript stringifies it, `message` becomes the literal "[object Object]",
// and that is what was written. All 241,776 failed rows on this deployment say
// exactly that and nothing else — the one field whose job was to explain the
// failure was destroying the explanation.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage, apiError } from '../integrationError.js';

describe('errorMessage', () => {
  test('unwraps the Google error shape that caused the outage', () => {
    const body = { error: { code: 401, message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } };
    assert.equal(errorMessage(body), 'Invalid Credentials');
  });

  test('recovers a message from an Error already ruined by the old code', () => {
    // Exactly what `new Error(someObject)` produces. Reading `.message` here is
    // what wrote 241,776 useless rows, so this must not trust it.
    const ruined = new Error({ error: { message: 'Invalid Credentials' } });
    assert.equal(ruined.message, '[object Object]', 'precondition: this is the shape of the bug');
    assert.notEqual(errorMessage(ruined), '[object Object]');
  });

  test('falls through to `cause` when the message is unusable', () => {
    const err = new Error({});
    err.cause = { error: { message: 'Token has been expired or revoked.' } };
    assert.equal(errorMessage(err), 'Token has been expired or revoked.');
  });

  test('handles the OAuth2 error shape', () => {
    assert.equal(
      errorMessage({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
      'Token has been expired or revoked.',
    );
    assert.equal(errorMessage({ error: 'invalid_grant' }), 'invalid_grant');
  });

  test('never returns "[object Object]", whatever it is handed', () => {
    const inputs = [
      { error: { code: 500 } },
      { a: { b: { c: 1 } } },
      new Error({ x: 1 }),
      Object.create(null),
      [{ nested: true }],
      { toString: () => '[object Object]' },
    ];
    for (const input of inputs) {
      const out = errorMessage(input);
      assert.notEqual(out, '[object Object]', `leaked for ${JSON.stringify(input)}`);
      assert.ok(out.length > 0, 'must never be empty — a blank column reads as "no error"');
    }
  });

  test('never returns empty, so a failed row is never mistaken for a clean one', () => {
    for (const input of [null, undefined, '', {}, 0, false, NaN]) {
      assert.equal(errorMessage(input), 'Unknown error', `"${String(input)}"`);
    }
    assert.equal(errorMessage(null, 'sync failed'), 'sync failed');
  });

  test('survives a circular object instead of throwing inside a catch block', () => {
    // This runs on the error path. Throwing here would replace a provider
    // failure with a crash, and lose both.
    const circular = { name: 'loop' };
    circular.self = circular;
    assert.doesNotThrow(() => errorMessage(circular));
    assert.ok(errorMessage(circular).length > 0);
  });

  test('clips a runaway payload rather than storing all of it', () => {
    const huge = errorMessage({ message: 'x'.repeat(5000) });
    assert.ok(huge.length <= 500, `got ${huge.length}`);
    assert.ok(huge.endsWith('…'));
  });

  test('passes plain strings and normal Errors straight through', () => {
    assert.equal(errorMessage('Sheet not found'), 'Sheet not found');
    assert.equal(errorMessage(new Error('Sheet not found')), 'Sheet not found');
  });
});

describe('apiError', () => {
  test('builds an Error whose message is readable, not "[object Object]"', () => {
    const err = apiError({ error: { message: 'Invalid Credentials' } }, 'Token exchange failed', 401);
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'Invalid Credentials');
    assert.equal(err.statusCode, 401);
  });

  test('uses the fallback when the body says nothing', () => {
    assert.equal(apiError({}, 'Token exchange failed (500)').message, 'Token exchange failed (500)');
  });
});
