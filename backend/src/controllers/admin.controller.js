import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import * as adminAnalytics from '../services/adminAnalytics.service.js';
import * as userMgmt from '../services/userManagement.service.js';
import * as audit from '../services/audit.service.js';
import { writeAudit, AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../services/audit.service.js';
import { ROLES } from '../constants/roles.js';

// ─── Admin Analytics ──────────────────────────────────────────────────────────

export const getPlatformOverview = async (req, res) => {
  const data = await adminAnalytics.getPlatformOverview();
  return res.json(data);
};

export const getUserSignupChart = async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const data = await adminAnalytics.getUserSignupChart(days);
  return res.json(data);
};

export const getWorkspaceGrowthChart = async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const data = await adminAnalytics.getWorkspaceGrowthChart(days);
  return res.json(data);
};

export const getAgentCreationChart = async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const data = await adminAnalytics.getAgentCreationChart(days);
  return res.json(data);
};

export const getTopWorkspaces = async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const data = await adminAnalytics.getTopWorkspacesByAgents(limit);
  return res.json(data);
};

export const getRecentUsers = async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const data = await adminAnalytics.getRecentUsers(limit);
  return res.json(data);
};

/** GET /admin/workspaces — list all workspaces (for assign dropdown) */
export const listWorkspaces = async (req, res) => {
  const workspaces = await prisma.workspace.findMany({
    // Pricing comes back with the list so the admin pricing table can show
    // every client's effective rate without an N+1 of per-workspace lookups.
    select: {
      id: true, name: true, slug: true, planName: true,
      rateOverrideInr: true,
      pricingBucketId: true,
      pricingBucket: { select: { id: true, label: true, perMinuteInr: true } },
    },
    orderBy: { name: 'asc' },
  });
  return res.json({ workspaces });
};

// ─── User Management ──────────────────────────────────────────────────────────

export const listUsers = async (req, res) => {
  const { search, status, plan, page, limit } = req.query;
  const data = await userMgmt.listUsers({
    search, status, plan,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  return res.json(data);
};

export const getUserDetail = async (req, res) => {
  const user = await userMgmt.getUserDetail(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
};

/** Snapshot used as the audit `before`/`after` for user mutations. */
const userSnapshot = (u) => (u ? {
  id: u.id, email: u.email, banned: u.banned,
  bannedAt: u.bannedAt ?? null, bannedReason: u.bannedReason ?? null,
  planName: u.planName,
} : null);

const loadUserForAudit = (id) => prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, name: true, banned: true, bannedAt: true, bannedReason: true, planName: true },
});

export const banUser = async (req, res) => {
  const { reason } = req.body;
  const before = await loadUserForAudit(req.params.id);
  if (!before) return res.status(404).json({ error: 'User not found' });

  const user = await userMgmt.banUser(req.params.id, reason);

  // A ban is only half-effective while the user still holds a valid session:
  // the access token stays verifiable until it expires. Revoking refresh tokens
  // stops renewal, so the session dies at the next refresh instead of running
  // for its full remaining lifetime.
  const { count: revokedSessions } = await prisma.refreshToken.updateMany({
    where: { userId: req.params.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await writeAudit(req, {
    action: AUDIT_ACTIONS.USER_BAN,
    category: AUDIT_CATEGORIES.USER,
    targetType: 'User',
    targetId: req.params.id,
    targetLabel: before.email,
    before: userSnapshot(before),
    after: userSnapshot(user),
    metadata: { reason: reason || null, revokedSessions },
  });

  logger.info({ adminId: req.user?.userId, targetId: req.params.id, revokedSessions }, 'User banned');
  return res.json({ success: true, user, revokedSessions });
};

export const unbanUser = async (req, res) => {
  const before = await loadUserForAudit(req.params.id);
  if (!before) return res.status(404).json({ error: 'User not found' });

  const user = await userMgmt.unbanUser(req.params.id);

  await writeAudit(req, {
    action: AUDIT_ACTIONS.USER_UNBAN,
    category: AUDIT_CATEGORIES.USER,
    targetType: 'User',
    targetId: req.params.id,
    targetLabel: before.email,
    before: userSnapshot(before),
    after: userSnapshot(user),
  });

  logger.info({ adminId: req.user?.userId, targetId: req.params.id }, 'User unbanned');
  return res.json({ success: true, user });
};

export const deleteUser = async (req, res) => {
  const before = await loadUserForAudit(req.params.id);
  if (!before) return res.status(404).json({ error: 'User not found' });

  // Refuse to delete the last Superadmin membership — locking every human out
  // of the admin panel is not a recoverable mistake from inside the product.
  const superAdminMemberships = await prisma.workspaceMember.count({
    where: { userId: req.params.id, role: ROLES.SUPER_ADMIN },
  });
  if (superAdminMemberships > 0) {
    const remaining = await prisma.workspaceMember.count({
      where: { role: ROLES.SUPER_ADMIN, NOT: { userId: req.params.id } },
    });
    if (remaining === 0) {
      await writeAudit(req, {
        action: AUDIT_ACTIONS.USER_DELETE,
        category: AUDIT_CATEGORIES.USER,
        targetType: 'User',
        targetId: req.params.id,
        targetLabel: before.email,
        status: 'failure',
        errorMessage: 'Refused: would remove the last Superadmin',
      });
      return res.status(409).json({ error: 'Cannot delete the last Superadmin account' });
    }
  }

  // Snapshot what the cascade is about to take with it, so the audit row
  // records the blast radius rather than just the user id.
  const cascade = await prisma.workspaceMember.findMany({
    where: { userId: req.params.id },
    select: { workspaceId: true, role: true },
  });

  await userMgmt.deleteUser(req.params.id);

  await writeAudit(req, {
    action: AUDIT_ACTIONS.USER_DELETE,
    category: AUDIT_CATEGORIES.USER,
    targetType: 'User',
    targetId: req.params.id,
    targetLabel: before.email,
    before: userSnapshot(before),
    after: null,
    metadata: { cascadedMemberships: cascade },
  });

  logger.info({ adminId: req.user?.userId, targetId: req.params.id }, 'User deleted');
  return res.json({ success: true });
};

/*
 * changeUserPlan and getPlans lived here.
 *
 * Removed with plans: there is nothing to assign a user to. Billing is one
 * platform rate per talk-minute against the workspace's wallet, so the admin
 * levers that matter are the rate (Super Admin → Wallet Rate) and crediting a
 * wallet (Super Admin → Wallets), both of which are audited.
 */

/**
 * POST /admin/users/:id/force-logout
 * Revokes every refresh token, ending the user's sessions at next renewal.
 */
export const forceLogoutUser = async (req, res) => {
  const target = await loadUserForAudit(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { count } = await prisma.refreshToken.updateMany({
    where: { userId: req.params.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await writeAudit(req, {
    action: AUDIT_ACTIONS.USER_FORCE_LOGOUT,
    category: AUDIT_CATEGORIES.SECURITY,
    targetType: 'User',
    targetId: req.params.id,
    targetLabel: target.email,
    metadata: { revokedSessions: count },
  });

  logger.info({ adminId: req.user?.userId, targetId: req.params.id, count }, 'User sessions revoked');
  return res.json({ success: true, revokedSessions: count });
};

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const getAuditLogs = async (req, res) => {
  const data = await audit.listAuditLogs(req.query);
  return res.json(data);
};

export const getAuditFilterOptions = async (_req, res) => {
  return res.json(await audit.getAuditFilterOptions());
};
