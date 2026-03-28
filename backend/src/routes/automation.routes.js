import { Router } from 'express';
import * as ctrl from '../controllers/automation.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { keywordTriggerSchema, flowSchema } from '../validators/automation.validator.js';

const router = Router({ mergeParams: true });

router.get('/triggers', ctrl.listTriggers);
router.post('/triggers', authorize('Admin', 'Agent'), validate(keywordTriggerSchema), ctrl.createTrigger);
router.patch('/triggers/:triggerId', authorize('Admin', 'Agent'), validate(keywordTriggerSchema.partial()), ctrl.updateTrigger);
router.delete('/triggers/:triggerId', authorize('Admin'), ctrl.deleteTrigger);

router.get('/flow', ctrl.getFlow);
router.put('/flow', authorize('Admin', 'Agent'), validate(flowSchema), ctrl.saveFlow);

export default router;
