import { Router } from 'express';
import * as ctrl from '../controllers/metaOauth.controller.js';
import { authorize } from '../middleware/authorize.js';

const router = Router({ mergeParams: true });

router.post('/callback', authorize('Admin'), ctrl.oauthCallback);
router.get('/status', ctrl.getStatus);
router.delete('/disconnect', authorize('Admin'), ctrl.disconnect);

export default router;
