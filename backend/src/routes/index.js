import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { workspaceContext } from '../middleware/workspaceContext.js';

import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import workspaceRoutes from './workspace.routes.js';
import whatsappRoutes from './whatsapp.routes.js';
import metaOauthRoutes from './metaOauth.routes.js';
import apiKeyRoutes from './apiKey.routes.js';
import webhookRoutes from './webhook.routes.js';
import templateRoutes from './template.routes.js';
import contactRoutes from './contact.routes.js';
import campaignRoutes from './campaign.routes.js';
import conversationRoutes from './conversation.routes.js';
import automationRoutes from './automation.routes.js';
import analyticsRoutes from './analytics.routes.js';
import settingsRoutes from './settings.routes.js';

const router = Router();

// Public
router.use('/auth', authRoutes);

// Admin (authenticate + isAdmin enforced inside admin.routes.js)
router.use('/admin', adminRoutes);

// Meta webhook (public — verified by Meta challenge / HMAC)
router.use('/', webhookRoutes);

// Workspace-scoped (authenticated)
const ws = Router({ mergeParams: true });
ws.use(authenticate);
ws.use(workspaceContext);

ws.use('/', workspaceRoutes);
ws.use('/whatsapp', whatsappRoutes);
ws.use('/meta/oauth', metaOauthRoutes);
ws.use('/api-keys', apiKeyRoutes);
ws.use('/templates', templateRoutes);
ws.use('/contacts', contactRoutes);
ws.use('/campaigns', campaignRoutes);
ws.use('/conversations', conversationRoutes);
ws.use('/automation', automationRoutes);
ws.use('/analytics', analyticsRoutes);
ws.use('/settings', settingsRoutes);

router.use('/workspaces/:workspaceId', ws);

export default router;
