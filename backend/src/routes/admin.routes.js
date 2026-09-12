import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { isAdmin } from '../middleware/authorize.js';
import * as ctrl from '../controllers/admin.controller.js';
import * as callLogs from '../controllers/adminCallLogs.controller.js';
import * as adminBilling from '../controllers/adminBilling.controller.js';
import * as modelCatalog from '../controllers/modelCatalog.controller.js';

const router = Router();

// The number pool lived here: a pool of WhatsApp numbers registered against a
// Meta WABA, plus the Twilio sync and SMS-OTP dance that provisioned them. It
// went with the WhatsApp models — every route needed a NumberPool table that no
// longer exists. Voice caller IDs are unrelated and live under
// /workspaces/:id/caller-numbers.

// ─── Workspace list ──────────────────────────────────────────────────────────
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
// ─── Pricing buckets (admin-only; nothing customer-facing reads these) ───────
// Volume tiers, and the bespoke per-workspace override. Sits above the wallet
// rate because it OVERRIDES it: the wallet rate is now the fallback for a
// workspace with neither a bucket nor an override.
router.get('/pricing/buckets', authenticate, isAdmin, platform.adminListBuckets);
router.post('/pricing/buckets', authenticate, isAdmin, platform.adminCreateBucket);
router.patch('/pricing/buckets/:id', authenticate, isAdmin, platform.adminUpdateBucket);
router.delete('/pricing/buckets/:id', authenticate, isAdmin, platform.adminDeleteBucket);
router.get('/pricing/workspaces/:workspaceId', authenticate, isAdmin, platform.adminGetWorkspaceRate);
router.put('/pricing/workspaces/:workspaceId/bucket', authenticate, isAdmin, platform.adminAssignBucket);
router.put('/pricing/workspaces/:workspaceId/override', authenticate, isAdmin, platform.adminSetRateOverride);

// The platform wallet rate — the DEFAULT every call falls back to, per minute.
router.get('/wallet-rate', authenticate, isAdmin, platform.adminGetWalletRate);
router.put('/wallet-rate', authenticate, isAdmin, platform.adminSetWalletRate);
// The platform broadcast rate — what a one-way recorded call is charged, per
// minute. Separate from the wallet rate because it costs us a carrier minute
// and nothing else; see services/billing/broadcastRate.js.
// Phone-number pricing: one-time setup fee + monthly rental, platform-wide.
// Changing these affects numbers rented AFTERWARDS only — VoiceNumber freezes
// its client price at rent time. See services/billing/numberRate.js.
router.get('/number-rate', authenticate, isAdmin, platform.adminGetNumberRate);
router.put('/number-rate', authenticate, isAdmin, platform.adminSetNumberRate);

router.get('/broadcast-rate', authenticate, isAdmin, platform.adminGetBroadcastRate);
router.put('/broadcast-rate', authenticate, isAdmin, platform.adminSetBroadcastRate);

router.post('/wallets/credit', authenticate, isAdmin, billing.adminCreditWallet);
// Ledger-vs-balance reconciliation. Surfaces any balance mutated outside
// applyWalletTransaction, which should be impossible but must be detectable.
router.get('/wallets/:workspaceId/audit', authenticate, isAdmin, billing.adminAuditWallet);
router.get('/health', authenticate, isAdmin, platform.adminHealth);

// ─── Model access ─────────────────────────────────────────────────────────────
// Which models clients may see and use. Off here means invisible AND unsavable.
router.get('/model-catalog', authenticate, isAdmin, modelCatalog.adminGetCatalog);
router.put('/model-catalog', authenticate, isAdmin, modelCatalog.adminSetCatalog);

// ─── Numbers & carrier ────────────────────────────────────────────────────────
// The operator's side of the number business: carrier KYC review, the per-client
// kill switch, renting and releasing numbers, the request queue, and usage
// reconciliation. See controllers/adminTelephony.controller.js.
//
// Mounted under one prefix rather than scattered through this file because the
// whole group shares a single screen and a single concern.
import * as telephony from '../controllers/adminTelephony.controller.js';

router.get('/telephony/overview', authenticate, isAdmin, telephony.getOverview);

router.get('/telephony/workspaces', authenticate, isAdmin, telephony.listWorkspaces);
router.post('/telephony/workspaces/:workspaceId/carrier-access', authenticate, isAdmin, telephony.postCarrierAccess);
router.post('/telephony/workspaces/:workspaceId/suspension', authenticate, isAdmin, telephony.postSuspension);
router.post('/telephony/workspaces/:workspaceId/review', authenticate, isAdmin, telephony.postReview);
router.post('/telephony/workspaces/:workspaceId/relink', authenticate, isAdmin, telephony.postRelink);
// Releases every number and closes the carrier account. Irreversible; the
// controller demands the workspace id back as confirmation.
router.post('/telephony/workspaces/:workspaceId/offboard', authenticate, isAdmin, telephony.postOffboard);

// `/available` before `/:numberId` so the parameter route does not capture it.
router.get('/telephony/numbers/available', authenticate, isAdmin, telephony.searchNumbers);
router.get('/telephony/numbers', authenticate, isAdmin, telephony.listNumbers);
router.post('/telephony/numbers/rent', authenticate, isAdmin, telephony.postRentNumber);
router.patch('/telephony/numbers/:numberId', authenticate, isAdmin, telephony.patchNumber);
router.delete('/telephony/numbers/:numberId', authenticate, isAdmin, telephony.deleteNumber);

router.get('/telephony/requests', authenticate, isAdmin, telephony.listRequests);
router.post('/telephony/requests/:requestId/fulfil', authenticate, isAdmin, telephony.postFulfilRequest);
router.post('/telephony/requests/:requestId/decline', authenticate, isAdmin, telephony.postDeclineRequest);

router.get('/telephony/audit', authenticate, isAdmin, telephony.getCarrierAudit);

router.get('/telephony/reconciliation', authenticate, isAdmin, telephony.listReconciliationRuns);
router.get('/telephony/reconciliation/:runId', authenticate, isAdmin, telephony.getReconciliationRun);
router.post('/telephony/reconciliation', authenticate, isAdmin, telephony.postReconciliation);

// The concurrency ceilings have been settable in code since the carrier gate
// landed and reachable from nowhere. Subaccounts share the parent's pool at
// Plivo, so the per-workspace ceiling is the only thing standing between one
// client's campaign and everyone else's calls.
router.get('/telephony/concurrency', authenticate, isAdmin, telephony.getConcurrency);
router.put('/telephony/concurrency', authenticate, isAdmin, telephony.putConcurrency);

export default router;