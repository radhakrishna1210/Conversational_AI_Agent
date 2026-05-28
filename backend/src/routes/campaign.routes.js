import { Router } from 'express';
import * as ctrl from '../controllers/campaign.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { createCampaignSchema, scheduleCampaignSchema } from '../validators/campaign.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listCampaigns);
router.post('/', authorize('Admin', 'Viewer'), validate(createCampaignSchema), ctrl.createCampaign);
router.get('/:campaignId', ctrl.getCampaign);
router.get('/:campaignId/stats', ctrl.getCampaignStats);
router.post('/:campaignId/recipients', authorize('Admin', 'Viewer'), ctrl.addRecipients);
router.post('/:campaignId/launch', authorize('Admin', 'Viewer'), validate(scheduleCampaignSchema), ctrl.launchCampaign);
router.post('/:campaignId/cancel', authorize('Admin', 'Viewer'), ctrl.cancelCampaign);

export default router;
