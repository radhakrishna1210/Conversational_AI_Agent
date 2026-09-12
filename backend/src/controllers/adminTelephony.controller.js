// Super Admin → Numbers & Carrier.
//
// The operator's side of the number business: who is verified, who holds what,
// who is asking for a number, and whether our books agree with the carrier's.
// Everything that spends money, stops a client calling, or gives a number back
// is audited — these are the actions a customer will later ask us to explain.
//
// Read paths degrade rather than fail: an unconfigured or unreachable Plivo must
// still leave the workspace list, the numbers and the queue readable, because
// that is where an operator looks to find out what is wrong.

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import {
  CARRIER_APPLICATION_STATUS,
  NUMBER_REQUEST_STATUS,
  VOICE_NUMBER_STATUS,
} from '../constants/compliance.js';
import { review } from '../services/compliance/compliance.service.js';
import { writeAudit, AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../services/audit.service.js';
import { PlivoError, isPlivoConfigured } from '../services/plivo/client.js';
import * as subaccounts from '../services/plivo/subaccount.service.js';
import * as lifecycle from '../services/plivo/lifecycle.service.js';
import * as carrierNumbers from '../services/plivo/number.service.js';
import * as numberRequests from '../services/plivo/numberRequest.service.js';
import * as reconciliation from '../services/plivo/reconciliation.service.js';
import { getNumberRate } from '../services/billing/numberRate.js';
import {
  getConcurrencyLimits,
  setConcurrencyLimits,
  snapshot as concurrencySnapshot,
} from '../services/telephony/concurrency.js';
import { selfServeRentEnabled } from '../services/plivo/numberRequest.service.js';

const actor = (req) => req.user?.email ?? req.user?.userId ?? null;

/** Carrier failures are the carrier's, not the operator's request. */
const failCarrier = (res, err, action) => {
  if (err instanceof PlivoError) {
    logger.warn({ err: err.message, status: err.status }, `${action} rejected by Plivo`);
    return res.status(err.status && err.status < 500 ? err.status : 502).json({ error: err.message });
  }
  logger.error({ err: err.message }, `${action} failed`);
  return res.status(502).json({ error: `Could not reach the carrier to ${action}. Try again shortly.` });
};

// ── Overview ────────────────────────────────────────────────────────────────

/**
 * GET /admin/telephony/overview
 *
 * Everything the page header needs: how the platform is configured, what is
 * live, and what is waiting on somebody.
 */
export const getOverview = async (_req, res) => {
  const [
    numbers, suspendedNumbers, pendingRequests, awaitingReview, subaccountCount, rate, limits, lastRun,
  ] = await Promise.all([
    prisma.voiceNumber.count({ where: { status: { not: VOICE_NUMBER_STATUS.RELEASED } } }),
    prisma.voiceNumber.count({ where: { status: VOICE_NUMBER_STATUS.SUSPENDED_NONPAYMENT } }),
    prisma.numberRequest.count({ where: { status: NUMBER_REQUEST_STATUS.PENDING } }),
    prisma.workspaceCompliance.count({ where: { carrierApplicationStatus: CARRIER_APPLICATION_STATUS.SUBMITTED } }),
    prisma.plivoSubaccount.count(),
    getNumberRate(),
    getConcurrencyLimits(),
    prisma.carrierReconciliationRun.findFirst({
      orderBy: { startedAt: 'desc' },
      select: { id: true, status: true, startedAt: true, finishedAt: true, summary: true, error: true },
    }),
  ]);

  res.json({
    carrier: {
      configured: isPlivoConfigured(),
      selfServeRent: selfServeRentEnabled(),
      reconciliationScheduled: process.env.PLIVO_RECONCILIATION_ENABLED !== 'false',
    },
    counts: { numbers, suspendedNumbers, pendingRequests, awaitingReview, subaccounts: subaccountCount },
    rate: { monthlyInr: rate.monthlyInr, setupInr: rate.setupInr },
    concurrency: { ...limits, ...concurrencySnapshot() },
    lastReconciliation: lastRun,
  });
};

// ── Workspaces ──────────────────────────────────────────────────────────────

/**
 * GET /admin/telephony/workspaces
 *
 * One row per workspace that has reached the carrier at all — a compliance
 * record, a subaccount, or a number. A workspace that has never started
 * onboarding is not an operator's problem and would bury the ones that are.
 */
export const listWorkspaces = async (req, res) => {
  const filter = String(req.query.filter ?? 'all');

  const [records, subs, numbers, pending] = await Promise.all([
    prisma.workspaceCompliance.findMany({
      select: {
        workspaceId: true, entityName: true, useCase: true, carrierApplicationStatus: true,
        carrierApplicationRef: true, carrierRejectionReason: true, carrierApplicationAt: true,
        peStatus: true, tmBindingStatus: true, suspended: true, suspendedReason: true, suspendedAt: true,
        workspace: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    }),
    prisma.plivoSubaccount.findMany({
      select: { workspaceId: true, authId: true, name: true, enabled: true, appId: true, createdAt: true },
    }),
    prisma.voiceNumber.groupBy({
      by: ['workspaceId', 'status'],
      _count: { _all: true },
    }),
    prisma.numberRequest.groupBy({
      by: ['workspaceId'],
      where: { status: NUMBER_REQUEST_STATUS.PENDING },
      _count: { _all: true },
    }),
  ]);

  const subByWs = new Map(subs.map((s) => [s.workspaceId, s]));
  const pendingByWs = new Map(pending.map((p) => [p.workspaceId, p._count._all]));
  const numbersByWs = new Map();
  for (const n of numbers) {
    const e = numbersByWs.get(n.workspaceId) ?? { active: 0, suspended: 0, released: 0 };
    if (n.status === VOICE_NUMBER_STATUS.ACTIVE) e.active += n._count._all;
    else if (n.status === VOICE_NUMBER_STATUS.SUSPENDED_NONPAYMENT) e.suspended += n._count._all;
    else e.released += n._count._all;
    numbersByWs.set(n.workspaceId, e);
  }

  // A workspace can hold a subaccount or numbers without a compliance row —
  // recorded by hand, or restored — and those are exactly the odd ones out an
  // operator needs to see.
  const ids = new Set([
    ...records.map((r) => r.workspaceId),
    ...subByWs.keys(),
    ...numbersByWs.keys(),
    ...pendingByWs.keys(),
  ]);
  const byId = new Map(records.map((r) => [r.workspaceId, r]));
  const missingNames = [...ids].filter((id) => !byId.get(id)?.workspace);
  const extraNames = missingNames.length
    ? await prisma.workspace.findMany({ where: { id: { in: missingNames } }, select: { id: true, name: true, slug: true } })
    : [];
  const nameById = new Map(extraNames.map((w) => [w.id, w]));

  let rows = [...ids].map((workspaceId) => {
    const record = byId.get(workspaceId) ?? null;
    const ws = record?.workspace ?? nameById.get(workspaceId) ?? null;
    const sub = subByWs.get(workspaceId) ?? null;
    return {
      workspaceId,
      workspaceName: ws?.name ?? null,
      workspaceSlug: ws?.slug ?? null,
      entityName: record?.entityName ?? null,
      useCase: record?.useCase ?? null,
      carrierApplicationStatus: record?.carrierApplicationStatus ?? CARRIER_APPLICATION_STATUS.NOT_SUBMITTED,
      carrierApplicationRef: record?.carrierApplicationRef ?? null,
      carrierRejectionReason: record?.carrierRejectionReason ?? null,
      carrierApplicationAt: record?.carrierApplicationAt ?? null,
      peStatus: record?.peStatus ?? null,
      tmBindingStatus: record?.tmBindingStatus ?? null,
      suspended: Boolean(record?.suspended),
      suspendedReason: record?.suspendedReason ?? null,
      subaccount: sub ? { authId: sub.authId, enabled: sub.enabled, appId: sub.appId, createdAt: sub.createdAt } : null,
      numbers: numbersByWs.get(workspaceId) ?? { active: 0, suspended: 0, released: 0 },
      pendingRequests: pendingByWs.get(workspaceId) ?? 0,
      // Our gate says stopped, the carrier's says go: the kill switch did not
      // take at Plivo, and this workspace can still dial from a number it holds.
      carrierDrift: Boolean(record?.suspended) && Boolean(sub?.enabled),
    };
  });

  if (filter === 'awaiting_review') {
    rows = rows.filter((r) => r.carrierApplicationStatus === CARRIER_APPLICATION_STATUS.SUBMITTED);
  } else if (filter === 'suspended') {
    rows = rows.filter((r) => r.suspended || r.numbers.suspended > 0);
  } else if (filter === 'drift') {
    rows = rows.filter((r) => r.carrierDrift || (r.numbers.active > 0 && !r.subaccount));
  }

  rows.sort((a, b) => {
    // Problems first, then whoever is waiting on us, then by size.
    const rank = (r) => (r.carrierDrift ? 0 : r.pendingRequests ? 1
      : r.carrierApplicationStatus === CARRIER_APPLICATION_STATUS.SUBMITTED ? 2 : r.suspended ? 3 : 4);
    return rank(a) - rank(b)
      || b.numbers.active - a.numbers.active
      || String(a.workspaceName ?? '').localeCompare(String(b.workspaceName ?? ''));
  });

  res.json({ workspaces: rows });
};

/**
 * POST /admin/telephony/workspaces/:workspaceId/carrier-access  { enabled }
 *
 * The kill switch on its own — Plivo stops this client's traffic, our own gate
 * is untouched. For the usual case (stop them calling at all) use the
 * suspension endpoint, which moves both.
 */
export const postCarrierAccess = async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  try {
    const result = await lifecycle.syncCarrierAccess(req.params.workspaceId, { enabled });
    if (!result.ok) return res.status(502).json({ error: result.error });

    await writeAudit(req, {
      action: enabled ? AUDIT_ACTIONS.CARRIER_ENABLE : AUDIT_ACTIONS.CARRIER_DISABLE,
      category: AUDIT_CATEGORIES.PROVIDER,
      targetType: 'Workspace',
      targetId: req.params.workspaceId,
      workspaceId: req.params.workspaceId,
      metadata: { enabled, changed: result.changed },
    });
    res.json(result);
  } catch (err) {
    return failCarrier(res, err, 'change carrier access');
  }
};

/**
 * POST /admin/telephony/workspaces/:workspaceId/suspension  { suspended, reason? }
 *
 * Stops (or restores) this workspace's calling on both sides at once.
 */
export const postSuspension = async (req, res) => {
  const suspended = Boolean(req.body?.suspended);
  const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : null;

  const result = await lifecycle.setWorkspaceSuspension(req.params.workspaceId, { suspended, reason });
  if (!result.ok) return res.status(400).json({ error: result.error });

  await writeAudit(req, {
    action: suspended ? AUDIT_ACTIONS.WORKSPACE_SUSPEND : AUDIT_ACTIONS.WORKSPACE_UNSUSPEND,
    category: AUDIT_CATEGORIES.PROVIDER,
    targetType: 'Workspace',
    targetId: req.params.workspaceId,
    workspaceId: req.params.workspaceId,
    metadata: { reason, carrier: result.carrier },
    // The carrier half failing is the part worth seeing in the trail: our gate
    // holds, but the client can still dial out through Plivo directly.
    status: result.carrier?.ok === false ? 'failure' : 'success',
    errorMessage: result.carrier?.ok === false ? result.carrier.error : null,
  });
  res.json(result);
};

/**
 * POST /admin/telephony/workspaces/:workspaceId/review  { carrierApplicationStatus?, … }
 *
 * Record a carrier decision by hand. The webhook does this on its own; this is
 * for the times it did not arrive, or arrived wrong.
 */
export const postReview = async (req, res) => {
  const patch = {
    carrierApplicationStatus: req.body?.carrierApplicationStatus,
    carrierApplicationRef: req.body?.carrierApplicationRef,
    carrierRejectionReason: req.body?.carrierRejectionReason,
    peStatus: req.body?.peStatus,
    tmBindingStatus: req.body?.tmBindingStatus,
    documentId: req.body?.documentId,
    documentStatus: req.body?.documentStatus,
    reviewNote: req.body?.reviewNote,
  };
  const result = await review(req.params.workspaceId, patch);
  if (!result.ok) return res.status(400).json({ error: result.error });

  await writeAudit(req, {
    action: AUDIT_ACTIONS.COMPLIANCE_REVIEW,
    category: AUDIT_CATEGORIES.PROVIDER,
    targetType: 'Workspace',
    targetId: req.params.workspaceId,
    workspaceId: req.params.workspaceId,
    metadata: patch,
  });
  res.json(result);
};

/**
 * POST /admin/telephony/workspaces/:workspaceId/relink  { authId, replace? }
 *
 * Point a workspace at a subaccount that already exists at Plivo, fetching its
 * token. For a subaccount whose row was lost, or one made in the console.
 */
export const postRelink = async (req, res) => {
  try {
    const result = await subaccounts.relinkSubaccount(req.params.workspaceId, req.body?.authId, {
      replace: Boolean(req.body?.replace),
    });
    if (!result.ok) return res.status(409).json({ error: result.error });

    await writeAudit(req, {
      action: AUDIT_ACTIONS.CARRIER_RELINK,
      category: AUDIT_CATEGORIES.PROVIDER,
      targetType: 'Workspace',
      targetId: req.params.workspaceId,
      workspaceId: req.params.workspaceId,
      metadata: { authId: result.subaccount.authId, replace: Boolean(req.body?.replace) },
    });
    res.json({ subaccount: { authId: result.subaccount.authId, enabled: result.subaccount.enabled } });
  } catch (err) {
    return failCarrier(res, err, 'link that subaccount');
  }
};

/**
 * POST /admin/telephony/workspaces/:workspaceId/offboard  { confirm, reason? }
 *
 * Releases every number and closes the carrier account. Not reversible: a
 * released number is never reissued to anyone, and its DLT header goes with it.
 */
export const postOffboard = async (req, res) => {
  if (req.body?.confirm !== req.params.workspaceId) {
    return res.status(400).json({
      error: 'Confirm by sending the workspace id — this releases every number and cannot be undone.',
    });
  }

  try {
    const result = await lifecycle.offboardWorkspace(req.params.workspaceId, {
      reason: req.body?.reason ? String(req.body.reason).slice(0, 500) : null,
    });
    await writeAudit(req, {
      action: AUDIT_ACTIONS.CARRIER_OFFBOARD,
      category: AUDIT_CATEGORIES.PROVIDER,
      targetType: 'Workspace',
      targetId: req.params.workspaceId,
      workspaceId: req.params.workspaceId,
      metadata: result,
      status: result.ok ? 'success' : 'failure',
      errorMessage: result.ok ? null : 'Carrier resources were left behind — see the metadata.',
    });
    res.status(result.ok ? 200 : 207).json(result);
  } catch (err) {
    return failCarrier(res, err, 'offboard that workspace');
  }
};

// ── Numbers ─────────────────────────────────────────────────────────────────

/** GET /admin/telephony/numbers?status=&workspaceId=&q= */
export const listNumbers = async (req, res) => {
  const { status, workspaceId, q } = req.query;
  const where = {
    ...(status && status !== 'ALL' ? { status: String(status) } : {}),
    ...(workspaceId ? { workspaceId: String(workspaceId) } : {}),
    ...(q ? { phoneNumber: { contains: String(q) } } : {}),
  };

  const rows = await prisma.voiceNumber.findMany({
    where,
    orderBy: [{ status: 'asc' }, { assignedAt: 'desc' }],
    take: 500,
    include: { workspace: { select: { id: true, name: true } } },
  });

  res.json({
    numbers: rows.map((n) => ({
      id: n.id,
      phoneNumber: n.phoneNumber,
      workspaceId: n.workspaceId,
      workspaceName: n.workspace?.name ?? null,
      provider: n.provider,
      subaccountId: n.subaccountId,
      series: n.series,
      status: n.status,
      headerStatus: n.headerStatus,
      inboundAgentId: n.inboundAgentId,
      dailyDialCap: n.dailyDialCap,
      // Both prices: this screen is where margin per number is actually visible.
      clientMonthlyCents: n.clientMonthlyCents,
      carrierMonthlyCents: n.carrierMonthlyCents,
      nextRenewalAt: n.nextRenewalAt,
      renewalFailedAt: n.renewalFailedAt,
      assignedAt: n.assignedAt,
      releasedAt: n.releasedAt,
    })),
  });
};

/** GET /admin/telephony/numbers/available?workspaceId=&pattern=&city= */
export const searchNumbers = async (req, res) => {
  if (!req.query.workspaceId) {
    return res.status(400).json({ error: 'Pick the workspace to search for — the series depends on its use case.' });
  }
  try {
    const result = await carrierNumbers.searchNumbers(String(req.query.workspaceId), {
      pattern: req.query.pattern,
      city: req.query.city,
      offset: Number(req.query.offset) || 0,
    });
    if (!result.ok) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) {
    return failCarrier(res, err, 'search for available numbers');
  }
};

/**
 * POST /admin/telephony/numbers/rent  { workspaceId, phoneNumber }
 *
 * Rents on a client's behalf, debiting THEIR wallet exactly as a self-serve
 * purchase would — an admin buying a number a client did not agree to pay for
 * is a refund conversation, not a shortcut.
 */
export const postRentNumber = async (req, res) => {
  const { workspaceId, phoneNumber } = req.body ?? {};
  if (!workspaceId || !phoneNumber) return res.status(400).json({ error: 'workspaceId and phoneNumber are required.' });

  try {
    const result = await carrierNumbers.rentNumber(String(workspaceId), { phoneNumber: String(phoneNumber) });
    await writeAudit(req, {
      action: AUDIT_ACTIONS.NUMBER_ASSIGN,
      category: AUDIT_CATEGORIES.NUMBER,
      targetType: 'VoiceNumber',
      targetId: result.number?.id ?? null,
      targetLabel: String(phoneNumber),
      workspaceId: String(workspaceId),
      metadata: { ok: result.ok, error: result.error ?? null },
      status: result.ok ? 'success' : 'failure',
      errorMessage: result.ok ? null : result.error,
    });
    if (!result.ok) return res.status(409).json({ error: result.error });
    res.status(201).json({ number: result.number });
  } catch (err) {
    return failCarrier(res, err, 'rent that number');
  }
};

/** DELETE /admin/telephony/numbers/:numberId  { workspaceId, confirm } */
export const deleteNumber = async (req, res) => {
  const workspaceId = String(req.body?.workspaceId ?? req.query.workspaceId ?? '');
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required.' });

  const number = await prisma.voiceNumber.findFirst({ where: { id: req.params.numberId, workspaceId } });
  if (!number) return res.status(404).json({ error: 'Number not found in that workspace.' });
  if (req.body?.confirm !== number.phoneNumber) {
    return res.status(400).json({
      error: 'Confirm by sending the number itself — releasing it destroys the client\'s DLT header and cannot be undone.',
    });
  }

  try {
    const result = await carrierNumbers.releaseRentedNumber(workspaceId, { numberId: req.params.numberId });
    await writeAudit(req, {
      action: AUDIT_ACTIONS.NUMBER_UNASSIGN,
      category: AUDIT_CATEGORIES.NUMBER,
      targetType: 'VoiceNumber',
      targetId: req.params.numberId,
      targetLabel: number.phoneNumber,
      workspaceId,
      before: { status: number.status },
      metadata: { ok: result.ok },
      status: result.ok ? 'success' : 'failure',
      errorMessage: result.ok ? null : result.error,
    });
    if (!result.ok) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) {
    return failCarrier(res, err, 'release that number');
  }
};

/**
 * PATCH /admin/telephony/numbers/:numberId  { dailyDialCap }
 *
 * The per-number dial cap. The only field here an operator edits directly —
 * everything else about a number is the carrier's or the client's to say.
 */
export const patchNumber = async (req, res) => {
  const cap = Number(req.body?.dailyDialCap);
  if (!Number.isInteger(cap) || cap < 1 || cap > 5000) {
    return res.status(400).json({ error: 'The daily dial cap must be a whole number between 1 and 5000.' });
  }

  const before = await prisma.voiceNumber.findUnique({ where: { id: req.params.numberId } });
  if (!before) return res.status(404).json({ error: 'Number not found.' });

  const updated = await prisma.voiceNumber.update({
    where: { id: req.params.numberId },
    data: { dailyDialCap: cap },
  });
  await writeAudit(req, {
    action: AUDIT_ACTIONS.NUMBER_UPDATE,
    category: AUDIT_CATEGORIES.NUMBER,
    targetType: 'VoiceNumber',
    targetId: updated.id,
    targetLabel: updated.phoneNumber,
    workspaceId: updated.workspaceId,
    before: { dailyDialCap: before.dailyDialCap },
    after: { dailyDialCap: cap },
  });
  res.json({ number: { id: updated.id, dailyDialCap: updated.dailyDialCap } });
};

// ── Requests ────────────────────────────────────────────────────────────────

/** GET /admin/telephony/requests?status= */
export const listRequests = async (req, res) => {
  const rows = await numberRequests.adminListNumberRequests({
    status: req.query.status ? String(req.query.status) : NUMBER_REQUEST_STATUS.PENDING,
  });
  res.json({ selfServe: selfServeRentEnabled(), requests: rows });
};

/** POST /admin/telephony/requests/:requestId/fulfil  { phoneNumber? } */
export const postFulfilRequest = async (req, res) => {
  try {
    const result = await numberRequests.fulfilNumberRequest(req.params.requestId, {
      phoneNumber: req.body?.phoneNumber ?? null,
      resolvedBy: actor(req),
    });
    await writeAudit(req, {
      action: AUDIT_ACTIONS.NUMBER_ASSIGN,
      category: AUDIT_CATEGORIES.NUMBER,
      targetType: 'NumberRequest',
      targetId: req.params.requestId,
      targetLabel: result.number?.phoneNumber ?? req.body?.phoneNumber ?? null,
      metadata: { ok: result.ok, error: result.error ?? null },
      status: result.ok ? 'success' : 'failure',
      errorMessage: result.ok ? null : result.error,
    });
    if (!result.ok) return res.status(result.status ?? 409).json({ error: result.error });
    res.status(201).json({ number: result.number });
  } catch (err) {
    return failCarrier(res, err, 'rent that number');
  }
};

/** POST /admin/telephony/requests/:requestId/decline  { reason } */
export const postDeclineRequest = async (req, res) => {
  const result = await numberRequests.declineNumberRequest(req.params.requestId, {
    reason: req.body?.reason,
    resolvedBy: actor(req),
  });
  if (!result.ok) return res.status(result.status ?? 409).json({ error: result.error });

  await writeAudit(req, {
    action: AUDIT_ACTIONS.NUMBER_REQUEST_DECLINE,
    category: AUDIT_CATEGORIES.NUMBER,
    targetType: 'NumberRequest',
    targetId: req.params.requestId,
    metadata: { reason: req.body?.reason ?? null },
  });
  res.json(result);
};

// ── Carrier audit ───────────────────────────────────────────────────────────

/** GET /admin/telephony/audit — Plivo's subaccounts against ours. */
export const getCarrierAudit = async (_req, res) => {
  if (!isPlivoConfigured()) {
    return res.status(503).json({ error: 'Plivo is not configured on this server.' });
  }
  try {
    res.json(await subaccounts.auditSubaccounts());
  } catch (err) {
    return failCarrier(res, err, 'audit the carrier account');
  }
};

// ── Reconciliation ──────────────────────────────────────────────────────────

/** GET /admin/telephony/reconciliation */
export const listReconciliationRuns = async (_req, res) => {
  res.json({ runs: await reconciliation.listReconciliationRuns() });
};

/** GET /admin/telephony/reconciliation/:runId — with the discrepancy list. */
export const getReconciliationRun = async (req, res) => {
  const run = await reconciliation.getReconciliationRun(req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found.' });
  res.json({ run });
};

/** POST /admin/telephony/reconciliation  { from?, to? } */
export const postReconciliation = async (req, res) => {
  const result = await reconciliation.runReconciliation({
    from: req.body?.from ? new Date(req.body.from) : null,
    to: req.body?.to ? new Date(req.body.to) : null,
    trigger: 'manual',
    triggeredBy: actor(req),
  });
  if (!result.ok) return res.status(result.status ?? 500).json({ error: result.error });
  res.json({ run: result.run });
};

// ── Concurrency ─────────────────────────────────────────────────────────────

/**
 * GET /admin/telephony/concurrency
 *
 * The ceilings and what is live against them. Subaccounts share the parent's
 * pool at Plivo — there is no per-subaccount cap and no per-subaccount usage
 * API — so the per-workspace ceiling here is the only thing standing between
 * one client's campaign and everyone else's calls.
 */
export const getConcurrency = async (_req, res) => {
  res.json({ ...(await getConcurrencyLimits()), ...concurrencySnapshot() });
};

/** PUT /admin/telephony/concurrency  { carrierCeiling?, perWorkspace? } */
export const putConcurrency = async (req, res) => {
  try {
    const before = await getConcurrencyLimits();
    const limits = await setConcurrencyLimits({
      carrierCeiling: req.body?.carrierCeiling,
      perWorkspace: req.body?.perWorkspace,
    });
    await writeAudit(req, {
      action: AUDIT_ACTIONS.CONCURRENCY_UPDATE,
      category: AUDIT_CATEGORIES.PROVIDER,
      targetType: 'Platform',
      targetId: 'concurrency',
      before,
      after: limits,
    });
    res.json({ ...limits, ...concurrencySnapshot() });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Could not save the limits.' });
  }
};
