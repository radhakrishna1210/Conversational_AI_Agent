import prisma from '../config/prisma.js';
import * as sarvamService from '../services/sarvam.service.js';
import logger from '../lib/logger.js';

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
export const chat = async (req, res) => {
  const { agentId } = req.params;
  const { message, selectedLanguages, welcomeMessage } = req.body;

  // Validate input
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!Array.isArray(selectedLanguages) || selectedLanguages.length === 0) {
    return res.status(400).json({ error: 'At least one language must be selected' });
  }

  try {
    const agentContext = {
      welcomeMessage: welcomeMessage || 'You are a helpful assistant.',
    };

    logger.debug(
      { agentId, messageLength: message.length, languages: selectedLanguages },
      'Chat request received'
    );

    // Generate response using Sarvam AI
    const response = await sarvamService.generateResponse(
      message,
      selectedLanguages,
      agentContext
    );

    logger.debug(
      { agentId, replyLength: response.reply.length, detectedLanguage: response.detectedLanguage },
      'Chat response generated'
    );

    res.json({
      reply: response.reply,
      detectedLanguage: response.detectedLanguage,
      model: response.model,
      tokensUsed: response.tokensUsed,
      timestamp: new Date().toISOString(),
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
