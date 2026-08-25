import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { isAdmin } from '../middleware/authorize.js';
import { submitContactForm, listContactForms } from '../controllers/contactForm.controller.js';

const router = Router();

// Public — no auth required (marketing contact form).
router.post('/', submitContactForm);

// ─── Admin ────────────────────────────────────────────────────────────────────
// Reading submissions back is Superadmin-only. This listing was unauthenticated,
// which published every lead's name, email, phone and use-case description to
// anyone who knew the path — the same hole that was already closed on
// /report-issue. Surfaced by the Contact Requests page in the admin console.
router.get('/', authenticate, isAdmin, listContactForms);

export default router;
