import prisma from '../config/prisma.js';
import { sendMessage as metaSend } from './whatsapp.service.js';
import { MESSAGE_LIST_DEFAULT_LIMIT, MESSAGE_LIST_MAX_LIMIT } from '../constants/limits.js';

export const listMessages = (workspaceId, convId, query = {}) => {
  const limit = Math.min(
    parseInt(query.limit ?? String(MESSAGE_LIST_DEFAULT_LIMIT), 10),
    MESSAGE_LIST_MAX_LIMIT
  );
  const cursor = query.cursor;
  return prisma.message.findMany({
    where: { conversationId: convId, workspaceId },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { sentAt: 'asc' },
    include: { senderUser: { select: { id: true, name: true } } },
  });
};

export const createMessage = async (workspaceId, convId, { type, body, mediaUrl, mediaCaption, templateId, templateVars, senderUserId }) => {
  const conv = await prisma.conversation.findFirstOrThrow({ where: { id: convId, workspaceId } });

  const message = await prisma.message.create({
    data: {
      conversationId: convId,
      workspaceId,
      direction: 'OUTBOUND',
      type: type ?? 'TEXT',
      body,
      mediaUrl,
      mediaCaption,
      templateId,
      templateVars,
      senderUserId,
      status: 'sent',
    },
  });

  await prisma.conversation.update({
    where: { id: convId },
    data: { lastMessageAt: new Date() },
  });

  try {
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: conv.contactId } });
    await metaSend(workspace, contact.phoneNumber, buildMetaPayload(type, body, templateId, templateVars));
  } catch (err) {
    await prisma.message.update({ where: { id: message.id }, data: { status: 'failed' } });
    throw err;
  }

  return message;
};

const buildMetaPayload = (type, body, templateId, templateVars) => {
  if (type === 'TEMPLATE') {
    return {
      type: 'template',
      template: {
        name: templateId,
        language: { code: 'en' },
        components: templateVars ? [{
          type: 'body',
          parameters: Object.values(templateVars).map((v) => ({ type: 'text', text: v })),
        }] : [],
      },
    };
  }
  return { type: 'text', text: { body: body ?? '' } };
};
