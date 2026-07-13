import { Router } from 'express';
import * as ctrl from '../controllers/campaign.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { uploadCsv } from '../middleware/upload.js';
import { createCampaignSchema, scheduleCampaignSchema, updateCampaignSchema } from '../validators/campaign.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listCampaigns);
router.post('/', authorize('Admin', 'Viewer'), validate(createCampaignSchema), ctrl.createCampaign);
router.post('/bulk', authorize('Admin', 'Viewer'), uploadCsv, ctrl.createBulkCampaign);

router.get('/:campaignId', ctrl.getCampaign);
router.get('/:campaignId/stats', ctrl.getCampaignStats);

router.put('/:campaignId', authorize('Admin', 'Viewer'), validate(updateCampaignSchema), ctrl.updateCampaign);
router.delete('/:campaignId', authorize('Admin'), ctrl.deleteCampaign);

router.post('/:campaignId/recipients', authorize('Admin', 'Viewer'), ctrl.addRecipients);

router.post('/:campaignId/start', authorize('Admin', 'Viewer'), ctrl.startCampaign);
router.post('/:campaignId/launch', authorize('Admin', 'Viewer'), validate(scheduleCampaignSchema), ctrl.launchCampaign);

router.post('/:campaignId/cancel', authorize('Admin', 'Viewer'), ctrl.cancelCampaign);

export default router;
