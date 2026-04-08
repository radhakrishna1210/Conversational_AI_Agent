import * as metaOauthService from '../services/metaOauth.service.js';

export const oauthCallback = async (req, res) => {
  const { code } = req.body;
  const result = await metaOauthService.handleOAuthCallback(req.params.workspaceId, code);
  res.json({
    message: 'Meta account connected',
    wabaCount: result.wabaCount,
    numbers: result.numbers,
  });
};

export const getStatus = async (req, res) => {
  const status = await metaOauthService.getOAuthStatus(req.params.workspaceId);
  res.json(status);
};

export const disconnect = async (req, res) => {
  await metaOauthService.disconnectOAuth(req.params.workspaceId);
  res.json({ message: 'Facebook Business Account disconnected' });
};
