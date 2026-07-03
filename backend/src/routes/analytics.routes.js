import { Router } from 'express';
import {
  getOverview,
  getDeliveryChart,
  getCampaignPerformance,
  getAgentPerformance,
  getChatbotOverview,
  getCallOverview,
  getCallTimeSeries,
  getCallOutcomes,
  getSentimentDistribution,
  getHourlyHeatmap,
  getCallLogs,
  getAssistantPerformance,
  getAssistantsList,
} from '../controllers/analytics.controller.js';

const router = Router();

// ─── WhatsApp / Chatbot routes ────────────────────────────────────────────────
router.get('/overview',            getOverview);
router.get('/delivery-chart',      getDeliveryChart);
router.get('/delivery',            getDeliveryChart);        // alias used by frontend
router.get('/campaign-performance', getCampaignPerformance);
router.get('/campaigns',           getCampaignPerformance);  // alias used by frontend
router.get('/agent-performance',   getAgentPerformance);
router.get('/agents',              getAgentPerformance);     // alias used by frontend
router.get('/chatbot/overview',    getChatbotOverview);

// ─── Voice / Call routes ──────────────────────────────────────────────────────
router.get('/calls/overview',        getCallOverview);
router.get('/calls/timeseries',      getCallTimeSeries);
router.get('/calls/outcomes',        getCallOutcomes);
router.get('/calls/sentiment',       getSentimentDistribution);
router.get('/calls/heatmap',         getHourlyHeatmap);
router.get('/calls/logs',            getCallLogs);
router.get('/calls/assistants',      getAssistantPerformance);
router.get('/calls/assistants-list', getAssistantsList);

export default router;
