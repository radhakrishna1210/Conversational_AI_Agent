import { Router } from 'express';
import * as kb from '../controllers/kbFile.controller.js';

const router = Router({ mergeParams: true });

router.post('/', kb.uploadKbFile, kb.upload);
router.get('/', kb.list);
router.get('/:id/download', kb.download);
router.delete('/:id', kb.remove);

export default router;
