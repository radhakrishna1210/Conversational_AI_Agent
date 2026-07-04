import { Router } from 'express';
import { submitReportIssue, listReportIssues } from '../controllers/reportIssue.controller.js';

const router = Router();

// Public — no auth required
router.post('/', submitReportIssue);

// Admin listing
router.get('/', listReportIssues);

export default router;
