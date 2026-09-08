/**
 * Delivery status for WhatsApp confirmations.
 *
 * ChatFlow reports SENT -> DELIVERED -> READ (or FAILED) for every message it
 * sends, by POSTing to a URL the workspace registers. Spandan registers that URL
 * itself, which is what makes this authenticable.
 *
 * ── Why the token is in the URL ────────────────────────────────────────────────
 * ChatFlow signs its outgoing webhooks with an HMAC over the body, using
 * Workspace.webhookVerifyToken as the key. That column defaults to "" and no code
 * path anywhere in ChatFlow ever writes it — it is excluded from the settings
 * allow-list precisely because it is sensitive, and no rotate endpoint exists. So
 * `X-ChatFlow-Signature-256` is currently computed with an empty secret and
 * verifies nothing: anyone could reproduce it.
 *
 * Rather than pretend that header is authentication, the capability travels in the
 * URL we register — the same approach the carrier transfer callbacks already use
 * (services/broadcast/signedToken.js). An HMAC over (workspaceId) that only this
 * server can mint, checked in constant time.
 *
 * The signature is still verified when a real secret exists, as defence in depth,
 * so this tightens automatically the day ChatFlow can set one.
 *
 * Because the token is a bearer credential sitting in a URL, it must never be
 * logged. Nothing here logs `req.originalUrl`.
 */
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';
import { publicHttpBase } from '../lib/publicUrl.js';
import { getChatflowKey } from './whatsappTemplates.service.js';

/**
 * Falls back to the access-token secret rather than a constant: a hardcoded
 * default would make every deployment's callback URLs forgeable by anyone who
 * read this file.
 */
const signingKey = () => process.env.CHATFLOW_WEBHOOK_SECRET || env.JWT_ACCESS_SECRET || '';

export const signStatusToken = (workspaceId) =>
  crypto.createHmac('sha256', signingKey())
    .update(`chatflow:status:${workspaceId}`)
    .digest('hex')
    .slice(0, 32);

/** Constant-time, so the token cannot be recovered a byte at a time. */
export function verifyStatusToken(workspaceId, token) {
  const expected = signStatusToken(workspaceId);
  const given = String(token || '');
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

/** The URL ChatFlow should POST to for this workspace, or '' if unconfigured. */
export function statusCallbackUrl(workspaceId) {
  const base = publicHttpBase();
  if (!base) return '';
  return `${base}/api/v1/integrations/chatflow/status/${workspaceId}/${signStatusToken(workspaceId)}`;
}

/**
 * Tell ChatFlow where to send delivery reports.
 *
 * ChatFlow's POST /public/webhooks accepts only `webhookUrl` — it drops any event
 * filter — so this workspace will receive every event type it emits, not just
 * message.status. The receiver ignores the rest rather than erroring, because a
 * 4xx would make ChatFlow retry an event we simply do not want.
 */
export async function registerStatusWebhook(workspaceId) {
  const url = statusCallbackUrl(workspaceId);
  if (!url) {
    throw Object.assign(
      new Error('This server has no public address configured (PUBLIC_BACKEND_URL / PUBLIC_BACKEND_WS_URL), so ChatFlow cannot reach it for delivery reports.'),
      { statusCode: 500 },
    );
  }

  const apiKey = await getChatflowKey(workspaceId);
  const base = String(env.CHATFLOW_API_BASE_URL || '').replace(/\/+$/, '');

  const res = await fetch(`${base}/api/v1/public/webhooks`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl: url }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let reason = text.slice(0, 300);
    try { reason = JSON.parse(text)?.error ?? reason; } catch { /* keep the raw text */ }
    throw Object.assign(new Error(`ChatFlow refused the webhook registration: ${reason}`), { statusCode: 400 });
  }
  // The URL itself carries the credential, so log that it happened, not what it is.
  logger.info({ workspaceId }, 'Registered ChatFlow delivery-status webhook');
  return { registered: true };
}

/** Meta's vocabulary, normalised to what the send row stores. */
const STATUS_MAP = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

// Once a message is READ it cannot become DELIVERED again, and out-of-order
// webhooks are normal. Rank them so a late arrival cannot walk the status
// backwards — except FAILED, which always wins because it is the one a human
// needs to act on.
const RANK = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3 };

/**
 * Apply one `message.status` event.
 *
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyStatusEvent(workspaceId, data) {
  const messageId = data?.messageId ?? data?.id ?? null;
  const raw = String(data?.status ?? '').toLowerCase();
  const next = STATUS_MAP[raw] ?? null;
  if (!messageId || !next) return { applied: false, reason: 'no message id or unrecognised status' };

  const row = await prisma.whatsAppPostCallSend.findFirst({
    where: { workspaceId, chatflowMessageId: String(messageId) },
  });
  // Not ours. ChatFlow reports on every message the workspace sends, including
  // ones from its own inbox and campaigns, so this is the common case.
  if (!row) return { applied: false, reason: 'not a Spandan-sent message' };

  if (next !== 'FAILED' && (RANK[next] ?? 0) <= (RANK[row.status] ?? 0)) {
    return { applied: false, reason: `ignored ${next} after ${row.status}` };
  }

  await prisma.whatsAppPostCallSend.update({
    where: { id: row.id },
    data: {
      status: next,
      lastError: next === 'FAILED'
        ? String(data?.error?.title ?? data?.error?.message ?? JSON.stringify(data?.error ?? 'Delivery failed')).slice(0, 500)
        : row.lastError,
    },
  });

  if (next === 'FAILED') {
    logger.warn({ workspaceId, callLogId: row.callLogId, error: data?.error }, 'WhatsApp confirmation was not delivered');
  }
  return { applied: true };
}
