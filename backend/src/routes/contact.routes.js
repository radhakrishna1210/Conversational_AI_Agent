import { Router } from 'express';
import * as ctrl from '../controllers/contact.controller.js';
import { authorize } from '../middleware/authorize.js';
import { uploadCsv } from '../middleware/upload.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listContacts);
router.post('/', authorize('Admin', 'Viewer'), ctrl.createContact);
router.post('/upload', authorize('Admin', 'Viewer'), uploadCsv, ctrl.uploadCsv);
router.get('/:contactId', ctrl.getContact);
router.patch('/:contactId/opt-out', authorize('Admin', 'Viewer'), ctrl.toggleOptOut);
router.delete('/:contactId', authorize('Admin', 'Viewer'), ctrl.deleteContact);

export default router;
