import * as analyticsService from '../services/analytics.service.js';

export const getOverviewMetrics = async (req, res, next) => {
  try {
    const workspaceId = req.workspace?.id || req.headers['x-workspace-id'];

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace identification context is missing' });
    }

    const metrics = await analyticsService.getOverviewMetrics(workspaceId);
    return res.status(200).json(metrics);
  } catch (error) {
    next(error);
  }
};

export const getDeliveryRateLast7Days = async (req, res, next) => {
  try {
    const workspaceId = req.workspace?.id || req.headers['x-workspace-id'];
    const data = await analyticsService.getDeliveryRateLast7Days(workspaceId);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

export const getCampaignPerformance = async (req, res, next) => {
  try {
    const workspaceId = req.workspace?.id || req.headers['x-workspace-id'];
    const data = await analyticsService.getCampaignPerformance(workspaceId);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

export const getAgentPerformance = async (req, res, next) => {
  try {
    const workspaceId = req.workspace?.id || req.headers['x-workspace-id'];
    const data = await analyticsService.getAgentPerformance(workspaceId);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

// Backwards-compatible aliases for older route names.
export const getOverview = getOverviewMetrics;
export const getDeliveryChart = getDeliveryRateLast7Days;
