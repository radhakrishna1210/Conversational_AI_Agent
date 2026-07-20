import { hashPassword, comparePassword, hashToken, generateSecureToken } from '../lib/hash.js';
import { signAccessToken } from '../lib/jwt.js';
import logger from '../lib/logger.js';

// In-memory stores (dev only)
const users = new Map();
const tokenStore = new Map();
let authInitPromise = null;

// Default users
const defaultUsers = [
  { id: '1', email: 'test@example.com', name: 'Test User', password: 'password123' },
  { id: '2', email: 'admin@example.com', name: 'Admin User', password: 'admin123' },
];

// Initialize default users once and reuse the promise for all callers
async function initializeDefaultUsers() {
  if (authInitPromise) return authInitPromise;

  authInitPromise = (async () => {
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
  })();

  return authInitPromise;
}

// Initialize on startup
initializeDefaultUsers().catch(err =>
  logger.error(err, 'Failed to initialize mock users')
);

// ---------------- AUTH FUNCTIONS ----------------

// Register
export const registerUser = async ({ name, email, password, workspaceName }) => {
  await initializeDefaultUsers();
  if (users.has(email)) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409 });
  }

  const id = `user-${Date.now()}`;
  const passwordHash = await hashPassword(password);
  const workspaceId = `ws-${Date.now()}`;

  const user = { id, email, name, passwordHash };

  const workspace = workspaceName
    ? {
        id: workspaceId,
        name: workspaceName,
        slug:
          workspaceName.toLowerCase().replace(/\s+/g, '-') +
          '-' +
          Date.now().toString(36),
      }
    : null;

  users.set(email, { ...user, workspace });

  logger.info({ email }, 'User registered');

  return { user, workspace };
};

// Login
export const loginUser = async ({ email, password }) => {
  await initializeDefaultUsers();
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
    role: 'Member',
  };

  const accessToken = signAccessToken(payload);

  const rawRefresh = generateSecureToken();
  const tokenHash = hashToken(rawRefresh);

  tokenStore.set(tokenHash, {
    userId: user.id,
    workspaceId: user.workspace?.id ?? null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  logger.info({ email }, 'User logged in');

  return {
    accessToken,
    refreshToken: rawRefresh,
    user: { id: user.id, name: user.name, email: user.email },
    workspace: user.workspace ?? null,
  };
};

// Refresh token
export const refreshUserToken = async (rawToken) => {
  await initializeDefaultUsers();
  const tokenHash = hashToken(rawToken);
  const stored = tokenStore.get(tokenHash);

  if (!stored || stored.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
  }

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

  // Remove old token
  tokenStore.delete(tokenHash);

  const payload = {
    userId: user.id,
    email: user.email,
    workspaceId: stored.workspaceId,
    role: 'Member',
  };

  const accessToken = signAccessToken(payload);
  const newRawRefresh = generateSecureToken();
  const newHash = hashToken(newRawRefresh);

  tokenStore.set(newHash, {
    userId: user.id,
    workspaceId: stored.workspaceId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return {
    accessToken,
    refreshToken: newRawRefresh,
  };
};

// Logout
export const logout = async (rawToken) => {
  if (!rawToken) return;

  const tokenHash = hashToken(rawToken);
  tokenStore.delete(tokenHash);
};

// Google OAuth Login/Register
export const loginOrRegisterWithGoogle = async ({ googleId, email, name, avatarUrl }) => {
  await initializeDefaultUsers();
  // Check if user exists by googleId
  let user = null;
  for (const u of users.values()) {
    if (u.googleId === googleId) {
      user = u;
      break;
    }
  }

  // If not found by googleId, check by email
  if (!user) {
    user = users.get(email);
  }

  // If user doesn't exist, create new one
  if (!user) {
    const id = `user-${Date.now()}`;
    const workspaceId = `ws-${Date.now()}`;

    user = {
      id,
      email,
      name,
      googleId,
      avatarUrl,
      workspace: {
        id: workspaceId,
        name: `${name}'s Workspace`,
        slug: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36),
      },
    };

    users.set(email, user);
    logger.info({ email }, 'New user created via Google OAuth');
  } else {
    // Update existing user with Google info
    user.googleId = googleId;
    if (avatarUrl) user.avatarUrl = avatarUrl;
    logger.info({ email }, 'User logged in via Google OAuth');
  }

  const payload = {
    userId: user.id,
    email: user.email,
    workspaceId: user.workspace?.id ?? null,
    role: 'Member',
  };

  const accessToken = signAccessToken(payload);
  const rawRefresh = generateSecureToken();
  const tokenHash = hashToken(rawRefresh);

  tokenStore.set(tokenHash, {
    userId: user.id,
    workspaceId: user.workspace?.id ?? null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return {
    accessToken,
    refreshToken: rawRefresh,
    user: { id: user.id, name: user.name, email: user.email },
    workspace: user.workspace ?? null,
  };
};

// Invite (not implemented yet)
export const acceptInvite = async () => {
  throw Object.assign(
    new Error('Invite system requires database'),
    { statusCode: 501 }
  );
};
