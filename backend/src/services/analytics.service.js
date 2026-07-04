import prisma from '../config/prisma.js';
import { CAMPAIGN_PERF_LIST_LIMIT } from '../constants/limits.js';

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

// ─── WhatsApp / Chatbot analytics ────────────────────────────────────────────

export const getOverviewMetrics = async (workspaceId) => {
  const [totalMessages, totalCampaigns, totalContacts, optOuts] = await prisma.$transaction([
    prisma.message.count({ where: { workspaceId } }),
    prisma.campaign.count({ where: { workspaceId } }),
    prisma.contact.count({ where: { workspaceId } }),
    prisma.contact.count({ where: { workspaceId, optedOut: true } }),
  ]);

  const delivered = await prisma.message.count({ where: { workspaceId, status: 'delivered' } });
  const sent = await prisma.message.count({ where: { workspaceId, direction: 'OUTBOUND' } });

  return {
    totalMessages,
    totalCampaigns,
    totalContacts,
    optOuts,
    deliveryRate: sent > 0 ? ((delivered / sent) * 100).toFixed(1) : '0',
    optOutRate: totalContacts > 0 ? ((optOuts / totalContacts) * 100).toFixed(1) : '0',
  };
};

export const getDeliveryRateLast7Days = async (workspaceId) => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const start = new Date(date.setHours(0, 0, 0, 0));
    const end   = new Date(date.setHours(23, 59, 59, 999));

    const [sent, delivered] = await prisma.$transaction([
      prisma.message.count({ where: { workspaceId, direction: 'OUTBOUND', sentAt: { gte: start, lte: end } } }),
      prisma.message.count({ where: { workspaceId, status: 'delivered',  sentAt: { gte: start, lte: end } } }),
    ]);

    days.push({
      date: start.toISOString().slice(0, 10),
      sent,
      delivered,
      rate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
    });
  }
  return days;
};

export const getCampaignPerformance = (workspaceId) =>
  prisma.campaign.findMany({
    where: { workspaceId, status: { in: ['COMPLETED', 'RUNNING'] } },
    select: { id: true, name: true, sent: true, delivered: true, read: true, failed: true, totalContacts: true, completedAt: true },
    orderBy: { createdAt: 'desc' },
    take: CAMPAIGN_PERF_LIST_LIMIT,
  });

export const getAgentPerformance = async (workspaceId) => {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, role: { in: ['Admin'] } },
    include: { user: { select: { id: true, name: true } } },
  });

  const results = await Promise.all(members.map(async (m) => {
    const chatsHandled = await prisma.conversation.count({
      where: { workspaceId, assignedAgentId: m.userId },
    });
    return { agentId: m.userId, name: m.user.name, chatsHandled };
  }));

  return results.sort((a, b) => b.chatsHandled - a.chatsHandled);
};

export const getChatbotOverview = async (workspaceId, range = '7d') => {
  const { start, end } = getDateRange(range);

  const [
    totalConversations, openConversations, resolvedConversations,
    totalMessages, inboundMessages, outboundMessages,
    totalContacts, newContacts, optOuts,
    totalCampaigns, activeCampaigns,
  ] = await prisma.$transaction([
    prisma.conversation.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } }),
    prisma.conversation.count({ where: { workspaceId, status: 'OPEN' } }),
    prisma.conversation.count({ where: { workspaceId, status: 'RESOLVED', updatedAt: { gte: start, lte: end } } }),
    prisma.message.count({ where: { workspaceId, sentAt: { gte: start, lte: end } } }),
    prisma.message.count({ where: { workspaceId, direction: 'INBOUND',  sentAt: { gte: start, lte: end } } }),
    prisma.message.count({ where: { workspaceId, direction: 'OUTBOUND', sentAt: { gte: start, lte: end } } }),
    prisma.contact.count({ where: { workspaceId } }),
    prisma.contact.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } }),
    prisma.contact.count({ where: { workspaceId, optedOut: true } }),
    prisma.campaign.count({ where: { workspaceId } }),
    prisma.campaign.count({ where: { workspaceId, status: 'RUNNING' } }),
  ]);

  const deliveredMessages = await prisma.message.count({
    where: { workspaceId, direction: 'OUTBOUND', status: 'delivered', sentAt: { gte: start, lte: end } },
  });
  const readMessages = await prisma.message.count({
    where: { workspaceId, direction: 'OUTBOUND', status: 'read', sentAt: { gte: start, lte: end } },
  });

  // Daily delivery chart
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    const ds = new Date(cur); ds.setHours(0, 0, 0, 0);
    const de = new Date(cur); de.setHours(23, 59, 59, 999);
    const [s, d] = await prisma.$transaction([
      prisma.message.count({ where: { workspaceId, direction: 'OUTBOUND', sentAt: { gte: ds, lte: de } } }),
      prisma.message.count({ where: { workspaceId, status: 'delivered',  sentAt: { gte: ds, lte: de } } }),
    ]);
    days.push({ date: cur.toISOString().slice(0, 10), sent: s, delivered: d, rate: s > 0 ? Math.round((d / s) * 100) : 0 });
    cur.setDate(cur.getDate() + 1);
  }

  return {
    conversations: { total: totalConversations, open: openConversations, resolved: resolvedConversations },
    messages: { total: totalMessages, inbound: inboundMessages, outbound: outboundMessages, delivered: deliveredMessages, read: readMessages },
    contacts: { total: totalContacts, new: newContacts, optOuts },
    campaigns: { total: totalCampaigns, active: activeCampaigns },
    rates: {
      deliveryRate: outboundMessages > 0 ? Number(((deliveredMessages / outboundMessages) * 100).toFixed(1)) : 0,
      readRate:     outboundMessages > 0 ? Number(((readMessages     / outboundMessages) * 100).toFixed(1)) : 0,
      optOutRate:   totalContacts    > 0 ? Number(((optOuts          / totalContacts)    * 100).toFixed(1)) : 0,
      responseRate: outboundMessages > 0 ? Number(((inboundMessages  / outboundMessages) * 100).toFixed(1)) : 0,
    },
    deliveryChart: days,
  };
};

// ─── Voice / Call analytics ───────────────────────────────────────────────────

const calculateTrend = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

export const getCallOverview = async (workspaceId, range = '7d', assistantId = null, from = null, to = null) => {
  const { start, end } = from && to ? parseCustomRange(from, to) : getDateRange(range);

  const where = {
    workspaceId,
    startedAt: { gte: start, lte: end },
    ...(assistantId && assistantId !== 'all' ? { assistantId } : {}),
  };

  const [calls, agentsCount] = await prisma.$transaction([
    prisma.call.findMany({ where, select: { duration: true, status: true, direction: true, cost: true } }),
    prisma.agent.count({ where: { workspaceId } }),
  ]);

  const totalCalls      = calls.length;
  const totalDuration   = calls.reduce((s, c) => s + (c.duration || 0), 0);
  const avgDuration     = totalCalls > 0 ? totalDuration / totalCalls : 0;
  const completedCalls  = calls.filter(c => c.status === 'completed').length;
  const failedCalls     = calls.filter(c => c.status === 'failed').length;
  const inboundCalls    = calls.filter(c => c.direction === 'INBOUND').length;
  const outboundCalls   = calls.filter(c => c.direction === 'OUTBOUND').length;

  // Trend vs previous period
  const periodMs  = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - periodMs);
  const prevEnd   = new Date(end.getTime()   - periodMs);
  const prevWhere = { workspaceId, startedAt: { gte: prevStart, lte: prevEnd } };
  const prevCalls = await prisma.call.findMany({ where: prevWhere, select: { duration: true } });
  const prevTotal    = prevCalls.length;
  const prevDuration = prevCalls.reduce((s, c) => s + (c.duration || 0), 0);

  return {
    totalCalls,
    totalCallsTrend:    calculateTrend(totalCalls,    prevTotal),
    totalDuration:      Math.round(totalDuration / 60),
    totalDurationTrend: calculateTrend(totalDuration, prevDuration),
    avgDuration:        Number((avgDuration / 60).toFixed(1)),
    totalAgents:        agentsCount,
    totalAssistants:    agentsCount,
    completedCalls,
    failedCalls,
    inboundCalls,
    outboundCalls,
    successRate: totalCalls > 0 ? Number(((completedCalls / totalCalls) * 100).toFixed(1)) : 0,
    period: { start, end },
  };
};

export const getCallTimeSeries = async (workspaceId, metric = 'volume', range = '7d', assistantId = null, from = null, to = null) => {
  const { start, end } = from && to ? parseCustomRange(from, to) : getDateRange(range);

  const where = {
    workspaceId,
    startedAt: { gte: start, lte: end },
    ...(assistantId && assistantId !== 'all' ? { assistantId } : {}),
  };

  const calls = await prisma.call.findMany({
    where,
    select: { startedAt: true, duration: true, status: true, direction: true, cost: true },
    orderBy: { startedAt: 'asc' },
  });

  // Build date map
  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  const dataMap = new Map();
  dates.forEach(d => dataMap.set(d, { date: d, value: 0, inbound: 0, outbound: 0, completed: 0, failed: 0 }));

  calls.forEach(call => {
    const key   = new Date(call.startedAt).toISOString().slice(0, 10);
    const entry = dataMap.get(key);
    if (!entry) return;
    if (metric === 'volume')   entry.value += 1;
    if (metric === 'duration') entry.value += call.duration || 0;
    if (metric === 'cost')     entry.value += call.cost     || 0;
    if (call.direction === 'INBOUND')  entry.inbound   += 1;
    if (call.direction === 'OUTBOUND') entry.outbound  += 1;
    if (call.status   === 'completed') entry.completed += 1;
    if (call.status   === 'failed')    entry.failed    += 1;
  });

  const data = Array.from(dataMap.values()).map(d => ({
    ...d,
    value: metric === 'duration' ? Number((d.value / 60).toFixed(1)) : Number(d.value.toFixed(2)),
  }));

  const total   = data.reduce((s, d) => s + d.value, 0);
  const average = data.length > 0 ? Number((total / data.length).toFixed(1)) : 0;
  const peak    = data.length > 0 ? Math.max(...data.map(d => d.value)) : 0;

  return { metric, data, summary: { total: Number(total.toFixed(2)), average, peak } };
};

export const getCallOutcomes = async (workspaceId, range = '7d', assistantId = null) => {
  const { start, end } = getDateRange(range);

  const where = {
    workspaceId,
    startedAt: { gte: start, lte: end },
    outcome: { not: null },
    ...(assistantId && assistantId !== 'all' ? { assistantId } : {}),
  };

  const grouped = await prisma.call.groupBy({
    by: ['outcome'],
    where,
    _count: { outcome: true },
  });

  const total = grouped.reduce((s, o) => s + o._count.outcome, 0);
  return grouped.map(o => ({
    outcome:    o.outcome,
    count:      o._count.outcome,
    percentage: total > 0 ? Number(((o._count.outcome / total) * 100).toFixed(1)) : 0,
  }));
};

export const getSentimentDistribution = async (workspaceId, range = '7d', assistantId = null) => {
  const { start, end } = getDateRange(range);

  const where = {
    workspaceId,
    startedAt: { gte: start, lte: end },
    sentiment: { not: null },
    ...(assistantId && assistantId !== 'all' ? { assistantId } : {}),
  };

  const grouped = await prisma.call.groupBy({
    by: ['sentiment'],
    where,
    _count: { sentiment: true },
    _avg:   { duration: true },
  });

  return grouped.map(s => ({
    sentiment:   s.sentiment,
    count:       s._count.sentiment,
    avgDuration: Number(((s._avg.duration || 0) / 60).toFixed(1)),
  }));
};

export const getHourlyHeatmap = async (workspaceId, range = '7d', assistantId = null) => {
  const { start, end } = getDateRange(range);

  const where = {
    workspaceId,
    startedAt: { gte: start, lte: end },
    ...(assistantId && assistantId !== 'all' ? { assistantId } : {}),
  };

  const calls = await prisma.call.findMany({ where, select: { startedAt: true } });

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const heatmap = DAYS.map(day => ({
    day,
    hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, intensity: 0 })),
  }));

  calls.forEach(call => {
    const d = new Date(call.startedAt);
    heatmap[d.getDay()].hours[d.getHours()].count += 1;
  });

  const maxCount = Math.max(...heatmap.flatMap(d => d.hours.map(h => h.count)), 1);
  heatmap.forEach(day =>
    day.hours.forEach(h => { h.intensity = Math.round((h.count / maxCount) * 100); })
  );

  return heatmap;
};

export const getCallLogs = async (workspaceId, options = {}) => {
  const {
    page       = 1,
    limit      = 20,
    range      = '7d',
    assistantId = null,
    status     = null,
    direction  = null,
    search     = null,
    sortBy     = 'startedAt',
    sortOrder  = 'desc',
    from       = null,
    to         = null,
  } = options;

  const { start, end } = from && to ? parseCustomRange(from, to) : getDateRange(range);

  const where = {
    workspaceId,
    startedAt: { gte: start, lte: end },
    ...(assistantId && assistantId !== 'all' ? { assistantId } : {}),
    ...(status    ? { status }    : {}),
    ...(direction ? { direction } : {}),
    ...(search ? {
      OR: [
        { fromNumber: { contains: search, mode: 'insensitive' } },
        { toNumber:   { contains: search, mode: 'insensitive' } },
        { transcript: { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
  };

  const [calls, total] = await prisma.$transaction([
    prisma.call.findMany({
      where,
      include: { agent: { select: { id: true, name: true } } },
      orderBy: { [sortBy]: sortOrder },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.call.count({ where }),
  ]);

  return {
    data: calls.map(call => ({
      id:               call.id,
      assistant:        call.agent?.name || 'Unknown',
      assistantId:      call.assistantId,
      from:             call.fromNumber,
      to:               call.toNumber,
      direction:        call.direction,
      status:           call.status,
      duration:         call.duration,
      durationFormatted: formatDuration(call.duration),
      cost:             call.cost,
      sentiment:        call.sentiment,
      outcome:          call.outcome,
      startedAt:        call.startedAt,
      endedAt:          call.endedAt,
      recordingUrl:     call.recordingUrl,
      transcript:       call.transcript?.substring(0, 200) ?? null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext:  page * limit < total,
      hasPrev:  page > 1,
    },
  };
};

export const getAssistantPerformance = async (workspaceId, range = '7d') => {
  const { start, end } = getDateRange(range);

  const agents = await prisma.agent.findMany({
    where: { workspaceId },
    include: {
      calls: {
        where: { startedAt: { gte: start, lte: end } },
        select: { duration: true, status: true, sentiment: true, outcome: true, cost: true },
      },
    },
  });

  return agents.map(agent => {
    const calls        = agent.calls;
    const totalCalls   = calls.length;
    const completed    = calls.filter(c => c.status === 'completed').length;
    const failed       = calls.filter(c => c.status === 'failed').length;
    const totalDur     = calls.reduce((s, c) => s + (c.duration || 0), 0);
    const totalCost    = calls.reduce((s, c) => s + (c.cost     || 0), 0);

    return {
      id:            agent.id,
      name:          agent.name,
      totalCalls,
      completedCalls: completed,
      failedCalls:    failed,
      avgDuration:    totalCalls > 0 ? Number(((totalDur / totalCalls) / 60).toFixed(1)) : 0,
      totalDuration:  Math.round(totalDur / 60),
      totalCost:      Number(totalCost.toFixed(2)),
      successRate:    totalCalls > 0 ? Number(((completed / totalCalls) * 100).toFixed(1)) : 0,
    };
  }).sort((a, b) => b.totalCalls - a.totalCalls);
};

export const getAssistantsList = async (workspaceId) => {
  return prisma.agent.findMany({
    where:   { workspaceId },
    select:  { id: true, name: true },
    orderBy: { name: 'asc' },
  });
};
