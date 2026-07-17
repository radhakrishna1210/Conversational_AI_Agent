// backend/src/routes/voice.routes.js
import { Router } from 'express';
import * as voiceCtrl from '../controllers/voice.controller.js';

const router = Router();

// ─── Provider status (must come before /:id to avoid route collision) ─────────
router.get('/providers/status', voiceCtrl.providerStatus);

// ─── Voice sync (manual trigger) ──────────────────────────────────────────────
router.post('/sync', voiceCtrl.sync);

// ─── Voice listing and detail ─────────────────────────────────────────────────
router.get('/', voiceCtrl.list);
router.get('/:id', voiceCtrl.get);

// ─── Audio preview ────────────────────────────────────────────────────────────
router.get('/:id/preview', voiceCtrl.preview);
router.post('/:id/preview', voiceCtrl.preview);

export default router;
