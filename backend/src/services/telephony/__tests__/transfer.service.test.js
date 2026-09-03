// What these pin: transfer configuration is validated and defaulted; a call is
// only ever declared transferable when a real handover can happen (number,
// carrier, channel, hours); the carrier documents and REST bodies are exactly
// what Twilio and Plivo accept; every <Dial> outcome maps to one vocabulary;
// callback URLs are signed; and each failure path is honest.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  e164, resolveTransferConfig, isWithinTransferHours, transferAvailability,
  signTransferToken, verifyTransferToken, transferCallbackUrl, buildDialDocument,
  buildResumeDocument, buildHangupDocument, parseDialOutcome, failureLineFor, transferLiveCall,
  registerPendingTransfer, takePendingTransfer, peekPendingTransfer, __resetPendingForTests,
} from '../transfer.service.js';

const ENV = ['PUBLIC_BACKEND_WS_URL', 'PUBLIC_BACKEND_HTTP_URL', 'PLIVO_ANSWER_URL', 'JWT_ACCESS_SECRET', 'TRANSFER_CALLBACK_SECRET',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'PLIVO_AUTH_ID', 'PLIVO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'PLIVO_FROM_NUMBER'];
const saved = {};
beforeEach(() => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.JWT_ACCESS_SECRET = 'test-secret';
  process.env.PUBLIC_BACKEND_WS_URL = 'wss://example.test';
  __resetPendingForTests();
});
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('e164 / resolveTransferConfig', () => {
  test('numbers are normalised or rejected', () => {
    assert.equal(e164('+91 98765 43210'), '+919876543210');
    assert.equal(e164('00919876543210'), '+919876543210');
    assert.equal(e164('919876543210'), '+919876543210');
    assert.equal(e164('(415) 555-0100'), null, 'no country code, too short for E.164 without one');
    assert.equal(e164('+1 415 555 0100'), '+14155550100');
    assert.equal(e164('abc'), null);
    assert.equal(e164(''), null);
  });
  test('defaults and clamps', () => {
    const c = resolveTransferConfig({ transferNumber: '+919876543210', transferTimeoutSec: 500, transferMode: 'nonsense', transferOutOfHours: 'x' });
    assert.equal(c.enabled, true);
    assert.equal(c.timeoutSec, 60);
    assert.equal(c.mode, 'announce');
    assert.equal(c.outOfHours, 'callback');
    assert.equal(c.hours, null);
    assert.equal(c.targetLabel, 'a team member');
    assert.equal(resolveTransferConfig({}).enabled, false);
    assert.equal(resolveTransferConfig({ transferNumber: 'front desk' }).enabled, false);
    const h = resolveTransferConfig({ transferNumber: '+919876543210', transferHours: { enabled: true, start: '10:00', end: '17:30', days: [1, 2, 3], timezone: 'Asia/Kolkata' }, transferLabel: 'Dr. Rao' });
    assert.deepEqual(h.hours, { start: '10:00', end: '17:30', days: [1, 2, 3], timezone: 'Asia/Kolkata' });
    assert.equal(h.targetLabel, 'Dr. Rao');
  });
});

describe('transfer hours and availability', () => {
  const cfg = resolveTransferConfig({ transferNumber: '+919876543210', transferHours: { enabled: true, start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5], timezone: 'UTC' } });
  test('inside / outside / weekend / overnight', () => {
    assert.equal(isWithinTransferHours(cfg, new Date('2026-09-02T10:00:00Z')), true);   // Wed 10:00
    assert.equal(isWithinTransferHours(cfg, new Date('2026-09-02T18:00:00Z')), false);  // end is exclusive
    assert.equal(isWithinTransferHours(cfg, new Date('2026-09-06T10:00:00Z')), false);  // Sun
    const night = resolveTransferConfig({ transferNumber: '+919876543210', transferHours: { enabled: true, start: '22:00', end: '06:00', days: [0, 1, 2, 3, 4, 5, 6], timezone: 'UTC' } });
    assert.equal(isWithinTransferHours(night, new Date('2026-09-02T23:30:00Z')), true);
    assert.equal(isWithinTransferHours(night, new Date('2026-09-02T12:00:00Z')), false);
    assert.equal(isWithinTransferHours(resolveTransferConfig({ transferNumber: '+919876543210' })), true, 'no hours = always');
  });
  test('availability is false without a number, on web, on PIOPIY, and out of hours unless attempting', () => {
    const settings = { transferNumber: '+919876543210' };
    assert.equal(transferAvailability({ carrierId: 'TWILIO', settings }).available, true);
    assert.equal(transferAvailability({ carrierId: 'PLIVO', settings }).available, true);
    assert.equal(transferAvailability({ carrierId: 'PIOPIY', settings }).available, false);
    assert.equal(transferAvailability({ carrierId: 'TWILIO', settings, channel: 'web' }).available, false);
    assert.equal(transferAvailability({ carrierId: 'TWILIO', settings: {} }).available, false);
    const ooh = { ...settings, transferHours: { enabled: true, start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5], timezone: 'UTC' } };
    const sunday = new Date('2026-09-06T10:00:00Z');
    const r = transferAvailability({ carrierId: 'TWILIO', settings: ooh, now: sunday });
    assert.equal(r.available, false);
    assert.equal(r.outOfHours, true);
    const attempt = transferAvailability({ carrierId: 'TWILIO', settings: { ...ooh, transferOutOfHours: 'attempt' }, now: sunday });
    assert.equal(attempt.available, true);
    assert.equal(attempt.outOfHours, true);
  });
});

describe('callback signing and URLs', () => {
  test('tokens verify only for their own call log', () => {
    const t = signTransferToken('log_1');
    assert.equal(t.length, 32);
    assert.equal(verifyTransferToken('log_1', t), true);
    assert.equal(verifyTransferToken('log_2', t), false);
    assert.equal(verifyTransferToken('log_1', ''), false);
  });
  test('callback URL is HTTP, carries identity and a token, and is null without a public base', () => {
    const u = new URL(transferCallbackUrl({ carrierId: 'TWILIO', callLogId: 'log_1', workspaceId: 'ws', agentId: 'ag' }));
    assert.equal(u.origin, 'https://example.test');
    assert.equal(u.pathname, '/api/v1/telephony/transfer/twilio/dial');
    assert.equal(u.searchParams.get('callLogId'), 'log_1');
    assert.equal(verifyTransferToken('log_1', u.searchParams.get('t')), true);
    delete process.env.PUBLIC_BACKEND_WS_URL;
    assert.equal(transferCallbackUrl({ carrierId: 'PLIVO', callLogId: 'x', workspaceId: 'w', agentId: 'a' }), null);
  });
});

describe('documents', () => {
  test('Twilio <Dial> with action, timeout, callerId', () => {
    const d = buildDialDocument('TWILIO', { number: '+91 98765 43210', callerId: '+14155550100', timeoutSec: 20, actionUrl: 'https://x.test/cb?a=1&b=2' });
    assert.equal(d, '<Response><Dial timeout="20" callerId="+14155550100" action="https://x.test/cb?a=1&amp;b=2" method="POST"><Number>+919876543210</Number></Dial></Response>');
  });
  test('Plivo <Dial> redirects to the action document; timeout is clamped', () => {
    const d = buildDialDocument('PLIVO', { number: '+919876543210', timeoutSec: 1, actionUrl: 'https://x.test/cb' });
    assert.ok(d.startsWith('<?xml'));
    assert.ok(d.includes('<Dial timeout="5" action="https://x.test/cb" method="POST" redirect="true">'));
    assert.ok(d.includes('<Number>+919876543210</Number>'));
    assert.throws(() => buildDialDocument('TWILIO', { number: 'nope', actionUrl: 'https://x' }), /E\.164/);
    assert.throws(() => buildDialDocument('PIOPIY', { number: '+919876543210', actionUrl: 'https://x' }), /no transfer document/);
  });
  test('resume documents reconnect the modular stream and carry the outcome', () => {
    const t = buildResumeDocument('TWILIO', { baseWsUrl: 'wss://example.test', workspaceId: 'ws', agentId: 'ag', callLogId: 'log_1', outcome: 'no-answer', direction: 'INBOUND' });
    assert.ok(t.includes('<Connect><Stream url="wss://example.test/api/v1/twilio-media/ws/ag?direction=inbound&amp;engine=modular">'));
    assert.ok(t.includes('<Parameter name="transferOutcome" value="no-answer" />'));
    const p = buildResumeDocument('PLIVO', { baseWsUrl: 'wss://example.test', workspaceId: 'ws', agentId: 'ag', callLogId: 'log_1', outcome: 'busy' });
    assert.ok(p.includes('<Stream bidirectional="true"'));
    assert.ok(p.includes('callLogId=log_1'));
    assert.ok(p.includes('transferOutcome=busy'));
    assert.equal(buildHangupDocument('TWILIO'), '<Response><Hangup/></Response>');
    assert.ok(buildHangupDocument('PLIVO').includes('<Hangup/>'));
  });
});

describe('parseDialOutcome / failureLineFor', () => {
  test('both carriers map to one vocabulary', () => {
    assert.deepEqual(parseDialOutcome('TWILIO', { DialCallStatus: 'completed', DialCallDuration: '42' }), { outcome: 'completed', durationSec: 42, raw: 'completed' });
    assert.equal(parseDialOutcome('TWILIO', { DialCallStatus: 'no-answer' }).outcome, 'no-answer');
    assert.equal(parseDialOutcome('TWILIO', { DialCallStatus: 'busy' }).outcome, 'busy');
    assert.equal(parseDialOutcome('TWILIO', { DialCallStatus: 'failed' }).outcome, 'failed');
    assert.equal(parseDialOutcome('TWILIO', { DialCallStatus: 'canceled' }).outcome, 'canceled');
    assert.equal(parseDialOutcome('PLIVO', { DialStatus: 'timeout' }).outcome, 'no-answer');
    assert.equal(parseDialOutcome('PLIVO', { DialStatus: 'busy' }).outcome, 'busy');
    assert.deepEqual(parseDialOutcome('PLIVO', { DialStatus: 'completed', DialBLegDuration: '7' }), { outcome: 'completed', durationSec: 7, raw: 'completed' });
    assert.equal(parseDialOutcome('PLIVO', {}).outcome, 'unknown');
  });
  test('failure lines never claim success and offer an alternative', () => {
    for (const o of ['busy', 'no-answer', 'failed', 'unknown']) {
      const line = failureLineFor(o, { targetLabel: 'Dr. Rao' });
      assert.ok(/message|callback|call you back/i.test(line), line);
      assert.ok(!/connected you|transferred you/i.test(line));
    }
    assert.ok(failureLineFor('busy', { lang: 'hi' }).includes('व्यस्त'));
  });
});

describe('transferLiveCall', () => {
  const fakeFetch = (responses) => {
    const calls = [];
    const f = async (url, init = {}) => {
      calls.push({ url, init });
      const r = responses.shift() || { ok: true, status: 200, body: '{}' };
      return { ok: r.ok, status: r.status, json: async () => JSON.parse(r.body), text: async () => r.body };
    };
    return { f, calls };
  };
  const cfg = resolveTransferConfig({ transferNumber: '+919876543210', transferTimeoutSec: 20 });
  const base = { callLogId: 'log_1', workspaceId: 'ws', agentId: 'ag', config: cfg };

  test('refuses without a number, without a carrier call id, and on PIOPIY', async () => {
    assert.equal((await transferLiveCall({ ...base, carrierId: 'TWILIO', carrierCallId: 'CA1', config: resolveTransferConfig({}) })).ok, false);
    assert.equal((await transferLiveCall({ ...base, carrierId: 'TWILIO', carrierCallId: null })).ok, false);
    const p = await transferLiveCall({ ...base, carrierId: 'PIOPIY', carrierCallId: 'x' });
    assert.equal(p.ok, false); assert.equal(p.unsupported, true);
  });

  test('Twilio: looks up the call for a caller id, then updates the live call with <Dial> TwiML and a status callback', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxx'; process.env.TWILIO_AUTH_TOKEN = 'tok';
    const { f, calls } = fakeFetch([
      { ok: true, status: 200, body: JSON.stringify({ from: '+15550001111', to: '+14155550100', direction: 'inbound' }) },
      { ok: true, status: 200, body: '{}' },
    ]);
    const r = await transferLiveCall({ ...base, carrierId: 'TWILIO', carrierCallId: 'CA123', fetchImpl: f });
    assert.equal(r.ok, true, r.error);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.endsWith('/Calls/CA123.json'));
    const body = calls[1].init.body;
    assert.equal(calls[1].init.method, 'POST');
    const twiml = body.get('Twiml');
    assert.ok(twiml.includes('callerId="+14155550100"'), 'inbound: present the number the caller dialled');
    assert.ok(twiml.includes('<Number>+919876543210</Number>'));
    assert.ok(twiml.includes('timeout="20"'));
    assert.ok(body.get('StatusCallback').includes('/telephony/transfer/twilio/status'));
    assert.ok(twiml.includes('/telephony/transfer/twilio/dial'));
  });

  test('Twilio refusal is reported, not swallowed', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxx'; process.env.TWILIO_AUTH_TOKEN = 'tok';
    const { f } = fakeFetch([
      { ok: false, status: 400, body: JSON.stringify({ message: 'Call is not in-progress' }) },
    ]);
    const r = await transferLiveCall({ ...base, carrierId: 'TWILIO', carrierCallId: 'CA9', callerId: '+14155550100', fetchImpl: f });
    assert.equal(r.ok, false);
    assert.match(r.error, /Call is not in-progress/);
    assert.equal(r.httpStatus, 400);
  });

  test('Plivo: POSTs the transfer API with an aleg_url that serves the <Dial> XML', async () => {
    process.env.PLIVO_AUTH_ID = 'MAxxx'; process.env.PLIVO_AUTH_TOKEN = 'tok';
    const { f, calls } = fakeFetch([{ ok: true, status: 202, body: '{}' }]);
    const r = await transferLiveCall({ ...base, carrierId: 'PLIVO', carrierCallId: 'uuid-1', callerId: '+912212345678', fetchImpl: f });
    assert.equal(r.ok, true, r.error);
    assert.equal(calls.length, 1, 'caller id given, no lookup');
    assert.ok(calls[0].url.endsWith('/Account/MAxxx/Call/uuid-1/'));
    const j = JSON.parse(calls[0].init.body);
    assert.equal(j.legs, 'aleg');
    assert.ok(j.aleg_url.includes('/telephony/transfer/plivo/xml'));
    assert.ok(r.document.includes('callerId="+912212345678"'));
  });

  test('a network failure is an honest failure', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxx'; process.env.TWILIO_AUTH_TOKEN = 'tok';
    const f = async () => { throw new Error('ECONNRESET'); };
    const r = await transferLiveCall({ ...base, carrierId: 'TWILIO', carrierCallId: 'CA1', callerId: '+14155550100', fetchImpl: f });
    assert.equal(r.ok, false);
    assert.match(r.error, /ECONNRESET/);
  });

  test('pending registry is take-once', () => {
    registerPendingTransfer('log_1', { carrierId: 'TWILIO' });
    assert.equal(peekPendingTransfer('log_1').carrierId, 'TWILIO');
    assert.equal(takePendingTransfer('log_1').carrierId, 'TWILIO');
    assert.equal(takePendingTransfer('log_1'), null);
  });
});
