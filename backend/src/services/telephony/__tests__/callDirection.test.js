// backend/src/services/telephony/__tests__/callDirection.test.js
/**
 * The call's OWN direction has to reach the media bridge.
 *
 * The bug this covers: an agent saved as INBOUND (or with no direction at all —
 * several live agents have none) used for an outbound campaign answered with
 * "Thank you for calling…", on a call the platform itself dialled. The greeting
 * was chosen from the agent's stored setting, which says what the agent is FOR,
 * not what is happening on this leg.
 *
 * The fix carries the direction on the socket URL, so these tests pin the two
 * halves that are easy to break silently: that the flag is emitted when the
 * dialler asks for it, and that it is ABSENT otherwise — because absent has to
 * keep meaning "unknown, use the agent's setting" rather than "inbound".
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { twilioProvider } from '../twilio.provider.js';
import { plivoProvider } from '../plivo.provider.js';
import { piopiyProvider } from '../piopiy.provider.js';

const BASE = 'wss://spandan.mannmate.com';
const ARGS = { baseWsUrl: BASE, workspaceId: 'ws1', agentId: 'ag1' };

const PROVIDERS = [
  ['twilio', twilioProvider],
  ['plivo', plivoProvider],
  ['piopiy', piopiyProvider],
];

describe('mediaStreamUrl — call direction on the socket URL', () => {
  for (const [name, provider] of PROVIDERS) {
    test(`${name}: omits direction when the caller does not know it`, () => {
      const url = new URL(provider.mediaStreamUrl(ARGS));
      assert.equal(url.searchParams.get('direction'), null);
    });

    test(`${name}: carries an OUTBOUND dial through to the bridge`, () => {
      const url = new URL(provider.mediaStreamUrl({ ...ARGS, direction: 'OUTBOUND' }));
      assert.equal(url.searchParams.get('direction'), 'outbound');
    });

    test(`${name}: adding direction does not drop the provider's own query params`, () => {
      const without = new URL(provider.mediaStreamUrl(ARGS));
      const with_ = new URL(provider.mediaStreamUrl({ ...ARGS, direction: 'OUTBOUND' }));
      assert.equal(with_.pathname, without.pathname);
      for (const [key, value] of without.searchParams) {
        assert.equal(with_.searchParams.get(key), value, `${name} lost ${key}`);
      }
    });
  }
});

describe('plivo placeCall — direction survives the answer-URL hop', () => {
  // Plivo is the only carrier whose bridge address is built in the controller
  // rather than in the provider, so the flag has to ride the answer URL to get
  // there at all.
  let savedFetch;
  let captured;
  beforeEach(() => {
    savedFetch = globalThis.fetch;
    captured = null;
    globalThis.fetch = async (_url, init) => {
      captured = JSON.parse(init.body);
      return { ok: true, status: 201, text: async () => '{}' };
    };
  });
  afterEach(() => { globalThis.fetch = savedFetch; });

  const call = (context) => plivoProvider.placeCall({
    credentials: { authId: 'MAXXXXXXXXXXXXXXXXXX', authToken: 'tok' },
    to: '+918000000001',
    from: '+918000000000',
    document: 'https://spandan.mannmate.com/api/v1/plivo/answer?mode=conversation',
    context,
  });

  test('an OUTBOUND dial reaches the answer URL', async () => {
    await call({ workspaceId: 'ws1', agentId: 'ag1', direction: 'OUTBOUND' });
    const answer = new URL(captured.answer_url);
    assert.equal(answer.searchParams.get('direction'), 'outbound');
  });

  test('no direction means no parameter, not a guessed one', async () => {
    await call({ workspaceId: 'ws1', agentId: 'ag1' });
    const answer = new URL(captured.answer_url);
    assert.equal(answer.searchParams.get('direction'), null);
  });
});
