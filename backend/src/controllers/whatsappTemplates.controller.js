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
  res.json({
    templates: bindings.map((b) => ({
      id: b.id,
      presetId: b.presetId,
      name: b.chatflowName,
      language: b.language,
      status: b.status,
      rejectedReason: b.rejectedReason,
      lastCheckedAt: b.lastCheckedAt,
      stale: b.stale === true,
    })),
  });
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
  res.status(created ? 201 : 200).json({
    created,
    template: {
      id: binding.id,
      presetId: binding.presetId,
      name: binding.chatflowName,
      language: binding.language,
      status: binding.status,
      rejectedReason: binding.rejectedReason,
    },
  });
};
