/**
 * Model access control — Super Admin decides which models clients can use.
 *
 * Two audiences, two shapes:
 *   admin  — the full catalogue with enabled/configured state, and the writer
 *   client — only the entries that are enabled right now
 */
import logger from '../lib/logger.js';
import {
  getCatalogForAdmin,
  getEnabledCatalog,
  setModelsEnabled,
} from '../services/platform/modelCatalog.js';
import { writeAudit, AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../services/audit.service.js';

/** GET /admin/model-catalog */
export const adminGetCatalog = async (_req, res) => {
  try {
    res.json({ groups: await getCatalogForAdmin() });
  } catch (err) {
    logger.error('adminGetCatalog failed', err);
    res.status(500).json({ error: 'Failed to load the model catalogue' });
  }
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
    if (!err.status) logger.error('adminSetCatalog failed', err);
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to save the model catalogue' });
  }
};

/** GET /workspaces/:workspaceId/model-catalog — what this client may pick from. */
export const clientGetCatalog = async (_req, res) => {
  try {
    res.json(await getEnabledCatalog());
  } catch (err) {
    logger.error('clientGetCatalog failed', err);
    res.status(500).json({ error: 'Failed to load available models' });
  }
};
