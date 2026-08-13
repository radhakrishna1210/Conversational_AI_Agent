import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  plivoProvider as p,
  buildStreamXml,
  buildGreetingXml,
  resolveAnswerUrlBase,
  STREAM_CONTENT_TYPE,
  STREAM_SAMPLE_RATE,
} from '../plivo.provider.js';

const ENV_KEYS = [
  'PLIVO_AUTH_ID', 'PLIVO_AUTH_TOKEN', 'PLIVO_FROM_NUMBER',
  'PLIVO_ANSWER_URL', 'PUBLIC_BACKEND_WS_URL',
];

let saved;
const configure = (over = {}) => {
  Object.assign(process.env, {
    PLIVO_AUTH_ID: 'MAXXXXXXXXXXXXXXXXXX',
    PLIVO_AUTH_TOKEN: 'tok',
    PLIVO_FROM_NUMBER: '+918000000000',
    PUBLIC_BACKEND_WS_URL: 'wss://spandan.mannmate.com',
    ...over,
  });
};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
});
afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
});

describe('plivo.provider — answer URL derivation', () => {
  test('derives an https answer URL from the wss backend URL', () => {
    configure();
    assert.equal(resolveAnswerUrlBase(), 'https://spandan.mannmate.com/api/v1/plivo/answer');
  });

  test('an explicit PLIVO_ANSWER_URL wins verbatim, minus a trailing slash', () => {
    configure({ PLIVO_ANSWER_URL: 'https://other.example.com/api/v1/plivo/answer/' });
    assert.equal(resolveAnswerUrlBase(), 'https://other.example.com/api/v1/plivo/answer');
  });

  test('is empty when neither is set, rather than producing a broken URL', () => {
    assert.equal(resolveAnswerUrlBase(), '');
  });
});

describe('plivo.provider — readiness', () => {
  test('not ready without credentials', () => {
    const s = p.status();
    assert.equal(s.ready, false);
    assert.match(s.error, /PLIVO_AUTH_ID/);
  });

  test('not ready without a caller ID', () => {
    configure({ PLIVO_FROM_NUMBER: '' });
    const s = p.status();
    assert.equal(s.ready, false);
    assert.match(s.error, /PLIVO_FROM_NUMBER/);
  });

  // Without an answer URL the call connects and then sits in silence, which is
  // the failure this check exists to convert into a refusal before dialling.
  test('not ready without any answer URL', () => {
    configure({ PUBLIC_BACKEND_WS_URL: '' });
    const s = p.status();
    assert.equal(s.ready, false);
    assert.match(s.error, /PLIVO_ANSWER_URL|PUBLIC_BACKEND_WS_URL/);
  });

  test('ready when configured, and spreads credentials flat', () => {
    configure();
    const s = p.status();
    assert.equal(s.ready, true);
    assert.equal(s.authId, 'MAXXXXXXXXXXXXXXXXXX');
  });
});

describe('plivo.provider — documents are URLs, not markup', () => {
  test('conversation doc is the answer URL in conversation mode', () => {
    configure();
    const doc = p.buildConversationDoc({ streamUrl: 'wss://x/ignored', callLogId: 'log_1' });
    assert.equal(doc, 'https://spandan.mannmate.com/api/v1/plivo/answer?mode=conversation');
  });

  // The stream URL must NOT be reflected into the document: the answer endpoint
  // is public, and echoing an externally supplied wss:// into XML a carrier
  // dials is the one thing this design deliberately avoids.
  test('conversation doc does not carry the stream URL', () => {
    configure();
    const doc = p.buildConversationDoc({ streamUrl: 'wss://evil.example/hijack', callLogId: null });
    assert.ok(!doc.includes('evil.example'));
  });

  test('greeting doc carries the closing line but not the greeting', () => {
    configure();
    const doc = p.buildGreetingDoc({ greeting: 'Hello there', closingLine: 'Goodbye' });
    const u = new URL(doc);
    assert.equal(u.searchParams.get('mode'), 'greeting');
    assert.equal(u.searchParams.get('closing'), 'Goodbye');
    assert.ok(!doc.includes('Hello there'));
  });

  test('a long closing line is capped rather than blowing up the URL', () => {
    configure();
    const doc = p.buildGreetingDoc({ greeting: 'hi', closingLine: 'x'.repeat(5000) });
    assert.ok(new URL(doc).searchParams.get('closing').length <= 300);
  });

  test('refuses to build a document with no answer URL configured', () => {
    assert.throws(() => p.buildConversationDoc({}), /PLIVO_ANSWER_URL|PUBLIC_BACKEND_WS_URL/);
  });
});

describe('plivo.provider — XML', () => {
  // bidirectional is what allows playAudio back at all; keepCallAlive stops
  // Plivo hanging up the moment the one-element document is consumed.
  test('stream XML is bidirectional and keeps the call alive', () => {
    const x = buildStreamXml({ streamUrl: 'wss://h/api/v1/plivo-media/w/a?callLogId=l' });
    assert.match(x, /<Stream [^>]*bidirectional="true"/);
    assert.match(x, /<Stream [^>]*keepCallAlive="true"/);
    assert.ok(x.includes('wss://h/api/v1/plivo-media/w/a?callLogId=l'));
  });

  // The socket's contentType must agree with what the handler stamps on every
  // outbound frame, so both come from the same two constants.
  test('stream XML declares the same format the handler sends', () => {
    const x = buildStreamXml({ streamUrl: 'wss://h/s' });
    assert.ok(x.includes(`contentType="${STREAM_CONTENT_TYPE};rate=${STREAM_SAMPLE_RATE}"`));
  });

  test('greeting XML speaks, pauses, then speaks the closing line', () => {
    const x = buildGreetingXml({ greeting: 'Hi there', closingLine: 'Bye now' });
    assert.ok(x.indexOf('Hi there') < x.indexOf('<Wait'));
    assert.ok(x.indexOf('<Wait') < x.indexOf('Bye now'));
  });

  test('greeting XML omits the pause when there is no closing line', () => {
    const x = buildGreetingXml({ greeting: 'Hi there' });
    assert.ok(!x.includes('<Wait'));
  });

  // Plivo's format is Polly.<VoiceName>; a bare voice="Polly" is rejected and
  // the greeting call fails with an XML error instead of speaking.
  test('greeting XML names a fully-qualified Polly voice', () => {
    const x = buildGreetingXml({ greeting: 'Hi' });
    assert.match(x, /voice="Polly\.[A-Za-z]+"/);
    assert.match(x, /language="en-IN"/);
  });

  // One unescaped & or < fails the whole call with a parse error instead of
  // speaking, so xmlSafe has to be applied to spoken text.
  test('greeting XML neutralises XML metacharacters in spoken text', () => {
    const x = buildGreetingXml({ greeting: 'Tools & Dies <ltd>' });
    assert.ok(!x.includes('&amp;'));  // replaced with a space, not entity-encoded
    assert.ok(!x.includes('<ltd>'));
  });
});

describe('plivo.provider — placeCall', () => {
  const capture = () => {
    const calls = [];
    global.fetch = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ request_uuid: 'req-1', message: 'call fired' }),
      };
    };
    return calls;
  };

  let realFetch;
  beforeEach(() => { realFetch = global.fetch; });
  afterEach(() => { global.fetch = realFetch; });

  test('posts JSON to the Call endpoint and normalizes the id', async () => {
    configure();
    const calls = capture();
    const r = await p.placeCall({
      credentials: { authId: 'AID', authToken: 'tok' },
      to: '+919000000000',
      from: '+918000000000',
      document: p.buildConversationDoc({}),
      context: { workspaceId: 'w1', agentId: 'a1', callLogId: 'l1' },
    });

    assert.equal(r.ok, true);
    assert.equal(r.callId, 'req-1');
    assert.equal(calls[0].url, 'https://api.plivo.com/v1/Account/AID/Call/');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');

    // Stripped at the carrier boundary: VoiceNumber stores "+91…" and routes on
    // that exact string, but Plivo's API wants bare digits.
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.to, '919000000000');
    assert.equal(body.from, '918000000000');
  });

  test('leaves an already-bare number alone', async () => {
    configure();
    const calls = capture();
    await p.placeCall({
      credentials: { authId: 'AID', authToken: 'tok' },
      to: '919000000000',
      from: '912269851741',
      document: p.buildConversationDoc({}),
      context: {},
    });
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.to, '919000000000');
    assert.equal(body.from, '912269851741');
  });

  // Plivo's stream `start` event has no customParameters, so this query string
  // is the ONLY way the answer endpoint learns which call it is answering.
  test('appends the per-call context to the answer URL', async () => {
    configure();
    const calls = capture();
    await p.placeCall({
      credentials: { authId: 'AID', authToken: 'tok' },
      to: '+919000000000',
      from: '+918000000000',
      document: p.buildConversationDoc({}),
      context: { workspaceId: 'w1', agentId: 'a1', callLogId: 'l1' },
    });

    const u = new URL(JSON.parse(calls[0].init.body).answer_url);
    assert.equal(u.searchParams.get('workspaceId'), 'w1');
    assert.equal(u.searchParams.get('agentId'), 'a1');
    assert.equal(u.searchParams.get('callLogId'), 'l1');
    assert.equal(u.searchParams.get('mode'), 'conversation');
  });

  // For a greeting-only call no media socket ever opens, so the hangup callback
  // is the only thing that can move the log off INITIATED.
  test('derives a hangup URL carrying the same call log id', async () => {
    configure();
    const calls = capture();
    await p.placeCall({
      credentials: { authId: 'AID', authToken: 'tok' },
      to: '+919000000000',
      from: '+918000000000',
      document: p.buildGreetingDoc({ greeting: 'hi', closingLine: 'bye' }),
      context: { workspaceId: 'w1', agentId: 'a1', callLogId: 'l1' },
    });

    const body = JSON.parse(calls[0].init.body);
    const h = new URL(body.hangup_url);
    assert.ok(h.pathname.endsWith('/api/v1/plivo/hangup'));
    assert.equal(h.searchParams.get('callLogId'), 'l1');
    // The closing line is call-script data; it has no business on a callback
    // that fires after the words were already spoken.
    assert.equal(h.searchParams.get('closing'), null);
  });

  test('a 400 names the India compliance cause rather than guessing', async () => {
    configure();
    global.fetch = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'invalid source number' }),
    });
    const r = await p.placeCall({
      credentials: { authId: 'AID', authToken: 'tok' },
      to: '+919000000000',
      from: '+918000000000',
      document: p.buildConversationDoc({}),
      context: {},
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /compliance application/);
  });

  test('a network failure is reported, not thrown', async () => {
    configure();
    global.fetch = async () => { throw new Error('ECONNRESET'); };
    const r = await p.placeCall({
      credentials: { authId: 'AID', authToken: 'tok' },
      to: '+919000000000',
      from: '+918000000000',
      document: p.buildConversationDoc({}),
      context: {},
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /Could not reach Plivo/);
  });
});
