/**
 * The endpoint ChatFlow POSTs WhatsApp delivery reports to.
 *
 * Public, because a webhook sender cannot hold a session. Authorised by the HMAC
 * token in the URL — see services/chatflowWebhook.service.js for why that rather
 * than ChatFlow's own signature header.
 */
import logger from '../lib/logger.js';
import { verifyStatusToken, applyStatusEvent, registerStatusWebhook, statusCallbackUrl } from '../services/chatflowWebhook.service.js';

/**
 * POST /integrations/chatflow/status/:workspaceId/:token
 *
 * Always answers 200 once the token checks out, whatever the body turns out to
 * be. ChatFlow retries on 5xx with backoff, so returning an error for an event we
 * simply do not care about — it sends message.received and campaign.completed to
 * the same URL — would have it redeliver that event for five minutes.
 */
export const receiveStatus = async (req, res) => {
  const { workspaceId, token } = req.params;

  if (!workspaceId || !verifyStatusToken(workspaceId, token)) {
    // Deliberately terse, and the token is never echoed or logged: this is a
    // bearer credential in a URL.
    logger.warn({ workspaceId }, 'Rejected ChatFlow status callback with a bad token');
    return res.status(403).json({ error: 'Invalid callback token' });
  }

  const event = String(req.body?.event ?? '');
  if (event !== 'message.status') {
    return res.status(200).json({ ignored: true });
  }

  try {
    const out = await applyStatusEvent(workspaceId, req.body?.data ?? {});
    return res.status(200).json(out);
  } catch (err) {
    // A 500 here makes ChatFlow retry, which is right for a transient DB fault.
    logger.error({ workspaceId, err: err.message }, 'Failed to apply WhatsApp delivery status');
    return res.status(500).json({ error: 'Could not record delivery status' });
  }
};

/**
 * POST /workspaces/:workspaceId/whatsapp-templates/webhook
 *
 * Registers this workspace's callback URL with ChatFlow. Separate from connecting
 * the integration because it needs this server's public address, which is a
 * deployment property rather than something the client can fix.
 */
export const registerWebhook = async (req, res) => {
  const { workspaceId } = req.params;
  const out = await registerStatusWebhook(workspaceId);
  res.json(out);
};

/** GET the same path — lets an operator see the URL without re-registering. */
export const getWebhookStatus = async (req, res) => {
  const url = statusCallbackUrl(req.params.workspaceId);
  res.json({
    configured: Boolean(url),
    // Safe to show the owner their own callback URL; it is scoped to their
    // workspace and they are already authenticated to it.
    url: url || null,
  });
};
