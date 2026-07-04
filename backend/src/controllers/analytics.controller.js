import * as svc from '../services/analytics.service.js';

// ─── WhatsApp / Chatbot ───────────────────────────────────────────────────────

export const getOverview = async (req, res) => {
  const data = await svc.getOverviewMetrics(req.params.workspaceId);
  res.json(data);
};

export const getDeliveryChart = async (req, res) => {
  const data = await svc.getDeliveryRateLast7Days(req.params.workspaceId);
  res.json(data);
};

export const getCampaignPerformance = async (req, res) => {
  const data = await svc.getCampaignPerformance(req.params.workspaceId);
  res.json(data);
};

export const getAgentPerformance = async (req, res) => {
  const data = await svc.getAgentPerformance(req.params.workspaceId);
  res.json(data);
};

export const getChatbotOverview = async (req, res) => {
  const { workspaceId } = req.params;
  const { range = '7d' } = req.query;
  const data = await svc.getChatbotOverview(workspaceId, range);
  res.json({ success: true, data });
};

// ─── Voice / Call ─────────────────────────────────────────────────────────────

export const getCallOverview = async (req, res) => {
  const { workspaceId } = req.params;
  const { range = '7d', agentId, assistantId, from, to } = req.query;
  const data = await svc.getCallOverview(
    workspaceId,
    range,
    agentId || assistantId || null,
    from || null,
    to   || null,
  );
  res.json({ success: true, data });
};

export const getCallTimeSeries = async (req, res) => {
  const { workspaceId } = req.params;
  const { metric = 'volume', range = '7d', agentId, assistantId, from, to } = req.query;
  const data = await svc.getCallTimeSeries(
    workspaceId,
    metric,
    range,
    agentId || assistantId || null,
    from || null,
    to   || null,
  );
  res.json({ success: true, data });
};

export const getCallOutcomes = async (req, res) => {
  const { workspaceId } = req.params;
  const { range = '7d', agentId, assistantId } = req.query;
  const data = await svc.getCallOutcomes(workspaceId, range, agentId || assistantId || null);
  res.json({ success: true, data });
};

export const getSentimentDistribution = async (req, res) => {
  const { workspaceId } = req.params;
  const { range = '7d', agentId, assistantId } = req.query;
  const data = await svc.getSentimentDistribution(workspaceId, range, agentId || assistantId || null);
  res.json({ success: true, data });
};

export const getHourlyHeatmap = async (req, res) => {
  const { workspaceId } = req.params;
  const { range = '7d', agentId, assistantId } = req.query;
  const data = await svc.getHourlyHeatmap(workspaceId, range, agentId || assistantId || null);
  res.json({ success: true, data });
};

export const getCallLogs = async (req, res) => {
  const { workspaceId } = req.params;
  const data = await svc.getCallLogs(workspaceId, {
    page:        parseInt(req.query.page)  || 1,
    limit:       parseInt(req.query.limit) || 20,
    range:       req.query.range      || '7d',
    assistantId: req.query.agentId    || req.query.assistantId || null,
    status:      req.query.status     || null,
    direction:   req.query.direction  || null,
    search:      req.query.search     || null,
    sortBy:      req.query.sortBy     || 'startedAt',
    sortOrder:   req.query.sortOrder  || 'desc',
    from:        req.query.from       || null,
    to:          req.query.to         || null,
  });
  res.json({ success: true, data });
};

export const getAssistantPerformance = async (req, res) => {
  const { workspaceId } = req.params;
  const { range = '7d' } = req.query;
  const data = await svc.getAssistantPerformance(workspaceId, range);
  res.json({ success: true, data });
};

export const getAssistantsList = async (req, res) => {
  const { workspaceId } = req.params;
  const data = await svc.getAssistantsList(workspaceId);
  res.json({ success: true, data });
};
