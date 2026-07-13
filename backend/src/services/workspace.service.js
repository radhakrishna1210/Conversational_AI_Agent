import prisma from '../config/prisma.js';
import { generateSecureToken } from '../lib/hash.js';
import { INVITE_EXPIRY_MS, INVITE_TOKEN_BYTES } from '../constants/limits.js';

export const getWorkspace = (workspaceId) =>
  prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

export const updateWorkspace = (workspaceId, data) =>
  prisma.workspace.update({ where: { id: workspaceId }, data });

export const listMembers = (workspaceId) =>
  prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { joinedAt: 'asc' },
  });

export const createInvite = async (workspaceId, email, role) => {
  const token = generateSecureToken(INVITE_TOKEN_BYTES);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  return prisma.workspaceInvite.upsert({
    where: { workspaceId_email: { workspaceId, email } },
    create: { workspaceId, email, role, token, expiresAt },
    update: { role, token, expiresAt, acceptedAt: null },
  });
};

export const updateMemberRole = (workspaceId, userId, role) =>
  prisma.workspaceMember.update({
    where: { userId_workspaceId: { userId, workspaceId } },
    data: { role },
  });

export const removeMember = (workspaceId, userId) =>
  prisma.workspaceMember.delete({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
