import { Router } from 'express';
import * as ctrl from '../controllers/contact.controller.js';
import { authorize } from '../middleware/authorize.js';
import { uploadCsv } from '../middleware/upload.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listContacts);
router.post('/', authorize('Member'), ctrl.createContact);
router.post('/upload', authorize('Member'), uploadCsv, ctrl.uploadCsv);
router.get('/:contactId', ctrl.getContact);
router.patch('/:contactId/opt-out', authorize('Member'), ctrl.toggleOptOut);
router.delete('/:contactId', authorize('Member'), ctrl.deleteContact);

export default router;
