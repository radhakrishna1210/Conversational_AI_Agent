import * as convService from '../services/conversation.service.js';
import { initSseResponse, addClient } from '../lib/sse.js';

export const listConversations = async (req, res) => {
  const result = await convService.listConversations(req.params.workspaceId, req.query);
  res.json(result);
};

export const getConversation = async (req, res) => {
  const conv = await convService.getConversation(req.params.workspaceId, req.params.convId);
  res.json(conv);
};

export const assignAgent = async (req, res) => {
  const conv = await convService.assignAgent(
    req.params.workspaceId, req.params.convId, req.body.agentId
  );
  res.json(conv);
};

export const updateConversation = async (req, res) => {
  const conv = await convService.updateConversation(
    req.params.workspaceId, req.params.convId, req.body
  );
  res.json(conv);
};

export const markRead = async (req, res) => {
  const conv = await convService.markRead(req.params.workspaceId, req.params.convId);
  res.json(conv);
};

// SSE stream for real-time inbox updates
export const streamEvents = (req, res) => {
  initSseResponse(res);
  addClient(req.params.workspaceId, res);
};
