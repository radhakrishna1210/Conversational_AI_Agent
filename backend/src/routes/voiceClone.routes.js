import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/voiceClone.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = new Set([
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/webm',
      'audio/ogg',
      'audio/flac',
      'audio/x-flac',
      'audio/mp4',
      'audio/x-m4a',
    ]);

    if (allowedMimeTypes.has(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
      return;
    }

    cb(new Error('Only audio files are allowed'));
  },
});

const router = Router({ mergeParams: true });

router.post('/', upload.single('audio'), ctrl.createVoiceClone);
router.get('/', ctrl.getVoiceClones);
router.get('/:cloneId/status', ctrl.refreshVoiceCloneStatus);
router.delete('/:cloneId', ctrl.deleteVoiceClone);
router.post('/:cloneId/test', ctrl.testVoiceClone);

export default router;
