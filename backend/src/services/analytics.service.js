import prisma from '../config/prisma.js';

// Call analytics, read from AgentCallLog.
//
// This file used to query `prisma.call` — a `Call` model that has never existed
// in this schema. Every function here therefore threw "Cannot read properties of
// undefined (reading 'findMany')" before it touched the database, which is why
// Call Logs and Analytics both showed a permanent empty state: the page caught
// the error, rendered "No calls yet", and the real reason was one line above it.
//
// AgentCallLog is the only record of a call this product keeps, so it is the
// source now. Three fields the old code selected simply do not exist in it, and
// they are handled honestly rather than faked:
//
//   direction  → derived from `type`. There is no inbound calling yet; every
//                phone call is one we placed.
//   sentiment  → never scored. Returned as null, and the UI already renders
//                "Not scored" for that.
//   outcome    → not stored separately; derived from status where a label helps.
//
// `fromNumber` is also absent (see DIALING_HYGIENE_PLAN.md §12.1 — the same gap
// blocks per-caller-ID health scoring). Until it is added, the caller side of a
// call is unknown and is reported as such instead of guessed.

// ─── Date helpers ────────────────────────────────────────────────────────────

const getDateRange = (range) => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);

  switch (range) {
    case '7d':   start.setDate(now.getDate() - 7);  break;
    case '30d':  start.setDate(now.getDate() - 30); break;
    case '90d':  start.setDate(now.getDate() - 90); break;
    case 'today':
      start.setHours(0, 0, 0, 0);
      return { start, end: new Date(now.setHours(23, 59, 59, 999)) };
    default:
      start.setDate(now.getDate() - 7);
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

const parseCustomRange = (from, to) => ({
  start: new Date(from),
  end: new Date(new Date(to).setHours(23, 59, 59, 999)),
});

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ─── AgentCallLog vocabulary ─────────────────────────────────────────────────

// CHAT rows are text sessions from the agent tester. They are interactions, not
// calls, and counting them here would inflate every number on the page.
const CALL_TYPES = ['PHONE_CALL', 'WEB_CALL'];

// The chips on the Calls page speak lowercase; the column stores uppercase.
// 'no-answer' has no stored equivalent — a call that was initiated and never
// reached COMPLETED is the closest true statement.
const STATUS_FILTER = {
  completed: ['COMPLETED'],
  failed: ['FAILED'],
  'no-answer': ['INITIATED', 'IN_PROGRESS'],
};

const SORTABLE = new Set(['startedAt', 'durationSec', 'status', 'endedAt']);

const baseWhere = (workspaceId, start, end, agentId) => ({
  workspaceId,
  type: { in: CALL_TYPES },
  startedAt: { gte: start, lte: end },
  ...(agentId && agentId !== 'all' ? { agentId } : {}),
});

/** PHONE_CALL is always one we placed; WEB_CALL is the browser widget. */
const directionOf = (type) => (type === 'WEB_CALL' ? 'WEB' : 'OUTBOUND');

/** Billing is in paise on a rupee rate card. Report rupees. */
const rupees = (billedCents) => Number(((billedCents || 0) / 100).toFixed(2));

/**
 * The transcript column is a JSON array of turns. Flattened to text because
 * that is what the Calls page renders (pre-wrap), and because a raw JSON blob
 * in a transcript pane is unreadable.
 */
const transcriptText = (raw) => {
  if (!raw) return null;
  try {
    const turns = JSON.parse(raw);
    if (!Array.isArray(turns) || !turns.length) return null;
    return turns
      .map((t) => {
        const who = t.role === 'assistant' ? 'Agent' : t.role === 'user' ? 'Caller' : (t.role ?? '');
        return `${who}: ${t.content ?? ''}`.trim();
      })
      .join('\n');
  } catch {
    const s = String(raw).trim();
    return s && s !== '[]' ? s : null;
  }
};

/**
 * Agent names, fetched separately.
 *
 * AgentCallLog declares no relation to Agent, so `include: { agent: … }` is not
 * available — one lookup keyed by the ids actually present is the same shape
 * adminCallLogs.service.js uses.
 */
const agentNames = async (agentIds) => {
  const ids = Array.from(new Set(agentIds.filter(Boolean)));
  if (!ids.length) return new Map();
  const agents = await prisma.agent.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(agents.map((a) => [a.id, a.name]));
};

const calculateTrend = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

// ─── Voice / Call analytics ──────────────────────────────────────────────────

export const getCallOverview = async (workspaceId, range = '7d', assistantId = null, from = null, to = null) => {
  const { start, end } = from && to ? parseCustomRange(from, to) : getDateRange(range);
  const where = baseWhere(workspaceId, start, end, assistantId);

  const [calls, agentsCount] = await prisma.$transaction([
    prisma.agentCallLog.findMany({
      where,
      select: { durationSec: true, status: true, type: true, billedCents: true },
    }),
    prisma.agent.count({ where: { workspaceId } }),
  ]);

  const totalCalls     = calls.length;
  const totalDuration  = calls.reduce((s, c) => s + (c.durationSec || 0), 0);
  const avgDuration    = totalCalls > 0 ? totalDuration / totalCalls : 0;
  const completedCalls = calls.filter((c) => c.status === 'COMPLETED').length;
  const failedCalls    = calls.filter((c) => c.status === 'FAILED').length;
  const phoneCalls     = calls.filter((c) => c.type === 'PHONE_CALL').length;
  const webCalls       = calls.filter((c) => c.type === 'WEB_CALL').length;

  // Trend vs the previous period of equal length.
  const periodMs  = end.getTime() - start.getTime();
  const prevCalls = await prisma.agentCallLog.findMany({
    where: baseWhere(workspaceId, new Date(start.getTime() - periodMs), new Date(end.getTime() - periodMs), assistantId),
    select: { durationSec: true },
  });
  const prevDuration = prevCalls.reduce((s, c) => s + (c.durationSec || 0), 0);

  return {
    totalCalls,
    totalCallsTrend:    calculateTrend(totalCalls, prevCalls.length),
    totalDuration:      Math.round(totalDuration / 60),
    totalDurationTrend: calculateTrend(totalDuration, prevDuration),
    avgDuration:        Number((avgDuration / 60).toFixed(1)),
    totalAgents:        agentsCount,
    totalAssistants:    agentsCount,
    completedCalls,
    failedCalls,
    // Zero is the truth, not a gap in the data: nothing in this product answers
    // an incoming call yet. Phone calls are all outbound; web calls are neither.
    inboundCalls:  0,
    outboundCalls: phoneCalls,
    webCalls,
    totalCost: rupees(calls.reduce((s, c) => s + (c.billedCents || 0), 0)),
    successRate: totalCalls > 0 ? Number(((completedCalls / totalCalls) * 100).toFixed(1)) : 0,
    period: { start, end },
  };
};

export const getCallTimeSeries = async (workspaceId, metric = 'volume', range = '7d', assistantId = null, from = null, to = null) => {
  const { start, end } = from && to ? parseCustomRange(from, to) : getDateRange(range);

  const calls = await prisma.agentCallLog.findMany({
    where: baseWhere(workspaceId, start, end, assistantId),
    select: { startedAt: true, durationSec: true, status: true, type: true, billedCents: true },
    orderBy: { startedAt: 'asc' },
  });

  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  const dataMap = new Map();
  dates.forEach((d) => dataMap.set(d, { date: d, value: 0, inbound: 0, outbound: 0, completed: 0, failed: 0 }));

  calls.forEach((call) => {
    const entry = dataMap.get(new Date(call.startedAt).toISOString().slice(0, 10));
    if (!entry) return;
    if (metric === 'volume')   entry.value += 1;
    if (metric === 'duration') entry.value += call.durationSec || 0;
    if (metric === 'cost')     entry.value += rupees(call.billedCents);
    if (call.type   === 'PHONE_CALL') entry.outbound  += 1;
    if (call.status === 'COMPLETED')  entry.completed += 1;
    if (call.status === 'FAILED')     entry.failed    += 1;
  });

  const data = Array.from(dataMap.values()).map((d) => ({
    ...d,
    value: metric === 'duration' ? Number((d.value / 60).toFixed(1)) : Number(d.value.toFixed(2)),
  }));

  const total   = data.reduce((s, d) => s + d.value, 0);
  const average = data.length > 0 ? Number((total / data.length).toFixed(1)) : 0;
  const peak    = data.length > 0 ? Math.max(...data.map((d) => d.value)) : 0;

  return { metric, data, summary: { total: Number(total.toFixed(2)), average, peak } };
};

/**
 * Outcome breakdown.
 *
 * There is no `outcome` column, so status is the outcome: it is the only thing
 * recorded about how a call ended. Labelled for reading rather than passed
 * through raw.
 */
const OUTCOME_LABEL = {
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  INITIATED: 'Never connected',
  IN_PROGRESS: 'In progress',
};

export const getCallOutcomes = async (workspaceId, range = '7d', assistantId = null) => {
  const { start, end } = getDateRange(range);

  const grouped = await prisma.agentCallLog.groupBy({
    by: ['status'],
    where: baseWhere(workspaceId, start, end, assistantId),
    _count: { _all: true },
  });

  const total = grouped.reduce((s, o) => s + o._count._all, 0);
  return grouped.map((o) => ({
    outcome:    OUTCOME_LABEL[o.status] ?? o.status,
    count:      o._count._all,
    percentage: total > 0 ? Number(((o._count._all / total) * 100).toFixed(1)) : 0,
  }));
};

/**
 * Sentiment is not scored anywhere in the pipeline — no column, and post-call
 * extraction does not produce it. An empty array is the honest answer; the UI
 * already has a "Not scored" state for it. Inventing a distribution here would
 * be worse than showing nothing.
 */
export const getSentimentDistribution = async () => [];

export const getHourlyHeatmap = async (workspaceId, range = '7d', assistantId = null) => {
  const { start, end } = getDateRange(range);

  const calls = await prisma.agentCallLog.findMany({
    where: baseWhere(workspaceId, start, end, assistantId),
    select: { startedAt: true },
  });

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const heatmap = DAYS.map((day) => ({
    day,
    hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, intensity: 0 })),
  }));

  calls.forEach((call) => {
    const d = new Date(call.startedAt);
    heatmap[d.getDay()].hours[d.getHours()].count += 1;
  });

  const maxCount = Math.max(...heatmap.flatMap((d) => d.hours.map((h) => h.count)), 1);
  heatmap.forEach((day) =>
    day.hours.forEach((h) => { h.intensity = Math.round((h.count / maxCount) * 100); }));

  return heatmap;
};

export const getCallLogs = async (workspaceId, options = {}) => {
  const {
    page        = 1,
    limit       = 20,
    range       = '7d',
    assistantId = null,
    status      = null,
    search      = null,
    sortBy      = 'startedAt',
    sortOrder   = 'desc',
    from        = null,
    to          = null,
  } = options;

  const { start, end } = from && to ? parseCustomRange(from, to) : getDateRange(range);

  const where = {
    ...baseWhere(workspaceId, start, end, assistantId),
    ...(status && STATUS_FILTER[status] ? { status: { in: STATUS_FILTER[status] } } : {}),
    ...(search ? {
      OR: [
        { phoneNumber: { contains: search, mode: 'insensitive' } },
        { transcript:  { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
  };

  // An unknown sort column would be a 500 from the query builder, and sortBy
  // arrives straight off the query string.
  const orderBy = { [SORTABLE.has(sortBy) ? sortBy : 'startedAt']: sortOrder === 'asc' ? 'asc' : 'desc' };

  const [calls, total] = await prisma.$transaction([
    prisma.agentCallLog.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.agentCallLog.count({ where }),
  ]);

  const names = await agentNames(calls.map((c) => c.agentId));

  return {
    data: calls.map((call) => ({
      id:                call.id,
      assistant:         names.get(call.agentId) || 'Unknown agent',
      assistantId:       call.agentId,
      // No caller ID is recorded against a call yet, so there is nothing
      // truthful to put here.
      from:              null,
      to:                call.phoneNumber,
      direction:         directionOf(call.type),
      type:              call.type,
      status:            call.status.toLowerCase(),
      duration:          call.durationSec,
      durationFormatted: formatDuration(call.durationSec),
      cost:              rupees(call.billedCents),
      sentiment:         null,
      outcome:           null,
      startedAt:         call.startedAt,
      endedAt:           call.endedAt,
      // Streamed through the authenticated agent route; the client fetches it
      // with its token and plays the blob.
      recordingUrl: call.recordingPath
        ? `/api/v1/workspaces/${workspaceId}/agents/${call.agentId}/calls/${call.id}/recording`
        : null,
      // Whole transcript, not a 200-character slice: this is what the detail
      // pane renders, and truncating it there made every call look empty.
      transcript: transcriptText(call.transcript),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
};

export const getAssistantPerformance = async (workspaceId, range = '7d') => {
  const { start, end } = getDateRange(range);

  const [agents, calls] = await Promise.all([
    prisma.agent.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    prisma.agentCallLog.findMany({
      where: baseWhere(workspaceId, start, end, null),
      select: { agentId: true, durationSec: true, status: true, billedCents: true },
    }),
  ]);

  const byAgent = new Map(agents.map((a) => [a.id, []]));
  for (const call of calls) {
    if (byAgent.has(call.agentId)) byAgent.get(call.agentId).push(call);
  }

  return agents.map((agent) => {
    const rows       = byAgent.get(agent.id) ?? [];
    const totalCalls = rows.length;
    const completed  = rows.filter((c) => c.status === 'COMPLETED').length;
    const failed     = rows.filter((c) => c.status === 'FAILED').length;
    const totalDur   = rows.reduce((s, c) => s + (c.durationSec || 0), 0);
    const totalCents = rows.reduce((s, c) => s + (c.billedCents || 0), 0);

    return {
      id:             agent.id,
      name:           agent.name,
      totalCalls,
      completedCalls: completed,
      failedCalls:    failed,
      avgDuration:    totalCalls > 0 ? Number(((totalDur / totalCalls) / 60).toFixed(1)) : 0,
      totalDuration:  Math.round(totalDur / 60),
      totalCost:      rupees(totalCents),
      successRate:    totalCalls > 0 ? Number(((completed / totalCalls) * 100).toFixed(1)) : 0,
    };
  }).sort((a, b) => b.totalCalls - a.totalCalls);
};

export const getAssistantsList = async (workspaceId) =>
  prisma.agent.findMany({
    where:   { workspaceId },
    select:  { id: true, name: true },
    orderBy: { name: 'asc' },
  });
