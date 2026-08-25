import { Router } from 'express';
import * as ctrl from '../controllers/compliance.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { uploadComplianceDocument } from '../middleware/upload.js';
import { ROLES } from '../constants/roles.js';
import {
  assignNumberSchema,
  headerStatusSchema,
  rentNumberSchema,
  saveTemplateSchema,
  setEntityDetailsSchema,
  setPeIdSchema,
  setUseCaseSchema,
} from '../validators/compliance.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.getCompliance);

// The client's own steps: declare the call type, record their PE ID, ask for
// the telemarketer binding, upload entity documents, record voice templates.
router.put('/use-case', authorize(ROLES.MEMBER), validate(setUseCaseSchema), ctrl.putUseCase);
router.put('/entity-details', authorize(ROLES.MEMBER), validate(setEntityDetailsSchema), ctrl.putEntityDetails);
router.put('/pe-id', authorize(ROLES.MEMBER), validate(setPeIdSchema), ctrl.putPeId);
router.post('/tm-binding', authorize(ROLES.MEMBER), ctrl.postTmBinding);

// Multipart: `kind` is validated in the service rather than by a zod body
// schema, because multer populates req.body and validate() runs before it.
router.post('/documents', authorize(ROLES.MEMBER), uploadComplianceDocument, ctrl.postDocument);

router.delete('/documents/:documentId', authorize(ROLES.MEMBER), ctrl.deleteDocument);

router.post('/templates', authorize(ROLES.MEMBER), validate(saveTemplateSchema), ctrl.postTemplate);

// The carrier KYC application. Filing is the client's own step — it is their
// entity and their documents — but it is irreversible in the sense that a
// second application against the same end customer orphans the first, so the
// service guards re-submission rather than the router.
router.get('/carrier-application', ctrl.getCarrierApplication);
router.post('/carrier-application', authorize(ROLES.MEMBER), ctrl.postCarrierApplication);
router.patch('/carrier-application', authorize(ROLES.MEMBER), ctrl.patchCarrierApplication);
router.post('/carrier-application/refresh', authorize(ROLES.MEMBER), ctrl.refreshCarrierApplication);

// Provisioning and release are platform actions: a number is rented from the
// carrier against this customer's approved compliance application, and once
// bound it is never moved to another workspace.
// Browsing inventory costs nothing and reserves nothing, so it is the client's
// own step — they pick the number they want to live with.
router.get('/numbers/available', ctrl.getAvailableNumbers);

// Renting is SUPER_ADMIN until phase D puts a wallet debit behind it. This call
// spends real money on our parent account; without the debit, a member-facing
// route would let a client rent numbers we pay for and they do not.
router.post('/numbers/rent', authorize(ROLES.SUPER_ADMIN), validate(rentNumberSchema), ctrl.postRentNumber);

// Records a number rented by hand elsewhere. Kept alongside /rent because the
// carrier's console remains the fallback whenever the API path is unavailable.
router.post('/numbers', authorize(ROLES.SUPER_ADMIN), validate(assignNumberSchema), ctrl.postNumber);
router.delete('/numbers/:numberId', authorize(ROLES.SUPER_ADMIN), ctrl.deleteNumber);

// Header registration happens in the client's DLT portal, so the client reports
// its outcome.
router.put('/numbers/:numberId/header', authorize(ROLES.MEMBER), validate(headerStatusSchema), ctrl.putHeaderStatus);

export default router;
