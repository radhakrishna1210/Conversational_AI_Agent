import prisma from '../config/prisma.js';

export const getSettings = async (workspaceId) => {
  let settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId } });
  if (!settings) {
    settings = await prisma.workspaceSettings.create({ data: { workspaceId } });
  }
  return settings;
};

export const updateSettings = (workspaceId, data) =>
  prisma.workspaceSettings.upsert({
    where: { workspaceId },
    create: { workspaceId, ...data },
    update: data,
  });

export const listInvoices = (workspaceId) =>
  prisma.invoice.findMany({
    where: { workspaceId },
    orderBy: { invoiceDate: 'desc' },
  });
