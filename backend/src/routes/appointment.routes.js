import { Router } from 'express';
import { submitAppointment, listAppointments } from '../controllers/appointment.controller.js';

const router = Router();

router.post('/', submitAppointment);   // Public — no auth needed
router.get('/', listAppointments);     // Admin listing

export default router;
