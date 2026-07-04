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

import { getHealth as getGeminiHealth, getMetrics as getGeminiMetrics } from '../controllers/gemini.controller.js';
import { getHealth as getOpenAIHealth, getMetrics as getOpenAIMetrics } from '../controllers/openai.controller.js';
import { getHealth as getAzureHealth, getMetrics as getAzureMetrics } from '../controllers/azure.controller.js';
import { generateAgentFlow } from '../controllers/llm.controller.js';
import { buildAssistantRequestPayload } from '../lib/chatHistoryFormatter.js';

const router = Router();

// Public config — safe to expose (no secrets)
router.get('/config', (_req, res) => {
  res.json({ metaAppId: process.env.META_APP_ID ?? null });
});

// Public
router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);
router.use('/integrations', integrationsPublicRoutes);

// Public AI Assistant chat — no auth required, always works
router.post('/assistant/chat', async (req, res) => {
  console.log("✅ Assistant chat endpoint hit");
console.log(req.body);
  try {
    const { message, systemPrompt, history } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const { message: cleanedMessage, chatHistory, systemPrompt: resolvedSystemPrompt } = buildAssistantRequestPayload({
      message,
      history,
      systemPrompt,
    });

    const normalizedMessage = cleanedMessage.toLowerCase().replace(/[^a-z0-9\s?]/g, ' ').replace(/\s+/g, ' ').trim();
    const isPlatformQuestion = /\b(what|who|which|where|why|how)\b.*\b(platform|website|product|service|omnidimension|omni dimension)\b/i.test(normalizedMessage);
    const isAssistantQuestion = /\b(what|who|which|where|why|how)\b.*\b(ai assistant|assistant|voice ai|voice assistant|chatbot)\b/i.test(normalizedMessage);
    const isVoiceAssistantQuestion = /\b(what|who|which|where|why|how)\b.*\b(voice assistant|voice ai|voice bot)\b/i.test(normalizedMessage);
    const isHowItWorksQuestion = /\b(what|who|which|where|why|how)\b.*\b(work|works|function|functions|operate|operates)\b/i.test(normalizedMessage);
    const isSetupTimeQuestion = /\b(how long|setup|takes|time|minutes|hours)\b/i.test(normalizedMessage);
    const isFreeTrialQuestion = /\b(free|trial|demo|test)\b/i.test(normalizedMessage);
    const isCodingKnowledgeQuestion = /\b(coding|code|developer|programming|technical|tech)\b/i.test(normalizedMessage);
    const yesNoQuestion = /\b(yes|no)\b/i.test(normalizedMessage) || (/\?/.test(message.trim()) && /\b(is|are|do|does|did|can|could|would|should|will|have|has|need|must|shall)\b/i.test(normalizedMessage));

    if (isPlatformQuestion) {
      return res.json({
        success: true,
        message: 'This is OmniDimension, a voice AI platform for building assistants, managing contacts, running WhatsApp campaigns, and connecting integrations from one dashboard.',
      });
    }

    if (isAssistantQuestion) {
      return res.json({
        success: true,
        message: 'An AI assistant is a smart helper that understands questions, guides conversations, and automates tasks like answering customers or booking appointments.',
      });
    }

    if (isVoiceAssistantQuestion || isHowItWorksQuestion) {
      return res.json({
        success: true,
        message: 'A voice assistant listens to spoken questions, understands them, and replies with a voice answer or action. It is commonly used for support, booking, and automation.',
      });
    }

    if (isSetupTimeQuestion) {
      return res.json({
        success: true,
        message: 'Setup usually takes only a few minutes to get started, and a bit longer if you are configuring custom flows or integrations.',
      });
    }

    if (isFreeTrialQuestion) {
      return res.json({
        success: true,
        message: 'Yes, a free trial or demo is typically available so you can explore the platform before committing to a paid plan.',
      });
    }

    if (isCodingKnowledgeQuestion) {
      return res.json({
        success: true,
        message: 'No coding knowledge is required for the basic experience. You can build and manage assistants using the visual tools, and coding is only needed for advanced custom integrations.',
      });
    }

    if (yesNoQuestion) {
      return res.json({
        success: true,
        message: 'Yes — Kelvin can help answer yes/no questions about building agents, training your assistant, WhatsApp integration, API keys, and dashboard features.',
      });
    }

    // Try real LLM provider with fallback, ultimately falls back to mock
    console.log("STEP 1");

    const provider = getLLMProviderWithFallback('openai');
    console.log("STEP 2", provider);
    console.log("STEP 3");
    
    // console.log("Provider:", provider.constructor.name); 
    const response = await provider.generateResponse(
      cleanedMessage,
      { model: 'gpt-4o-mini', temperature: 0.7 },
      {
        systemPrompt: resolvedSystemPrompt || "You are a helpful AI assistant representing the OmniDimension Conversational Voice AI platform. Your job is to answer the user's questions about configuring their agent, setting up integrations (like N8N, Genesys, Twilio), setting up speech-to-text / text-to-speech, and configuring languages. Be concise, professional, and friendly.",
        maxTokens: 2000,
        chatHistory,
      }
    );
    console.log("STEP 4", response);

    // Handle both string and object responses (mock returns object, real LLM returns string)
    const replyText = typeof response === 'object' ? response.message : response;
    res.json({ success: true, message: replyText });
  } catch (err) {
  console.error("🔥 Assistant Chat Error:", err);

  res.status(500).json({
    success: false,
    error: err.message,
    stack: err.stack
    // stack: process.env.NODE_ENV !== "production" ? err.stack : undefined
  });
}
});

// Public LLM — generate-flow needs no auth (only takes a name, returns AI config)
router.post('/llm/generate-flow', generateAgentFlow);

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
