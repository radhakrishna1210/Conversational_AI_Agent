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
import { randomBytes } from 'crypto';
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

// ─── Custom templates ────────────────────────────────────────────────────────
//
// A template the client wrote, or had drafted for them, rather than one of the
// three shipped presets. Same submission path, same approval wait — the only
// difference is that the wording lives on the row instead of in a constant.

const CATEGORIES = new Set(['MARKETING', 'UTILITY', 'AUTHENTICATION']);
const BODY_MAX_CHARS = 1024;

/** Every {{n}} in the text, ascending, deduped. */
export function extractPlaceholderIndices(bodyText) {
  const found = new Set();
  for (const m of String(bodyText ?? '').matchAll(/\{\{(\d+)\}\}/g)) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > 0) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * How much of the body is actual sentences rather than placeholders.
 *
 * Meta reads a template to decide whether it is UTILITY (cheap) or MARKETING
 * (dearer, needs opt-in), and a body that is mostly `{{1}}, {{2}}` reads as
 * unclear and gets reclassified — silently, after approval. This is a heuristic,
 * not Meta's algorithm, so it drives a warning and never a refusal.
 */
export function literalTextLength(bodyText) {
  return String(bodyText ?? '').replace(/\{\{\d+\}\}/g, '').trim().length;
}

/**
 * Check a custom template before it goes anywhere near ChatFlow.
 *
 * Everything here is also enforced downstream — by ChatFlow's zod schema, then by
 * Meta. The point of repeating it is the message: a caller gets "the body is 1,200
 * characters, the limit is 1,024" instead of a Graph API error two hops away.
 *
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function validateCustomTemplate({ label, category, language, bodyText, placeholders }) {
  const name = String(label ?? '').trim();
  if (!name) return { ok: false, error: 'Give the template a name so you can find it later.' };

  const cat = String(category ?? 'UTILITY').toUpperCase();
  if (!CATEGORIES.has(cat)) return { ok: false, error: `Category must be one of ${[...CATEGORIES].join(', ')}.` };

  const lang = String(language ?? 'en').trim();
  if (lang.length < 2 || lang.length > 10) return { ok: false, error: 'Language must be a Meta language code, e.g. "en".' };

  const body = String(bodyText ?? '').trim();
  if (!body) return { ok: false, error: 'The message body cannot be empty.' };
  if (body.length > BODY_MAX_CHARS) {
    return { ok: false, error: `The message is ${body.length} characters — the limit is ${BODY_MAX_CHARS}.` };
  }
  // Mirrors ChatFlow's own checkBodyText: emoji- or symbol-only bodies are refused.
  if (!/\p{L}/u.test(body)) return { ok: false, error: 'The message needs some words in it, not only symbols or emoji.' };

  const indices = extractPlaceholderIndices(body);
  // Meta numbers parameters positionally from 1 with no gaps — {{1}}, {{3}} is
  // rejected, and the error it returns does not say so.
  const expected = indices.map((_, i) => i + 1);
  if (indices.join(',') !== expected.join(',')) {
    return { ok: false, error: `Placeholders must run 1 to ${indices.length} with no gaps — found ${indices.map((i) => `{{${i}}}`).join(', ')}.` };
  }

  const given = Array.isArray(placeholders) ? placeholders : [];
  const normalised = [];
  for (const index of indices) {
    const entry = given.find((p) => Number(p?.index) === index);
    const example = String(entry?.example ?? '').trim();
    // Meta requires a sample for every placeholder at submission — it is how a
    // reviewer judges what the template is for.
    if (!example) return { ok: false, error: `Give an example value for {{${index}}} — Meta shows it to the reviewer.` };
    normalised.push({
      index,
      label: String(entry?.label ?? '').trim() || `Value ${index}`,
      example,
      variableKey: String(entry?.variableKey ?? '').trim() || null,
    });
  }

  return { ok: true, value: { label: name, category: cat, language: lang, bodyText: body, placeholders: normalised } };
}

/**
 * A Meta-legal, workspace-unique template name.
 *
 * Unlike a preset — one row per preset, so the name can be derived deterministically
 * — two custom templates may share a label, so a short random tail keeps them apart.
 */
export function deriveCustomTemplateName(label, workspaceId) {
  const slug = String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'template';
  const ws = String(workspaceId).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const tail = randomBytes(2).toString('hex');
  return `${slug}_${ws}_${tail}`.slice(0, 64);
}

/**
 * Create a client-authored template on ChatFlow, which submits it to Meta.
 *
 * Not an upsert, unlike the preset path: there is no natural key to collide on, so
 * a double submission would be two Meta reviews of the same message. The caller
 * guards that client-side.
 */
export async function createCustomTemplate(workspaceId, input, createdByUserId = null) {
  const checked = validateCustomTemplate(input);
  if (!checked.ok) throw httpError(checked.error, 400);
  const { label, category, language, bodyText, placeholders } = checked.value;

  const apiKey = await getChatflowKey(workspaceId);
  const name = deriveCustomTemplateName(label, workspaceId);

  // buildComponents already takes exactly this shape — it only reads bodyText and
  // placeholders — so the preset and custom paths produce identical payloads.
  const result = await chatflowFetch('/api/v1/public/templates', {
    method: 'POST',
    apiKey,
    body: { name, category, language, components: buildComponents({ bodyText, placeholders }) },
  });

  const binding = await prisma.whatsAppTemplateBinding.create({
    data: {
      workspaceId,
      presetId: null,
      origin: 'custom',
      label,
      bodyText,
      placeholders,
      category,
      createdByUserId,
      chatflowTemplateId: result?.id ?? result?.metaTemplateId ?? null,
      chatflowName: name,
      language,
      status: result?.status ?? 'PENDING',
      lastCheckedAt: new Date(),
    },
  });

  logger.info({ workspaceId, name, label }, 'Custom WhatsApp template submitted to Meta via ChatFlow');

  // Same best-effort webhook registration as the preset path — the template really
  // was submitted, so a status-feed failure must not fail the whole request.
  try {
    const { registerStatusWebhook } = await import('./chatflowWebhook.service.js');
    await registerStatusWebhook(workspaceId);
  } catch (err) {
    logger.warn({ workspaceId, err: err.message }, 'Template submitted, but delivery reports could not be enabled');
  }

  return binding;
}

// ─── AI drafting ─────────────────────────────────────────────────────────────

/**
 * Keep only what the agent can actually deliver.
 *
 * The model is told to use nothing outside the supplied variables, but a model
 * told a thing is not a model that did it. A placeholder bound to a variable the
 * agent never captures could never be filled — buildPositionalVariables refuses
 * to send in exactly that case — so an invented one is dropped here rather than
 * discovered by a customer not receiving their confirmation.
 *
 * Renumbers what survives so the placeholders still run 1..N with no gaps, which
 * is what Meta requires.
 */
export function sanitiseDraft(draft, allowedKeys) {
  const allowed = new Set((allowedKeys ?? []).map((k) => String(k).trim()).filter(Boolean));
  let bodyText = String(draft?.bodyText ?? '').trim();
  const given = Array.isArray(draft?.placeholders) ? draft.placeholders : [];

  const kept = [];
  let droppedCount = 0;
  for (const p of given) {
    const index = Number(p?.index);
    const key = String(p?.variableKey ?? '').trim();
    if (!Number.isInteger(index) || index < 1) continue;
    if (allowed.has(key)) kept.push({ index, variableKey: key, example: String(p?.example ?? '').trim() });
    else droppedCount += 1;
  }
  kept.sort((a, b) => a.index - b.index);

  // Old index -> new, so the survivors still run 1..N with no gaps.
  const renumber = new Map(kept.map((p, i) => [p.index, i + 1]));

  // ONE pass, rewriting each {{n}} where it stands. Doing it as "replace with a
  // bare number, then turn bare numbers back into placeholders" reads simpler and
  // is wrong: a literal number in the copy gets swept up too, so "table for 4
  // people" comes out as "table for{{4}}people".
  bodyText = bodyText
    .replace(/\{\{(\d+)\}\}/g, (_m, n) => {
      const next = renumber.get(Number(n));
      return next ? `{{${next}}}` : '';
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();

  const placeholders = kept.map((p, i) => ({ ...p, index: i + 1 }));
  return { bodyText, placeholders, droppedCount };
}

/**
 * Draft a message body from a plain-English intent.
 *
 * Returns a draft ONLY — nothing is created on ChatFlow and nothing reaches Meta.
 * The client drops it into the same composer fields as hand-written text so it
 * goes through identical validation before the one shared submit path.
 */
export async function draftTemplate({ intent, variables }) {
  const prompt = String(intent ?? '').trim();
  if (!prompt) throw httpError('Describe the message you want, e.g. "confirm a dental appointment".', 400);

  const available = (Array.isArray(variables) ? variables : [])
    .map((v) => ({ key: String(v?.key ?? '').trim(), description: String(v?.description ?? '').trim() }))
    .filter((v) => v.key);
  if (available.length === 0) {
    throw httpError('Add at least one variable the agent captures before drafting a message.', 400);
  }

  const { getLLMProviderWithFallback } = await import('./llm.factory.js');
  const provider = process.env.DEFAULT_LLM_PROVIDER || 'gemini';
  const model = process.env.DEFAULT_LLM_MODEL || 'gemini-2.5-flash';

  const systemPrompt = `You write WhatsApp Business message templates that Meta will approve.

Rules, all of them hard:
- Use ONLY these variables. Never invent one; a variable that is not listed can never be filled and the message would fail to send.
${available.map((v) => `    ${v.key} — ${v.description || 'no description given'}`).join('\n')}
- Use two or three of them, not all. A template crowded with values reads as spam.
- Placeholders are {{1}}, {{2}}, numbered from 1 with no gaps, in the order they appear.
- Write real sentences around every placeholder. A body that is mostly placeholders is reclassified by Meta from UTILITY to MARKETING, which costs more and needs opt-in.
- Under 1024 characters, and far shorter is better — this is a confirmation, not a letter.
- Plain text. No markdown, no bullet points, no emoji-only content.
- Do not greet with the business name or add marketing language; that also forces MARKETING.

Reply with JSON only, no prose and no code fences:
{"bodyText":"Hi {{1}}, ...","placeholders":[{"index":1,"variableKey":"customer_name","example":"Priya"}]}`;

  const llm = getLLMProviderWithFallback(provider);
  const raw = await llm.generateResponse(
    `Write the message body for: ${prompt}`,
    { model, temperature: 0.3 },
    // Generous on purpose. The body itself is short, but the reply also carries a
    // placeholder object per variable, and a JSON object cut off at the token
    // ceiling does not parse at all — it fails as "no usable draft" rather than as
    // a slightly shorter message, which is a confusing way to lose.
    { systemPrompt, maxTokens: 1400 },
  );
  const text = typeof raw === 'object' ? (raw.message ?? raw.text ?? '') : raw;

  // Reuse the extraction parser rather than a bare JSON.parse: it already strips
  // ```json fences and pulls the outer object out of surrounding prose, which is
  // exactly how these replies go wrong.
  const { parseExtractionResponse } = await import('./postCallExtraction.utils.js');
  let parsed;
  try {
    parsed = parseExtractionResponse(text);
  } catch {
    throw httpError('The model did not return a usable draft. Try describing the message a little differently.', 502);
  }

  const draft = sanitiseDraft(parsed, available.map((v) => v.key));
  if (!draft.bodyText) throw httpError('The draft came back empty. Try describing the message again.', 502);

  // Fill in a label and example for anything the model left thin, so the composer
  // opens ready to submit rather than ready to fill in.
  const placeholders = draft.placeholders.map((p) => {
    const v = available.find((a) => a.key === p.variableKey);
    return {
      index: p.index,
      variableKey: p.variableKey,
      label: v?.description || p.variableKey,
      example: p.example || v?.description || 'Sample',
    };
  });

  return { bodyText: draft.bodyText, placeholders, droppedCount: draft.droppedCount };
}
