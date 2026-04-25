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
import llmRoutes from './llm.routes.js';
import geminiRoutes from './gemini.routes.js';
import openaiRoutes from './openai.routes.js';
import azureRoutes from './azure.routes.js';
import { getHealth as getGeminiHealth, getMetrics as getGeminiMetrics } from '../controllers/gemini.controller.js';
import { getHealth as getOpenAIHealth, getMetrics as getOpenAIMetrics } from '../controllers/openai.controller.js';
import { getHealth as getAzureHealth, getMetrics as getAzureMetrics } from '../controllers/azure.controller.js';

const router = Router();

// Public config — safe to expose (no secrets)
router.get('/config', (_req, res) => {
  res.json({ metaAppId: process.env.META_APP_ID ?? null });
});

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
ws.use('/llm', llmRoutes);
ws.use('/gemini', geminiRoutes);
ws.use('/openai', openaiRoutes);
ws.use('/azure', azureRoutes);

router.use('/workspaces/:workspaceId', ws);

// Public Diagnostic Endpoints (Controlled)
router.get('/gemini/health', (req, res, next) => {
  req.params.workspaceId = 'public'; // Mock for logging
  next();
}, getGeminiHealth);

router.get('/gemini/metrics', (req, res, next) => {
  req.params.workspaceId = 'public';
  next();
}, getGeminiMetrics);

router.get('/openai/health', (req, res, next) => {
  req.params.workspaceId = 'public';
  next();
}, getOpenAIHealth);

router.get('/openai/metrics', (req, res, next) => {
  req.params.workspaceId = 'public';
  next();
}, getOpenAIMetrics);

router.get('/azure/health', (req, res, next) => {
  req.params.workspaceId = 'public';
  next();
}, getAzureHealth);

router.get('/azure/metrics', (req, res, next) => {
  req.params.workspaceId = 'public';
  next();
}, getAzureMetrics);

export default router;
