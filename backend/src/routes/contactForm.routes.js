import { Router } from 'express';
import { submitContactForm, listContactForms } from '../controllers/contactForm.controller.js';

const router = Router();

// Public — no auth required (marketing contact form)
router.post('/', submitContactForm);

// Admin-only listing (protect this in production with isAdmin middleware)
router.get('/', listContactForms);

export default router;
