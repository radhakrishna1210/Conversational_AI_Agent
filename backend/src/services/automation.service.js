import prisma from '../config/prisma.js';

// ── Keyword Triggers ──────────────────────────────────────────────────────────

export const listTriggers = (workspaceId) =>
  prisma.keywordTrigger.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });

export const createTrigger = (workspaceId, data) =>
  prisma.keywordTrigger.create({ data: { ...data, workspaceId } });

export const updateTrigger = (workspaceId, triggerId, data) =>
  prisma.keywordTrigger.update({ where: { id: triggerId, workspaceId }, data });

export const deleteTrigger = (workspaceId, triggerId) =>
  prisma.keywordTrigger.delete({ where: { id: triggerId, workspaceId } });

/**
 * Match an inbound message against active triggers.
 * Returns the first matching trigger or null.
 */
export const matchTrigger = async (workspaceId, messageText) => {
  const triggers = await prisma.keywordTrigger.findMany({
    where: { workspaceId, isActive: true },
  });
  const text = messageText.trim().toUpperCase();
  return triggers.find((t) =>
    t.matchExact ? text === t.keyword.toUpperCase() : text.includes(t.keyword.toUpperCase())
  ) ?? null;
};

// ── Visual Flow ───────────────────────────────────────────────────────────────

export const getFlow = async (workspaceId) => {
  const flow = await prisma.automationFlow.findUnique({ where: { workspaceId } });
  return flow ?? { workspaceId, flowJson: {} };
};

export const saveFlow = (workspaceId, flowJson) =>
  prisma.automationFlow.upsert({
    where: { workspaceId },
    create: { workspaceId, flowJson },
    update: { flowJson },
  });
