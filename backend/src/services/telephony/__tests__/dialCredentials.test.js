// backend/src/services/telephony/__tests__/dialCredentials.test.js
//
// Which credentials a Plivo call goes out with. Every case here is silent when
// wrong: the call still connects, and only the usage report, the kill switch or
// the bill say something went to the wrong account.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { resolveDialCredentials } = await import('../dialCredentials.js');

const PLIVO = { id: 'PLIVO' };
const TWILIO = { id: 'TWILIO' };
const MAIN = { ready: true, authId: 'MAmain', authToken: 'main-token' };
const SUB = { authId: 'SAsub', authToken: 'sub-token', enabled: true };

/** A stand-in for subaccountCredentials(), so no database is involved. */
const deps = (value) => ({ subaccountCredentials: async () => value });
const throwing = (message) => ({ subaccountCredentials: async () => { throw new Error(message); } });

describe('resolveDialCredentials', () => {
  test('dials as the subaccount that holds the caller ID', async () => {
    const out = await resolveDialCredentials(
      PLIVO, MAIN, { workspaceId: 'ws1', subaccountId: 'SAsub' }, deps(SUB),
    );
    assert.equal(out.ready, true);
    assert.equal(out.authId, 'SAsub');
    assert.equal(out.authToken, 'sub-token');
    assert.equal(out.subaccount, true);
  });

  test('leaves a number with no subaccount on main credentials', async () => {
    // PLIVO_FROM_NUMBER, or a number recorded by hand — the main account really
    // does hold these, and refusing them would break every existing deployment.
    const out = await resolveDialCredentials(PLIVO, MAIN, { workspaceId: 'ws1' }, deps(SUB));
    assert.deepEqual(out, MAIN);
  });

  test('does not touch a non-Plivo carrier', async () => {
    let asked = false;
    const out = await resolveDialCredentials(
      TWILIO, MAIN, { workspaceId: 'ws1', subaccountId: 'SAsub' },
      { subaccountCredentials: async () => { asked = true; return SUB; } },
    );
    assert.deepEqual(out, MAIN);
    assert.equal(asked, false, 'a Twilio dial must not pay for a Plivo lookup');
  });

  test('passes an unready status straight through', async () => {
    const unready = { ready: false, error: 'Plivo is not configured on this server.' };
    const out = await resolveDialCredentials(
      PLIVO, unready, { workspaceId: 'ws1', subaccountId: 'SAsub' }, deps(SUB),
    );
    assert.deepEqual(out, unready);
  });

  test('refuses rather than falling back when the subaccount row is gone', async () => {
    // Falling back to main credentials would bill this client's traffic to the
    // parent account and quietly defeat the isolation.
    const out = await resolveDialCredentials(
      PLIVO, MAIN, { workspaceId: 'ws1', subaccountId: 'SAsub' }, deps(null),
    );
    assert.equal(out.ready, false);
    assert.equal(out.code, 'CARRIER_CREDENTIALS');
    assert.match(out.error, /relink/i, 'the operator needs to be told what fixes it');
  });

  test('refuses when the caller ID belongs to a different subaccount', async () => {
    const out = await resolveDialCredentials(
      PLIVO, MAIN, { workspaceId: 'ws1', subaccountId: 'SAsomeone-else' }, deps(SUB),
    );
    assert.equal(out.ready, false);
    assert.equal(out.code, 'CARRIER_SUBACCOUNT_MISMATCH');
    assert.equal(out.status, 403);
  });

  test('refuses when the kill switch is pulled', async () => {
    const out = await resolveDialCredentials(
      PLIVO, MAIN, { workspaceId: 'ws1', subaccountId: 'SAsub' }, deps({ ...SUB, enabled: false }),
    );
    assert.equal(out.ready, false);
    assert.equal(out.code, 'CARRIER_DISABLED');
  });

  test('refuses when the token will not decrypt', async () => {
    // ENCRYPTION_KEY changed under us. Dialling on main credentials here is the
    // one outcome that must not happen.
    const out = await resolveDialCredentials(
      PLIVO, MAIN, { workspaceId: 'ws1', subaccountId: 'SAsub' },
      throwing('Stored Plivo subaccount credentials could not be decrypted.'),
    );
    assert.equal(out.ready, false);
    assert.equal(out.code, 'CARRIER_CREDENTIALS');
    assert.match(out.error, /decrypt/i);
  });
});
