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
 * Every status meaning the message already reached Meta.
 *
 * Not just SENT: ChatFlow's status webhook moves a row on to DELIVERED and READ
 * (chatflowWebhook.service.js), and the duplicate guard below used to check for
 * SENT alone — so replaying a call whose confirmation had already been READ put
 * a second copy on the customer's phone. FAILED is deliberately absent: a
 * message Meta could not deliver is exactly one a retry should attempt again.
 */
const REACHED_META = ['SENT', 'DELIVERED', 'READ'];

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
 * Who a post-call confirmation goes to.
 *
 * "Send to" names a captured variable for the case where the customer gives a
 * DIFFERENT number during the call — or a web call, which carries no number of
 * its own. It used to be all or nothing: once a variable was named, an empty
 * value meant `to: undefined`, and the message went nowhere. That is exactly
 * the call a customer answers with "use the number you called me on" — no
 * digits, so extraction rightly records nothing, while the number itself was
 * sitting on the call log the whole time.
 *
 * So the captured number wins when there is a usable one, and the customer's
 * number on this call is the fallback. A captured value too garbled to be a
 * number falls back too: the caller's own phone is a far better destination
 * than no message at all.
 *
 * @param {object} p
 * @param {string} [p.recipientVariable]  the config's "Send to" variable key
 * @param {(key: string) => ({ value?: unknown }|undefined)} p.findVar
 * @param {string} [p.callPhoneNumber]    the customer's number on this call
 * @returns {{ to: string, source: 'variable'|'call' } | { to: null, reason: string }}
 */
export function resolveRecipient({ recipientVariable, findVar, callPhoneNumber }) {
  const key = String(recipientVariable ?? '').trim();
  if (key) {
    const captured = normalizeRecipient(findVar(key)?.value);
    if (captured) return { to: captured, source: 'variable' };
  }
  const onCall = normalizeRecipient(callPhoneNumber);
  if (onCall) return { to: onCall, source: 'call' };
  return {
    to: null,
    reason: key
      ? `No phone number to send to: nothing usable was captured for "${key}", and this call has no customer number to fall back to`
      : 'No phone number to send to: this call has no customer number. Web calls never do — choose a captured value under "Send to".',
  };
}

/**
 * Record a confirmation that was NOT sent, so the call's own history says why.
 *
 * Every refusal in the post-call WhatsApp branch used to leave nothing behind —
 * the reason reached a log line and nowhere else, and the one path that went
 * through the queue reported `queued: true` for a message the worker then threw
 * away. From the product, a failed confirmation and a call that was never meant
 * to send one looked identical. The Recent Calls panel already renders a FAILED
 * row with its error; it just never received one.
 *
 * Never downgrades a message that did go out: a replayed delivery that fails a
 * check (say the template was since paused) must not overwrite SENT.
 *
 * Never throws — this is bookkeeping for a failure already being handled.
 */
export async function recordWhatsAppSendFailure(workspaceId, { callLogId, postCallConfigId, reason, recipient = null }) {
  if (!workspaceId || !callLogId || !postCallConfigId) return;
  const lastError = String(reason ?? 'Not sent').slice(0, 500);
  try {
    await prisma.whatsAppPostCallSend.create({
      data: { workspaceId, callLogId, postCallConfigId, status: 'FAILED', recipient, lastError },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) {
      logger.warn({ callLogId, postCallConfigId, err: err.message }, 'Could not record WhatsApp send failure');
      return;
    }
    await prisma.whatsAppPostCallSend.updateMany({
      where: { callLogId, postCallConfigId, status: { notIn: REACHED_META } },
      data: { status: 'FAILED', lastError, ...(recipient ? { recipient } : {}) },
    }).catch((e) => logger.warn({ callLogId, postCallConfigId, err: e.message }, 'Could not record WhatsApp send failure'));
  }
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
  if (!recipient) {
    // executePostCall resolves the recipient before queueing, so reaching this
    // means a caller skipped that. Leave the same trace it would have.
    const reason = 'No usable recipient phone number for this call';
    await recordWhatsAppSendFailure(workspaceId, { callLogId, postCallConfigId, reason });
    throw Object.assign(new Error(reason), { statusCode: 400 });
  }
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
    if (REACHED_META.includes(existing?.status)) {
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
      // `recipient` too: a retry can reuse a row first written as a FAILED
      // "no number" record, which has none.
      data: { status: 'SENT', recipient, chatflowMessageId: messageId, sentAt: new Date(), lastError: null, attempts: { increment: 1 } },
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
