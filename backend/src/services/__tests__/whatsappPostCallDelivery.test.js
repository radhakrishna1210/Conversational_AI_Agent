// What these pin: the post-call WhatsApp branch, end to end through the real
// executePostCall and sendWhatsAppConfirmation, with the database and ChatFlow
// stubbed.
//
//  1. A confirmation whose "Send to" variable came back empty still reaches the
//     customer, on the number the call already had.
//  2. Every confirmation that is NOT sent leaves a FAILED row on the call — the
//     Recent Calls panel renders those — instead of vanishing. A call that simply
//     booked nothing is the one exception, and stays quiet.
//  3. A message that already reached Meta is never sent twice, including after
//     ChatFlow has moved it on to DELIVERED or READ.
//
// Lives under services/ rather than controllers/ because `npm test` only globs
// services/**/__tests__.

import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// These run the inline send, which is what happens without Redis. With REDIS_URL
// set, executePostCall hands the message to the BullMQ queue instead, so a shell
// that happens to export one (with no Redis listening) failed every send test.
// Cleared before the app modules load, because config/redis.js reads it on import.
delete process.env.REDIS_URL;
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { default: prisma } = await import('../../config/prisma.js');
const { encryptToken } = await import('../../lib/encryption.js');
const { executePostCall } = await import('../../controllers/platform.controller.js');
const { recordWhatsAppSendFailure, sendWhatsAppConfirmation } = await import('../whatsappPostCall.service.js');
const { withCallFacts } = await import('../postCallExtraction.utils.js');

// ── Stubbing ────────────────────────────────────────────────────────────────
// Prisma model delegates are proxies, so node:test's mock.method cannot see
// their methods; plain assignment does stick, and is restored after each test.
const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

const WA_CFG = Object.freeze({
  id: 'cfg_wa',
  deliveryMethod: 'whatsapp',
  whatsappBindingId: 'bind_1',
  triggerVariable: 'objective_completed',
  recipientVariable: 'customer_phone_number',
  variableMapping: [{ placeholderIndex: 1, variableKey: 'customer_name' }],
  triggerStatuses: [],
});

const APPROVED = { id: 'bind_1', status: 'APPROVED', chatflowName: 'booking_confirmed', language: 'en' };

/** The finished outbound hotel-booking call, as the call log holds it. */
const ROW = {
  id: 'call_1',
  phoneNumber: '+919876543210',
  fromNumber: '+918045678901',
  startedAt: new Date('2026-09-13T09:59:40.000Z'),
  endedAt: new Date('2026-09-13T10:04:12.000Z'),
  durationSec: 252,
};

const extracted = (pairs) => Object.entries(pairs).map(([key, value]) => ({
  key, description: key, configIds: ['cfg_wa'], value, evidence: null,
}));

/** Variables exactly as deliverPostCall hands them over: extracted, then call facts. */
const deliveredVariables = (pairs, row = ROW) => withCallFacts(extracted(pairs), row, { timeZone: 'Asia/Kolkata' });

const payloadFor = (variables, overrides = {}) => ({
  callId: 'call_1',
  callType: 'PHONE_CALL',
  outcome: 'Completed',
  durationSec: 252,
  phoneNumber: '+919876543210',
  variables,
  transcript: '',
  endedAt: '2026-09-13T10:04:12.000Z',
  ...overrides,
});

let db;
let chatflow;

/** Wire the stubs for one run. */
const world = ({ cfg = WA_CFG, binding = APPROVED } = {}) => {
  stub(prisma.agent, 'findFirst', async () => ({ id: 'agent_1', name: 'Hotel desk', settings: JSON.stringify({ postCallConfigs: [cfg] }) }));
  stub(prisma.whatsAppTemplateBinding, 'findFirst', async () => binding);
  stub(prisma.integration, 'findUnique', async () => ({ token: { accessTokenCipher: encryptToken('cf_test_key'), revokedAt: null } }));
  stub(prisma.whatsAppPostCallSend, 'create', async ({ data }) => { db.created.push(data); return { id: `send_${db.created.length}`, ...data }; });
  stub(prisma.whatsAppPostCallSend, 'update', async (args) => { db.updated.push(args); return {}; });
  stub(prisma.whatsAppPostCallSend, 'updateMany', async (args) => { db.updatedMany.push(args); return { count: 1 }; });
  stub(globalThis, 'fetch', async (url, init) => {
    chatflow.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.new' }] }), { status: 200 });
  });
};

beforeEach(() => {
  db = { created: [], updated: [], updatedMany: [] };
  chatflow = [];
});

const whatsappResult = (out) => out.results.find((r) => r.method === 'whatsapp');

describe('executePostCall — WhatsApp recipient', () => {
  test('the call that failed: an empty "Send to" variable falls back to the number the call already had', async () => {
    world();
    const variables = deliveredVariables({
      customer_name: 'Krishna',
      objective_completed: 'Booked a deluxe room for two nights',
      // "use the number you called me on" — no digits, so extraction left it empty.
      customer_phone_number: null,
    });

    const out = await executePostCall('agent_1', 'ws_1', payloadFor(variables));

    const r = whatsappResult(out);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.recipientSource, 'call');
    assert.equal(chatflow.length, 1, 'the message was actually sent');
    assert.equal(chatflow[0].body.to, '919876543210');
    assert.equal(db.created[0].recipient, '919876543210');
  });

  test('a number the customer gave on the call is used instead', async () => {
    world();
    const variables = deliveredVariables({ customer_name: 'Krishna', objective_completed: 'Booked', customer_phone_number: '98111 22233' });
    const out = await executePostCall('agent_1', 'ws_1', payloadFor(variables));
    assert.equal(whatsappResult(out).recipientSource, 'variable');
    assert.equal(chatflow[0].body.to, '9811122233');
  });

  test('the built-in customer_phone works as "Send to" on its own', async () => {
    world({ cfg: { ...WA_CFG, recipientVariable: 'customer_phone' } });
    const variables = deliveredVariables({ customer_name: 'Krishna', objective_completed: 'Booked' });
    const out = await executePostCall('agent_1', 'ws_1', payloadFor(variables, { phoneNumber: '' }));
    assert.equal(whatsappResult(out).ok, true, whatsappResult(out).error);
    assert.equal(chatflow[0].body.to, '919876543210');
  });
});

describe('executePostCall — a confirmation that is not sent is recorded on the call', () => {
  test('no number anywhere (a web call): FAILED row with the reason, nothing sent', async () => {
    world();
    const webRow = { ...ROW, phoneNumber: null };
    const variables = deliveredVariables({ customer_name: 'Krishna', objective_completed: 'Booked', customer_phone_number: null }, webRow);

    const out = await executePostCall('agent_1', 'ws_1', payloadFor(variables, { callType: 'WEB_CALL', phoneNumber: '' }));

    const r = whatsappResult(out);
    assert.equal(r.ok, false);
    assert.match(r.error, /No phone number to send to/);
    assert.equal(chatflow.length, 0);
    assert.equal(db.created.length, 1);
    assert.equal(db.created[0].status, 'FAILED');
    assert.equal(db.created[0].callLogId, 'call_1');
    assert.equal(db.created[0].postCallConfigId, 'cfg_wa');
    assert.match(db.created[0].lastError, /customer_phone_number/);
  });

  test('a template still awaiting Meta approval shows on the call', async () => {
    world({ binding: { ...APPROVED, status: 'PENDING' } });
    const variables = deliveredVariables({ customer_name: 'Krishna', objective_completed: 'Booked' });
    const out = await executePostCall('agent_1', 'ws_1', payloadFor(variables));
    assert.equal(whatsappResult(out).ok, false);
    assert.equal(db.created[0].status, 'FAILED');
    assert.match(db.created[0].lastError, /awaiting Meta approval/);
    assert.equal(chatflow.length, 0);
  });

  test('a placeholder with nothing captured shows on the call', async () => {
    world({ cfg: { ...WA_CFG, variableMapping: [{ placeholderIndex: 1, variableKey: 'room_type' }] } });
    const variables = deliveredVariables({ customer_name: 'Krishna', objective_completed: 'Booked', room_type: null });
    await executePostCall('agent_1', 'ws_1', payloadFor(variables));
    assert.equal(db.created[0].status, 'FAILED');
    assert.match(db.created[0].lastError, /Nothing was captured for \{\{1\}\} \(room_type\)/);
  });

  test('a built-in call fact is refused as the trigger — it would confirm every enquiry', async () => {
    world({ cfg: { ...WA_CFG, triggerVariable: 'customer_phone' } });
    const variables = deliveredVariables({ customer_name: 'Krishna' });
    const out = await executePostCall('agent_1', 'ws_1', payloadFor(variables));
    const r = whatsappResult(out);
    assert.equal(r.ok, false);
    assert.match(r.error, /filled in from the call itself/);
    assert.equal(chatflow.length, 0);
    assert.equal(db.created[0].status, 'FAILED');
  });

  test('the agent\'s OWN variable under a call-fact key, filled from the call, does not fire the trigger', async () => {
    // The agent defines customer_phone itself, so it is not `builtin`; the customer
    // never said a number, so the call record filled it in. That is every phone call.
    world({ cfg: { ...WA_CFG, triggerVariable: 'customer_phone' } });
    const variables = deliveredVariables({ customer_name: 'Krishna', customer_phone: null });
    const trigger = variables.find((v) => v.key === 'customer_phone');
    assert.equal(trigger.builtin, undefined, 'precondition: the agent defined it');
    assert.equal(trigger.source, 'call', 'precondition: filled from the call record');

    const out = await executePostCall('agent_1', 'ws_1', payloadFor(variables));

    const r = whatsappResult(out);
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
    assert.equal(chatflow.length, 0, 'no confirmation for a booking nobody made');
    assert.equal(db.created.length, 0, 'quiet, like any call that captured nothing');
  });

  test('…but when the customer did say a number into that variable, it counts', async () => {
    world({ cfg: { ...WA_CFG, triggerVariable: 'customer_phone' } });
    const variables = deliveredVariables({ customer_name: 'Krishna', customer_phone: '98111 22233' });
    const out = await executePostCall('agent_1', 'ws_1', payloadFor(variables));
    assert.equal(whatsappResult(out).ok, true, whatsappResult(out).error);
    assert.equal(chatflow.length, 1);
  });

  test('a call that booked nothing is skipped QUIETLY — no failure row for an ordinary enquiry', async () => {
    world();
    const variables = deliveredVariables({ customer_name: 'Krishna', objective_completed: null });
    const out = await executePostCall('agent_1', 'ws_1', payloadFor(variables));
    const r = whatsappResult(out);
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
    assert.equal(db.created.length, 0);
    assert.equal(chatflow.length, 0);
  });

  test('"Test delivery" has no call, so a refusal records nothing', async () => {
    world();
    const variables = extracted({ customer_name: '(sample)', objective_completed: '(sample)', customer_phone_number: '(sample)' });
    const out = await executePostCall('agent_1', 'ws_1', payloadFor(variables, { callId: undefined, phoneNumber: undefined, outcome: 'test' }));
    assert.equal(whatsappResult(out).ok, false);
    assert.equal(db.created.length, 0);
  });
});

describe('recordWhatsAppSendFailure', () => {
  test('an existing row is updated, but never one that already reached Meta', async () => {
    stub(prisma.whatsAppPostCallSend, 'create', async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); });
    stub(prisma.whatsAppPostCallSend, 'updateMany', async (args) => { db.updatedMany.push(args); return { count: 1 }; });

    await recordWhatsAppSendFailure('ws_1', { callLogId: 'call_1', postCallConfigId: 'cfg_wa', reason: 'Template paused' });

    assert.equal(db.updatedMany.length, 1);
    const { where, data } = db.updatedMany[0];
    assert.deepEqual([...where.status.notIn].sort(), ['DELIVERED', 'READ', 'SENT']);
    assert.equal(data.status, 'FAILED');
    assert.equal(data.lastError, 'Template paused');
  });

  test('never throws — it is bookkeeping for a failure already being handled', async () => {
    stub(prisma.whatsAppPostCallSend, 'create', async () => { throw new Error('connection reset'); });
    stub(prisma.whatsAppPostCallSend, 'updateMany', async (args) => { db.updatedMany.push(args); return { count: 0 }; });
    await assert.doesNotReject(recordWhatsAppSendFailure('ws_1', { callLogId: 'call_1', postCallConfigId: 'cfg_wa', reason: 'x' }));
    assert.equal(db.updatedMany.length, 0, 'an unexpected error is not mistaken for "row exists"');
  });

  test('does nothing without a call to attach to', async () => {
    stub(prisma.whatsAppPostCallSend, 'create', async ({ data }) => { db.created.push(data); return data; });
    await recordWhatsAppSendFailure('ws_1', { callLogId: undefined, postCallConfigId: 'cfg_wa', reason: 'x' });
    assert.equal(db.created.length, 0);
  });
});

describe('sendWhatsAppConfirmation — duplicate guard', () => {
  for (const status of ['SENT', 'DELIVERED', 'READ']) {
    test(`a replay after the message is ${status} does not send a second copy`, async () => {
      stub(prisma.whatsAppPostCallSend, 'create', async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); });
      stub(prisma.whatsAppPostCallSend, 'findUnique', async () => ({ id: 'send_1', status, chatflowMessageId: 'wamid.old' }));
      stub(globalThis, 'fetch', async () => { chatflow.push('called'); throw new Error('must not be called'); });

      const out = await sendWhatsAppConfirmation('ws_1', {
        to: '919876543210', templateName: 'booking_confirmed', variables: ['Krishna'], callLogId: 'call_1', postCallConfigId: 'cfg_wa',
      });

      assert.deepEqual(out, { sent: false, duplicate: true, messageId: 'wamid.old' });
      assert.equal(chatflow.length, 0);
    });
  }

  test('a row Meta could not deliver (FAILED) IS retried', async () => {
    world();
    stub(prisma.whatsAppPostCallSend, 'create', async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); });
    stub(prisma.whatsAppPostCallSend, 'findUnique', async () => ({ id: 'send_1', status: 'FAILED', chatflowMessageId: null }));

    const out = await sendWhatsAppConfirmation('ws_1', {
      to: '919876543210', templateName: 'booking_confirmed', variables: ['Krishna'], callLogId: 'call_1', postCallConfigId: 'cfg_wa',
    });

    assert.equal(out.sent, true);
    assert.equal(chatflow.length, 1);
    assert.equal(db.updated[0].data.recipient, '919876543210', 'the retried row gains the number it was sent to');
  });

  test('no usable number records a FAILED row before refusing', async () => {
    stub(prisma.whatsAppPostCallSend, 'create', async ({ data }) => { db.created.push(data); return data; });
    await assert.rejects(
      sendWhatsAppConfirmation('ws_1', { to: '', templateName: 't', callLogId: 'call_1', postCallConfigId: 'cfg_wa' }),
      (err) => err.statusCode === 400,
    );
    assert.equal(db.created[0].status, 'FAILED');
  });
});
