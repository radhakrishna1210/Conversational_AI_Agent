// backend/src/routes/voice.routes.js
import { Router } from 'express';
import * as voiceCtrl from '../controllers/voice.controller.js';
import { isAdmin } from '../middleware/authorize.js';

const router = Router({ mergeParams: true });

// ─── Provider status (must come before /:id to avoid route collision) ─────────
// Superadmin only: it names every voice provider and its health, and clients
// are never shown which provider speaks their voice.
router.get('/providers/status', isAdmin, voiceCtrl.providerStatus);

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
// Superadmin only: it re-pulls every provider's catalogue for the whole
// platform. The scheduler in voice.startup.js keeps it current on its own.
router.post('/sync', isAdmin, voiceCtrl.sync);

// ─── Provider library search + import ─────────────────────────────────────────
// Both MUST stay above '/:id' or Express matches "library" as a voice id.
// Superadmin only: searching a named provider's library and adding its voices
// to the platform-wide table is curation, not something a client does.
router.get('/library', isAdmin, voiceCtrl.searchLibrary);
router.post('/library/import', isAdmin, voiceCtrl.importLibraryVoice);

// ─── The client's Voice picker (above '/:id' for the same reason) ─────────────
router.get('/picker', voiceCtrl.pickerList);

// ─── Voice listing and detail ─────────────────────────────────────────────────
router.get('/', voiceCtrl.list);
router.get('/:id', voiceCtrl.get);

// ─── Audio preview ────────────────────────────────────────────────────────────
router.get('/:id/preview', voiceCtrl.preview);

export default router;
