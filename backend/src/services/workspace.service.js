import prisma from '../config/prisma.js';
import { generateSecureToken } from '../lib/hash.js';
import { INVITE_EXPIRY_MS, INVITE_TOKEN_BYTES } from '../constants/limits.js';
import { ROLES } from '../constants/roles.js';

/**
 * Workspace columns a customer must never be shown.
 *
 * Pricing is Super-Admin-only (see the note on Workspace in schema.prisma), but
 * GET and PATCH /workspaces/:id returned the raw row, so any member could read
 * a bespoke per-minute deal and the tier they had been put on.
 */
const ADMIN_ONLY_FIELDS = ['rateOverrideInr', 'pricingBucketId', 'pricingBucket'];

export const toCustomerWorkspace = (workspace) => {
  if (!workspace) return workspace;
  const out = { ...workspace };
  for (const field of ADMIN_ONLY_FIELDS) delete out[field];
  return out;
};

export const getWorkspace = (workspaceId) =>
  prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

/**
 * `timezone` is a setting, not a Workspace column. The validator has always
 * accepted it, so sending one made Prisma throw "Unknown argument" and the
 * request answer 500. It is stored where the schema keeps it.
 */
export const updateWorkspace = async (workspaceId, { timezone, ...data }) => {
  if (timezone !== undefined) {
    await prisma.workspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, timezone },
      update: { timezone },
    });
  }
  return Object.keys(data).length
    ? prisma.workspace.update({ where: { id: workspaceId }, data })
    : prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
};

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

/**
 * Only the platform owner may change or remove the platform owner's membership.
 *
 * Every member passes authorize('Member'), so any of them could demote or
 * remove the Superadmin's membership — stepping straight around the
 * last-Superadmin guard the admin panel enforces on user deletion.
 */
const assertMayManage = async (workspaceId, targetUserId, actorRole) => {
  if (actorRole === ROLES.SUPER_ADMIN) return;
  const target = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
    select: { role: true },
  });
  if (target?.role === ROLES.SUPER_ADMIN) {
    throw Object.assign(new Error('Only the platform owner can change the platform owner\'s membership'), { statusCode: 403 });
  }
};

export const updateMemberRole = async (workspaceId, userId, role, actorRole = null) => {
  await assertMayManage(workspaceId, userId, actorRole);
  return prisma.workspaceMember.update({
    where: { userId_workspaceId: { userId, workspaceId } },
    data: { role },
  });
};

export const removeMember = async (workspaceId, userId, actorRole = null) => {
  await assertMayManage(workspaceId, userId, actorRole);
  return prisma.workspaceMember.delete({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
};
