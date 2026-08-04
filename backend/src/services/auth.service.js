import prisma from '../config/prisma.js';
import { hashPassword, comparePassword, hashToken, generateSecureToken } from '../lib/hash.js';
import { signAccessToken, signRefreshToken } from '../lib/jwt.js';
import { REFRESH_TOKEN_EXPIRY_MS, INVITE_TOKEN_BYTES } from '../constants/limits.js';
import { env } from '../config/env.js';
import { ROLES } from '../constants/roles.js';
import logger from '../lib/logger.js';
import { writeAudit, AUDIT_ACTIONS, AUDIT_CATEGORIES } from './audit.service.js';

const resolveRole = (email) =>
  (env.SUPER_ADMIN_EMAIL && email === env.SUPER_ADMIN_EMAIL ? ROLES.SUPER_ADMIN : ROLES.MEMBER);

/**
 * Make SUPER_ADMIN_EMAIL authoritative at every auth event, not just at signup.
 *
 * `resolveRole` runs only when a membership is CREATED. An account that
 * registered while SUPER_ADMIN_EMAIL was empty — which is every account in this
 * deployment — was written as `Member`, and login re-reads that stored role.
 * So setting the variable afterwards appeared to do nothing at all: the owner
 * logged in with the configured address and still landed on the customer
 * dashboard, with no error to explain why.
 *
 * Reconciling here makes the env var the single source of truth. It also
 * DEMOTES a stale Superadmin when the variable is pointed at a different
 * address, so ownership can actually be transferred rather than accumulating
 * admins forever.
 *
 * Deliberately narrow: it only ever moves a role between Superadmin and Member.
 * The legacy `Admin` / `Viewer` roles present in this database are left alone,
 * because clobbering them is not this function's decision to make.
 */
const reconcileSuperAdminRole = async (user, membership) => {
  if (!membership) return membership;

  const shouldBeSuperAdmin = Boolean(env.SUPER_ADMIN_EMAIL) && user.email === env.SUPER_ADMIN_EMAIL;
  const isSuperAdmin = membership.role === ROLES.SUPER_ADMIN;
  if (shouldBeSuperAdmin === isSuperAdmin) return membership;

  // Only promote Member -> Superadmin, or demote Superadmin -> Member.
  if (!shouldBeSuperAdmin && !isSuperAdmin) return membership;

  const nextRole = shouldBeSuperAdmin ? ROLES.SUPER_ADMIN : ROLES.MEMBER;
  const updated = await prisma.workspaceMember.update({
    where: { id: membership.id },
    data: { role: nextRole },
    include: { workspace: true },
  });

  logger.warn(
    { userId: user.id, email: user.email, from: membership.role, to: nextRole },
    `Reconciled platform role against SUPER_ADMIN_EMAIL: ${membership.role} -> ${nextRole}`,
  );

  // A privilege change is security-relevant and must be in the trail even
  // though no human triggered it directly.
  await writeAudit(
    { user: { userId: user.id, email: user.email, role: nextRole }, headers: {} },
    {
      action: AUDIT_ACTIONS.USER_ROLE_CHANGE,
      category: AUDIT_CATEGORIES.SECURITY,
      targetType: 'User',
      targetId: user.id,
      targetLabel: user.email,
      workspaceId: membership.workspaceId,
      before: { role: membership.role },
      after: { role: nextRole },
      metadata: { reason: 'reconciled against SUPER_ADMIN_EMAIL at login', automatic: true },
    },
  );

  return updated;
};

const makeSlug = (name) =>
  name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36);

const resolveGoogleName = (name, email) => {
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (trimmedName) return trimmedName;

  const localPart = typeof email === 'string' ? email.split('@')[0].trim() : '';
  return localPart || 'Google User';
};

export const registerUser = async ({ name, email, password, workspaceName }) => {
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({ data: { name, email, passwordHash } });

  let workspace = null;
  if (workspaceName) {
    workspace = await prisma.workspace.create({
      data: {
        name: workspaceName,
        slug: makeSlug(workspaceName),
        members: { create: { userId: user.id, role: resolveRole(email) } },
        settings: { create: {} },
      },
    });
  }

  return { user, workspace };
};

export const loginUser = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

  if (!user.passwordHash) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

  let membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });

  if (!membership) {
    const workspace = await prisma.workspace.create({
      data: {
        name: `${user.name || user.email.split('@')[0]}'s Workspace`,
        slug: makeSlug(user.name || user.email.split('@')[0]),
        members: { create: { userId: user.id, role: resolveRole(user.email) } },
        settings: { create: {} },
      },
    });
    membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      include: { workspace: true },
    });
  }

  membership = await reconcileSuperAdminRole(user, membership);

  const payload = {
    userId: user.id,
    email: user.email,
    workspaceId: membership?.workspaceId ?? null,
    role: membership?.role ?? null,
  };

  const accessToken = signAccessToken(payload);
  const rawRefresh = generateSecureToken();
  const tokenHash = hashToken(rawRefresh);

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId: user.id,
      workspaceId: membership?.workspaceId ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    },
  });

  return { accessToken, refreshToken: rawRefresh, user, workspace: membership?.workspace ?? null };
};

export const refreshTokens = async (rawToken) => {
  const tokenHash = hashToken(rawToken);

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });

  // Re-fetch the membership role so it isn't lost after a token refresh
  let membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspaceId: stored.workspaceId ?? undefined },
  });

  membership = await reconcileSuperAdminRole(user, membership);

  const payload = {
    userId: user.id,
    email: user.email,
    workspaceId: stored.workspaceId,
    role: membership?.role ?? null,
  };

  const accessToken = signAccessToken(payload);
  const newRawRefresh = generateSecureToken();
  const newHash = hashToken(newRawRefresh);

  await prisma.refreshToken.create({
    data: {
      tokenHash: newHash,
      userId: user.id,
      workspaceId: stored.workspaceId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    },
  });

  return { accessToken, refreshToken: newRawRefresh };
};

export const logout = async (rawToken) => {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revokedAt: new Date() },
  });
};

export const loginOrRegisterWithGoogle = async ({ googleId, email, name, avatarUrl }) => {
  const resolvedName = resolveGoogleName(name, email);

  let user = await prisma.user.findUnique({ where: { googleId } });

  if (!user) {
    // Try to link to existing account with same email
    user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId,
          name: user.name?.trim() ? user.name : resolvedName,
          avatarUrl: avatarUrl ?? user.avatarUrl,
        },
      });
    } else {
      user = await prisma.user.create({ data: { googleId, email, name: resolvedName, avatarUrl } });
      // Auto-create a workspace for new Google users
      await prisma.workspace.create({
        data: {
          name: `${resolvedName}'s Workspace`,
          slug: makeSlug(resolvedName),
          members: { create: { userId: user.id, role: resolveRole(email) } },
          settings: { create: {} },
        },
      });
    }
  }

  let membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });

  membership = await reconcileSuperAdminRole(user, membership);

  const payload = {
    userId: user.id,
    email: user.email,
    workspaceId: membership?.workspaceId ?? null,
    role: membership?.role ?? null,
  };

  const accessToken = signAccessToken(payload);
  const rawRefresh = generateSecureToken();
  const tokenHash = hashToken(rawRefresh);

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId: user.id,
      workspaceId: membership?.workspaceId ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    },
  });

  return { accessToken, refreshToken: rawRefresh, user, workspace: membership?.workspace ?? null };
};

export const acceptInvite = async ({ token, name, password }) => {
  const invite = await prisma.workspaceInvite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw Object.assign(new Error('Invite is invalid or expired'), { statusCode: 400 });
  }

  const passwordHash = await hashPassword(password);

  let user = await prisma.user.findUnique({ where: { email: invite.email } });
  if (!user) {
    user = await prisma.user.create({ data: { name, email: invite.email, passwordHash } });
  }

  await prisma.$transaction([
    prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
      create: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
      update: { role: invite.role },
    }),
    prisma.workspaceInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);

  return user;
};
