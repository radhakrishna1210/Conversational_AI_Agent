import prisma from '../config/prisma.js';
import { CAMPAIGN_PERF_LIST_LIMIT } from '../constants/limits.js';

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
    const end = new Date(date.setHours(23, 59, 59, 999));

    const [sent, delivered] = await prisma.$transaction([
      prisma.message.count({ where: { workspaceId, direction: 'OUTBOUND', sentAt: { gte: start, lte: end } } }),
      prisma.message.count({ where: { workspaceId, status: 'delivered', sentAt: { gte: start, lte: end } } }),
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
  const agents = await prisma.workspaceMember.findMany({
    where: { workspaceId, role: { in: ['Admin', 'Agent'] } },
    include: { user: { select: { id: true, name: true } } },
  });

  const results = await Promise.all(agents.map(async (m) => {
    const chatsHandled = await prisma.conversation.count({
      where: { workspaceId, assignedAgentId: m.userId },
    });
    return { agentId: m.userId, name: m.user.name, chatsHandled };
  }));

  return results.sort((a, b) => b.chatsHandled - a.chatsHandled);
};
