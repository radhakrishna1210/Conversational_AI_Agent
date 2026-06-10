import { Router } from 'express';
import { submitContactRequest } from '../controllers/contactSubmission.controller.js';

const router = Router();

router.post('/', submitContactRequest);

export default router;
