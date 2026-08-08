import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { isAdmin } from '../middleware/authorize.js';
import {
  submitReportIssue,
  listReportIssues,
  getReportIssueScreenshot,
  uploadScreenshot,
} from '../controllers/reportIssue.controller.js';

const router = Router();

// Public — a user hitting a bug may not be able to sign in. Accepts either JSON
// or multipart/form-data with a `screenshot` file; app-level JSON parsing is
// skipped for multipart, so uploadScreenshot also populates req.body.
router.post('/', uploadScreenshot, submitReportIssue);

// ─── Admin ────────────────────────────────────────────────────────────────────
// Reading reports back is admin-only. The listing used to be unauthenticated,
// which published every bug report — reporter's words, and now their
// screenshots — to anyone who knew the path.
router.get('/', authenticate, isAdmin, listReportIssues);
router.get('/:id/screenshot', authenticate, isAdmin, getReportIssueScreenshot);

export default router;
