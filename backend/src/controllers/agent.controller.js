import prisma from '../config/prisma.js';
import * as sarvamService from '../services/sarvam.service.js';
import { geminiService } from '../services/gemini.service.js';
import * as knowledgeService from '../services/knowledge.service.js';
import logger from '../lib/logger.js';
import fetch from 'node-fetch';

const chatSessions = new Map();
const CHAT_SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const CHAT_SESSION_MAX_TURNS = 24;

const safeJson = (value, fallback = []) => {
  if (value == null) return fallback;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const serializeAgent = (agent) => ({
  ...agent,
  languages: safeJson(agent.languages, []),
  selectedLanguages: safeJson(agent.languages, []),
  flowItems: safeJson(agent.flowItems, null),
});

export const createAgent = async (req, res) => {
  const { workspaceId } = req.params;
  const data = req.body;

  try {
    const normalizedData = {
      ...data,
      languages: JSON.stringify(data.languages ?? data.selectedLanguages ?? []),
      flowItems: data.flowItems == null ? null : JSON.stringify(data.flowItems),
    };

    const agent = await prisma.agent.create({
      data: {
        ...normalizedData,
        workspaceId,
      },
    });
    res.status(201).json(serializeAgent(agent));
  } catch (error) {
    logger.error('Failed to create agent', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
};

export const getAgents = async (req, res) => {
  const { workspaceId } = req.params;

  try {
    const agents = await prisma.agent.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(agents.map(serializeAgent));
  } catch (error) {
    logger.error('Failed to get agents', error);
    res.status(500).json({ error: 'Failed to get agents' });
  }
};

export const getAgent = async (req, res) => {
  const { agentId } = req.params;

  try {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(serializeAgent(agent));
  } catch (error) {
    logger.error('Failed to get agent', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
};

export const updateAgent = async (req, res) => {
  const { agentId } = req.params;
  const data = req.body;

  try {
    // Remove ID and timestamps from body to avoid prisma errors
    const { id, createdAt, updatedAt, workspaceId, ...updateData } = data;

    const normalizedData = {
      ...updateData,
      languages: updateData.languages || updateData.selectedLanguages
        ? JSON.stringify(updateData.languages ?? updateData.selectedLanguages ?? [])
        : undefined,
      flowItems: updateData.flowItems == null
        ? undefined
        : JSON.stringify(updateData.flowItems),
    };

    const agent = await prisma.agent.update({
      where: { id: agentId },
      data: normalizedData,
    });
    res.json(serializeAgent(agent));
  } catch (error) {
    logger.error('Failed to update agent', error, { agentId });
    res.status(500).json({ error: 'Failed to update agent' });
  }
};

export const deleteAgent = async (req, res) => {
  const { agentId } = req.params;

  try {
    await prisma.agent.delete({
      where: { id: agentId },
    });
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete agent', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
};

/**
 * Chat endpoint for multilingual AI responses
 * POST /api/v1/agents/:agentId/chat
 */
const normalizePromptBullets = (items = []) => {
  return items
    .filter((item) => item && item.enabled !== false)
    .map((item, index) => {
      const title = item.title || `Section ${index + 1}`;
      const body = item.body ? `\n${item.body}` : '';
      return `- ${title}${body}`;
    })
    .join('\n');
};

const pruneSessionStore = () => {
  const now = Date.now();
  for (const [key, session] of chatSessions.entries()) {
    if (!session || now - session.updatedAt > CHAT_SESSION_TTL_MS) {
      chatSessions.delete(key);
    }
  }
};

const getChatSessionKey = (req, agentId) => {
  const workspaceId = req.params.workspaceId || req.workspace?.id || req.user?.workspaceId || 'workspace';
  const userKey = req.user?.userId || req.user?.id || req.user?.apiKeyId || req.headers['x-session-id'] || 'anonymous';
  return `${workspaceId}:${agentId}:${userKey}`;
};

const getSessionMemory = (sessionKey) => {
  pruneSessionStore();
  const existing = chatSessions.get(sessionKey);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }

  const created = {
    summary: '',
    facts: {},
    turns: [],
    askedQuestions: new Set(),
    pendingTopic: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  chatSessions.set(sessionKey, created);
  return created;
};

const normalizeText = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');

const extractMemoryFacts = (text) => {
  const lower = text.toLowerCase();
  const facts = {};

  const nameMatch = text.match(/\bmy name is\s+([A-Za-z][A-Za-z\s.'-]{1,60})/i) || text.match(/\bcall me\s+([A-Za-z][A-Za-z\s.'-]{1,60})/i);
  if (nameMatch) facts.name = normalizeText(nameMatch[1]);

  const phoneMatch = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  if (phoneMatch) facts.phone = normalizeText(phoneMatch[0]);

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) facts.email = normalizeText(emailMatch[0]);

  const timeMatch = text.match(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i);
  if (timeMatch) facts.time = normalizeText(timeMatch[0].toLowerCase());

  const dateMatch = text.match(/\b(?:today|tomorrow|day after tomorrow|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i);
  if (dateMatch) facts.date = normalizeText(dateMatch[0].toLowerCase());

  const deptKeywords = ['child specialist', 'pediatric', 'pediatrics', 'doctor visit', 'appointment', 'dentist', 'cardiologist', 'dermatologist', 'general physician', 'physician', 'support', 'billing', 'sales'];
  const foundDept = deptKeywords.find((keyword) => lower.includes(keyword));
  if (foundDept) facts.topic = foundDept;

  return facts;
};

const mergeFacts = (baseFacts, incomingFacts) => {
  const merged = { ...(baseFacts || {}) };
  for (const [key, value] of Object.entries(incomingFacts || {})) {
    if (value) merged[key] = value;
  }
  return merged;
};

const buildMemorySummary = (memory) => {
  const parts = [];
  if (memory.pendingTopic) parts.push(`Current task: ${memory.pendingTopic}`);
  const factLabels = {
    name: 'Name',
    phone: 'Phone',
    email: 'Email',
    date: 'Date',
    time: 'Time',
    topic: 'Topic',
  };
  const factLines = Object.entries(memory.facts || {})
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${factLabels[key] || key}: ${value}`);
  if (factLines.length) parts.push(`Known details: ${factLines.join('; ')}`);
  if (memory.askedQuestions?.size) parts.push(`Already asked: ${Array.from(memory.askedQuestions).slice(-5).join(' | ')}`);
  if (memory.summary) parts.push(`Summary: ${memory.summary}`);
  return parts.join('\n') || '(no prior session memory)';
};

const updateSessionMemory = (memory, userMessage, assistantReply) => {
  const userText = normalizeText(userMessage);
  const assistantText = normalizeText(assistantReply);

  if (userText) {
    memory.turns.push({ role: 'user', text: userText });
    memory.facts = mergeFacts(memory.facts, extractMemoryFacts(userText));
    if (!memory.pendingTopic && memory.facts.topic) {
      memory.pendingTopic = memory.facts.topic;
    }
  }

  if (assistantText) {
    memory.turns.push({ role: 'assistant', text: assistantText });
    const question = assistantText.split('?')[0]?.trim();
    if (assistantText.includes('?') && question) {
      memory.askedQuestions.add(question);
      memory.pendingTopic = memory.pendingTopic || question;
    }
  }

  memory.turns = memory.turns.slice(-CHAT_SESSION_MAX_TURNS);

  const recentTurns = memory.turns
    .slice(-8)
    .map((turn) => `${turn.role === 'assistant' ? 'Assistant' : 'User'}: ${turn.text}`)
    .join('\n');

  memory.summary = [buildMemorySummary(memory), recentTurns].filter(Boolean).join('\n\n').trim();
  memory.updatedAt = Date.now();
};

export const chat = async (req, res) => {
  const { agentId } = req.params;
  const { message, selectedLanguages, welcomeMessage, flowItems: clientFlowItems, voice: clientVoice, chatHistory = [] } = req.body;

  // Validate input
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!Array.isArray(selectedLanguages) || selectedLanguages.length === 0) {
    return res.status(400).json({ error: 'At least one language must be selected' });
  }

  try {
    let agent = null;
    if (process.env.DB_STATUS !== 'unavailable') {
      try {
        agent = await prisma.agent.findUnique({
          where: { id: agentId },
        });
      } catch (dbErr) {
        logger.warn({ dbErr: dbErr.message }, 'Failed to fetch agent from DB for chat context');
      }
    }

    let flowItems = [];
    if (agent && agent.flowItems) {
      flowItems = safeJson(agent.flowItems, []);
    }

    const requestFlowItems = Array.isArray(clientFlowItems) && clientFlowItems.length > 0 ? clientFlowItems : flowItems;
    const selectedVoice = agent?.voice || clientVoice || 'Google - Aoede (female)';

    const agentContext = {
      name: agent?.name || 'AI Assistant',
      welcomeMessage: agent?.welcomeMessage || welcomeMessage || 'Hello!',
      aiModel: agent?.aiModel || 'sarvam-30b',
      voice: selectedVoice,
      transcription: agent?.transcription || 'Azure',
      languages: selectedLanguages,
      flowItems: requestFlowItems,
    };

    logger.debug(
      { agentId, messageLength: message.length, languages: selectedLanguages, hasFlow: flowItems.length > 0 },
      'Chat request received'
    );

    const flowPrompt = normalizePromptBullets(agentContext.flowItems);
    const sessionKey = getChatSessionKey(req, agentId);
    const sessionMemory = getSessionMemory(sessionKey);
    const incomingHistory = Array.isArray(chatHistory)
      ? chatHistory
          .filter((item) => item && typeof item.text === 'string' && item.text.trim())
          .slice(-10)
          .map((item) => ({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: item.text,
          }))
      : [];

    const systemPrompt = `You are the live voice assistant for the agent "${agentContext.name}".

Agent purpose and context:
${agentContext.welcomeMessage}

Configured voice:
${agentContext.voice}

Operating instructions:
- Stay tightly aligned to the agent's business purpose, not generic chatbot behavior.
- If the agent is for appointments, focus on scheduling, confirmations, reschedules, reminders, availability, and follow-ups.
- If the agent is for support, focus on troubleshooting, orders, returns, account issues, and next steps.
- If the agent is for sales or lead qualification, focus on qualification, interest, objections, and booking next actions.
- Ask the next natural follow-up question when needed.
- Keep replies concise, helpful, and spoken-natural.
- Detect the user's language and respond in the same language when possible.

Requested languages:
${selectedLanguages.join(', ')}

Relevant flow / problem-statement context:
${flowPrompt || '(none provided)'}

Session memory:
${buildMemorySummary(sessionMemory)}

Session rules:
- Do not restart the conversation from the beginning if the user already answered something.
- Never repeat a question that is already present in Session memory or the recent chat history.
- Ask only the next missing detail, and ask one concise question at a time.
- Prefer carrying forward the known details instead of re-confirming them.
- If enough details are known, move to the next action immediately.`;

    let knowledgeMatches = [];
    if (agent?.workspaceId) {
      knowledgeMatches = await knowledgeService.findRelevantKnowledge(agent.workspaceId, message, 4);
      if (!knowledgeMatches.length) {
        knowledgeMatches = await knowledgeService.getKnowledgeSnapshot(agent.workspaceId, 3);
      }
    }
    const knowledgeContext = knowledgeService.buildKnowledgeContext(knowledgeMatches);
    const knowledgePrompt = `\n\nKnowledge base context:\n${knowledgeContext}\n\nKnowledge rules:\n- If the workspace has uploaded knowledge documents, answer using only the knowledge base context above.\n- If the knowledge base does not contain the answer, say you could not find it in the uploaded documents and ask the user to upload or clarify.\n- Do not invent facts beyond the uploaded documents.\n- If there are no uploaded knowledge documents, keep the answer general and mention that no knowledge base is available yet.`;

    // Generate response using Gemini
    const response = await geminiService.generateResponse({
      message,
      model: 'gemini-2.5-flash',
      systemPrompt: `${systemPrompt}${knowledgePrompt}`,
      chatHistory: incomingHistory,
    });

    if (!response.success) {
      throw new Error(response.error || 'Gemini API failed to generate response');
    }

    logger.debug(
      { agentId, replyLength: response.message ? response.message.length : 0 },
      'Chat response generated'
    );

    updateSessionMemory(sessionMemory, message, response.message);

    res.json({
      reply: response.message,
      detectedLanguage: 'Auto-detected by Gemini',
      model: response.model,
      tokensUsed: 0,
      timestamp: response.timestamp,
    });
  } catch (err) {
    logger.error({ agentId, error: err.message }, 'Chat error');
    res.status(500).json({
      error: 'Failed to generate response',
      details: err.message,
    });
  }
};

/**
 * Health check for Sarvam AI
 * GET /api/v1/agents/health/sarvam
 */
export const checkSarvamHealth = async (req, res) => {
  try {
    const isHealthy = await sarvamService.checkSarvamHealth();
    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      sarvamUrl: process.env.SARVAM_URL || 'https://api.sarvam.ai/api/v1',
    });
  } catch (err) {
    logger.error({ error: err.message }, 'Sarvam AI health check failed');
    res.status(500).json({
      status: 'error',
      error: err.message,
    });
  }
};

/**
 * Initiate an outbound voice test call using Twilio, falling back to a simulation.
 * POST /api/v1/workspaces/:workspaceId/agents/test-call
 */
export const testCall = async (req, res) => {
  const { agentId, phoneNumber } = req.body;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER || '+15017122661';

  if (!agentId || !phoneNumber) {
    return res.status(400).json({ error: 'agentId and phoneNumber are required' });
  }

  logger.info({ agentId, phoneNumber }, 'Initiating test call');

  // If no Twilio credentials are set, simulate the call with standard success
  if (!accountSid || !authToken) {
    logger.warn('Twilio credentials not found. Simulating test call.');
    return res.json({
      success: true,
      simulated: true,
      message: `[Simulated] Call sent successfully to ${phoneNumber}!`
    });
  }

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const twimlUrl = `http://demo.twilio.com/docs/voice.xml`;

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: phoneNumber,
        From: fromNumber,
        Url: twimlUrl
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.warn({ errorData }, 'Twilio call request failed. Falling back to simulation.');
      return res.json({
        success: true,
        simulated: true,
        message: `[Simulated] Call sent successfully to ${phoneNumber}! (Twilio info: ${errorData.message})`
      });
    }

    const data = await response.json();
    logger.info({ callSid: data.sid }, 'Twilio outbound call initiated');

    res.json({
      success: true,
      simulated: false,
      callSid: data.sid,
      message: `Test call initiated successfully via Twilio!`
    });
  } catch (error) {
    logger.error('Failed to initiate Twilio call, falling back to simulation', error);
    res.json({
      success: true,
      simulated: true,
      message: `[Simulated] Call sent successfully to ${phoneNumber}!`
    });
  }
};
