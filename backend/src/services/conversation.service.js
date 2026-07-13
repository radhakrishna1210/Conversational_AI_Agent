import prisma from '../config/prisma.js';
import { getPaginationArgs } from '../lib/pagination.js';

export const listConversations = async (workspaceId, query = {}) => {
  const { take, skip } = getPaginationArgs(query);
  const where = { workspaceId };
  if (query.status) where.status = query.status;
  if (query.agentId) where.assignedAgentId = query.agentId;
  if (query.label) where.label = query.label;
  if (query.search) {
    where.contact = { OR: [
      { name: { contains: query.search, mode: 'insensitive' } },
      { phoneNumber: { contains: query.search } },
    ]};
  }

  const [data, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where,
      take,
      skip,
      include: {
        contact: { select: { id: true, name: true, phoneNumber: true } },
        assignedAgent: { select: { id: true, name: true } },
        messages: { take: 1, orderBy: { sentAt: 'desc' }, select: { body: true, sentAt: true, direction: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    }),
    prisma.conversation.count({ where }),
  ]);
  return { data, total };
};

export const getConversation = (workspaceId, convId) =>
  prisma.conversation.findFirstOrThrow({
    where: { id: convId, workspaceId },
    include: {
      contact: true,
      assignedAgent: { select: { id: true, name: true } },
      whatsappNumber: { select: { phoneNumber: true, displayName: true } },
    },
  });

export const upsertConversationFromWebhook = (workspaceId, contactId, whatsappNumberId) =>
  prisma.conversation.upsert({
    where: {
      // Use a unique constraint composite — contact+number per workspace
      // Fallback: search first
      id: 'nonexistent', // force upsert path
    },
    create: { workspaceId, contactId, whatsappNumberId, lastMessageAt: new Date() },
    update: { lastMessageAt: new Date(), updatedAt: new Date() },
  }).catch(() =>
    prisma.conversation.findFirst({ where: { workspaceId, contactId, whatsappNumberId } })
  );

export const assignAgent = (workspaceId, convId, agentId) =>
  prisma.conversation.update({
    where: { id: convId, workspaceId },
    data: { assignedAgentId: agentId },
  });

export const updateConversation = (workspaceId, convId, data) =>
  prisma.conversation.update({ where: { id: convId, workspaceId }, data });

export const markRead = (workspaceId, convId) =>
  prisma.conversation.update({
    where: { id: convId, workspaceId },
    data: { unreadCount: 0 },
  });
