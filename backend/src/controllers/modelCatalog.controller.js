/**
 * Models — Super Admin only.
 *
 * Two jobs:
 *   access      which models exist on this platform at all (on/off per model)
 *   assignment  which LLM and transcription model clients' calls run on — the
 *               platform default, and a per-client override. Clients do not
 *               choose these; see services/platform/modelAssignments.js.
 */
import logger from '../lib/logger.js';
import {
  findCatalogEntry,
  getCatalogForAdmin,
  setModelsEnabled,
} from '../services/platform/modelCatalog.js';
import {
  ASSIGNED_GROUPS,
  assignmentsUsing,
  configurationWarnings,
  getAssignmentsForAdmin,
  setModelDefaults,
  setWorkspaceModels,
} from '../services/platform/modelAssignments.js';
import { writeAudit, AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../services/audit.service.js';

const sendError = (res, err, fallback) => {
  if (!err.status) logger.error(fallback, err);
  res.status(err.status ?? 500).json({ error: err.status ? err.message : fallback });
};

/** GET /admin/model-catalog */
export const adminGetCatalog = async (_req, res) => {
  try {
    res.json({ groups: await getCatalogForAdmin() });
  } catch (err) {
    sendError(res, err, 'Failed to load the model catalogue');
  }
};

/**
 * Refuse to switch off an LLM or transcription model that calls are assigned
 * to. Off would otherwise mean "hidden from this page, still running for those
 * clients", which is the opposite of what the switch says.
 *
 * @returns {Promise<string|null>} the refusal message, or null when fine
 */
const disableConflict = async (updates) => {
  for (const [id, on] of Object.entries(updates ?? {})) {
    if (on !== false) continue;
    const [group] = String(id).split(':');
    if (!ASSIGNED_GROUPS.includes(group)) continue;

    const entry = (await getCatalogForAdmin())
      .find((g) => g.key === group)?.models.find((m) => m.id === id);
    if (!entry || !findCatalogEntry(group, entry.value)) continue;

    const use = await assignmentsUsing(group, entry.value);
    const where = [
      use.isDefault ? 'the platform default' : null,
      use.workspaceIds.length ? `assigned to ${use.workspaceIds.length} client${use.workspaceIds.length === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    if (where.length) {
      return `"${entry.label}" is ${where.join(' and ')}. Assign something else first, then switch it off.`;
    }
  }
  return null;
};

/**
 * PUT /admin/model-catalog
 * Body: { updates: { "<modelId>": boolean, ... } }
 *
 * Partial by design — the panel sends only the toggle that moved, so two admins
 * editing different groups cannot overwrite each other.
 */
export const adminSetCatalog = async (req, res) => {
  try {
    const updates = req.body?.updates ?? req.body;

    const conflict = await disableConflict(updates);
    if (conflict) return res.status(409).json({ error: conflict });

    await setModelsEnabled(updates);

    // Who may use which model is an access-control decision, so it belongs in
    // the audit log next to bans and wallet credits. writeAudit never throws.
    await writeAudit(req, {
      action: AUDIT_ACTIONS.MODEL_CATALOG_UPDATE,
      category: AUDIT_CATEGORIES.SYSTEM,
      targetType: 'platform',
      targetId: 'model-catalog',
      targetLabel: 'Model access',
      after: updates,
    });

    res.json({ groups: await getCatalogForAdmin() });
  } catch (err) {
    sendError(res, err, 'Failed to save the model catalogue');
  }
};

/** GET /admin/model-assignments — defaults, and every client with its override. */
export const adminGetAssignments = async (_req, res) => {
  try {
    res.json(await getAssignmentsForAdmin());
  } catch (err) {
    sendError(res, err, 'Failed to load model assignments');
  }
};

/**
 * PUT /admin/model-assignments/defaults
 * Body: { llm?: string|null, stt?: string|null } — absent leaves it, null clears.
 */
export const adminSetDefaults = async (req, res) => {
  try {
    const { before, after } = await setModelDefaults(req.body ?? {});
    await writeAudit(req, {
      action: AUDIT_ACTIONS.MODEL_DEFAULTS_UPDATE,
      category: AUDIT_CATEGORIES.SYSTEM,
      targetType: 'platform',
      targetId: 'model-defaults',
      targetLabel: 'Platform model defaults',
      before,
      after,
    });
    res.json({ defaults: after, warnings: configurationWarnings(after) });
  } catch (err) {
    sendError(res, err, 'Failed to save the platform defaults');
  }
};

/**
 * PUT /admin/model-assignments/workspaces/:workspaceId
 * Body: { llm?: string|null, stt?: string|null } — null clears back to default.
 */
export const adminSetWorkspaceModels = async (req, res) => {
  const { workspaceId } = req.params;
  try {
    const { before, after } = await setWorkspaceModels(workspaceId, req.body ?? {});
    await writeAudit(req, {
      action: AUDIT_ACTIONS.MODEL_WORKSPACE_OVERRIDE,
      category: AUDIT_CATEGORIES.SYSTEM,
      targetType: 'Workspace',
      targetId: workspaceId,
      targetLabel: 'Client models',
      workspaceId,
      before,
      after,
    });
    res.json({ workspaceId, ...after, warnings: configurationWarnings(after) });
  } catch (err) {
    sendError(res, err, 'Failed to save the client models');
  }
};
