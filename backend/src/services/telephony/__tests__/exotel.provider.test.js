import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { exotelProvider as p } from '../exotel.provider.js';

const ENV_KEYS = [
  'EXOTEL_API_KEY', 'EXOTEL_API_TOKEN', 'EXOTEL_SID',
  'EXOTEL_SUBDOMAIN', 'EXOTEL_CALLER_ID', 'EXOTEL_APP_ID', 'EXOTEL_STATUS_CALLBACK',
  'EXOTEL_DIAL_MODE', 'EXOTEL_SAMPLE_RATE', 'EXOTEL_TIME_LIMIT_SEC',
  'EXOTEL_WEBHOOK_TOKEN', 'PUBLIC_BACKEND_WS_URL',
];

let saved;
const configure = (over = {}) => {
  Object.assign(process.env, {
    EXOTEL_API_KEY: 'key', EXOTEL_API_TOKEN: 'token', EXOTEL_SID: 'acme1',
    EXOTEL_CALLER_ID: '+918000000000', EXOTEL_APP_ID: '99001', ...over,
  });
};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
});
afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  });
});

describe('exotel provider configuration', () => {
  test('is unconfigured without credentials', () => {
    const s = p.status();
    assert.equal(s.ready, false);
    assert.match(s.error, /EXOTEL_API_KEY/);
  });

  test('names the missing caller ID specifically', () => {
    configure({ EXOTEL_CALLER_ID: '' });
    assert.match(p.status().error, /EXOTEL_CALLER_ID/);
  });

  test('refuses to be ready without an App id in app mode', () => {
    // In app mode there is no per-call document at all — with no flow there is
    // nothing to connect the call to, so "configured" here would be a lie.
    configure({ EXOTEL_APP_ID: '', EXOTEL_DIAL_MODE: 'app' });
    const s = p.status();
    assert.equal(s.ready, false);
    assert.match(s.error, /EXOTEL_APP_ID/);
  });

  test('stream mode is ready WITHOUT an App id', () => {
    // Connect Voice AI carries the wss:// URL on the dial request, so demanding
    // a dashboard App here would block a correctly configured account.
    configure({ EXOTEL_APP_ID: '' });
    assert.equal(p.status().ready, true);
    assert.equal(p.credentials().dialMode, 'stream');
  });

  test('is ready once credentials, caller ID and App id are present', () => {
    configure();
    assert.equal(p.status().ready, true);
  });

  test('defaults to stream mode, and only "app" opts out', () => {
    configure({ EXOTEL_DIAL_MODE: 'APP' });
    assert.equal(p.credentials().dialMode, 'app');
    assert.equal(p.deliverDocument, 'app_id');
    configure({ EXOTEL_DIAL_MODE: 'nonsense' });
    assert.equal(p.credentials().dialMode, 'stream');
    assert.equal(p.deliverDocument, 'stream_url');
  });

  test('only Exotel\'s three sample rates are accepted', () => {
    configure();
    assert.equal(p.credentials().sampleRate, 24000, 'defaults to the engines\' native rate');
    configure({ EXOTEL_SAMPLE_RATE: '16000' });
    assert.equal(p.credentials().sampleRate, 16000);
    // 44100 would be silently ignored by Exotel, leaving the two ends
    // disagreeing about the rate — fall back rather than pass it on.
    configure({ EXOTEL_SAMPLE_RATE: '44100' });
    assert.equal(p.credentials().sampleRate, 24000);
  });

  test('defaults to the Mumbai subdomain, not Singapore', () => {
    // India requires media to stay in-country; Singapore is the wrong default
    // for the traffic this provider exists to carry.
    configure();
    assert.equal(p.credentials().subdomain, 'api.in.exotel.com');
    configure({ EXOTEL_SUBDOMAIN: 'api.exotel.com' });
    assert.equal(p.credentials().subdomain, 'api.exotel.com');
  });
});

describe('exotel call document', () => {
  test('in app mode the "document" is the dashboard flow URL', () => {
    configure({ EXOTEL_DIAL_MODE: 'app' });
    assert.equal(p.buildConversationDoc(), 'http://my.exotel.com/acme1/exoml/start_voice/99001');
  });

  test('in stream mode the "document" is the per-call wss URL', () => {
    configure();
    const streamUrl = p.mediaStreamUrl({ baseWsUrl: 'wss://api.example.in/', workspaceId: 'ws1', agentId: 'ag1' });
    assert.equal(streamUrl, 'wss://api.example.in/api/v1/exotel-media/ws1/ag1?sample-rate=24000');
    assert.equal(
      p.buildConversationDoc({ streamUrl, callLogId: 'log1' }),
      'wss://api.example.in/api/v1/exotel-media/ws1/ag1?sample-rate=24000&callLogId=log1',
      'the call log id must ride on the URL — it is the only channel that cannot be dropped',
    );
  });

  test('stream mode refuses to build a document with no public ws origin', () => {
    // Returning the flow URL here would dial a lead into a stranger's flow.
    configure();
    assert.throws(() => p.buildConversationDoc({ streamUrl: '', callLogId: 'l' }), /PUBLIC_BACKEND_WS_URL/);
  });

  test('greeting mode is refused loudly rather than playing the wrong flow', () => {
    configure();
    assert.equal(p.supportsGreetingMode, false);
    assert.throws(() => p.buildGreetingDoc({ greeting: 'hi', closingLine: '' }), /cannot speak per-call greeting text/);
  });
});

describe('exotel placeCall', () => {
  let realFetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });

  const capture = (response) => {
    let seen = null;
    globalThis.fetch = async (url, init) => { seen = { url, init }; return response; };
    return () => seen;
  };

  test('INVERTS from/to — From is the destination, CallerId is our number', async () => {
    // Exotel's "connect a customer to an app" dials `From` first. Passing our
    // own number as From (the Twilio habit) rings us, not the lead.
    configure();
    const seen = capture({
      ok: true, status: 200, text: async () => JSON.stringify({ Call: { Sid: 'exo-1' } }),
    });
    const out = await p.placeCall({
      credentials: p.credentials(),
      to: '+919812345678',
      from: '+918000000000',
      document: 'http://my.exotel.com/acme1/exoml/start_voice/99001',
      context: { workspaceId: 'ws1', agentId: 'ag1', callLogId: 'log1' },
    });

    assert.deepEqual(out, { ok: true, callId: 'exo-1' });
    const { url, init } = seen();
    assert.equal(url, 'https://api.in.exotel.com/v1/Accounts/acme1/Calls/connect.json');
    assert.equal(init.body.get('From'), '+919812345678', 'From must be the DESTINATION');
    assert.equal(init.body.get('CallerId'), '+918000000000', 'CallerId must be our ExoPhone');
    assert.equal(init.body.get('To'), null, 'To is not used in the connect-to-app flow');
    assert.equal(init.headers.Authorization, `Basic ${Buffer.from('key:token').toString('base64')}`);
  });

  test('carries workspace/agent/log ids through CustomField', async () => {
    // The only per-call channel Exotel offers; without it the media bridge
    // cannot tell which agent the audio belongs to.
    configure();
    const seen = capture({ ok: true, status: 200, text: async () => '{"Call":{"Sid":"s"}}' });
    await p.placeCall({
      credentials: p.credentials(),
      to: '+911', from: '+912', document: 'flow',
      context: { workspaceId: 'ws1', agentId: 'ag1', callLogId: 'log1' },
    });
    assert.deepEqual(JSON.parse(seen().init.body.get('CustomField')), {
      workspaceId: 'ws1', agentId: 'ag1', callLogId: 'log1',
    });
  });

  test('omits StatusCallback only when there is nothing to derive it from', async () => {
    configure();
    delete process.env.PUBLIC_BACKEND_WS_URL;
    const seen = capture({ ok: true, status: 200, text: async () => '{"Call":{"Sid":"s"}}' });
    await p.placeCall({ credentials: p.credentials(), to: '+911', from: '+912', document: 'f' });
    assert.equal(seen().init.body.get('StatusCallback'), null);
  });

  test('an explicit StatusCallback is sent verbatim', async () => {
    // The deployment whose public hostname is not its websocket hostname.
    configure({ EXOTEL_STATUS_CALLBACK: 'https://cb.example/exotel' });
    process.env.PUBLIC_BACKEND_WS_URL = 'wss://voice.example.in';
    const seen = capture({ ok: true, status: 200, text: async () => '{"Call":{"Sid":"s"}}' });
    await p.placeCall({ credentials: p.credentials(), to: '+911', from: '+912', document: 'f' });
    assert.equal(seen().init.body.get('StatusCallback'), 'https://cb.example/exotel');
  });

  test('derives StatusCallback from the ws origin when unset', async () => {
    // It can only ever be <that host>/api/v1/exotel/status, and a URL nobody
    // has to retype is a URL nobody mistypes — the failure is silent otherwise
    // (calls simply never close out).
    configure();
    process.env.PUBLIC_BACKEND_WS_URL = 'wss://voice.example.in/';
    let seen = capture({ ok: true, status: 200, text: async () => '{"Call":{"Sid":"s"}}' });
    await p.placeCall({ credentials: p.credentials(), to: '+911', from: '+912', document: 'f' });
    assert.equal(
      seen().init.body.get('StatusCallback'),
      'https://voice.example.in/api/v1/exotel/status',
    );

    // The shared secret has to travel with it, or the endpoint 403s its own carrier.
    process.env.EXOTEL_WEBHOOK_TOKEN = 's3cret/1';
    seen = capture({ ok: true, status: 200, text: async () => '{"Call":{"Sid":"s"}}' });
    await p.placeCall({ credentials: p.credentials(), to: '+911', from: '+912', document: 'f' });
    assert.equal(
      seen().init.body.get('StatusCallback'),
      'https://voice.example.in/api/v1/exotel/status?token=s3cret%2F1',
    );
  });

  test('surfaces the Exotel RestException message', async () => {
    configure();
    capture({
      ok: false, status: 400,
      text: async () => JSON.stringify({ RestException: { Message: 'Invalid CallerId' } }),
    });
    const out = await p.placeCall({ credentials: p.credentials(), to: '+911', from: '+912', document: 'f' });
    assert.equal(out.ok, false);
    assert.equal(out.status, 502);
    assert.match(out.error, /Invalid CallerId/);
  });

  test('explains a 429 as the documented 200 calls/minute limit', async () => {
    // The campaign runner will hit this long before anything else goes wrong.
    configure();
    capture({ ok: false, status: 429, text: async () => '{}' });
    const out = await p.placeCall({ credentials: p.credentials(), to: '+911', from: '+912', document: 'f' });
    assert.match(out.error, /200 calls\/minute/);
  });

  test('a non-JSON error body does not throw', async () => {
    configure();
    capture({ ok: false, status: 502, text: async () => '<html>bad gateway' });
    const out = await p.placeCall({ credentials: p.credentials(), to: '+911', from: '+912', document: 'f' });
    assert.equal(out.ok, false);
    assert.match(out.error, /502/);
  });

  test('stream mode sends StreamUrl + StreamType, and no flow parameters', async () => {
    configure();
    const seen = capture({ ok: true, status: 200, text: async () => '{"Call":{"Sid":"s"}}' });
    await p.placeCall({
      credentials: p.credentials(),
      to: '+919812345678',
      from: '+918000000000',
      document: 'wss://api.example.in/api/v1/exotel-media/ws1/ag1?sample-rate=24000&callLogId=l1',
    });
    const body = seen().init.body;
    assert.equal(body.get('StreamType'), 'bidirectional');
    assert.match(body.get('StreamUrl'), /^wss:\/\/api\.example\.in\//);
    assert.equal(body.get('Url'), null, 'a flow URL must not be sent in stream mode');
    // Connect Voice AI does not document CallType, and Exotel rejects
    // parameters it does not expect.
    assert.equal(body.get('CallType'), null);
    // Still inverted, exactly as in app mode.
    assert.equal(body.get('From'), '+919812345678');
    assert.equal(body.get('CallerId'), '+918000000000');
  });

  test('app mode sends Url + CallType, and no stream parameters', async () => {
    configure({ EXOTEL_DIAL_MODE: 'app' });
    const seen = capture({ ok: true, status: 200, text: async () => '{"Call":{"Sid":"s"}}' });
    await p.placeCall({
      credentials: p.credentials(), to: '+911', from: '+912',
      document: 'http://my.exotel.com/acme1/exoml/start_voice/99001',
    });
    const body = seen().init.body;
    assert.equal(body.get('Url'), 'http://my.exotel.com/acme1/exoml/start_voice/99001');
    assert.equal(body.get('CallType'), 'trans');
    assert.equal(body.get('StreamUrl'), null);
    assert.equal(body.get('StreamType'), null);
  });

  test('refuses a StreamUrl over Exotel\'s 600-character limit before dialling', async () => {
    // Exotel rejects it anyway; failing here costs no carrier leg and says why.
    configure();
    let called = false;
    globalThis.fetch = async () => { called = true; return { ok: true, status: 200, text: async () => '{}' }; };
    const out = await p.placeCall({
      credentials: p.credentials(), to: '+911', from: '+912',
      document: `wss://x.example/${'a'.repeat(600)}`,
    });
    assert.equal(out.ok, false);
    assert.equal(called, false, 'no call may be placed');
    assert.match(out.error, /600/);
  });

  test('names Connect Voice AI when a first stream-mode call is rejected', async () => {
    // It is off by default on an Exotel account and the rejection looks like an
    // ordinary bad-parameter error, which sends people hunting the wrong bug.
    configure();
    capture({ ok: false, status: 400, text: async () => '{}' });
    const out = await p.placeCall({ credentials: p.credentials(), to: '+911', from: '+912', document: 'wss://x/y' });
    assert.match(out.error, /Connect Voice AI/);

    // App mode has no such feature flag, so the hint would be a red herring.
    configure({ EXOTEL_DIAL_MODE: 'app' });
    capture({ ok: false, status: 400, text: async () => '{}' });
    const appOut = await p.placeCall({ credentials: p.credentials(), to: '+911', from: '+912', document: 'f' });
    assert.doesNotMatch(appOut.error, /Connect Voice AI/);
  });

  test('sends TimeLimit only when configured', async () => {
    configure();
    let seen = capture({ ok: true, status: 200, text: async () => '{"Call":{"Sid":"s"}}' });
    await p.placeCall({ credentials: p.credentials(), to: '+911', from: '+912', document: 'wss://x/y' });
    assert.equal(seen().init.body.get('TimeLimit'), null);

    configure({ EXOTEL_TIME_LIMIT_SEC: '900' });
    seen = capture({ ok: true, status: 200, text: async () => '{"Call":{"Sid":"s"}}' });
    await p.placeCall({ credentials: p.credentials(), to: '+911', from: '+912', document: 'wss://x/y' });
    assert.equal(seen().init.body.get('TimeLimit'), '900');
  });
});
