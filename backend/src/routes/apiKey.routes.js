import { Router } from 'express';
import * as ctrl from '../controllers/apiKey.controller.js';
import { authorize } from '../middleware/authorize.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listKeys);
router.post('/', authorize('Member'), ctrl.createKey);
router.post('/:keyId/rotate', authorize('Member'), ctrl.rotateKey);
router.delete('/:keyId', authorize('Member'), ctrl.revokeKey);

export default router;
