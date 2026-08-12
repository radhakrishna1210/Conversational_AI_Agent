import { Router } from 'express';
import {
  getCallOverview,
  getCallTimeSeries,
  getCallOutcomes,
  getSentimentDistribution,
  getHourlyHeatmap,
  getCallLogs,
  getAssistantPerformance,
  getAssistantsList,
} from '../controllers/analytics.controller.js';

const router = Router({ mergeParams: true });

// Message delivery, contact opt-out and chatbot-conversation analytics used to
// be served here. They counted rows in Message, Contact and Conversation, all
// of which went with the WhatsApp models.

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
