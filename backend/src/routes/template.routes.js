import { Router } from 'express';
import * as ctrl from '../controllers/template.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { createTemplateSchema, updateTemplateSchema } from '../validators/template.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listTemplates);
router.post('/', authorize('Admin', 'Viewer'), validate(createTemplateSchema), ctrl.createTemplate);
router.get('/:templateId', ctrl.getTemplate);
router.patch('/:templateId', authorize('Admin', 'Viewer'), validate(updateTemplateSchema), ctrl.updateTemplate);
router.delete('/:templateId', authorize('Admin', 'Viewer'), ctrl.deleteTemplate);
router.post('/:templateId/duplicate', authorize('Admin', 'Viewer'), ctrl.duplicateTemplate);

export default router;
