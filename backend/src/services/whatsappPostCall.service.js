/**
 * Sending the post-call WhatsApp confirmation through ChatFlow.
 *
 * The important part of this file is the duplicate guard, not the HTTP call.
 *
 * ChatFlow's POST /public/messages accepts no idempotency key. Meanwhile a call
 * can reach post-call delivery more than once — the browser PATCHes a web call to
 * `ended`, the closed-tab backstop finalises it too, a support engineer replays a
 * delivery, and later a BullMQ retry will fire after a response was lost in
 * flight. Every one of those would put a second appointment confirmation on a
 * real customer's phone.
 *
 * So the send is claimed in Postgres BEFORE ChatFlow is called. The unique index
 * on (callLogId, postCallConfigId) is the actual protection; a queue's own
 * de-duplication is not, because Redis is optional here and the queue silently
 * becomes a no-op without it.
 */
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';
import { getChatflowKey } from './whatsappTemplates.service.js';

const CHATFLOW_TIMEOUT_MS = 15_000;

/** Prisma's unique-constraint violation. */
const isUniqueViolation = (err) => err?.code === 'P2002';

/**
 * Digits only, no '+', spaces or dashes.
 *
 * ChatFlow normalises this too, but a number that is empty or obviously not a
 * number should fail here with a sentence someone can act on, rather than as an
 * opaque Graph API rejection two hops away.
 */
export function normalizeRecipient(raw) {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  return digits.length >= 8 ? digits : null;
}

/**
 * Turn the config's placeholder mapping into the positional array Meta wants.
 *
 * Meta placeholders are 1-based ({{1}}, {{2}}) and the wire format is a plain
 * array, so index 0 of the result feeds {{1}}. A gap in the mapping is an error
 * rather than an empty string: sending "Hi , your appointment is confirmed for ."
 * to a customer is worse than sending nothing, and Meta rejects empty parameters
 * anyway.
 *
 * @returns {{ ok: true, values: string[] } | { ok: false, missing: string[] }}
 */
export function buildPositionalVariables(variableMapping, findVar) {
  const mapping = Array.isArray(variableMapping) ? variableMapping : [];
  const highest = mapping.reduce((max, m) => Math.max(max, Number(m?.placeholderIndex) || 0), 0);
  if (highest === 0) return { ok: false, missing: ['(no variables mapped)'] };

  const values = [];
  const missing = [];
  for (let i = 1; i <= highest; i += 1) {
    const entry = mapping.find((m) => Number(m?.placeholderIndex) === i);
    if (!entry?.variableKey) { missing.push(`{{${i}}}`); values.push(''); continue; }
    const found = findVar(entry.variableKey);
    const value = found?.value == null ? '' : String(found.value).trim();
    if (!value) missing.push(`{{${i}}} (${entry.variableKey})`);
    values.push(value);
  }
  return missing.length ? { ok: false, missing } : { ok: true, values };
}

const chatflowBase = () => String(env.CHATFLOW_API_BASE_URL || '').replace(/\/+$/, '');

/**
 * Send one template message, at most once per (call, destination).
 *
 * Not routed through assertPublicHttpUrl — CHATFLOW_API_BASE_URL is operator-set
 * and points at loopback on the shared VPS, which that guard blocks by design.
 *
 * @returns {Promise<{ sent: boolean, duplicate?: boolean, messageId?: string|null }>}
 */
export async function sendWhatsAppConfirmation(workspaceId, {
  to,
  templateName,
  language = 'en',
  variables = [],
  callLogId,
  postCallConfigId,
}) {
  const recipient = normalizeRecipient(to);
  if (!recipient) throw Object.assign(new Error('No usable recipient phone number for this call'), { statusCode: 400 });
  if (!callLogId || !postCallConfigId) throw new Error('callLogId and postCallConfigId are required to make the send idempotent');

  // ── Claim, before anything leaves the building ──────────────────────────────
  let claim;
  try {
    claim = await prisma.whatsAppPostCallSend.create({
      data: { workspaceId, callLogId, postCallConfigId, status: 'PENDING', recipient },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await prisma.whatsAppPostCallSend.findUnique({
      where: { callLogId_postCallConfigId: { callLogId, postCallConfigId } },
    });
    // Already delivered. This is a success for the caller's intent ("make sure
    // this confirmation went out"), not a failure — and above all, do not send again.
    if (existing?.status === 'SENT') {
      logger.info({ workspaceId, callLogId, postCallConfigId }, 'WhatsApp confirmation already sent — skipping duplicate');
      return { sent: false, duplicate: true, messageId: existing.chatflowMessageId ?? null };
    }
    // PENDING or FAILED: a previous attempt never confirmed success, so retry it.
    claim = existing;
  }

  const apiKey = await getChatflowKey(workspaceId);
  const body = {
    to: recipient,
    type: 'template',
    template: { name: templateName, language: { code: language }, variables },
  };

  let res;
  let text = '';
  try {
    res = await fetch(`${chatflowBase()}/api/v1/public/messages`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CHATFLOW_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (err) {
    await markFailed(claim?.id, `Could not reach ChatFlow: ${err.message}`);
    throw Object.assign(new Error(`Could not reach ChatFlow: ${err.message}`), { statusCode: 502 });
  }

  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok) {
    const reason = data?.error || data?.message || text.slice(0, 300) || `HTTP ${res.status}`;
    await markFailed(claim?.id, reason);
    throw Object.assign(new Error(`ChatFlow: ${reason}`), { statusCode: 400 });
  }

  // ChatFlow returns Meta's response verbatim. The message id is what delivery
  // webhooks are later matched on, so losing it costs the whole status timeline.
  const messageId = data?.messages?.[0]?.id ?? null;
  if (claim?.id) {
    await prisma.whatsAppPostCallSend.update({
      where: { id: claim.id },
      data: { status: 'SENT', chatflowMessageId: messageId, sentAt: new Date(), lastError: null, attempts: { increment: 1 } },
    }).catch((err) => logger.warn({ err: err.message }, 'Could not record WhatsApp send'));
  }

  logger.info({ workspaceId, callLogId, templateName, messageId }, 'WhatsApp confirmation sent');
  return { sent: true, duplicate: false, messageId };
}

async function markFailed(id, reason) {
  if (!id) return;
  await prisma.whatsAppPostCallSend.update({
    where: { id },
    data: { status: 'FAILED', lastError: String(reason).slice(0, 500), attempts: { increment: 1 } },
  }).catch(() => { /* the throw that follows carries the real reason */ });
}
