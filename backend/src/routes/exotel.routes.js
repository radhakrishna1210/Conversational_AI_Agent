// backend/src/routes/exotel.routes.js
//
// Public carrier endpoints — mounted OUTSIDE the authenticated router because
// Exotel cannot hold a session. See controllers/exotel.controller.js for how
// they are protected (optional EXOTEL_WEBHOOK_TOKEN) and why each exists.

import { Router } from 'express';
import express from 'express';
import { voicebotStream, statusCallback } from '../controllers/exotel.controller.js';

const router = Router();

// Exotel posts application/x-www-form-urlencoded, which app.js does not parse
// globally (only express.json is mounted). Scoped here so adding a body parser
// for one carrier cannot change how any other route reads its body.
router.use(express.urlencoded({ extended: false }));

// The Voicebot applet issues a GET in some flow versions and a POST in others.
router.route('/voicebot-stream').get(voicebotStream).post(voicebotStream);
router.route('/status').get(statusCallback).post(statusCallback);

export default router;
