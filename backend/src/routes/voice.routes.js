// backend/src/routes/voice.routes.js
import { Router } from 'express';
import * as voiceCtrl from '../controllers/voice.controller.js';

const router = Router({ mergeParams: true });

// ─── Provider status (must come before /:id to avoid route collision) ─────────
router.get('/providers/status', voiceCtrl.providerStatus);

// ─── Voice cloning (workspace-scoped custom voices) ───────────────────────────
import * as cloneCtrl from '../controllers/voiceClone.controller.js';
router.post('/clone', cloneCtrl.uploadVoiceSample, cloneCtrl.cloneVoice);
// Which provider/model a clone made now would use — and be billed on.
router.get('/clone/providers', cloneCtrl.cloneProviderInfo);
router.get('/cloned', cloneCtrl.listClonedVoices);
router.get('/cloned/:id/sample', cloneCtrl.streamClonedSample);
router.delete('/cloned/:id/sample', cloneCtrl.deleteClonedSample);
router.delete('/cloned/:id', cloneCtrl.deleteClonedVoice);

// ─── Voice sync (manual trigger) ──────────────────────────────────────────────
router.post('/sync', voiceCtrl.sync);

// ─── Provider library search + import ─────────────────────────────────────────
// Both MUST stay above '/:id' or Express matches "library" as a voice id.
router.get('/library', voiceCtrl.searchLibrary);
router.post('/library/import', voiceCtrl.importLibraryVoice);

// ─── Voice listing and detail ─────────────────────────────────────────────────
router.get('/', voiceCtrl.list);
router.get('/:id', voiceCtrl.get);

// ─── Audio preview ────────────────────────────────────────────────────────────
router.get('/:id/preview', voiceCtrl.preview);

export default router;
