import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { isAdmin } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { addNumberToPoolSchema } from '../validators/admin.validator.js';
import * as ctrl from '../controllers/admin.controller.js';

const router = Router();

// One-time admin operation: import all Twilio numbers into the pool
router.post('/twilio/sync', authenticate, isAdmin, ctrl.syncTwilioNumbers);

router.post(
  '/numbers/add',
  authenticate,
  isAdmin,
  validate(addNumberToPoolSchema),
  ctrl.addNumberToPool
);

router.get(
  '/numbers/pool',
  authenticate,
  isAdmin,
  ctrl.getNumberPool
);

export default router;
