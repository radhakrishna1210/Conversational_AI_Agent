import { Router } from 'express';
import * as ctrl from '../controllers/analytics.controller.js';

const router = Router({ mergeParams: true });

router.get('/overview', ctrl.getOverview);
router.get('/delivery', ctrl.getDeliveryChart);
router.get('/campaigns', ctrl.getCampaignPerformance);
router.get('/agents', ctrl.getAgentPerformance);

export default router;
