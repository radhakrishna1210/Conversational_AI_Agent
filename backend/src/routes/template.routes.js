import { Router } from 'express';
import * as ctrl from '../controllers/template.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { createTemplateSchema, updateTemplateSchema } from '../validators/template.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listTemplates);
router.post('/', authorize('Member'), validate(createTemplateSchema), ctrl.createTemplate);
router.get('/:templateId', ctrl.getTemplate);
router.patch('/:templateId', authorize('Member'), validate(updateTemplateSchema), ctrl.updateTemplate);
router.delete('/:templateId', authorize('Member'), ctrl.deleteTemplate);
router.post('/:templateId/duplicate', authorize('Member'), ctrl.duplicateTemplate);

export default router;
