import prisma from '../config/prisma.js';
import { hashPassword, comparePassword, hashToken, generateSecureToken } from '../lib/hash.js';
import { signAccessToken, signRefreshToken } from '../lib/jwt.js';
import { REFRESH_TOKEN_EXPIRY_MS, INVITE_TOKEN_BYTES } from '../constants/limits.js';

const makeSlug = (name) =>
  name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36);

export const registerUser = async ({ name, email, password, workspaceName }) => {
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({ data: { name, email, passwordHash } });

  let workspace = null;
  if (workspaceName) {
    workspace = await prisma.workspace.create({
      data: {
        name: workspaceName,
        slug: makeSlug(workspaceName),
        members: { create: { userId: user.id, role: 'Admin' } },
        settings: { create: {} },
      },
    });
  }

  return { user, workspace };
};

export const loginUser = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });

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
  const payload = {
    userId: user.id,
    email: user.email,
    workspaceId: stored.workspaceId,
    role: null,
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
