import prisma from '../config/prisma.js';
import * as sarvamService from '../services/sarvam.service.js';
import { geminiService } from '../services/gemini.service.js';
import logger from '../lib/logger.js';
import fetch from 'node-fetch';

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

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

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

// Keep track of active test chat sessions in-memory to maintain context during a session
const testChatSessions = new Map();
const MAX_SESSIONS = 1000;

function pruneTestChatSessions() {
  if (testChatSessions.size > MAX_SESSIONS) {
    const keys = Array.from(testChatSessions.keys());
    // Evict oldest 100 sessions
    for (let i = 0; i < 100; i++) {
      testChatSessions.delete(keys[i]);
    }
  }
}

/**
 * Chat endpoint for multilingual AI responses
 * POST /api/v1/agents/:agentId/chat
 */
export const chat = async (req, res) => {
  const { agentId } = req.params;
  const { message, selectedLanguages, welcomeMessage, conversationId } = req.body;

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

    const agentContext = {
      name: agent?.name || 'AI Assistant',
      welcomeMessage: agent?.welcomeMessage || welcomeMessage || 'Hello!',
      aiModel: agent?.aiModel || 'sarvam-30b',
      voice: agent?.voice || 'Google',
      transcription: agent?.transcription || 'Azure',
      languages: selectedLanguages,
      flowItems,
    };

    logger.debug(
      { agentId, messageLength: message.length, languages: selectedLanguages, hasFlow: flowItems.length > 0, conversationId },
      'Chat request received'
    );

    const systemPrompt = `You are a helpful multilingual assistant. 
Agent context: ${agentContext.welcomeMessage}
Important: You must detect the language of the user's message and respond in the same language. 
Ensure your response aligns with one of the following requested languages if possible: ${selectedLanguages.join(', ')}.`;

    // Load conversation history from memory store
    let chatHistory = [];
    if (conversationId) {
      if (!testChatSessions.has(conversationId)) {
        pruneTestChatSessions();
        testChatSessions.set(conversationId, []);
      }
      chatHistory = testChatSessions.get(conversationId);
    }

    // Generate response using Gemini
    const response = await geminiService.generateResponse({
      message,
      model: 'gemini-2.5-flash',
      systemPrompt: systemPrompt,
      chatHistory: chatHistory
    });

    if (!response.success) {
      throw new Error(response.error || 'Gemini API failed to generate response');
    }

    // Append to memory history upon success
    if (conversationId) {
      chatHistory.push({ role: 'user', content: message });
      chatHistory.push({ role: 'assistant', content: response.message });
      // Limit size of history buffer
      if (chatHistory.length > 40) {
        chatHistory.splice(0, chatHistory.length - 40);
      }
    }

    logger.debug(
      { agentId, replyLength: response.message ? response.message.length : 0 },
      'Chat response generated'
    );

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
