import * as mockAuthService from '../services/mockAuth.service.js';
import * as authService from '../services/auth.service.js';
import { env } from '../config/env.js';

// In dev (NODE_ENV !== 'production'), always use mock auth so default test
// credentials work without a real DB user.  Flip USE_MOCK_AUTH=false to use
// the real auth.service against the Neon DB.
const getAuthService = () => {
  const useMock = env.USE_MOCK_AUTH === 'true' || process.env.DB_STATUS === 'unavailable';
  return useMock ? mockAuthService : authService;
};

// Unified error handler — converts thrown errors into proper HTTP responses
const handleAuthError = (res, err) => {
  const status = err.statusCode ?? 500;
  const message = status < 500 ? err.message : 'Something went wrong. Please try again.';
  return res.status(status).json({ error: message });
};

export const register = async (req, res) => {
  try {
    const service = getAuthService();
    const { user, workspace } = await service.registerUser(req.body);
    res.status(201).json({ message: 'Account created', userId: user.id, workspaceId: workspace?.id });
  } catch (err) {
    handleAuthError(res, err);
  }
};

export const login = async (req, res) => {
  try {
    const service = getAuthService();
    const { accessToken, refreshToken, user, workspace } = await service.loginUser(req.body);
    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email },
      workspace: workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null,
    });
  } catch (err) {
    handleAuthError(res, err);
  }
};

export const refresh = async (req, res) => {
  try {
    const service = getAuthService();
    const { refreshToken } = req.body;
    const tokens = await service.refreshTokens(refreshToken);
    res.json(tokens);
  } catch (err) {
    handleAuthError(res, err);
  }
};

export const logout = async (req, res) => {
  try {
    const service = getAuthService();
    await service.logout(req.body.refreshToken);
    res.json({ message: 'Logged out' });
  } catch (err) {
    handleAuthError(res, err);
  }
};

export const acceptInvite = async (req, res) => {
  try {
    const service = getAuthService();
    const user = await service.acceptInvite(req.body);
    res.json({ message: 'Invite accepted', userId: user.id });
  } catch (err) {
    handleAuthError(res, err);
  }
};

export const me = async (req, res) => {
  res.json({ user: req.user });
};

export const googleRedirect = (req, res) => {
  // Use GOOGLE_REDIRECT_URI from env if set, otherwise build from backend port directly
  // (avoids issues when running behind Vite dev proxy which changes req.get('host'))
  const redirectUri = env.GOOGLE_REDIRECT_URI ||
    `${req.protocol}://localhost:${env.PORT}/api/v1/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
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

  const redirectUri = env.GOOGLE_REDIRECT_URI ||
    `${req.protocol}://localhost:${env.PORT}/api/v1/auth/google/callback`;

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
  if (!profile.sub) return res.redirect(`${env.CLIENT_URL}/login?error=no_profile`);

  const { accessToken, refreshToken, workspace } = await getAuthService().loginOrRegisterWithGoogle({
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
  res.redirect(redirectUrl);
  } catch (err) {
    console.error('[Google OAuth] Unexpected error:', err);
    res.redirect(`${env.CLIENT_URL}/login?error=google_failed`);
  }
};
