import * as webhookService from '../services/webhook.service.js';
import { env } from '../config/env.js';

// Meta webhook verification challenge (GET)
export const metaVerify = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.status(403).json({ error: 'Verification failed' });
};

// Meta inbound webhook (POST)
export const metaReceive = async (req, res) => {
  // Respond immediately to Meta (200 within 5s)
  res.sendStatus(200);
  await webhookService.processMetaWebhook(req.body).catch(() => {});
};

// Workspace-level webhook config
export const getConfig = async (req, res) => {
  const config = await webhookService.getWebhookConfig(req.params.workspaceId);
  res.json(config ?? {});
};

export const upsertConfig = async (req, res) => {
  const config = await webhookService.upsertWebhookConfig(req.params.workspaceId, req.body);
  res.json(config);
};

export const testPing = async (req, res) => {
  const config = await webhookService.testWebhookPing(req.params.workspaceId);
  res.json({ message: 'Ping sent', lastPingStatus: config.lastPingStatus });
};
