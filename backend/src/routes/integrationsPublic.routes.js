import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import * as service from '../services/integrations.service.js';
import { env } from '../config/env.js';
import { INTEGRATION_PROVIDERS } from '../constants/integrations.js';

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

export default router;
