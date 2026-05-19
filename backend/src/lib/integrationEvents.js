import { addClient, broadcast, initSseResponse } from './sse.js';

export const registerIntegrationClient = (workspaceId, res) => {
  initSseResponse(res);
  addClient(workspaceId, res);
  res.write(`event: ready\ndata: ${JSON.stringify({ workspaceId, channel: 'integrations' })}\n\n`);
};

export const broadcastIntegrationEvent = (workspaceId, event, data) => {
  broadcast(workspaceId, event, data);
};
