import { Router } from 'express';
import * as ctrl from '../controllers/campaign.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { uploadCsv } from '../middleware/upload.js';
import { createCampaignSchema, scheduleCampaignSchema, updateCampaignSchema } from '../validators/campaign.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listCampaigns);
router.post('/', authorize('Member'), validate(createCampaignSchema), ctrl.createCampaign);
router.post('/bulk', authorize('Member'), uploadCsv, ctrl.createBulkCampaign);

router.get('/:campaignId', ctrl.getCampaign);
router.get('/:campaignId/stats', ctrl.getCampaignStats);

router.put('/:campaignId', authorize('Member'), validate(updateCampaignSchema), ctrl.updateCampaign);
router.delete('/:campaignId', authorize('Member'), ctrl.deleteCampaign);

router.post('/:campaignId/recipients', authorize('Member'), ctrl.addRecipients);

router.post('/:campaignId/start', authorize('Member'), ctrl.startCampaign);
router.post('/:campaignId/launch', authorize('Member'), validate(scheduleCampaignSchema), ctrl.launchCampaign);

router.post('/:campaignId/cancel', authorize('Member'), ctrl.cancelCampaign);

export default router;
