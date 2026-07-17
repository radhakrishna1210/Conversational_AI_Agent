import { Router } from 'express';
import { authorize } from '../middleware/authorize.js';
import { uploadKnowledgeFile } from '../middleware/knowledgeUpload.js';
import * as ctrl from '../controllers/knowledge.controller.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.list);
router.post('/upload', authorize('Admin', 'Viewer'), uploadKnowledgeFile, ctrl.upload);
router.get('/search', ctrl.search);
router.delete('/:documentId', authorize('Admin', 'Viewer'), ctrl.remove);

export default router;

