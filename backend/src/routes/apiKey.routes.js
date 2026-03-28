import { Router } from 'express';
import * as ctrl from '../controllers/apiKey.controller.js';
import { authorize } from '../middleware/authorize.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listKeys);
router.post('/', authorize('Admin'), ctrl.createKey);
router.post('/:keyId/rotate', authorize('Admin'), ctrl.rotateKey);
router.delete('/:keyId', authorize('Admin'), ctrl.revokeKey);

export default router;
