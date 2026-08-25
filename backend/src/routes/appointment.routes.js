import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { isAdmin } from '../middleware/authorize.js';
import { submitAppointment, listAppointments } from '../controllers/appointment.controller.js';

const router = Router();

// Public — no auth needed (booking form on the public site).
router.post('/', submitAppointment);

// ─── Admin ────────────────────────────────────────────────────────────────────
// Superadmin-only, for the same reason as /contact-form: the rows carry a
// booker's name, email and phone. The admin console already called this with
// authFetch, but the endpoint never checked the token, so it was public.
router.get('/', authenticate, isAdmin, listAppointments);

export default router;
