// backend/src/routes/plivo.routes.js
//
// Public carrier endpoints — mounted OUTSIDE the authenticated router because
// Plivo cannot hold a session. Protection is the V3 request signature, verified
// in controllers/plivo.controller.js.

import { Router } from 'express';
import express from 'express';
import { answer, hangup } from '../controllers/plivo.controller.js';

const router = Router();

// Plivo posts application/x-www-form-urlencoded, which app.js does not parse
// globally (only express.json is mounted). Scoped here so adding a body parser
// for one carrier cannot change how any other route reads its body.
//
// `extended: false` matters for signature validation, not just style: the
// signing string is built from flat key/value pairs, and qs's extended mode
// would turn `a[b]=c` into a nested object whose keys no longer match what
// Plivo signed.
router.use(express.urlencoded({ extended: false }));

// answer_method / hangup_method are set to POST in plivo.provider.js, but Plivo
// falls back to GET in some retry paths and a GET that 404s reads as "the
// server is down" rather than "wrong verb".
router.route('/answer').get(answer).post(answer);
router.route('/hangup').get(hangup).post(hangup);

export default router;
