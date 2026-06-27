import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { workspaceContext } from '../middleware/workspaceContext.js';
import { mockLLMService } from '../services/llm/mock.service.js';
import { getLLMProviderWithFallback } from '../services/llm.factory.js';
import logger from '../lib/logger.js';

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
import agentRoutes from './agent.routes.js';
import integrationsRoutes from './integrations.routes.js';
import integrationsPublicRoutes from './integrationsPublic.routes.js';
import notificationRoutes from './notification.routes.js';
import contactFormRoutes from './contactForm.routes.js';
import appointmentRoutes from './appointment.routes.js';
import reportIssueRoutes from './reportIssue.routes.js';

import { getHealth as getGeminiHealth, getMetrics as getGeminiMetrics } from '../controllers/gemini.controller.js';
import { getHealth as getOpenAIHealth, getMetrics as getOpenAIMetrics } from '../controllers/openai.controller.js';
import { getHealth as getAzureHealth, getMetrics as getAzureMetrics } from '../controllers/azure.controller.js';
import { generateAgentFlow , enhancePrompt} from '../controllers/llm.controller.js';

const router = Router();

// Public config — safe to expose (no secrets)
router.get('/config', (_req, res) => {
  res.json({ metaAppId: process.env.META_APP_ID ?? null });
});

// Public
router.use('/auth', authRoutes);
router.use('/contact-form', contactFormRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/report-issue', reportIssueRoutes);
router.use('/agents', agentRoutes);
router.use('/integrations', integrationsPublicRoutes);

// Public AI Assistant chat — no auth required, always works
router.post('/assistant/chat', async (req, res) => {
  try {
    const { message, systemPrompt } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Try real LLM provider with fallback, ultimately falls back to mock
    const provider = getLLMProviderWithFallback('gemini');
    const response = await provider.generateResponse(
      message,
      { model: 'gemini-2.5-flash', temperature: 0.7 },
      {
        systemPrompt: systemPrompt || "You are a helpful AI assistant representing the OmniDimension Conversational Voice AI platform. Your job is to answer the user's questions about configuring their agent, setting up integrations (like N8N, Genesys, Twilio), setting up speech-to-text / text-to-speech, and configuring languages. Be concise, professional, and friendly.",
        maxTokens: 2000,
      }
    );

    // Handle both string and object responses (mock returns object, real LLM returns string)
    const replyText = typeof response === 'object' ? response.message : response;
    res.json({ success: true, message: replyText });
  } catch (err) {
    logger.error('Assistant chat error:', err);
    res.status(500).json({
      error: 'Failed to generate response',
      message: "I'm having trouble right now. Please try again in a moment.",
    });
  }
});

// Public LLM — generate-flow needs no auth (only takes a name, returns AI config)
router.post('/llm/generate-flow', generateAgentFlow);
router.post('/llm/enhance-prompt', enhancePrompt);

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
ws.use('/agents', agentRoutes);
ws.use('/integrations', integrationsRoutes);
ws.use('/notifications', notificationRoutes);


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
