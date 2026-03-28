import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { isAdmin } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { addNumberToPoolSchema } from '../validators/admin.validator.js';
import * as ctrl from '../controllers/admin.controller.js';

const router = Router();

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
