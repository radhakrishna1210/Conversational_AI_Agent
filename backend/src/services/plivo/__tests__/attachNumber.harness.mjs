// Run by attachNumber.test.js, in a child process with module mocks.
//
// attachMainAccountNumber() lends a client a number the MAIN account already
// holds. Everything worth pinning here is a refusal that is silent when it does
// not happen:
//
//   a null subaccountId          is what makes telephony/dialCredentials.js dial
//                                with main credentials. Writing one would fail
//                                every call from the number closed.
//   a number we do not own       records a row that routes nothing, and burns
//                                the digits string for the real number later.
//   a subaccount-held number     recorded with a null subaccountId is the exact
//                                mismatch dialCredentials.js refuses calls over.
//   no voice application         means inbound reaches Plivo's default_number_app
//                                and never this platform — silently.
//   no nextRenewalAt             keeps a number nobody agreed to pay for out of
//                                the renewal sweep.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../../../ws/__tests__/support/mockedHarness.js';

const here = (rel) => new URL(rel, import.meta.url);

const MUMBAI = '+912269851741';
const WS = 'ws_herbs';

/** What the fakes were asked to do, rebuilt for each test. */
let state;

const resetState = () => {
  state = {
    workspace: { id: WS },
    existingNumber: null,
    carrierNumber: { app_id: 'APP_MAIN', sub_account: null },
    carrierStatus: 200,
    requests: [],
    created: null,
  };
};
resetState();

class FakePlivoError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.status = status;
  }
}

mockModule(here('../client.js'), {
  PlivoError: FakePlivoError,
  mainCredentials: () => ({ authId: 'MAIN', authToken: 'tok' }),
  isPlivoConfigured: () => true,
  plivoRequest: async (path, opts = {}) => {
    state.requests.push({ path, method: opts.method ?? 'GET', json: opts.json });
    if (state.carrierStatus === 404) {
      throw new FakePlivoError('Plivo GET failed (404): not found', { status: 404 });
    }
    return state.carrierNumber;
  },
});

mockModule(here('../../../config/prisma.js'), {}, {
  workspace: { findUnique: async () => state.workspace },
  voiceNumber: {
    findUnique: async () => state.existingNumber,
    create: async ({ data }) => {
      state.created = data;
      return { id: 'vn_1', ...data };
    },
  },
});

// The subaccount module is only imported for rentNumber's sake; attaching must
// never reach it, and a throwing fake is how that stays true.
mockModule(here('../subaccount.service.js'), {
  createSubaccount: async () => { throw new Error('attach must not create a subaccount'); },
  ensureSubaccountApplication: async () => { throw new Error('attach must not touch subaccount apps'); },
  subaccountCredentials: async () => null,
});

process.env.PLIVO_VOICE_APP_ID = 'APP_MAIN';

const { attachMainAccountNumber } = await import('../number.service.js');

describe('attachMainAccountNumber', () => {
  beforeEach(resetState);

  test('records the number against the workspace with NO subaccount', async () => {
    const out = await attachMainAccountNumber(WS, { phoneNumber: MUMBAI });

    assert.equal(out.ok, true, out.error);
    assert.equal(state.created.workspaceId, WS);
    assert.equal(state.created.phoneNumber, MUMBAI);
    assert.equal(state.created.provider, 'PLIVO');
    // The load-bearing null: dialCredentials.js uses main credentials only when
    // the row names no subaccount.
    assert.equal(state.created.subaccountId, null);
  });

  test('leaves the number out of the renewal sweep and charges nobody', async () => {
    await attachMainAccountNumber(WS, { phoneNumber: MUMBAI });

    // Absent rather than null: assignNumber() only sets these when given them,
    // and a null nextRenewalAt is what keeps the sweep away.
    assert.equal(state.created.nextRenewalAt, undefined);
    assert.equal(state.created.clientMonthlyCents, undefined);
    assert.equal(state.created.carrierMonthlyCents, undefined);
  });

  test('classifies the series from the digits when none is given', async () => {
    await attachMainAccountNumber(WS, { phoneNumber: MUMBAI });
    // A Mumbai landline is not decidable from its digits, and an honest UNKNOWN
    // failing the compliance checklist is the correct outcome.
    assert.equal(state.created.series, 'UNKNOWN');
  });

  test('takes an explicit series over classification', async () => {
    await attachMainAccountNumber(WS, { phoneNumber: MUMBAI, series: 'TRANSACTIONAL_LANDLINE' });
    assert.equal(state.created.series, 'TRANSACTIONAL_LANDLINE');
  });

  test('refuses a number the main account does not hold', async () => {
    state.carrierStatus = 404;
    const out = await attachMainAccountNumber(WS, { phoneNumber: MUMBAI });

    assert.equal(out.ok, false);
    assert.match(out.error, /does not hold/i);
    assert.equal(state.created, null);
  });

  test('refuses a number held by a subaccount', async () => {
    // Plivo answers with the resource URI, not a bare auth id.
    state.carrierNumber = { app_id: 'APP_MAIN', sub_account: '/v1/Account/MAMAIN/Subaccount/SA0THER/' };
    const out = await attachMainAccountNumber(WS, { phoneNumber: MUMBAI });

    assert.equal(out.ok, false);
    assert.match(out.error, /subaccount SA0THER/);
    assert.equal(state.created, null);
  });

  test('refuses when nothing can point the number at this platform', async () => {
    delete process.env.PLIVO_VOICE_APP_ID;
    state.carrierNumber = { app_id: null, sub_account: null };
    try {
      const out = await attachMainAccountNumber(WS, { phoneNumber: MUMBAI });
      assert.equal(out.ok, false);
      assert.match(out.error, /inbound calls to it would never reach this platform/i);
      assert.equal(state.created, null);
    } finally {
      process.env.PLIVO_VOICE_APP_ID = 'APP_MAIN';
    }
  });

  test('attaches our voice application when the number is on a different one', async () => {
    state.carrierNumber = { app_id: 'APP_SOMETHING_ELSE', sub_account: null };
    const out = await attachMainAccountNumber(WS, { phoneNumber: MUMBAI });

    assert.equal(out.ok, true, out.error);
    const post = state.requests.find((r) => r.method === 'POST');
    assert.ok(post, 'expected the number to be pointed at our application');
    assert.equal(post.json.app_id, 'APP_MAIN');
    assert.equal(out.voiceApp.attached, true);
    assert.equal(out.voiceApp.before, 'APP_SOMETHING_ELSE');
  });

  test('leaves the carrier alone when the number is already on our application', async () => {
    const out = await attachMainAccountNumber(WS, { phoneNumber: MUMBAI });

    assert.equal(out.ok, true, out.error);
    assert.equal(state.requests.filter((r) => r.method === 'POST').length, 0);
    assert.equal(out.voiceApp.attached, false);
  });

  test('never moves a number that already belongs to someone', async () => {
    state.existingNumber = { workspaceId: 'ws_other', phoneNumber: MUMBAI };
    const out = await attachMainAccountNumber(WS, { phoneNumber: MUMBAI });

    assert.equal(out.ok, false);
    assert.match(out.error, /another customer/i);
    // Refused before the carrier is asked at all.
    assert.equal(state.requests.length, 0);
  });

  test('refuses a number that is not Indian E.164', async () => {
    const out = await attachMainAccountNumber(WS, { phoneNumber: '+14155550123' });
    assert.equal(out.ok, false);
    assert.match(out.error, /E\.164/);
    assert.equal(state.requests.length, 0);
  });

  test('refuses an unknown workspace', async () => {
    state.workspace = null;
    const out = await attachMainAccountNumber(WS, { phoneNumber: MUMBAI });
    assert.equal(out.ok, false);
    assert.match(out.error, /no such workspace/i);
  });
});
