import { Router } from 'express';
import * as ctrl from '../controllers/notification.controller.js';
import { authorize } from '../middleware/authorize.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listNotifications);
router.post('/', authorize('Admin'), ctrl.createNotification);
router.patch('/:id/read', ctrl.markAsRead);
router.patch('/read-all', ctrl.markAllAsRead);

export default router;
