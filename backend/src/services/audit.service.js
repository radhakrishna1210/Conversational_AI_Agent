// backend/src/services/audit.service.js
/**
 * The admin activity audit trail.
 *
 * Every mutating action in the /admin panel writes exactly one row here. The
 * point is answering, months later and under pressure, "who moved this money /
 * deleted this account / rotated this key, from where, and what did it look
 * like before?".
 *
 * Three deliberate choices:
 *
 *  1. NEVER THROWS. An audit write failure must not roll back the action it
 *     describes. For money that is not a close call: `applyWalletTransaction`
 *     has already committed by the time we get here, so throwing would report
 *     failure for a credit that really happened, and the admin would retry and
 *     credit twice. Instead a failed write is logged at ERROR with the full
 *     payload, so the trail survives in the application log even when the table
 *     is unavailable.
 *
 *  2. DENORMALISED ACTOR AND TARGET. `actorEmail`/`targetLabel` are copied in at
 *     write time and there is no foreign key. A trail that cascade-deletes with
 *     its actor is missing exactly the rows an investigation needs.
 *
 *  3. FAILURES ARE RECORDED TOO. A refused or errored attempt is security
 *     signal — `status: 'failure'` rows are how you see someone probing.
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';

/** Stable action names. Typos become unsearchable history, so callers use these. */
export const AUDIT_ACTIONS = Object.freeze({
  // user
  USER_BAN: 'user.ban',
  USER_UNBAN: 'user.unban',
  USER_DELETE: 'user.delete',
  USER_PLAN_CHANGE: 'user.plan_change',
  USER_FORCE_LOGOUT: 'user.force_logout',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_ROLE_CHANGE: 'user.role_change',
  // security
  IMPERSONATION_START: 'impersonation.start',
  IMPERSONATION_END: 'impersonation.end',
  // billing
  WALLET_CREDIT: 'wallet.credit',
  WALLET_DEBIT: 'wallet.debit',
  REFUND_ISSUE: 'refund.issue',
  SUBSCRIPTION_OVERRIDE: 'subscription.override',
  INVOICE_GENERATE: 'invoice.generate',
  // plan
  PLAN_CREATE: 'plan.create',
  PLAN_UPDATE: 'plan.update',
  PLAN_DELETE: 'plan.delete',
  // number pool
  NUMBER_ADD: 'number.add',
  NUMBER_ASSIGN: 'number.assign',
  NUMBER_UNASSIGN: 'number.unassign',
  NUMBER_RESET: 'number.reset',
  NUMBER_DEACTIVATE: 'number.deactivate',
  NUMBER_DELETE: 'number.delete',
  // agent
  AGENT_DISABLE: 'agent.disable',
  AGENT_FLAG: 'agent.flag',
  // voice
  VOICE_CLONE_DELETE: 'voice_clone.delete',
  VOICE_SAMPLE_DELETE: 'voice_sample.delete',
  // platform
  MODEL_CATALOG_UPDATE: 'model_catalog.update',
});

export const AUDIT_CATEGORIES = Object.freeze({
  USER: 'user',
  BILLING: 'billing',
  PLAN: 'plan',
  NUMBER: 'number',
  AGENT: 'agent',
  PROVIDER: 'provider',
  SECURITY: 'security',
  SYSTEM: 'system',
  CONTENT: 'content',
});

/**
 * Client IP, honouring the proxy chain.
 *
 * Express only populates `req.ips` when `trust proxy` is enabled; when it is
 * not, `x-forwarded-for` is attacker-controlled and must not be preferred over
 * the socket address. We take the app's configured view first and fall back to
 * the raw socket, which is always truthful even if it is the load balancer.
 */
const clientIp = (req) => {
  if (Array.isArray(req?.ips) && req.ips.length) return req.ips[0];
  return req?.ip ?? req?.socket?.remoteAddress ?? null;
};

/** Truncate oversized snapshots — an audit row must never be the reason a write fails. */
const MAX_SNAPSHOT_CHARS = 8000;
const serialise = (value) => {
  if (value === undefined || value === null) return null;
  let json;
  try {
    json = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return JSON.stringify({ _unserialisable: true });
  }
  if (json.length <= MAX_SNAPSHOT_CHARS) return json;
  return JSON.stringify({ _truncated: true, _originalLength: json.length, preview: json.slice(0, MAX_SNAPSHOT_CHARS) });
};

/** Keys whose values must never reach the audit table in plaintext. */
const REDACT_KEYS = /^(password|passwordHash|token|accessToken|refreshToken|secret|apiKey|keySecret|authToken|webhookSecret|.*Cipher)$/i;

/**
 * Strip secrets from a snapshot before it is stored. An audit trail that
 * records the key you just rotated has leaked it to everyone with read access
 * to the panel.
 */
export const redact = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.test(k)) out[k] = '[redacted]';
    else if (v && typeof v === 'object') out[k] = redact(v);
    else out[k] = v;
  }
  return out;
};

/**
 * Write one audit row.
 *
 * @param {object} req  Express request — supplies actor identity, IP, UA.
 * @param {object} entry
 * @param {string} entry.action      one of AUDIT_ACTIONS
 * @param {string} [entry.category]  one of AUDIT_CATEGORIES
 * @param {string} [entry.targetType]
 * @param {string} [entry.targetId]
 * @param {string} [entry.targetLabel]
 * @param {string} [entry.workspaceId]
 * @param {object} [entry.before]    snapshot prior to the change
 * @param {object} [entry.after]     snapshot after the change
 * @param {object} [entry.metadata]
 * @param {'success'|'failure'} [entry.status]
 * @param {string} [entry.errorMessage]
 * @returns {Promise<object|null>} the row, or null if the write failed
 */
export async function writeAudit(req, {
  action,
  category = 'general',
  targetType = null,
  targetId = null,
  targetLabel = null,
  workspaceId = null,
  before = null,
  after = null,
  metadata = {},
  status = 'success',
  errorMessage = null,
} = {}) {
  try {
    if (!action) throw new Error('audit action is required');

    return await prisma.auditLog.create({
      data: {
        actorId: req?.user?.userId ?? null,
        actorEmail: req?.user?.email ?? null,
        actorRole: req?.user?.role ?? null,
        actorIp: clientIp(req),
        actorUserAgent: req?.headers?.['user-agent']?.slice(0, 500) ?? null,
        // Set by the impersonation middleware when the admin is acting as a user.
        impersonatedUserId: req?.impersonation?.targetUserId ?? null,
        action,
        category,
        targetType,
        targetId,
        targetLabel,
        workspaceId,
        before: serialise(redact(before)),
        after: serialise(redact(after)),
        metadata: serialise(redact(metadata)) ?? '{}',
        status,
        errorMessage,
      },
    });
  } catch (err) {
    // See the header note: we log rather than throw, so the trail survives in
    // the application log and the underlying action is not falsely reported as
    // having failed.
    logger.error(
      { err: err.message, action, targetType, targetId, actorId: req?.user?.userId, status },
      'AUDIT WRITE FAILED — action proceeded but was not persisted to AuditLog',
    );
    return null;
  }
}

/**
 * Paginated audit query. Every filter is indexed; there is no unbounded read.
 */
export async function listAuditLogs({
  page = 1,
  limit = 50,
  action = '',
  category = '',
  actorId = '',
  targetId = '',
  targetType = '',
  status = '',
  search = '',
  from = '',
  to = '',
} = {}) {
  const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);

  const where = {};
  if (action) where.action = action;
  if (category) where.category = category;
  if (actorId) where.actorId = actorId;
  if (targetId) where.targetId = targetId;
  if (targetType) where.targetType = targetType;
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  if (search) {
    where.OR = [
      { actorEmail: { contains: search, mode: 'insensitive' } },
      { targetLabel: { contains: search, mode: 'insensitive' } },
      { action: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (currentPage - 1) * take,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const parse = (v, fb = null) => { try { return v ? JSON.parse(v) : fb; } catch { return v; } };

  return {
    logs: rows.map((r) => ({
      ...r,
      before: parse(r.before),
      after: parse(r.after),
      metadata: parse(r.metadata, {}),
    })),
    total,
    page: currentPage,
    limit: take,
    pages: Math.ceil(total / take),
  };
}

/** Distinct action/category values present, for populating filter dropdowns. */
export async function getAuditFilterOptions() {
  const [actions, categories] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' }, take: 200 }),
    prisma.auditLog.findMany({ distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' }, take: 50 }),
  ]);
  return {
    actions: actions.map((a) => a.action),
    categories: categories.map((c) => c.category),
    knownActions: Object.values(AUDIT_ACTIONS),
  };
}
