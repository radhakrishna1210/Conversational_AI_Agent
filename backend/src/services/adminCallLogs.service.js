// backend/src/services/adminCallLogs.service.js
/**
 * Cross-tenant call log access for the admin console.
 *
 * Two things shape this file:
 *
 *  1. NO RELATIONS. `AgentCallLog.workspaceId` / `.agentId` are plain String
 *     columns with no `@relation`, so Prisma cannot `include` the agent or
 *     workspace. Rows are batch-hydrated after the page is fetched — two extra
 *     queries per page, not one per row.
 *
 *  2. ALWAYS PAGINATED. This table grows without bound (one row per call, per
 *     tenant, forever). Every query here takes a bounded page and orders by
 *     `startedAt`, which is the trailing column of the existing
 *     `[workspaceId, agentId, startedAt]` index.
 */

import prisma from '../config/prisma.js';

const MAX_LIMIT = 100;

const parseJson = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };

/**
 * Hydrate agent + workspace names for a page of rows.
 * Two `IN` queries regardless of page size.
 */
const hydrate = async (rows) => {
  const agentIds = [...new Set(rows.map((r) => r.agentId).filter(Boolean))];
  const workspaceIds = [...new Set(rows.map((r) => r.workspaceId).filter(Boolean))];

  const [agents, workspaces] = await Promise.all([
    agentIds.length
      ? prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true, aiModel: true, voice: true } })
      : [],
    workspaceIds.length
      ? prisma.workspace.findMany({ where: { id: { in: workspaceIds } }, select: { id: true, name: true, slug: true, planName: true } })
      : [],
  ]);

  const agentById = new Map(agents.map((a) => [a.id, a]));
  const wsById = new Map(workspaces.map((w) => [w.id, w]));

  return rows.map((r) => ({
    ...r,
    // Null rather than a fabricated name when the agent or workspace has been
    // deleted — the call still happened and must remain visible.
    agent: agentById.get(r.agentId) ?? null,
    workspace: wsById.get(r.workspaceId) ?? null,
  }));
};

/** Row shape for the list view — deliberately excludes the transcript. */
const listDto = (r) => ({
  id: r.id,
  type: r.type,
  status: r.status,
  durationSec: r.durationSec,
  phoneNumber: r.phoneNumber,
  startedAt: r.startedAt,
  endedAt: r.endedAt,
  hasRecording: Boolean(r.recordingPath),
  extractionStatus: r.extractionStatus,
  billingStatus: r.billingStatus,
  billedCents: r.billedCents,
  // Billing is per second, so this is a fraction — 61 seconds is 1.0166666…
  // Rounded for display only; `billedCents` is the figure that was charged and
  // is never derived from this.
  billedMinutes: Number((Number(r.billedMinutes) || 0).toFixed(2)),
  ratePerMinuteCents: r.ratePerMinuteCents,
  // Null on every row today: settleCall() accepts this but no call site
  // supplies it. Passed through as-is so the UI can say "not measured"
  // instead of rendering a margin that was never recorded.
  actualCostMicroUsd: r.actualCostMicroUsd,
  agent: r.agent,
  workspace: r.workspace,
});

/**
 * Paginated, filtered call log across every tenant.
 *
 * `search` matches the phone number only. Agent and workspace are separate
 * columns on another table, so a name search would require loading candidate
 * ids first — the UI filters by explicit workspace/agent id instead, which is
 * both cheaper and unambiguous.
 */
export async function listCallLogs({
  page = 1,
  limit = 25,
  workspaceId = '',
  agentId = '',
  status = '',
  type = '',
  billingStatus = '',
  hasRecording = '',
  search = '',
  from = '',
  to = '',
  minDurationSec = '',
} = {}) {
  const take = Math.min(Math.max(parseInt(limit, 10) || 25, 1), MAX_LIMIT);
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);

  const where = {};
  if (workspaceId) where.workspaceId = workspaceId;
  if (agentId) where.agentId = agentId;
  if (status) where.status = status;
  if (type) where.type = type;
  if (billingStatus) where.billingStatus = billingStatus;
  if (hasRecording === 'true') where.recordingPath = { not: null };
  if (hasRecording === 'false') where.recordingPath = null;
  if (search) where.phoneNumber = { contains: search };
  if (minDurationSec) where.durationSec = { gte: parseInt(minDurationSec, 10) || 0 };
  if (from || to) {
    where.startedAt = {};
    if (from) where.startedAt.gte = new Date(from);
    if (to) where.startedAt.lte = new Date(to);
  }

  const [rows, total] = await prisma.$transaction([
    prisma.agentCallLog.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (currentPage - 1) * take,
      take,
    }),
    prisma.agentCallLog.count({ where }),
  ]);

  const hydrated = await hydrate(rows);

  return {
    logs: hydrated.map(listDto),
    total,
    page: currentPage,
    limit: take,
    pages: Math.ceil(total / take),
  };
}

/** One call, with transcript and extracted data. */
export async function getCallLog(id) {
  const row = await prisma.agentCallLog.findUnique({ where: { id } });
  if (!row) return null;
  const [hydrated] = await hydrate([row]);
  return {
    ...listDto(hydrated),
    transcript: parseJson(row.transcript, []),
    extractedData: parseJson(row.extractedData, {}),
    extractionError: row.extractionError,
    extractedAt: row.extractedAt,
    recordingMime: row.recordingMime,
    billedAt: row.billedAt,
  };
}

/**
 * Platform call statistics for the given window.
 *
 * `cogs` is reported with an explicit `measured` count rather than summed
 * blindly. `actualCostMicroUsd` is null on every call today, and a margin
 * computed from an all-null column would render as 100% profit — a confident,
 * wrong number is worse than an honest gap.
 */
export async function getCallStats({ days = 30 } = {}) {
  const since = new Date(Date.now() - (parseInt(days, 10) || 30) * 86_400_000);
  const where = { startedAt: { gte: since } };

  const [byStatus, byType, totals, costed, recorded, topWorkspaces] = await Promise.all([
    prisma.agentCallLog.groupBy({ by: ['status'], where, _count: true }),
    prisma.agentCallLog.groupBy({ by: ['type'], where, _count: true }),
    prisma.agentCallLog.aggregate({
      where,
      _count: true,
      _sum: { durationSec: true, billedCents: true, billedMinutes: true },
      _avg: { durationSec: true },
    }),
    prisma.agentCallLog.aggregate({
      where: { ...where, actualCostMicroUsd: { not: null } },
      _count: true,
      _sum: { actualCostMicroUsd: true },
    }),
    prisma.agentCallLog.count({ where: { ...where, recordingPath: { not: null } } }),
    prisma.agentCallLog.groupBy({
      by: ['workspaceId'],
      where,
      _count: true,
      _sum: { durationSec: true, billedCents: true },
      orderBy: { _sum: { durationSec: 'desc' } },
      take: 10,
    }),
  ]);

  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: topWorkspaces.map((t) => t.workspaceId) } },
    select: { id: true, name: true, slug: true, planName: true },
  });
  const wsById = new Map(workspaces.map((w) => [w.id, w]));

  const totalCalls = totals._count ?? 0;
  const failed = byStatus.find((s) => s.status === 'FAILED')?._count ?? 0;

  return {
    windowDays: parseInt(days, 10) || 30,
    totalCalls,
    totalMinutes: Number(((totals._sum.durationSec ?? 0) / 60).toFixed(1)),
    avgDurationSec: Math.round(totals._avg.durationSec ?? 0),
    revenueCents: totals._sum.billedCents ?? 0,
    billedMinutes: Number((totals._sum.billedMinutes ?? 0).toFixed(1)),
    recordedCalls: recorded,
    failureRatePct: totalCalls ? Number(((failed / totalCalls) * 100).toFixed(1)) : 0,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    byType: Object.fromEntries(byType.map((t) => [t.type, t._count])),
    cogs: {
      // How many calls actually recorded a provider cost. When this is 0 the
      // margin below is not computable and the UI must say so.
      measuredCalls: costed._count ?? 0,
      totalMicroUsd: costed._sum.actualCostMicroUsd ?? 0,
      coveragePct: totalCalls ? Number((((costed._count ?? 0) / totalCalls) * 100).toFixed(1)) : 0,
    },
    topWorkspaces: topWorkspaces.map((t) => ({
      workspace: wsById.get(t.workspaceId) ?? null,
      workspaceId: t.workspaceId,
      calls: t._count,
      minutes: Number(((t._sum.durationSec ?? 0) / 60).toFixed(1)),
      revenueCents: t._sum.billedCents ?? 0,
    })),
  };
}

/** Distinct workspaces/agents that have calls, for the filter dropdowns. */
export async function getCallFilterOptions() {
  const [wsIds, agentIds] = await Promise.all([
    prisma.agentCallLog.findMany({ distinct: ['workspaceId'], select: { workspaceId: true }, take: 200 }),
    prisma.agentCallLog.findMany({ distinct: ['agentId'], select: { agentId: true }, take: 300 }),
  ]);

  const [workspaces, agents] = await Promise.all([
    prisma.workspace.findMany({
      where: { id: { in: wsIds.map((w) => w.workspaceId) } },
      select: { id: true, name: true }, orderBy: { name: 'asc' },
    }),
    prisma.agent.findMany({
      where: { id: { in: agentIds.map((a) => a.agentId) } },
      select: { id: true, name: true, workspaceId: true }, orderBy: { name: 'asc' },
    }),
  ]);

  return { workspaces, agents };
}

/** Raw row, used by the recording streamer to resolve the stored path. */
export const getRecordingRow = (id) =>
  prisma.agentCallLog.findUnique({ where: { id }, select: { id: true, recordingPath: true, recordingMime: true } });
