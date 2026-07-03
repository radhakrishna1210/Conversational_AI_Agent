import { Router } from 'express';
import * as ctrl from '../controllers/notification.controller.js';
import { authorize } from '../middleware/authorize.js';

const router = Router({ mergeParams: true });

router.get('/stream', ctrl.streamNotifications);          // SSE real-time stream
router.get('/unread-count', ctrl.getUnreadCount);         // badge count
router.get('/', ctrl.listNotifications);                  // list all
router.post('/', authorize('Admin'), ctrl.createNotification);
router.patch('/read-all', ctrl.markAllAsRead);
router.patch('/:id/read', ctrl.markAsRead);
router.delete('/', ctrl.clearAllNotifications);
router.delete('/:id', ctrl.deleteNotification);

export default router;
