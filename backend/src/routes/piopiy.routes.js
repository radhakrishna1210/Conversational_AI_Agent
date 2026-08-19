// backend/src/routes/piopiy.routes.js
//
// Public carrier endpoint — mounted OUTSIDE the authenticated router because
// PIOPIY is a carrier and cannot hold a session. PIOPIY signs nothing, so the
// only protection is the optional shared secret on the URL
// (PIOPIY_WEBHOOK_TOKEN); see controllers/piopiy.controller.js.
//
// There is no answer endpoint here, unlike plivo.routes.js: PIOPIY takes its
// PCMO document inline on the dial request, so nothing is served at pickup.

import { Router } from 'express';
import express from 'express';
import { cdr } from '../controllers/piopiy.controller.js';

const router = Router();

// PIOPIY posts JSON. app.js mounts express.json globally, but this router is
// reached before that on some mount orders and a carrier body silently read as
// empty is the hardest failure here to see — so parse it explicitly, scoped to
// this router. urlencoded is accepted too, because the dashboard's own webhook
// tester sends form bodies.
router.use(express.json());
router.use(express.urlencoded({ extended: false }));

// The dashboard issues a POST; a GET that 404s reads as "the server is down"
// rather than "wrong verb", which is worth the one extra line.
router.route('/cdr').get(cdr).post(cdr);

export default router;
