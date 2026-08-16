import { Router } from 'express';
import * as ctrl from '../controllers/broadcast.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { uploadAudio } from '../middleware/upload.js';
import { synthesizeRecordingSchema } from '../validators/broadcast.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listRecordings);

// Two ways to make a recording, one resulting object.
router.post('/upload', authorize('Member'), uploadAudio, ctrl.uploadRecording);
router.post('/synthesize', authorize('Member'), validate(synthesizeRecordingSchema), ctrl.synthesizeRecording);

// Playback for the console. The carrier fetches a different, token-signed URL —
// see the public /broadcast-audio route.
router.get('/:recordingId/audio', ctrl.streamRecording);
router.delete('/:recordingId', authorize('Member'), ctrl.deleteRecording);

export default router;
