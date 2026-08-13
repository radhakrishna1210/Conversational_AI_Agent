import { Router } from 'express';
import * as ctrl from '../controllers/contact.controller.js';
import { authorize } from '../middleware/authorize.js';
import { uploadCsv } from '../middleware/upload.js';

const router = Router({ mergeParams: true });

// Literal paths first — '/summary' and '/import' would otherwise be swallowed by
// '/:contactId'.
router.get('/', ctrl.listContacts);
router.get('/summary', ctrl.contactSummary);

router.post('/', authorize('Member'), ctrl.createContact);
router.post('/import', authorize('Member'), uploadCsv, ctrl.importContacts);
router.post('/add-to-clusters', authorize('Member'), ctrl.addToClusters);
router.post('/status', authorize('Member'), ctrl.setContactStatus);
// Bulk delete carries its ids in a body, which DELETE cannot be relied on to
// forward through every proxy in the path.
router.post('/delete', authorize('Member'), ctrl.bulkDeleteContacts);

router.get('/:contactId', ctrl.getContact);
router.patch('/:contactId', authorize('Member'), ctrl.updateContact);
router.delete('/:contactId', authorize('Member'), ctrl.deleteContact);

export default router;
