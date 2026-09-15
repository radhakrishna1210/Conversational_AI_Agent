// backend/src/routes/twilio.routes.js
//
// Public carrier endpoint — mounted OUTSIDE the authenticated router because
// Twilio cannot hold a session. Authorised by the HMAC token on the URL; see
// controllers/twilioCall.controller.js. Broadcasts keep their own status route
// (/broadcast/twilio/status) because a broadcast has no call log.

import { Router } from 'express';
import { callStatus } from '../controllers/twilioCall.controller.js';

const router = Router();

router.post('/call-status', callStatus);

export default router;
