/**
 * The dashboard's view of WhatsApp templates.
 *
 * The client never opens ChatFlow to do this: they pick a preset here, Spandan
 * submits it to Meta through ChatFlow, and this is where they watch it move from
 * Pending to Approved. See services/whatsappTemplates.service.js for why the
 * status is polled rather than pushed.
 *
 * Errors are thrown, not returned — express-async-errors plus middleware/
 * errorHandler.js turns a thrown error carrying `statusCode` into that status,
 * which is how every other controller here reports failure.
 */
import * as service from '../services/whatsappTemplates.service.js';
import { getPreset } from '../constants/whatsappTemplatePresets.js';

/**
 * One shape for both origins.
 *
 * A preset's wording lives in a constant and a custom template's lives on the row,
 * so this backfills presets from `getPreset` — the client should not have to care
 * which kind it is holding.
 */
const serializeBinding = (b) => {
  const preset = b.presetId ? getPreset(b.presetId) : null;
  return {
    id: b.id,
    origin: b.origin ?? (b.presetId ? 'preset' : 'custom'),
    presetId: b.presetId,
    label: b.label ?? preset?.label ?? b.chatflowName,
    bodyText: b.bodyText ?? preset?.bodyText ?? null,
    placeholders: b.placeholders ?? preset?.placeholders ?? [],
    category: b.category ?? preset?.category ?? null,
    name: b.chatflowName,
    language: b.language,
    status: b.status,
    rejectedReason: b.rejectedReason,
    lastCheckedAt: b.lastCheckedAt,
    stale: b.stale === true,
  };
};

/** GET /workspaces/:workspaceId/whatsapp-templates/presets */
export const getPresets = async (_req, res) => {
  res.json({ presets: service.listPresets() });
};

/**
 * GET /workspaces/:workspaceId/whatsapp-templates
 *
 * Refreshes from ChatFlow on read. A row comes back `stale: true` when ChatFlow
 * could not be reached — the cached status is still shown rather than an empty
 * page, and the UI can say so.
 */
export const listTemplates = async (req, res) => {
  const bindings = await service.refreshBindings(req.params.workspaceId);
  res.json({ templates: bindings.map(serializeBinding) });
};

/**
 * POST /workspaces/:workspaceId/whatsapp-templates  { presetId }
 *
 * Creating is submitting: ChatFlow forwards to Meta in the same call, so this
 * returns a PENDING template, never a sendable one. `created: false` means an
 * existing binding was reused — that is the duplicate guard doing its job, not a
 * failure, so it is still a 200.
 */
export const createTemplate = async (req, res) => {
  const presetId = String(req.body?.presetId ?? '').trim();
  if (!presetId) {
    throw Object.assign(new Error('presetId is required'), { statusCode: 400 });
  }

  const { binding, created } = await service.createTemplateFromPreset(req.params.workspaceId, presetId);
  res.status(created ? 201 : 200).json({ created, template: serializeBinding(binding) });
};

/**
 * POST /workspaces/:workspaceId/whatsapp-templates/custom
 *
 * A template the client wrote, or accepted from a draft. Same submission and the
 * same approval wait as a preset — only the wording's origin differs.
 */
export const createCustomTemplate = async (req, res) => {
  const binding = await service.createCustomTemplate(
    req.params.workspaceId,
    {
      label: req.body?.label,
      category: req.body?.category,
      language: req.body?.language,
      bodyText: req.body?.bodyText,
      placeholders: req.body?.placeholders,
    },
    req.user?.userId ?? null,
  );
  res.status(201).json({ created: true, template: serializeBinding(binding) });
};

/**
 * POST /workspaces/:workspaceId/whatsapp-templates/draft
 *
 * Drafts a body from a plain-English intent. Returns a draft only — nothing is
 * created and nothing reaches Meta, so the client can show it for review and it
 * still goes through the same validation as hand-written text on submit.
 */
export const draftTemplate = async (req, res) => {
  const out = await service.draftTemplate({
    intent: req.body?.intent,
    variables: req.body?.variables,
  });
  res.json(out);
};
