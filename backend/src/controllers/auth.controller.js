import * as authService from '../services/auth.service.js';

export const register = async (req, res) => {
  const { user, workspace } = await authService.registerUser(req.body);
  res.status(201).json({ message: 'Account created', userId: user.id, workspaceId: workspace?.id });
};

export const login = async (req, res) => {
  const { accessToken, refreshToken, user, workspace } = await authService.loginUser(req.body);
  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email },
    workspace: workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null,
  });
};

export const refresh = async (req, res) => {
  const { refreshToken } = req.body;
  const tokens = await authService.refreshTokens(refreshToken);
  res.json(tokens);
};

export const logout = async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.json({ message: 'Logged out' });
};

export const acceptInvite = async (req, res) => {
  const user = await authService.acceptInvite(req.body);
  res.json({ message: 'Invite accepted', userId: user.id });
};

export const me = async (req, res) => {
  res.json({ user: req.user });
};
