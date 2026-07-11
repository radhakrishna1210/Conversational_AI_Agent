import prisma from '../config/prisma.js';

export const createSupportTicket = async (data) => {
  const { title, description, category, priority, status, source, createdBy } = data;
  return prisma.supportTicket.create({
    data: {
      title,
      description,
      category,
      priority,
      status: status || 'OPEN',
      source: source || 'chatbot',
      createdBy,
    },
  });
};

export const listSupportTickets = async () => {
  return prisma.supportTicket.findMany({
    orderBy: { createdAt: 'desc' },
  });
};
