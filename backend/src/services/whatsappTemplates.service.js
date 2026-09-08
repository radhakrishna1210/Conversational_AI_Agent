/**
 * WhatsApp templates, as Spandan drives them on ChatFlow.
 *
 * ChatFlow is our own WhatsApp Business platform, running on the same box. The
 * client connects their ChatFlow workspace once (constants/integrations.js ->
 * `chatflow`), and from then on Spandan creates and tracks templates on their
 * behalf so they never have to open ChatFlow's own UI.
 *
 * Three things about Meta shape everything here:
 *
 *  1. A template is reviewed ONCE and then reused for every send; only the
 *     variable values change. So a binding row is created once and cached, not
 *     rebuilt per message.
 *  2. Review is asynchronous — minutes to days — and can be REJECTED with a
 *     reason. Nothing can be sent until it is APPROVED.
 *  3. Placeholders are POSITIONAL ({{1}}, {{2}}) and Meta requires a sample value
 *     for each at submission time.
 *
 * And one thing about ChatFlow: its public send path does NOT check that a
 * template is approved before forwarding to Meta (its API-playground path does).
 * So approval is checked on this side, against the cached `status` below.
 */
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { decryptToken } from '../lib/encryption.js';
import logger from '../lib/logger.js';
import { WHATSAPP_TEMPLATE_PRESETS, getPreset, presetVariableCount } from '../constants/whatsappTemplatePresets.js';

const CHATFLOW_TIMEOUT_MS = 15_000;

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

/** A trailing slash here produces `//api/v1/...`, which ChatFlow 404s. */
const chatflowBase = () => {
  const base = String(env.CHATFLOW_API_BASE_URL || '').replace(/\/+$/, '');
  if (!base) throw httpError('CHATFLOW_API_BASE_URL is not configured on this server.', 500);
  return base;
};

/**
 * The workspace's ChatFlow API key, decrypted.
 *
 * The key IS the tenant: ChatFlow derives the workspace from it, so a Spandan
 * workspace can only ever act on the ChatFlow workspace whose key it holds. There
 * is no workspace id on the wire to get wrong.
 */
export async function getChatflowKey(workspaceId) {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: 'chatflow' } },
    include: { token: true },
  });
  if (!integration?.token || integration.token.revokedAt) {
    throw httpError('ChatFlow is not connected for this workspace. Connect it under Integrations.', 400);
  }
  return decryptToken(integration.token.accessTokenCipher);
}

/**
 * One ChatFlow public-API call.
 *
 * Deliberately NOT routed through assertPublicHttpUrl: CHATFLOW_API_BASE_URL is
 * operator-set and points at loopback on the shared VPS, which that guard blocks
 * by design. It exists to constrain URLs a tenant types, and this is not one.
 */
async function chatflowFetch(path, { method = 'GET', body = null, apiKey }) {
  const url = `${chatflowBase()}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'x-api-key': apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(CHATFLOW_TIMEOUT_MS),
    });
  } catch (err) {
    throw httpError(`Could not reach ChatFlow: ${err.message}`, 502);
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok) {
    // ChatFlow returns { error } for its own refusals; a Meta rejection arrives as
    // a longer message. Either way the reason is worth keeping verbatim — a bare
    // "Failed" tells whoever reads this log in a month nothing at all.
    const reason = data?.error || data?.message || text?.slice(0, 300) || `HTTP ${res.status}`;
    throw httpError(`ChatFlow: ${reason}`, res.status === 403 ? 403 : 400);
  }
  return data;
}

/** Meta requires /^[a-z0-9_]{1,64}$/, unique per WhatsApp Business Account. */
export function deriveTemplateName(presetId, workspaceId) {
  const suffix = String(workspaceId).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return `${presetId}_${suffix}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 64);
}

/**
 * The `components` array Meta reviews.
 *
 * `example.body_text` is not optional padding — Meta wants a sample for every
 * placeholder to judge what the template is for, and a template whose samples are
 * missing or meaningless is exactly what gets bumped from UTILITY to MARKETING.
 */
export function buildComponents(preset) {
  const count = presetVariableCount(preset);
  const samples = Array.from({ length: count }, (_, i) =>
    preset.placeholders.find((p) => p.index === i + 1)?.example ?? 'Sample');
  return [{
    type: 'BODY',
    text: preset.bodyText,
    ...(count > 0 ? { example: { body_text: [samples] } } : {}),
  }];
}

export function listPresets() {
  return WHATSAPP_TEMPLATE_PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    blurb: p.blurb,
    category: p.category,
    language: p.language,
    bodyText: p.bodyText,
    placeholders: p.placeholders,
    variableCount: presetVariableCount(p),
  }));
}

/**
 * Create the template on ChatFlow (which submits it to Meta in the same call) and
 * remember the binding.
 *
 * Idempotent by design. Calling twice must not produce two templates: ChatFlow's
 * Template table has no unique constraint on name+language and its send path uses
 * findFirst, so a duplicate would make every later send pick one at random. An
 * existing binding is returned untouched unless it was REJECTED, which is the one
 * case where resubmitting is the point.
 */
export async function createTemplateFromPreset(workspaceId, presetId) {
  const preset = getPreset(presetId);
  if (!preset) throw httpError(`Unknown template preset: ${presetId}`, 400);

  const existing = await prisma.whatsAppTemplateBinding.findUnique({
    where: { workspaceId_presetId: { workspaceId, presetId } },
  });
  if (existing && existing.status !== 'REJECTED') return { binding: existing, created: false };

  const apiKey = await getChatflowKey(workspaceId);
  const name = deriveTemplateName(presetId, workspaceId);

  const result = await chatflowFetch('/api/v1/public/templates', {
    method: 'POST',
    apiKey,
    body: {
      name,
      category: preset.category,
      language: preset.language,
      components: buildComponents(preset),
    },
  });

  const data = {
    workspaceId,
    presetId,
    chatflowTemplateId: result?.id ?? result?.metaTemplateId ?? null,
    chatflowName: name,
    language: preset.language,
    // Trust ChatFlow's own status if it sent one; a fresh submission is PENDING.
    status: result?.status ?? 'PENDING',
    rejectedReason: null,
    lastCheckedAt: new Date(),
  };

  const binding = await prisma.whatsAppTemplateBinding.upsert({
    where: { workspaceId_presetId: { workspaceId, presetId } },
    update: data,
    create: data,
  });

  logger.info({ workspaceId, presetId, name, status: binding.status }, 'WhatsApp template submitted to Meta via ChatFlow');

  // Point ChatFlow's delivery reports at us, now, rather than making the client
  // find a second button for it. Best-effort on purpose: the template really was
  // submitted, and failing the whole request over the status feed would leave the
  // caller thinking it was not. Registration is idempotent, so a later create or
  // an explicit POST .../whatsapp-templates/webhook fixes it.
  //
  // Imported here rather than at module scope because chatflowWebhook.service
  // imports getChatflowKey from this file — a static pair would be a cycle.
  try {
    const { registerStatusWebhook } = await import('./chatflowWebhook.service.js');
    await registerStatusWebhook(workspaceId);
  } catch (err) {
    logger.warn({ workspaceId, err: err.message }, 'Template submitted, but delivery reports could not be enabled');
  }

  return { binding, created: true };
}

/**
 * Refresh cached approval status from ChatFlow.
 *
 * Polling rather than ChatFlow's `template.status` webhook, and not for lack of
 * one: ChatFlow signs outgoing webhooks with Workspace.webhookVerifyToken, which
 * defaults to "" and has no code path that ever sets it, so a template-status
 * callback could not be authenticated. Approval takes minutes to days, so
 * page-cadence polling costs nothing and adds no unauthenticated surface.
 */
export async function refreshBindings(workspaceId) {
  const bindings = await prisma.whatsAppTemplateBinding.findMany({ where: { workspaceId } });
  if (bindings.length === 0) return [];

  let remote;
  try {
    const apiKey = await getChatflowKey(workspaceId);
    remote = await chatflowFetch('/api/v1/public/templates', { apiKey });
  } catch (err) {
    // A ChatFlow outage must not blank the page — serve the cached rows, flagged.
    logger.warn({ workspaceId, err: err.message }, 'Could not refresh WhatsApp template status');
    return bindings.map((b) => ({ ...b, stale: true }));
  }

  const list = Array.isArray(remote) ? remote : (remote?.templates ?? []);
  const byId = new Map(list.filter((t) => t?.id).map((t) => [t.id, t]));
  const byName = new Map(list.filter((t) => t?.name).map((t) => [`${t.name}::${t.language}`, t]));

  const out = [];
  for (const b of bindings) {
    const match = (b.chatflowTemplateId && byId.get(b.chatflowTemplateId))
      || byName.get(`${b.chatflowName}::${b.language}`)
      || null;
    if (!match || (match.status === b.status && (match.rejectedReason ?? null) === b.rejectedReason)) {
      out.push({ ...b, stale: false });
      continue;
    }
    const updated = await prisma.whatsAppTemplateBinding.update({
      where: { id: b.id },
      data: {
        status: match.status ?? b.status,
        rejectedReason: match.rejectedReason ?? null,
        chatflowTemplateId: match.id ?? b.chatflowTemplateId,
        lastCheckedAt: new Date(),
      },
    });
    logger.info({ workspaceId, presetId: b.presetId, from: b.status, to: updated.status }, 'WhatsApp template status changed');
    out.push({ ...updated, stale: false });
  }
  return out;
}

/** The binding a post-call config points at, or null. */
export async function getBinding(workspaceId, bindingId) {
  if (!bindingId) return null;
  return prisma.whatsAppTemplateBinding.findFirst({ where: { id: bindingId, workspaceId } });
}
