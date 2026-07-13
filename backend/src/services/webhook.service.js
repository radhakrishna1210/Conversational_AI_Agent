import { createHmac } from 'crypto';
import fetch from 'node-fetch';
import prisma from '../config/prisma.js';
import { generateSecureToken } from '../lib/hash.js';
import logger from '../lib/logger.js';
import { broadcast } from '../lib/sse.js';
import { SSE_EVENTS, WEBHOOK_EVENTS } from '../constants/events.js';
import { WEBHOOK_SECRET_BYTES, WEBHOOK_TEST_TIMEOUT_MS, WEBHOOK_DISPATCH_TIMEOUT_MS } from '../constants/limits.js';

export const getWebhookConfig = (workspaceId) =>
  prisma.webhookConfig.findUnique({ where: { workspaceId } });

export const upsertWebhookConfig = (workspaceId, { url, subscribedEvents }) => {
  const secret = generateSecureToken(WEBHOOK_SECRET_BYTES);
  return prisma.webhookConfig.upsert({
    where: { workspaceId },
    create: { workspaceId, url, subscribedEvents, secret },
    update: { url, subscribedEvents },
  });
};

export const testWebhookPing = async (workspaceId) => {
  const config = await prisma.webhookConfig.findUniqueOrThrow({ where: { workspaceId } });
  const payload = { event: 'ping', workspaceId, timestamp: Date.now() };
  const sig = signPayload(JSON.stringify(payload), config.secret);

  let status = 0;
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Signature-256': sig },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TEST_TIMEOUT_MS),
    });
    status = res.status;
  } catch (err) {
    logger.warn({ err }, 'Webhook test ping failed');
  }

  return prisma.webhookConfig.update({
    where: { workspaceId },
    data: { lastPingAt: new Date(), lastPingStatus: status },
  });
};

export const signPayload = (body, secret) =>
  'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

export const dispatchWebhookEvent = async (workspaceId, eventName, data) => {
  const config = await prisma.webhookConfig.findUnique({ where: { workspaceId } });
  if (!config?.isActive || !config.subscribedEvents.includes(eventName)) return;

  const payload = { event: eventName, workspaceId, data, timestamp: Date.now() };
  const body = JSON.stringify(payload);
  const sig = signPayload(body, config.secret);

  fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature-256': sig },
    body,
    signal: AbortSignal.timeout(WEBHOOK_DISPATCH_TIMEOUT_MS),
  }).catch((err) => logger.warn({ err, eventName }, 'Webhook dispatch failed'));
};

export const processMetaWebhook = async (body) => {
  const entries = body?.entry ?? [];
  for (const entry of entries) {
    const workspaceId = await resolveWorkspaceFromWabaId(entry.id);
    if (!workspaceId) continue;

    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      for (const msg of value.messages ?? []) {
        broadcast(workspaceId, SSE_EVENTS.NEW_MESSAGE, { message: msg });
        await dispatchWebhookEvent(workspaceId, WEBHOOK_EVENTS.MESSAGE_RECEIVED, msg);
      }

      for (const status of value.statuses ?? []) {
        const event =
          status.status === 'delivered' ? WEBHOOK_EVENTS.MESSAGE_DELIVERED
          : status.status === 'read' ? WEBHOOK_EVENTS.MESSAGE_READ
          : status.status === 'failed' ? WEBHOOK_EVENTS.MESSAGE_FAILED
          : null;
        if (event) await dispatchWebhookEvent(workspaceId, event, status);
      }
    }
  }
};

const resolveWorkspaceFromWabaId = async (wabaId) => {
  const workspace = await prisma.workspace.findFirst({ where: { metaWabaId: wabaId } });
  return workspace?.id ?? null;
};
