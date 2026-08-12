import { Router } from 'express';
import * as ctrl from '../controllers/compliance.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { uploadComplianceDocument } from '../middleware/upload.js';
import { ROLES } from '../constants/roles.js';
import {
  assignNumberSchema,
  headerStatusSchema,
  saveTemplateSchema,
  setPeIdSchema,
  setUseCaseSchema,
} from '../validators/compliance.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.getCompliance);

// The client's own steps: declare the call type, record their PE ID, ask for
// the telemarketer binding, upload entity documents, record voice templates.
router.put('/use-case', authorize(ROLES.MEMBER), validate(setUseCaseSchema), ctrl.putUseCase);
router.put('/pe-id', authorize(ROLES.MEMBER), validate(setPeIdSchema), ctrl.putPeId);
router.post('/tm-binding', authorize(ROLES.MEMBER), ctrl.postTmBinding);

// Multipart: `kind` is validated in the service rather than by a zod body
// schema, because multer populates req.body and validate() runs before it.
router.post('/documents', authorize(ROLES.MEMBER), uploadComplianceDocument, ctrl.postDocument);

router.post('/templates', authorize(ROLES.MEMBER), validate(saveTemplateSchema), ctrl.postTemplate);

// Provisioning and release are platform actions: a number is rented from the
// carrier against this customer's approved compliance application, and once
// bound it is never moved to another workspace.
router.post('/numbers', authorize(ROLES.SUPER_ADMIN), validate(assignNumberSchema), ctrl.postNumber);
router.delete('/numbers/:numberId', authorize(ROLES.SUPER_ADMIN), ctrl.deleteNumber);

// Header registration happens in the client's DLT portal, so the client reports
// its outcome.
router.put('/numbers/:numberId/header', authorize(ROLES.MEMBER), validate(headerStatusSchema), ctrl.putHeaderStatus);

export default router;
