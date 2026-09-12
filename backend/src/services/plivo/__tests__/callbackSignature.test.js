// backend/src/services/plivo/__tests__/callbackSignature.test.js
//
// Plivo signs every callback TWICE — X-Plivo-Signature-V3 with the token of the
// account the request belongs to, and X-Plivo-Signature-Ma-V3 always with the
// main account's. Checking only V3 against the main token works right up until
// calls start going out as subaccounts, and then rejects every one of them as
// forged: the callee hears silence and nothing in the log points at signing.
//
// The signing string itself is pinned in client.test.js; this file is only
// about which token is allowed to have produced which header.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { signingString, verifyCallbackSignature } from '../client.js';

const MAIN_TOKEN = 'main-account-token';
const SUB_TOKEN = 'subaccount-token';
const NONCE = '12345678901234567890';
const URL = 'https://api.example.com/api/v1/plivo/answer?mode=conversation';
const PARAMS = { CallUUID: 'abc-123', CallStatus: 'completed' };

const sign = (token, { method = 'POST', url = URL, params = PARAMS, nonce = NONCE } = {}) =>
  createHmac('sha256', token).update(`${signingString(method, url, params)}.${nonce}`).digest('base64');

const call = (over = {}) => verifyCallbackSignature({
  method: 'POST', url: URL, nonce: NONCE, params: PARAMS, mainToken: MAIN_TOKEN, ...over,
});

describe('verifyCallbackSignature', () => {
  test('accepts the main-account signature', () => {
    assert.equal(call({ signatureMaV3: sign(MAIN_TOKEN) }), 'ma-v3');
  });

  test('accepts V3 signed with the main token — a call on the main account', () => {
    assert.equal(call({ signatureV3: sign(MAIN_TOKEN) }), 'v3-main');
  });

  test('accepts V3 signed with the subaccount token — the case that was rejected', () => {
    assert.equal(
      call({ signatureV3: sign(SUB_TOKEN), subaccountToken: SUB_TOKEN }),
      'v3-subaccount',
    );
  });

  test('prefers the main signature, so no lookup is needed for a main-account call', () => {
    // The order matters for latency: this runs on the answer webhook, while the
    // callee is already on the line.
    assert.equal(call({ signatureMaV3: sign(MAIN_TOKEN), signatureV3: sign(SUB_TOKEN) }), 'ma-v3');
  });

  test('rejects a subaccount signature when no subaccount token is offered', () => {
    assert.equal(call({ signatureV3: sign(SUB_TOKEN) }), null);
  });

  test('rejects a signature made with some other subaccount\'s token', () => {
    // One tenant must not be able to forge another tenant's callbacks.
    assert.equal(call({ signatureV3: sign('another-tenants-token'), subaccountToken: SUB_TOKEN }), null);
  });

  test('rejects tampered params, a replayed nonce and a different URL', () => {
    const sig = sign(SUB_TOKEN);
    assert.equal(call({ signatureV3: sig, subaccountToken: SUB_TOKEN, params: { ...PARAMS, CallStatus: 'busy' } }), null);
    assert.equal(call({ signatureV3: sig, subaccountToken: SUB_TOKEN, nonce: 'different' }), null);
    assert.equal(call({ signatureV3: sig, subaccountToken: SUB_TOKEN, url: 'https://api.example.com/api/v1/plivo/hangup' }), null);
  });

  test('rejects a request carrying no signature at all', () => {
    assert.equal(call({ subaccountToken: SUB_TOKEN }), null);
  });

  test('rejects everything when the server has no main token configured', () => {
    // Without PLIVO_AUTH_TOKEN nothing can be verified, and unverified is not
    // permission — an open answer webhook lets anyone drive calls on our account.
    assert.equal(call({ signatureMaV3: sign(MAIN_TOKEN), mainToken: '' }), null);
    assert.equal(call({ signatureV3: sign(SUB_TOKEN), mainToken: '', subaccountToken: SUB_TOKEN }), 'v3-subaccount');
  });

  test('accepts a GET callback, which signs its query differently', () => {
    const url = 'https://api.example.com/api/v1/plivo/answer?b=2&a=1';
    assert.equal(
      verifyCallbackSignature({
        method: 'GET', url, nonce: NONCE, params: {}, mainToken: MAIN_TOKEN,
        signatureMaV3: sign(MAIN_TOKEN, { method: 'GET', url, params: {} }),
      }),
      'ma-v3',
    );
  });

  test('does not throw on a malformed signature', () => {
    assert.doesNotThrow(() => call({ signatureV3: 'short', subaccountToken: SUB_TOKEN }));
  });
});
