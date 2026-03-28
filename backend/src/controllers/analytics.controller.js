import * as analyticsService from '../services/analytics.service.js';

export const getOverview = async (req, res) => {
  const metrics = await analyticsService.getOverviewMetrics(req.params.workspaceId);
  res.json(metrics);
};

export const getDeliveryChart = async (req, res) => {
  const data = await analyticsService.getDeliveryRateLast7Days(req.params.workspaceId);
  res.json(data);
};

export const getCampaignPerformance = async (req, res) => {
  const data = await analyticsService.getCampaignPerformance(req.params.workspaceId);
  res.json(data);
};

export const getAgentPerformance = async (req, res) => {
  const data = await analyticsService.getAgentPerformance(req.params.workspaceId);
  res.json(data);
};
