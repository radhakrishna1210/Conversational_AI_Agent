

import * as mockAuthService from '../services/mockAuth.service.js';
import * as authService from '../services/auth.service.js';


import { env } from '../config/env.js';

// Mock auth is ONLY available when explicitly enabled AND not in production.
// It must never activate implicitly: previously it triggered whenever
// NODE_ENV !== 'production' OR on any 401 login failure, which meant the
// hardcoded dev credentials (test@example.com / admin@example.com) could issue
// real signed JWTs — an authentication backdoor.
const shouldUseMockAuth = () => {
  return env.USE_MOCK_AUTH === 'true' && env.NODE_ENV !== 'production';
};

const getAuthService = () => (shouldUseMockAuth() ? mockAuthService : authService);

// Never fall back to mock credentials because a real login failed.
const shouldFallbackToMockAuth = () => false;

export const register = async (req, res) => {
  const service = getAuthService();
  try {
    const { user, workspace } = await service.registerUser(req.body);
    res.status(201).json({ message: 'Account created', userId: user.id, workspaceId: workspace?.id });
  } catch (err) {
    // No mock fallback: if the database is unavailable, fail honestly rather
    // than creating a phantom in-memory account the user can never use again.
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
    if (shouldFallbackToMockAuth(err) && service === authService) {
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
  // Use GOOGLE_AUTH_REDIRECT_URI from env if set, otherwise build from backend port directly
  // (avoids issues when running behind Vite dev proxy which changes req.get('host'))
  const redirectUri = env.GOOGLE_AUTH_REDIRECT_URI ||
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

    const redirectUri = env.GOOGLE_AUTH_REDIRECT_URI ||
      `${req.protocol}://localhost:${env.PORT}/api/v1/auth/google/callback`;

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      console.error('[Google OAuth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
      return res.redirect(`${env.CLIENT_URL}/login?error=google_config`);
    }

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
    if (!profile.sub) {
      console.error('[Google OAuth] Profile lookup returned no subject:', profile);
      return res.redirect(`${env.CLIENT_URL}/login?error=no_profile`);
    }
    if (!profile.email) {
      console.error('[Google OAuth] Profile lookup returned no email:', profile);
      return res.redirect(`${env.CLIENT_URL}/login?error=no_email`);
    }

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
      name: profile.name ?? '',
      email: profile.email ?? '',
    });

    // Tokens go in the URL FRAGMENT (#…), not the query string: fragments are
    // never sent to servers, never appear in access logs or the Referer header,
    // and the client strips them from history immediately after reading.
    const redirectUrl = `${env.CLIENT_URL}/auth/callback#${params}`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('[Google OAuth] Unexpected error:', err?.stack || err);
    res.redirect(`${env.CLIENT_URL}/login?error=google_failed`);
  }
};
