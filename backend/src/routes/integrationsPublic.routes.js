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
    // workspaceId is only known once completeOAuthCallback resolves the
    // session — an unrecognized/garbled state never reaches that point, so there's nothing to log against.
    if (err.workspaceId) {
      await service.addLog({
        workspaceId: err.workspaceId,
        provider,
        level: 'error',
        event: 'oauth_failed',
        message: err.message,
        status: String(err.statusCode ?? ''),
      }).catch(() => {});
    }
    return res.redirect(`${clientUrl}/integrations?provider=${provider}&error=${encodeURIComponent(err.message)}`);
  }
});

/** Constant-time compare that returns false, rather than throwing, on a length mismatch. */
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Is this webhook genuinely from the provider it names?
 *
 * This endpoint is public and the event it records picks its workspace from the
 * body, then queues a sync against that workspace's own credentials. It used to
 * accept anything for any provider — verifying only Calendly and Slack, and only
 * when their secret happened to be set — and stored every event as
 * `signatureValid: true`. So anyone could fill any workspace's event log and set
 * its integrations syncing on demand.
 *
 * Now a request is accepted only when a signature it carries has been verified.
 * A provider with no verification configured is refused outright: nothing real
 * depended on that path, because no provider's own payload carries our
 * workspace id — every genuine event fell through to the 'public' placeholder.
 *
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export const verifyProviderWebhook = (provider, headers, rawBody, secrets = {
  calendly: env.CALENDLY_WEBHOOK_SIGNING_KEY,
  slack: env.SLACK_SIGNING_SECRET,
}) => {
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : JSON.stringify(rawBody ?? {});

  if (provider === 'calendly' && secrets.calendly) {
    const signature = headers['calendly-webhook-signature'];
    if (!signature) return { ok: false, status: 401, error: 'Missing Calendly webhook signature' };
    // Calendly sends: t=timestamp,v1=hmac_sha256_hex
    const parts = Object.fromEntries(String(signature).split(',').map((p) => p.split('=')));
    const expected = createHmac('sha256', secrets.calendly).update(`${parts.t}.${body}`).digest('hex');
    return safeEqual(expected, parts.v1) ? { ok: true } : { ok: false, status: 401, error: 'Invalid Calendly webhook signature' };
  }

  if (provider === 'slack' && secrets.slack) {
    const slackSig = headers['x-slack-signature'];
    const slackTs = headers['x-slack-request-timestamp'];
    const expected = 'v0=' + createHmac('sha256', secrets.slack).update(`v0:${slackTs}:${body}`).digest('hex');
    // safeEqual, not a bare timingSafeEqual: a signature of the wrong length used
    // to throw inside the handler and answer 500.
    return safeEqual(expected, slackSig) ? { ok: true } : { ok: false, status: 401, error: 'Invalid Slack webhook signature' };
  }

  return { ok: false, status: 401, error: 'Webhook signature verification is not configured for this provider' };
};

// ── Webhook receiver ──────────────────────────────────────────────────────────
router.post('/webhooks/:provider', async (req, res) => {
  const { provider } = req.params;

  const verdict = verifyProviderWebhook(provider, req.headers, req.body);
  if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.error });

  try {
    await service.handleWebhookEvent(provider, req.headers, req.body, { signatureValid: true });
    res.sendStatus(200);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
