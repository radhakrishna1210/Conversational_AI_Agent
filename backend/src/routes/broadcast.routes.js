import { Router } from 'express';
import * as ctrl from '../controllers/broadcast.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { createBroadcastSchema, scheduleBroadcastSchema, updateBroadcastSchema } from '../validators/broadcast.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listBroadcasts);
// Both answered before anything is created: what a send would cost, and whether
// the chosen caller IDs can broadcast at all. Asking after the fact is how an
// operator finds out on recipient 4,000.
router.get('/estimate', ctrl.estimate);
router.get('/caller-readiness', ctrl.callerReadiness);
router.get('/rate', ctrl.broadcastRate);

router.post('/', authorize('Member'), validate(createBroadcastSchema), ctrl.createBroadcast);

router.get('/:broadcastId', ctrl.getBroadcast);
router.get('/:broadcastId/stats', ctrl.getBroadcastStats);
router.get('/:broadcastId/recipients', ctrl.listRecipients);

router.put('/:broadcastId', authorize('Member'), validate(updateBroadcastSchema), ctrl.updateBroadcast);
router.delete('/:broadcastId', authorize('Member'), ctrl.deleteBroadcast);

// Top up a not-yet-finished broadcast with contacts added to its clusters since
// it was created. Never re-adds anyone already dialled.
router.post('/:broadcastId/sync-list', authorize('Member'), ctrl.syncBroadcastList);

router.post('/:broadcastId/start', authorize('Member'), ctrl.startBroadcast);
router.post('/:broadcastId/launch', authorize('Member'), validate(scheduleBroadcastSchema), ctrl.launchBroadcast);
router.post('/:broadcastId/pause', authorize('Member'), ctrl.pauseBroadcast);
router.post('/:broadcastId/cancel', authorize('Member'), ctrl.cancelBroadcast);

export default router;
