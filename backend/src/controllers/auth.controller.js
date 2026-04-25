

import * as mockAuthService from '../services/mockAuth.service.js';

import * as authService from '../services/mockAuth.service.js';

import { env } from '../config/env.js';

// Fallback to mock service if database is unavailable
const getAuthService = () => {
  const useMock = env.USE_MOCK_AUTH === 'true' || env.DATABASE_URL?.includes('supabase') && process.env.DB_STATUS === 'unavailable';
  return useMock ? mockAuthService : authService;
};

export const register = async (req, res) => {
  const service = getAuthService();
  try {
    const { user, workspace } = await service.registerUser(req.body);
    res.status(201).json({ message: 'Account created', userId: user.id, workspaceId: workspace?.id });
  } catch (err) {
    // Try fallback to mock if auth service fails
    if (service === authService && process.env.DB_STATUS === 'unavailable') {
      const { user, workspace } = await mockAuthService.registerUser(req.body);
      return res.status(201).json({ message: 'Account created (dev mode)', userId: user.id, workspaceId: workspace?.id });
    }
    throw err;
  }
};

export const login = async (req, res) => {
  const service = getAuthService();
  try {
    const { accessToken, refreshToken, user, workspace } = await service.loginUser(req.body);
    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email },
      workspace: workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null,
    });
  } catch (err) {
    // Try fallback to mock if auth service fails
    if (service === authService && process.env.DB_STATUS === 'unavailable') {
      const { accessToken, refreshToken, user, workspace } = await mockAuthService.loginUser(req.body);
      return res.json({
        accessToken,
        refreshToken,
        user: { id: user.id, name: user.name, email: user.email },
        workspace: workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null,
      });
    }
    throw err;
  }
};

export const refresh = async (req, res) => {
  const service = getAuthService();
  const { refreshToken } = req.body;
  try {
    const tokens = await service.refreshTokens(refreshToken);
    res.json(tokens);
  } catch (err) {
    // Fallback
    if (service === authService && process.env.DB_STATUS === 'unavailable') {
      const tokens = await mockAuthService.refreshTokens_fn(refreshToken);
      return res.json(tokens);
    }
    throw err;
  }
};

export const logout = async (req, res) => {
  const service = getAuthService();
  await service.logout(req.body.refreshToken);
  res.json({ message: 'Logged out' });
};

export const acceptInvite = async (req, res) => {
  const service = getAuthService();
  const user = await service.acceptInvite(req.body);
  res.json({ message: 'Invite accepted', userId: user.id });
};

export const me = async (req, res) => {
  res.json({ user: req.user });
};

export const googleRedirect = (req, res) => {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${req.protocol}://${req.get('host')}/api/v1/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

export const googleCallback = async (req, res) => {
  try {
  const { code, error: googleError } = req.query;
  if (googleError) {
    console.error('[Google OAuth] Google returned error:', googleError);
    return res.redirect(`${env.CLIENT_URL}/login?error=google_denied`);
  }
  if (!code) return res.redirect(`${env.CLIENT_URL}/login?error=no_code`);

  const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/auth/google/callback`;
  console.log('[Google OAuth] redirect_uri used:', redirectUri);

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error('[Google OAuth] Token exchange failed:', tokenData);
    return res.redirect(`${env.CLIENT_URL}/login?error=token_exchange`);
  }

  // Get user info
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await userRes.json();
  console.log('[Google OAuth] profile:', profile);
  if (!profile.sub) return res.redirect(`${env.CLIENT_URL}/login?error=no_profile`);

  const { accessToken, refreshToken, workspace } = await authService.loginOrRegisterWithGoogle({
    googleId: profile.sub,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.picture,
  });

  const params = new URLSearchParams({
    token: accessToken,
    refreshToken,
    ...(workspace?.id ? { workspaceId: workspace.id } : {}),
  });
  const redirectUrl = `${env.CLIENT_URL}/auth/callback?${params}`;
  console.log('[Google OAuth] Redirecting to:', redirectUrl.substring(0, 80) + '...');
  res.redirect(redirectUrl);
  } catch (err) {
    console.error('[Google OAuth] Unexpected error:', err);
    res.redirect(`${env.CLIENT_URL}/login?error=google_failed`);
  }
};
