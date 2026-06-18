import { Router } from 'express';
import * as ctrl from '../controllers/analytics.controller.js';

const router = Router({ mergeParams: true });

router.get('/overview', ctrl.getOverviewMetrics);
router.get('/delivery', ctrl.getDeliveryRateLast7Days);
router.get('/campaigns', ctrl.getCampaignPerformance);
router.get('/agents', ctrl.getAgentPerformance);

export default router;
