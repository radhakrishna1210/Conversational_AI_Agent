import { hashPassword, comparePassword, hashToken, generateSecureToken } from '../lib/hash.js';
import { signAccessToken } from '../lib/jwt.js';
import logger from '../lib/logger.js';

// In-memory store for development
const users = new Map();
const refreshTokens = new Map();
const defaultUsers = [
  { id: '1', email: 'test@example.com', name: 'Test User', password: 'password123' },
  { id: '2', email: 'admin@example.com', name: 'Admin User', password: 'admin123' },
];

async function initializeDefaultUsers() {
  for (const user of defaultUsers) {
    const passwordHash = await hashPassword(user.password);
    users.set(user.email, {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash,
      workspace: {
        id: `ws-${user.id}`,
        name: `${user.name}'s Workspace`,
        slug: user.name.toLowerCase().replace(/\s+/g, '-'),
      },
    });
  }
  logger.info('Mock auth users initialized');
}

// Initialize on import
initializeDefaultUsers().catch(err => logger.error(err, 'Failed to initialize mock users'));

export const registerUser = async ({ name, email, password, workspaceName }) => {
  if (users.has(email)) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409 });
  }

  const id = `user-${Date.now()}`;
  const passwordHash = await hashPassword(password);
  const workspaceId = `ws-${Date.now()}`;

  const user = { id, email, name, passwordHash };
  const workspace = workspaceName ? {
    id: workspaceId,
    name: workspaceName,
    slug: workspaceName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36),
  } : null;

  users.set(email, { ...user, workspace });
  logger.info({ email }, 'User registered (mock)');

  return { user, workspace };
};

export const loginUser = async ({ email, password }) => {
  const user = users.get(email);
  if (!user) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  }

  const payload = {
    userId: user.id,
    email: user.email,
    workspaceId: user.workspace?.id ?? null,
    role: 'Admin',
  };

  const accessToken = signAccessToken(payload);
  const rawRefresh = generateSecureToken();
  const tokenHash = hashToken(rawRefresh);

  refreshTokens.set(tokenHash, {
    userId: user.id,
    workspaceId: user.workspace?.id ?? null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  logger.info({ email }, 'User logged in (mock)');

  return {
    accessToken,
    refreshToken: rawRefresh,
    user: { id: user.id, name: user.name, email: user.email },
    workspace: user.workspace ?? null,
  };
};

export const refreshTokens_fn = async (rawToken) => {
  const tokenHash = hashToken(rawToken);
  const stored = refreshTokens.get(tokenHash);

  if (!stored || stored.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
  }

  // Find user
  let user = null;
  for (const u of users.values()) {
    if (u.id === stored.userId) {
      user = u;
      break;
    }
  }

  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  // Revoke old token
  refreshTokens.delete(tokenHash);

  // Create new tokens
  const payload = {
    userId: user.id,
    email: user.email,
    workspaceId: stored.workspaceId,
    role: 'Admin',
  };

  const accessToken = signAccessToken(payload);
  const newRawRefresh = generateSecureToken();
  const newHash = hashToken(newRawRefresh);

  refreshTokens.set(newHash, {
    userId: user.id,
    workspaceId: stored.workspaceId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { accessToken, refreshToken: newRawRefresh };
};

export const logout = async (rawToken) => {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  refreshTokens.delete(tokenHash);
};

export const acceptInvite = async ({ token, name, password }) => {
  // Mock implementation
  const id = `user-${Date.now()}`;
  const passwordHash = await hashPassword(password);
  throw Object.assign(new Error('Invite system requires database'), { statusCode: 501 });
};
