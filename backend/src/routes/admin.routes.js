import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { isAdmin } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { addNumberToPoolSchema } from '../validators/admin.validator.js';
import * as ctrl from '../controllers/admin.controller.js';

const router = Router();

// ─── Public webhooks ──────────────────────────────────────────────────────────
// Twilio SMS webhook — public (called by Twilio servers, not by our clients)
router.post('/twilio/sms-webhook', ctrl.twilioSmsWebhook);

// ─── Twilio / Meta sync ───────────────────────────────────────────────────────
router.post('/twilio/sync', authenticate, isAdmin, ctrl.syncTwilioNumbers);
router.post('/meta/test-calls', authenticate, isAdmin, ctrl.runMetaTestCalls);
router.get('/waba/numbers', authenticate, isAdmin, ctrl.listWabaNumbers);
router.post('/numbers/request-otp', authenticate, isAdmin, ctrl.requestOtp);
router.post('/numbers/verify-otp',  authenticate, isAdmin, ctrl.verifyOtp);

// ─── Number Pool CRUD ─────────────────────────────────────────────────────────
router.post(
  '/numbers/add',
  authenticate,
  isAdmin,
  validate(addNumberToPoolSchema),
  ctrl.addNumberToPool
);

// Filtered pool list (supports ?status=&country=&search=)
router.get('/numbers/pool', authenticate, isAdmin, ctrl.getNumberPoolFiltered);

// Number state transitions
router.patch('/numbers/pool/:id/reset',      authenticate, isAdmin, ctrl.resetPoolNumber);
router.patch('/numbers/pool/:id/assign',     authenticate, isAdmin, ctrl.assignPoolNumber);
router.patch('/numbers/pool/:id/unassign',   authenticate, isAdmin, ctrl.unassignPoolNumber);
router.patch('/numbers/pool/:id/deactivate', authenticate, isAdmin, ctrl.deactivatePoolNumber);
router.delete('/numbers/pool/:id',           authenticate, isAdmin, ctrl.deletePoolNumber);

// ─── Workspace list (for assign dropdown) ────────────────────────────────────
router.get('/workspaces', authenticate, isAdmin, ctrl.listWorkspaces);

// ─── User Management ──────────────────────────────────────────────────────────
router.get('/users',                    authenticate, isAdmin, ctrl.listUsers);
router.get('/users/plans',              authenticate, isAdmin, ctrl.getPlans);
router.get('/users/:id',                authenticate, isAdmin, ctrl.getUserDetail);
router.patch('/users/:id/ban',          authenticate, isAdmin, ctrl.banUser);
router.patch('/users/:id/unban',        authenticate, isAdmin, ctrl.unbanUser);
router.delete('/users/:id',             authenticate, isAdmin, ctrl.deleteUser);
router.patch('/users/:id/plan',         authenticate, isAdmin, ctrl.changeUserPlan);

// ─── Platform Analytics ───────────────────────────────────────────────────────
router.get('/analytics/overview',          authenticate, isAdmin, ctrl.getPlatformOverview);
router.get('/analytics/signups',           authenticate, isAdmin, ctrl.getUserSignupChart);
router.get('/analytics/workspace-growth',  authenticate, isAdmin, ctrl.getWorkspaceGrowthChart);
router.get('/analytics/agent-creation',    authenticate, isAdmin, ctrl.getAgentCreationChart);
router.get('/analytics/top-workspaces',    authenticate, isAdmin, ctrl.getTopWorkspaces);
router.get('/analytics/recent-users',      authenticate, isAdmin, ctrl.getRecentUsers);


// ─── Sprint-2 admin additions ─────────────────────────────────────────────────
import * as platform from '../controllers/platform.controller.js';
import { listAppointments } from '../controllers/appointment.controller.js';

router.get('/appointments', authenticate, isAdmin, listAppointments);
router.get('/plans', authenticate, isAdmin, platform.adminListPlans);
router.post('/plans', authenticate, isAdmin, platform.adminUpsertPlan);
router.delete('/plans/:id', authenticate, isAdmin, platform.adminDeletePlan);
router.post('/wallets/credit', authenticate, isAdmin, platform.adminCreditWallet);
router.get('/health', authenticate, isAdmin, platform.adminHealth);

export default router;