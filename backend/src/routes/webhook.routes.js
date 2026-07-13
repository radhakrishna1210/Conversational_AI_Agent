import { Router } from 'express';
import * as ctrl from '../controllers/webhook.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { workspaceContext } from '../middleware/workspaceContext.js';
import { validate } from '../middleware/validate.js';
import { webhookConfigSchema } from '../validators/settings.validator.js';

const router = Router();

// Meta platform webhook endpoints (no auth — verified by hub.verify_token / HMAC)
router.get('/meta', ctrl.metaVerify);
router.post('/meta', ctrl.metaReceive);

// Workspace-scoped webhook config (requires auth)
router.get('/workspaces/:workspaceId/webhook', authenticate, workspaceContext, ctrl.getConfig);
router.put('/workspaces/:workspaceId/webhook', authenticate, workspaceContext, validate(webhookConfigSchema), ctrl.upsertConfig);
router.post('/workspaces/:workspaceId/webhook/test', authenticate, workspaceContext, ctrl.testPing);

export default router;
