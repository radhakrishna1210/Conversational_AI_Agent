// The public /integrations/webhooks/:provider receiver. What these pin:
//
//  1. Only a request whose signature was verified is accepted. A provider with no
//     verification configured is refused — it used to be accepted for any
//     workspace named in the body, and could set that workspace syncing.
//  2. A malformed Slack signature is a 401, not a thrown 500.
//  3. The event row records what was verified, not a hardcoded `true`, and an
//     unverified event never queues a sync.
//
// Lives under services/ because `npm test` only globs services/**/__tests__.

import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { default: prisma } = await import('../../config/prisma.js');
const { verifyProviderWebhook } = await import('../../routes/integrationsPublic.routes.js');
const { handleWebhookEvent } = await import('../integrations.service.js');

const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

const body = Buffer.from(JSON.stringify({ workspaceId: 'ws_victim', event: 'invitee.created' }));

describe('verifyProviderWebhook', () => {
  test('a provider with no verification configured is refused', () => {
    for (const provider of ['hubspot', 'salesforce', 'custom_api', 'calendly', 'slack']) {
      const v = verifyProviderWebhook(provider, {}, body, {});
      assert.equal(v.ok, false, provider);
      assert.equal(v.status, 401);
    }
  });

  test('a correctly signed Calendly event passes; a tampered one does not', () => {
    const secret = 'cal_secret';
    const sig = createHmac('sha256', secret).update(`1700000000.${body.toString()}`).digest('hex');
    const headers = { 'calendly-webhook-signature': `t=1700000000,v1=${sig}` };
    assert.equal(verifyProviderWebhook('calendly', headers, body, { calendly: secret }).ok, true);
    const tampered = Buffer.from(body.toString().replace('ws_victim', 'ws_other'));
    assert.equal(verifyProviderWebhook('calendly', headers, tampered, { calendly: secret }).ok, false);
    assert.equal(verifyProviderWebhook('calendly', {}, body, { calendly: secret }).status, 401);
  });

  test('a correctly signed Slack event passes; a short signature is a 401, not a throw', () => {
    const secret = 'slack_secret';
    const ts = '1700000000';
    const sig = 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${body.toString()}`).digest('hex');
    assert.equal(verifyProviderWebhook('slack', { 'x-slack-signature': sig, 'x-slack-request-timestamp': ts }, body, { slack: secret }).ok, true);
    const short = verifyProviderWebhook('slack', { 'x-slack-signature': 'v0=abc', 'x-slack-request-timestamp': ts }, body, { slack: secret });
    assert.deepEqual([short.ok, short.status], [false, 401]);
  });
});

describe('handleWebhookEvent', () => {
  const wire = () => {
    const seen = { events: [], syncs: 0 };
    stub(prisma.webhookEvent, 'create', async ({ data }) => { seen.events.push(data); return { id: 'evt_1', ...data }; });
    stub(prisma.integrationLog, 'create', async ({ data }) => data);
    stub(prisma.integration, 'findUnique', async () => ({ id: 'int_1' }));
    stub(prisma.syncJob, 'create', async ({ data }) => { seen.syncs += 1; return { id: 'job_1', ...data }; });
    return seen;
  };

  test('an unverified event is recorded as unverified and queues no sync', async () => {
    const seen = wire();
    await handleWebhookEvent('calendly', {}, body);
    assert.equal(seen.events[0].signatureValid, false);
    assert.equal(seen.syncs, 0);
  });

  test('a verified event is recorded as verified and may queue a sync', async () => {
    const seen = wire();
    await handleWebhookEvent('calendly', {}, body, { signatureValid: true });
    assert.equal(seen.events[0].signatureValid, true);
    assert.equal(seen.syncs, 1);
  });
});
