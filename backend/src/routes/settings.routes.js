import { Router } from 'express';
import * as ctrl from '../controllers/settings.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { notificationPrefsSchema } from '../validators/settings.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.getSettings);
router.patch('/', authorize('Admin'), validate(notificationPrefsSchema.partial()), ctrl.updateSettings);
router.get('/invoices', ctrl.listInvoices);

export default router;
