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
import { plivoProvider, buildStreamXml } from '../plivo.provider.js';
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


/**
 * THE COST OF THE PARAMETER ABOVE.
 *
 * Adding `direction` gave the media-stream URL its SECOND query parameter, and
 * so its first `&`. Both XML carriers embed that URL in a document — Plivo as
 * character data inside <Stream>, Twilio as a `url` attribute — where a raw `&`
 * starts an entity reference and makes the whole document unparseable. The
 * carrier answers the call, fails to parse what we served, and hangs up: the
 * callee hears one second of nothing and every conversational call dies at
 * pickup, with the call log left at INITIATED because the socket never opened.
 *
 * It shipped because the existing document tests all used a URL with ONE
 * parameter, which is well-formed by accident. These use the real two-parameter
 * URL and assert on the document rather than on the substring.
 */
const RAW_AMPERSAND = /&(?!amp;|lt;|gt;|quot;|apos;|#)/;

describe('carrier documents survive a two-parameter stream URL', () => {
  const streamUrl = (provider) => {
    const url = new URL(provider.mediaStreamUrl({ ...ARGS, direction: 'OUTBOUND' }));
    url.searchParams.set('callLogId', 'clog1');
    return url.toString();
  };

  test('plivo: <Stream> escapes the ampersand instead of emitting it raw', () => {
    const url = streamUrl(plivoProvider);
    assert.ok(url.includes('&'), 'precondition: the URL under test has two parameters');

    const doc = buildStreamXml({ streamUrl: url });
    assert.ok(!RAW_AMPERSAND.test(doc), `unescaped & in the answer document: ${doc}`);
    // Escaped, not stripped: the bridge needs every parameter back. xmlSafe()
    // would have replaced the & with a space and truncated the URL just as
    // effectively as leaving it raw.
    assert.ok(doc.includes('&amp;callLogId=clog1'));
  });

  test('twilio: the Stream url attribute escapes the ampersand', () => {
    const doc = twilioProvider.buildConversationDoc({
      streamUrl: `${streamUrl(twilioProvider)}`,
      callLogId: 'clog1',
    });
    assert.ok(!RAW_AMPERSAND.test(doc), `unescaped & in the TwiML: ${doc}`);
  });

  // PIOPIY is the one carrier with no escaping to get wrong: its document is a
  // JSON PCMO array, so the URL is a string value and JSON.stringify owns it.
  // Asserted rather than assumed, because "it is JSON" is only true until
  // someone builds the document by concatenation.
  test('piopiy: the PCMO document keeps the URL intact', () => {
    const url = streamUrl(piopiyProvider);
    const doc = piopiyProvider.buildConversationDoc({ streamUrl: url, callLogId: 'clog1' });
    const json = typeof doc === 'string' ? JSON.parse(doc) : doc;
    assert.ok(JSON.stringify(json).includes(url.replace(/&/g, '&')));
  });
});
