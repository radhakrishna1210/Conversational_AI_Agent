import prisma from '../config/prisma.js';
import { metaPost } from '../lib/metaApi.js';
import { decryptToken } from '../lib/encryption.js';
import logger from '../lib/logger.js';

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

// ─── Build Meta components array from our flat template fields ────────────────
function buildMetaComponents({ headerText, bodyText, footerText, buttons }) {
  const components = [];

  if (headerText?.trim()) {
    components.push({ type: 'HEADER', format: 'TEXT', text: headerText.trim() });
  }

  components.push({ type: 'BODY', text: bodyText });

  if (footerText?.trim()) {
    components.push({ type: 'FOOTER', text: footerText.trim() });
  }

  if (buttons?.length) {
    components.push({ type: 'BUTTONS', buttons });
  }

  return components;
}

export const createTemplate = async (workspaceId, data) => {
  // Save to DB first (PENDING)
  const template = await prisma.template.create({
    data: { ...data, workspaceId, status: 'PENDING' },
  });

  // Try to submit to Meta if the workspace has a connected number with a WABA ID
  try {
    const number = await prisma.whatsappNumber.findFirst({
      where: {
        workspaceId,
        wabaId: { not: null },
        accessToken: { not: null },
        status: { in: ['Approved', 'ACTIVE', 'CONNECTED'] },
      },
    });

    if (number?.wabaId && number?.accessToken) {
      const accessToken = decryptToken(number.accessToken);

      const payload = {
        name: data.name,
        category: data.category,
        language: data.language ?? 'en',
        components: buildMetaComponents(data),
      };

      const result = await metaPost(`/${number.wabaId}/message_templates`, payload, accessToken);

      // Meta returns { id, status } — store both
      await prisma.template.update({
        where: { id: template.id },
        data: {
          metaTemplateId: result.id ?? null,
          status: result.status ?? 'PENDING',
        },
      });

      logger.info(
        { workspaceId, templateId: template.id, metaTemplateId: result.id, status: result.status },
        'Template submitted to Meta'
      );

      return { ...template, metaTemplateId: result.id, status: result.status ?? 'PENDING' };
    }
  } catch (err) {
    // Log but don't fail — template is saved locally, Meta submission can be retried
    logger.warn({ workspaceId, templateId: template.id, err: err.message }, 'Meta template submission failed');
  }

  return template;
};

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
