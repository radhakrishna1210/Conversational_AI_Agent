// Run by callerNumbers.test.js, in a child process with module mocks.
//
// A caller ID is a tenancy fact. listCallerNumbers used to merge every number
// the PLATFORM's Twilio account owned into `owned`, unfiltered, so each client
// saw the whole parent account's inventory and could dial as any other tenant.
// Plivo was scoped correctly; Twilio was the one carrier that was not.
//
// What is pinned here:
//   only this workspace's numbers are ever offered, whatever Twilio returns;
//   an unconfigured Twilio is an empty list, not a 503 naming our env vars.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../../ws/__tests__/support/mockedHarness.js';

const here = (rel) => new URL(rel, import.meta.url);

const WS = 'ws_herbs';

let state;
const resetState = () => {
  state = {
    rows: [{ phoneNumber: '+918031708289', provider: 'PLIVO' }],
    // Both the assigned and the suspended lookups hit findMany, so every `where`
    // is kept rather than only the last one to land.
    wheres: [],
    suspended: [],
  };
};
resetState();

mockModule(here('../../config/prisma.js'), {}, {
  voiceNumber: {
    findMany: async ({ where }) => {
      state.wheres.push(where);
      // The suspended-number read uses the same model; tell them apart by the
      // status the caller asked for.
      if (where?.status && where.status !== 'ACTIVE') return state.suspended;
      return state.rows;
    },
  },
});

// Twilio holds four numbers that belong to the platform, not to any client.
const TWILIO_INVENTORY = ['+15550000001', '+15550000002', '+15550000003', '+15550000004'];
globalThis.fetch = async (url) => {
  if (String(url).includes('IncomingPhoneNumbers')) {
    return {
      ok: true,
      json: async () => ({ incoming_phone_numbers: TWILIO_INVENTORY.map((p) => ({ phone_number: p, friendly_name: 'platform' })) }),
    };
  }
  return { ok: true, json: async () => ({ outgoing_caller_ids: [] }) };
};

const { listCallerNumbers } = await import('../callerNumber.controller.js');

/** Minimal express double. */
const run = async () => {
  let payload; let status = 200;
  const res = {
    json: (b) => { payload = b; return res; },
    status: (s) => { status = s; return res; },
  };
  await listCallerNumbers({ params: { workspaceId: WS } }, res);
  return { status, payload };
};

describe('listCallerNumbers', () => {
  beforeEach(resetState);

  test('never offers the platform Twilio inventory to a workspace', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_platform';
    process.env.TWILIO_AUTH_TOKEN = 'tok';

    const { status, payload } = await run();

    assert.equal(status, 200);
    const offered = payload.owned.map((n) => n.phoneNumber);
    assert.deepEqual(offered, ['+918031708289']);
    for (const leaked of TWILIO_INVENTORY) {
      assert.ok(!offered.includes(leaked), `${leaked} must not be offered to a tenant`);
    }
  });

  test('scopes the lookup to this workspace and to live numbers', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_platform';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    await run();

    const assigned = state.wheres.find((w) => w.status === 'ACTIVE');
    assert.ok(assigned, "expected a lookup for this workspace's live numbers");
    assert.equal(assigned.workspaceId, WS);
    // A Twilio number assigned to this workspace must now come back from the
    // table — nothing else lists one per tenant any more.
    assert.equal(assigned.provider, undefined);
  });

  test('offers a Twilio number that IS assigned to the workspace', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_platform';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    state.rows = [{ phoneNumber: '+15551230000', provider: 'TWILIO' }];

    const { payload } = await run();
    assert.deepEqual(payload.owned.map((n) => n.phoneNumber), ['+15551230000']);
    assert.equal(payload.owned[0].source, 'twilio');
  });

  test('no Twilio credentials is an empty list, not a 503 about our env vars', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    // The workspace that has no number of its own yet — the case that used to
    // put "TWILIO_ACCOUNT_SID ... missing in backend/.env" on a client's screen.
    state.rows = [];

    const { status, payload } = await run();

    assert.equal(status, 200);
    assert.deepEqual(payload.owned, []);
    assert.deepEqual(payload.verified, []);
    assert.ok(!('error' in payload));
  });

  test('a workspace number still shows when Twilio is unreachable', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_platform';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    const saved = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('twilio down'); };
    try {
      const { status, payload } = await run();
      assert.equal(status, 200);
      assert.deepEqual(payload.owned.map((n) => n.phoneNumber), ['+918031708289']);
    } finally {
      globalThis.fetch = saved;
    }
  });
});
