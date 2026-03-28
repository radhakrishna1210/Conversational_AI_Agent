/**
 * Minimal SSE connection registry for real-time inbox updates.
 * Maps workspaceId → Set of SSE response objects.
 */
const clients = new Map();

export const addClient = (workspaceId, res) => {
  if (!clients.has(workspaceId)) clients.set(workspaceId, new Set());
  clients.get(workspaceId).add(res);

  res.on('close', () => {
    clients.get(workspaceId)?.delete(res);
    if (clients.get(workspaceId)?.size === 0) clients.delete(workspaceId);
  });
};

export const broadcast = (workspaceId, eventName, data) => {
  const workspaceClients = clients.get(workspaceId);
  if (!workspaceClients) return;

  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of workspaceClients) {
    res.write(payload);
  }
};

export const initSseResponse = (res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  // Send a heartbeat comment to keep connection alive
  res.write(': heartbeat\n\n');
};
