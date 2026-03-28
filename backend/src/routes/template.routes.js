import { Router } from 'express';
import * as ctrl from '../controllers/template.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { createTemplateSchema, updateTemplateSchema } from '../validators/template.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listTemplates);
router.post('/', authorize('Admin', 'Agent'), validate(createTemplateSchema), ctrl.createTemplate);
router.get('/:templateId', ctrl.getTemplate);
router.patch('/:templateId', authorize('Admin', 'Agent'), validate(updateTemplateSchema), ctrl.updateTemplate);
router.delete('/:templateId', authorize('Admin'), ctrl.deleteTemplate);
router.post('/:templateId/duplicate', authorize('Admin', 'Agent'), ctrl.duplicateTemplate);

export default router;
