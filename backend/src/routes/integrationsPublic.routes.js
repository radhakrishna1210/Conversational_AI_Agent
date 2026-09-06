import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import * as service from '../services/integrations.service.js';
import { env } from '../config/env.js';
import { INTEGRATION_PROVIDERS } from '../constants/integrations.js';
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { toE164 } from '../lib/phone.js';

const router = Router();

// ── OAuth callback ────────────────────────────────────────────────────────────
router.get('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return res.redirect(`${clientUrl}/integrations?provider=${provider}&error=${encodeURIComponent(String(errorDescription ?? error))}`);
  }

  try {
    await service.completeOAuthCallback(
      provider,
      String(code ?? ''),
      String(state ?? ''),
      req.query.redirect_uri ? String(req.query.redirect_uri) : null,
    );
    return res.redirect(`${clientUrl}/integrations?provider=${provider}&connected=1`);
  } catch (err) {
    return res.redirect(`${clientUrl}/integrations?provider=${provider}&error=${encodeURIComponent(err.message)}`);
  }
});

// ── Webhook receiver ──────────────────────────────────────────────────────────
router.post('/webhooks/:provider', async (req, res) => {
  const { provider } = req.params;

  // Verify Calendly webhook signature
  if (provider === 'calendly') {
    const signingKey = env.CALENDLY_WEBHOOK_SIGNING_KEY;
    if (signingKey) {
      const signature = req.headers['calendly-webhook-signature'];
      if (!signature) {
        return res.status(401).json({ error: 'Missing Calendly webhook signature' });
      }
      try {
        // Calendly sends: t=timestamp,v1=hmac_sha256_hex
        const parts = Object.fromEntries(
          String(signature).split(',').map(p => p.split('=')),
        );
        const timestamp = parts.t;
        const receivedSig = parts.v1;
        const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
        const expected = createHmac('sha256', signingKey)
          .update(`${timestamp}.${body}`)
          .digest('hex');
        const valid = timingSafeEqual(
          Buffer.from(expected, 'hex'),
          Buffer.from(receivedSig, 'hex'),
        );
        if (!valid) {
          return res.status(401).json({ error: 'Invalid Calendly webhook signature' });
        }
      } catch {
        return res.status(401).json({ error: 'Webhook signature verification failed' });
      }
    }
  }

  // Verify Slack webhook signature
  if (provider === 'slack') {
    const signingSecret = env.SLACK_SIGNING_SECRET;
    if (signingSecret) {
      const slackSig    = req.headers['x-slack-signature'];
      const slackTs     = req.headers['x-slack-request-timestamp'];
      const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
      const baseStr = `v0:${slackTs}:${body}`;
      const expected = 'v0=' + createHmac('sha256', signingSecret).update(baseStr).digest('hex');
      if (!slackSig || !timingSafeEqual(Buffer.from(expected), Buffer.from(String(slackSig)))) {
        return res.status(401).json({ error: 'Invalid Slack webhook signature' });
      }
    }
  }

  try {
    await service.handleWebhookEvent(provider, req.headers, req.body);
    res.sendStatus(200);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Zoho CRM: Lead-update → Contact sync ────────────────────────────────────
// Wired to a Zoho workflow rule's outgoing webhook (Settings → Automation →
// Workflow Rules → Instant Actions → Webhooks), NOT to the generic
// `/webhooks/:provider` receiver above — that one exists to poll our own
// SyncJob queue for a *connected* integration, this one exists to keep our own
// Contact table current with what Zoho has for a Lead.
//
// This does NOT place a call. An earlier version dialled the lead immediately
// on this event; that trigger was removed — this endpoint is now a one-way
// silent sync (Zoho → us). The other direction (a call summary pushed FROM us
// INTO Zoho) is unrelated and unaffected: see zoho.service.js#pushCallAsLead,
// called from deliverPostCall after every completed call.
//
// Zoho has no notion of our workspace, so the workflow's webhook URL is
// configured with it as a query param (?workspaceId=...) rather than looked
// up — there is nothing else to look it up BY.
router.post('/webhooks/zoho/lead-update', async (req, res) => {
  // Ack first: Zoho marks the webhook delivered on any 2xx and retries on
  // anything else, so a slow write downstream must never turn into Zoho
  // re-sending the same lead-update repeatedly.
  res.sendStatus(200);

  const { workspaceId } = req.query;

  let payload = {};
  try {
    const bodyText = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {});
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch (err) {
    logger.warn({ err: err.message, workspaceId }, 'Zoho lead-update webhook: could not parse JSON body');
    return;
  }

  const { leadId, phone, firstName, lastName, email } = payload;
  logger.info({ workspaceId, leadId, phone, firstName, lastName, email }, 'Zoho lead-update webhook received');

  try {
    if (!workspaceId) {
      logger.warn({ leadId }, 'Zoho lead-update webhook: missing workspaceId query param, cannot route sync');
      return;
    }

    const phoneNumber = toE164(phone);
    if (!phoneNumber) {
      logger.info({ workspaceId, leadId, phone }, 'Zoho lead-update webhook: no usable phone number on this Lead, skipping sync');
      return;
    }

    const name = [firstName, lastName].map((s) => String(s || '').trim()).filter(Boolean).join(' ') || undefined;

    // Upsert by (workspaceId, phoneNumber) — the same identity Contact already
    // keys on for CSV imports, so a lead synced from Zoho and a contact
    // uploaded by CSV collapse into the same row instead of duplicating it.
    const existing = await prisma.contact.findFirst({
      where: { workspaceId: String(workspaceId), phoneNumber },
      select: { id: true, attributes: true },
    });
    const attributes = {
      ...(existing?.attributes && typeof existing.attributes === 'object' ? existing.attributes : {}),
      zohoLeadId: leadId ?? existing?.attributes?.zohoLeadId,
      zohoSyncedAt: new Date().toISOString(),
    };

    if (existing) {
      await prisma.contact.update({
        where: { id: existing.id },
        data: { name, email: email || undefined, attributes },
      });
      logger.info({ workspaceId, leadId, contactId: existing.id }, 'Zoho lead-update webhook: contact updated');
    } else {
      const created = await prisma.contact.create({
        data: { workspaceId: String(workspaceId), phoneNumber, name, email: email || undefined, attributes },
      });
      logger.info({ workspaceId, leadId, contactId: created.id }, 'Zoho lead-update webhook: contact created');
    }
  } catch (err) {
    logger.error({ err, workspaceId, leadId }, 'Zoho lead-update webhook: unhandled error');
  }
});

export default router;
