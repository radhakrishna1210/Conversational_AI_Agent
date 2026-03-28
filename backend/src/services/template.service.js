import prisma from '../config/prisma.js';

export const listTemplates = (workspaceId, filters = {}) => {
  const where = { workspaceId };
  if (filters.category) where.category = filters.category;
  if (filters.status) where.status = filters.status;
  if (filters.search) where.OR = [
    { name: { contains: filters.search, mode: 'insensitive' } },
    { bodyText: { contains: filters.search, mode: 'insensitive' } },
  ];
  return prisma.template.findMany({ where, orderBy: { createdAt: 'desc' } });
};

export const getTemplate = (workspaceId, templateId) =>
  prisma.template.findFirstOrThrow({ where: { id: templateId, workspaceId } });

export const createTemplate = (workspaceId, data) =>
  prisma.template.create({ data: { ...data, workspaceId, status: 'PENDING' } });

export const updateTemplate = (workspaceId, templateId, data) =>
  prisma.template.update({ where: { id: templateId, workspaceId }, data });

export const deleteTemplate = (workspaceId, templateId) =>
  prisma.template.delete({ where: { id: templateId, workspaceId } });

export const duplicateTemplate = async (workspaceId, templateId) => {
  const original = await getTemplate(workspaceId, templateId);
  const { id, createdAt, updatedAt, metaTemplateId, status, rejectionReason, ...rest } = original;
  return prisma.template.create({
    data: { ...rest, name: `${rest.name}_copy`, workspaceId, status: 'PENDING' },
  });
};
