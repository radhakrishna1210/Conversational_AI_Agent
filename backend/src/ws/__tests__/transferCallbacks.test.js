// What these pin, at the HTTP boundary a carrier actually hits: a forged
// callback is refused; a successful <Dial> ends the call with <Hangup/> and
// settles it; every failed <Dial> outcome answers with a document that brings
// the caller BACK to the agent carrying the outcome; and Plivo's A-leg XML is
// served from the pending registry. The database is a stub — this is about the
// documents and the decisions, not Prisma.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret';
process.env.PUBLIC_BACKEND_WS_URL = 'wss://example.test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:1/stub';

const { default: express } = await import('express');
const prismaMod = await import('../../config/prisma.js');
const { signTransferToken, registerPendingTransfer, __resetPendingForTests } = await import('../../services/telephony/transfer.service.js');
const { default: transferRoutes } = await import('../../routes/transfer.routes.js');

// Stub the two Prisma models the controller touches.
const prisma = prismaMod.default;
const calls = { transferUpdates: [], logLookups: [] };
const origCallTransfer = prisma.callTransfer;
const origAgentCallLog = prisma.agentCallLog;
let logRow = { status: 'IN_PROGRESS', startedAt: new Date(Date.now() - 60_000), transcript: '[]', workspaceId: 'ws', agentId: 'ag' };

const app = express();
app.use('/api/v1/telephony/transfer', transferRoutes);
let server; let base;

beforeEach(async () => {
  __resetPendingForTests();
  calls.transferUpdates = []; calls.logLookups = [];
  prisma.callTransfer = {
    findFirst: async () => ({ id: 'ct_1' }),
    update: async ({ data }) => { calls.transferUpdates.push(data); return { id: 'ct_1', ...data }; },
  };
  prisma.agentCallLog = {
    findUnique: async () => { calls.logLookups.push(1); return logRow; },
    update: async () => logRow,
    updateMany: async () => ({ count: 0 }),
    findFirst: async () => null,
  };
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/api/v1/telephony/transfer`;
});
afterEach(async () => {
  prisma.callTransfer = origCallTransfer;
  prisma.agentCallLog = origAgentCallLog;
  await new Promise((r) => server.close(r));
});

const post = async (path, form) => {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
  return { status: r.status, text: await r.text() };
};
const q = (callLogId, extra = '') => `?callLogId=${callLogId}&workspaceId=ws&agentId=ag&t=${signTransferToken(callLogId)}${extra}`;

describe('transfer callbacks', () => {
  test('a bad token is refused with a hangup document and touches nothing', async () => {
    const r = await post(`/twilio/dial?callLogId=log_1&workspaceId=ws&agentId=ag&t=nope`, { DialCallStatus: 'completed' });
    assert.equal(r.status, 403);
    assert.ok(r.text.includes('<Hangup/>'));
    assert.equal(calls.transferUpdates.length, 0);
  });

  test('Twilio: a completed dial hangs up and marks the transfer CONNECTED with the human leg duration', async () => {
    registerPendingTransfer('log_1', { number: '+919876543210', direction: 'INBOUND' });
    const r = await post(`/twilio/dial${q('log_1')}`, { DialCallStatus: 'completed', DialCallDuration: '95' });
    assert.equal(r.status, 200);
    assert.equal(r.text, '<Response><Hangup/></Response>');
    const upd = calls.transferUpdates.find((u) => u.status === 'CONNECTED');
    assert.ok(upd);
    assert.equal(upd.humanLegSec, 95);
  });

  for (const [raw, status] of [['no-answer', 'NO_ANSWER'], ['busy', 'BUSY'], ['failed', 'FAILED'], ['canceled', 'CANCELED']]) {
    test(`Twilio: ${raw} brings the caller back to the agent with the outcome`, async () => {
      registerPendingTransfer('log_2', { number: '+919876543210', direction: 'INBOUND' });
      const r = await post(`/twilio/dial${q('log_2')}`, { DialCallStatus: raw });
      assert.equal(r.status, 200);
      assert.ok(r.text.includes('<Connect><Stream url="wss://example.test/api/v1/twilio-media/ws/ag?direction=inbound&amp;engine=modular">'), r.text);
      assert.ok(r.text.includes(`<Parameter name="transferOutcome" value="${raw}" />`));
      assert.ok(r.text.includes('<Parameter name="callLogId" value="log_2" />'));
      assert.ok(calls.transferUpdates.some((u) => u.status === status));
    });
  }

  test('Plivo: the A-leg XML is served from the pending registry, and a timeout resumes the agent', async () => {
    registerPendingTransfer('log_3', { number: '+919876543210', callerId: '+912212345678', timeoutSec: 20, direction: null });
    const x = await post(`/plivo/xml${q('log_3')}`, {});
    assert.equal(x.status, 200);
    assert.ok(x.text.includes('<Dial timeout="20" callerId="+912212345678"'), x.text);
    assert.ok(x.text.includes('<Number>+919876543210</Number>'));
    assert.ok(x.text.includes('/telephony/transfer/plivo/dial'));
    assert.ok(calls.transferUpdates.some((u) => u.status === 'DIALING'));
    const d = await post(`/plivo/dial${q('log_3')}`, { DialStatus: 'timeout' });
    assert.ok(d.text.includes('<Stream bidirectional="true"'), d.text);
    assert.ok(d.text.includes('transferOutcome=no-answer'));
    assert.ok(d.text.includes('callLogId=log_3'));
  });

  test('Plivo: XML for a call with no pending transfer hangs up rather than dialling anything', async () => {
    const x = await post(`/plivo/xml${q('log_9')}`, {});
    assert.ok(x.text.includes('<Hangup/>'));
    assert.ok(!x.text.includes('<Dial'));
  });

  test('a completed dial on a call log that is already settled finalises nothing twice', async () => {
    logRow = { ...logRow, status: 'COMPLETED' };
    registerPendingTransfer('log_4', { number: '+919876543210' });
    const r = await post(`/twilio/dial${q('log_4')}`, { DialCallStatus: 'completed', DialCallDuration: '10' });
    assert.equal(r.text, '<Response><Hangup/></Response>');
    logRow = { ...logRow, status: 'IN_PROGRESS' };
  });
});
