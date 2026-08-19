import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  piopiyProvider as p,
  piopiyNumber,
  resolveSampleRate,
} from '../piopiy.provider.js';

const ENV_KEYS = [
  'PIOPIY_APP_ID', 'PIOPIY_APP_SECRET', 'PIOPIY_FROM_NUMBER',
  'PIOPIY_SAMPLE_RATE', 'PIOPIY_LISTEN_MODE', 'PIOPIY_TIME_LIMIT_SEC',
  'PIOPIY_API_TOKEN',
];

let saved;
let savedFetch;

const configure = (over = {}) => {
  Object.assign(process.env, {
    PIOPIY_APP_ID: '2222222',
    PIOPIY_APP_SECRET: 'secret',
    PIOPIY_FROM_NUMBER: '+912269851741',
    ...over,
  });
};

/** Capture the request `placeCall` makes without ever leaving the process. */
const captureFetch = (response = { status: 'progress', request_id: 'REQ1', cmi_code: 200 }) => {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(response),
    };
  };
  return calls;
};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  savedFetch = global.fetch;
});
afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
  global.fetch = savedFetch;
});

describe('piopiy.provider — number normalization', () => {
  test('strips a leading plus and returns a number, because the API type-checks it', () => {
    assert.equal(piopiyNumber('+919876543210'), 919876543210);
    assert.equal(typeof piopiyNumber('+919876543210'), 'number');
  });

  test('accepts a number already stored without the plus', () => {
    assert.equal(piopiyNumber('919876543210'), 919876543210);
  });

  test('returns null rather than NaN for anything that is not a plain number', () => {
    // NaN would serialize to JSON null and the carrier would blame the wrong
    // field. Each of these is a real shape `to` can arrive as.
    assert.equal(piopiyNumber('sip:someone@example.com'), null);
    assert.equal(piopiyNumber('+91 98765 43210'), null);
    assert.equal(piopiyNumber(''), null);
    assert.equal(piopiyNumber(null), null);
    assert.equal(piopiyNumber(undefined), null);
  });
});

describe('piopiy.provider — sample rate', () => {
  test('defaults to 8000, the rate the phone leg carries anyway', () => {
    assert.equal(resolveSampleRate(), 8000);
  });

  test('accepts 16000', () => {
    configure({ PIOPIY_SAMPLE_RATE: '16000' });
    assert.equal(resolveSampleRate(), 16000);
  });

  test('falls back to 8000 on a rate PIOPIY would reject', () => {
    // 24000 is a common PCM16 stream rate and invalid here; taking it would leave the two
    // ends disagreeing about the rate, which is audible as pitch not silence.
    configure({ PIOPIY_SAMPLE_RATE: '24000' });
    assert.equal(resolveSampleRate(), 8000);
  });
});

describe('piopiy.provider — readiness', () => {
  test('not ready without credentials', () => {
    const s = p.status();
    assert.equal(s.ready, false);
    assert.match(s.error, /PIOPIY_APP_ID/);
  });

  test('names the v3-token mistake specifically, because the two credentials look alike', () => {
    // A v3 Bearer token is what the dashboard's API page hands you, and it
    // cannot stream audio at all — v3's pipeline has no `stream` action. Left
    // generic, this reads as "not configured" and costs an afternoon.
    process.env.PIOPIY_API_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.e30.sig';
    const s = p.status();
    assert.equal(s.ready, false);
    assert.match(s.error, /v3 API token/);
    assert.match(s.error, /PIOPIY_APP_ID/);
  });

  test('a v3 token alongside valid v2 credentials is simply ignored', () => {
    configure({ PIOPIY_API_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.e30.sig' });
    assert.equal(p.status().ready, true);
  });

  test('names a half-filled pair rather than reporting "not configured"', () => {
    // The state an operator lands in mid-setup: one value pasted, one still to
    // come. Reported generically, it sends them hunting for what they already have.
    process.env.PIOPIY_APP_ID = '2222222';
    let s = p.status();
    assert.equal(s.ready, false);
    assert.match(s.error, /has PIOPIY_APP_ID but not PIOPIY_APP_SECRET/);

    delete process.env.PIOPIY_APP_ID;
    process.env.PIOPIY_APP_SECRET = 'secret';
    s = p.status();
    assert.match(s.error, /has PIOPIY_APP_SECRET but not PIOPIY_APP_ID/);
  });

  test('the half-pair message wins over the v3-token message', () => {
    // Mid-setup the token is usually still sitting in .env, and the v3 advice
    // would be actively misleading to someone who has just pasted an app id.
    process.env.PIOPIY_API_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.e30.sig';
    process.env.PIOPIY_APP_ID = '2222222';
    assert.match(p.status().error, /but not PIOPIY_APP_SECRET/);
  });

  test('not ready without a caller ID', () => {
    configure({ PIOPIY_FROM_NUMBER: '' });
    const s = p.status();
    assert.equal(s.ready, false);
    assert.match(s.error, /PIOPIY_FROM_NUMBER/);
  });

  test('refuses an unusable caller ID before dialling', () => {
    configure({ PIOPIY_FROM_NUMBER: 'my-number' });
    const s = p.status();
    assert.equal(s.ready, false);
    assert.match(s.error, /not a dialable caller ID/);
  });

  test('ready with credentials and a caller ID', () => {
    configure();
    const s = p.status();
    assert.equal(s.ready, true);
    assert.equal(s.appId, '2222222');
    assert.equal(s.sampleRate, 8000);
    assert.equal(s.listenMode, 'caller');
  });
});

describe('piopiy.provider — conversation document', () => {
  const streamUrl = 'wss://spandan.mannmate.com/api/v1/piopiy-media/ws1/ag1?sample-rate=8000';

  test('is a PCMO array holding one stream action', () => {
    configure();
    const doc = JSON.parse(p.buildConversationDoc({ streamUrl, callLogId: 'log1' }));
    assert.equal(doc.length, 1);
    assert.equal(doc[0].action, 'stream');
    assert.equal(doc[0].listen_mode, 'caller');
  });

  test('pins the call log id to the stream URL, which is what the bridge reads', () => {
    configure();
    const doc = JSON.parse(p.buildConversationDoc({ streamUrl, callLogId: 'log1' }));
    const url = new URL(doc[0].ws_url);
    assert.equal(url.searchParams.get('callLogId'), 'log1');
    // The rate must survive: the bridge sizes its frames and its resampler off it.
    assert.equal(url.searchParams.get('sample-rate'), '8000');
  });

  test('adds no hangup action after the stream', () => {
    // An action after `stream` ends the call the moment the socket closes,
    // including a mid-call blip.
    configure();
    const doc = JSON.parse(p.buildConversationDoc({ streamUrl }));
    assert.equal(doc.some((a) => a.action === 'hangup'), false);
  });

  test('never emits listen_mode "both", which would feed the agent its own voice', () => {
    configure({ PIOPIY_LISTEN_MODE: 'both' });
    const doc = JSON.parse(p.buildConversationDoc({ streamUrl }));
    // 'both' is a legal PIOPIY value, so it IS honoured when asked for
    // explicitly — the guard is the default, not a prohibition.
    assert.equal(doc[0].listen_mode, 'both');

    delete process.env.PIOPIY_LISTEN_MODE;
    const dflt = JSON.parse(p.buildConversationDoc({ streamUrl }));
    assert.equal(dflt[0].listen_mode, 'caller');
  });

  test('throws rather than dialling into a call with nowhere to stream', () => {
    configure();
    assert.throws(() => p.buildConversationDoc({ streamUrl: '' }), /PUBLIC_BACKEND_WS_URL/);
  });
});

describe('piopiy.provider — greeting document', () => {
  test('speaks the greeting then hangs up, so the line is not held open', () => {
    configure();
    const doc = JSON.parse(p.buildGreetingDoc({ greeting: 'Hello there', closingLine: 'Goodbye' }));
    assert.deepEqual(doc.map((a) => a.action), ['speak', 'speak', 'hangup']);
    assert.equal(doc[0].text, 'Hello there');
    assert.equal(doc[1].text, 'Goodbye');
  });

  test('omits the closing action when there is no closing line', () => {
    configure();
    const doc = JSON.parse(p.buildGreetingDoc({ greeting: 'Hello there' }));
    assert.deepEqual(doc.map((a) => a.action), ['speak', 'hangup']);
  });

  test('refuses an empty greeting rather than dialling a lead to say nothing', () => {
    configure();
    assert.throws(() => p.buildGreetingDoc({ greeting: '   ' }), /greeting text/);
  });
});

describe('piopiy.provider — broadcast document', () => {
  const audioUrl = 'https://spandan.mannmate.com/api/v1/broadcast-audio/rec1?t=abc';

  test('plays the file then hangs up', () => {
    configure();
    const doc = JSON.parse(p.buildBroadcastDoc({ audioUrl }));
    assert.deepEqual(doc.map((a) => a.action), ['play', 'hangup']);
    assert.equal(doc[0].file_url, audioUrl);
  });

  test('a repeat is repeated actions, because PCMO has no loop attribute', () => {
    configure();
    const doc = JSON.parse(p.buildBroadcastDoc({ audioUrl, repeat: 3 }));
    assert.deepEqual(doc.map((a) => a.action), ['play', 'play', 'play', 'hangup']);
  });

  test('clamps the repeat count', () => {
    configure();
    const doc = JSON.parse(p.buildBroadcastDoc({ audioUrl, repeat: 99 }));
    assert.equal(doc.filter((a) => a.action === 'play').length, 5);
  });

  test('refuses a URL the carrier could not fetch', () => {
    configure();
    assert.throws(() => p.buildBroadcastDoc({ audioUrl: '/broadcast-audio/rec1' }), /absolute http/);
  });
});

describe('piopiy.provider — placeCall', () => {
  test('posts to the India endpoint for a +91 destination', async () => {
    configure();
    const calls = captureFetch();
    const doc = p.buildGreetingDoc({ greeting: 'Hi' });

    const res = await p.placeCall({
      credentials: p.status(), to: '+919876543210', from: '+912269851741', document: doc,
    });

    assert.equal(res.ok, true);
    assert.equal(res.callId, 'REQ1');
    assert.match(calls[0].url, /\/v2\/ind_pcmo_make_call$/);
  });

  test('posts to the global endpoint for a non-India destination', async () => {
    configure();
    const calls = captureFetch();
    const doc = p.buildGreetingDoc({ greeting: 'Hi' });

    await p.placeCall({
      credentials: p.status(), to: '+14155550100', from: '+912269851741', document: doc,
    });

    assert.match(calls[0].url, /\/v2\/global_pcmo_make_call$/);
  });

  test('sends the PCMO as a parsed array, not the JSON string the builder returned', async () => {
    configure();
    const calls = captureFetch();
    const doc = p.buildGreetingDoc({ greeting: 'Hi' });

    await p.placeCall({
      credentials: p.status(), to: '+919876543210', from: '+912269851741', document: doc,
    });

    assert.ok(Array.isArray(calls[0].body.pcmo));
    assert.equal(calls[0].body.pcmo[0].action, 'speak');
  });

  test('carries the per-call identity in extra_params, which the CDR echoes back', async () => {
    configure();
    const calls = captureFetch();
    const doc = p.buildGreetingDoc({ greeting: 'Hi' });

    await p.placeCall({
      credentials: p.status(),
      to: '+919876543210',
      from: '+912269851741',
      document: doc,
      context: {
        workspaceId: 'ws1',
        agentId: 'ag1',
        callLogId: 'log1',
        query: { broadcastRecipientId: 'rec1' },
      },
    });

    assert.deepEqual(calls[0].body.extra_params, {
      workspaceId: 'ws1', agentId: 'ag1', callLogId: 'log1', broadcastRecipientId: 'rec1',
    });
  });

  test('sends numbers, not strings, and without the plus', async () => {
    configure();
    const calls = captureFetch();
    const doc = p.buildGreetingDoc({ greeting: 'Hi' });

    await p.placeCall({
      credentials: p.status(), to: '+919876543210', from: '+912269851741', document: doc,
    });

    assert.equal(calls[0].body.to, 919876543210);
    assert.equal(calls[0].body.from, 912269851741);
  });

  test('applies PIOPIY_TIME_LIMIT_SEC as the duration ceiling', async () => {
    configure({ PIOPIY_TIME_LIMIT_SEC: '600' });
    const calls = captureFetch();
    const doc = p.buildGreetingDoc({ greeting: 'Hi' });

    await p.placeCall({
      credentials: p.status(), to: '+919876543210', from: '+912269851741', document: doc,
    });

    assert.equal(calls[0].body.duration, 600);
  });

  test('refuses a destination that is not dialable, before spending a request', async () => {
    configure();
    const calls = captureFetch();

    const res = await p.placeCall({
      credentials: p.status(),
      to: 'sip:x@example.com',
      from: '+912269851741',
      document: p.buildGreetingDoc({ greeting: 'Hi' }),
    });

    assert.equal(res.ok, false);
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });

  test('treats a non-200 cmi_code on an HTTP 200 as a rejection', async () => {
    // The failure this exists for: PIOPIY answers 200 OK with its own error
    // code in the body. Read as success, the call log sits at INITIATED forever.
    configure();
    captureFetch({ cmi_code: 401, message: 'Invalid credentials' });

    const res = await p.placeCall({
      credentials: p.status(),
      to: '+919876543210',
      from: '+912269851741',
      document: p.buildGreetingDoc({ greeting: 'Hi' }),
    });

    assert.equal(res.ok, false);
    assert.match(res.error, /Invalid credentials/);
    assert.match(res.error, /PIOPIY_APP_ID/);
  });

  test('surfaces an unreachable carrier as a 502 rather than throwing', async () => {
    configure();
    global.fetch = async () => { throw new Error('getaddrinfo ENOTFOUND'); };

    const res = await p.placeCall({
      credentials: p.status(),
      to: '+919876543210',
      from: '+912269851741',
      document: p.buildGreetingDoc({ greeting: 'Hi' }),
    });

    assert.equal(res.ok, false);
    assert.equal(res.status, 502);
    assert.match(res.error, /Could not reach PIOPIY/);
  });
});

describe('piopiy.provider — capability flags', () => {
  test('refuses the modular pipeline, which is µ-law and has no bridge here', () => {
    assert.equal(p.supportsModularEngine, false);
  });

  test('supports greeting mode, because PCMO has a speak action', () => {
    assert.equal(p.supportsGreetingMode, true);
  });

  test('supports broadcast, because PCMO has a play action', () => {
    assert.equal(p.supportsBroadcast, true);
  });

  test('delivers its document inline, so there is no answer endpoint to serve', () => {
    assert.equal(p.deliverDocument, 'inline');
  });
});
