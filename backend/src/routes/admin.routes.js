import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { isAdmin } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { addNumberToPoolSchema } from '../validators/admin.validator.js';
import * as ctrl from '../controllers/admin.controller.js';
import * as callLogs from '../controllers/adminCallLogs.controller.js';
import * as adminBilling from '../controllers/adminBilling.controller.js';
import * as modelCatalog from '../controllers/modelCatalog.controller.js';

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
router.get('/users/:id',                authenticate, isAdmin, ctrl.getUserDetail);
router.patch('/users/:id/ban',          authenticate, isAdmin, ctrl.banUser);
router.patch('/users/:id/unban',        authenticate, isAdmin, ctrl.unbanUser);
router.delete('/users/:id',             authenticate, isAdmin, ctrl.deleteUser);
router.post('/users/:id/force-logout',  authenticate, isAdmin, ctrl.forceLogoutUser);

// ─── Security & Audit ─────────────────────────────────────────────────────────
router.get('/audit-logs',         authenticate, isAdmin, ctrl.getAuditLogs);
router.get('/audit-logs/options', authenticate, isAdmin, ctrl.getAuditFilterOptions);

// ─── Billing visibility (cross-tenant, read-only) ────────────────────────────
router.get('/billing/overview',      authenticate, isAdmin, adminBilling.getOverview);
router.get('/billing/payments',      authenticate, isAdmin, adminBilling.listPayments);
router.get('/billing/invoices',      authenticate, isAdmin, adminBilling.listInvoices);
router.get('/billing/wallets',       authenticate, isAdmin, adminBilling.listWallets);
router.get('/billing/wallets/:workspaceId/ledger', authenticate, isAdmin, adminBilling.getWalletLedger);

// ─── Call Logs & Recordings (cross-tenant, read-only) ────────────────────────
// `/stats` and `/options` are declared before `/:id` so they are not captured
// by the parameter route.
router.get('/call-logs',                authenticate, isAdmin, callLogs.listCallLogs);
router.get('/call-logs/stats',          authenticate, isAdmin, callLogs.getCallStats);
router.get('/call-logs/options',        authenticate, isAdmin, callLogs.getCallFilterOptions);
router.get('/call-logs/:id',            authenticate, isAdmin, callLogs.getCallLog);
router.get('/call-logs/:id/recording',  authenticate, isAdmin, callLogs.getCallRecording);

// ─── Platform Analytics ───────────────────────────────────────────────────────
router.get('/analytics/overview',          authenticate, isAdmin, ctrl.getPlatformOverview);
router.get('/analytics/signups',           authenticate, isAdmin, ctrl.getUserSignupChart);
router.get('/analytics/workspace-growth',  authenticate, isAdmin, ctrl.getWorkspaceGrowthChart);
router.get('/analytics/agent-creation',    authenticate, isAdmin, ctrl.getAgentCreationChart);
router.get('/analytics/top-workspaces',    authenticate, isAdmin, ctrl.getTopWorkspaces);
router.get('/analytics/recent-users',      authenticate, isAdmin, ctrl.getRecentUsers);


// ─── Sprint-2 admin additions ─────────────────────────────────────────────────
import * as platform from '../controllers/platform.controller.js';
import * as billing from '../controllers/billing.controller.js';
import { listAppointments } from '../controllers/appointment.controller.js';

router.get('/appointments', authenticate, isAdmin, listAppointments);
// The platform wallet rate — what every call is charged, per minute.
router.get('/wallet-rate', authenticate, isAdmin, platform.adminGetWalletRate);
router.put('/wallet-rate', authenticate, isAdmin, platform.adminSetWalletRate);

router.post('/wallets/credit', authenticate, isAdmin, billing.adminCreditWallet);
// Ledger-vs-balance reconciliation. Surfaces any balance mutated outside
// applyWalletTransaction, which should be impossible but must be detectable.
router.get('/wallets/:workspaceId/audit', authenticate, isAdmin, billing.adminAuditWallet);
router.get('/health', authenticate, isAdmin, platform.adminHealth);

// ─── Model access ─────────────────────────────────────────────────────────────
// Which models clients may see and use. Off here means invisible AND unsavable.
router.get('/model-catalog', authenticate, isAdmin, modelCatalog.adminGetCatalog);
router.put('/model-catalog', authenticate, isAdmin, modelCatalog.adminSetCatalog);

export default router;