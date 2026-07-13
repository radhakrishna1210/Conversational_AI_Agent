// backend/src/routes/voice.routes.js
import { Router } from 'express';
import * as voiceCtrl from '../controllers/voice.controller.js';

const router = Router({ mergeParams: true });

// ─── Provider status (must come before /:id to avoid route collision) ─────────
router.get('/providers/status', voiceCtrl.providerStatus);

// ─── Voice cloning (workspace-scoped custom voices) ───────────────────────────
import * as cloneCtrl from '../controllers/voiceClone.controller.js';
router.post('/clone', cloneCtrl.uploadVoiceSample, cloneCtrl.cloneVoice);
router.get('/cloned', cloneCtrl.listClonedVoices);
router.get('/cloned/:id/sample', cloneCtrl.streamClonedSample);
router.delete('/cloned/:id', cloneCtrl.deleteClonedVoice);

// ─── Voice sync (manual trigger) ──────────────────────────────────────────────
router.post('/sync', voiceCtrl.sync);

// ─── Voice listing and detail ─────────────────────────────────────────────────
router.get('/', voiceCtrl.list);
router.get('/:id', voiceCtrl.get);

// ─── Audio preview ────────────────────────────────────────────────────────────
router.get('/:id/preview', voiceCtrl.preview);

export default router;
