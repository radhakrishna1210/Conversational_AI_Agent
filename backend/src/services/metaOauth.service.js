import prisma from '../config/prisma.js';
import { exchangeCodeForToken, metaGet } from '../lib/metaApi.js';
import { env } from '../config/env.js';

export const handleOAuthCallback = async (workspaceId, code) => {
  const redirectUri = `${env.CLIENT_URL}/wh/number-setup`;
  const tokenData = await exchangeCodeForToken(code, redirectUri);

  // Fetch WABA info
  const wabaData = await metaGet('/me', tokenData.access_token, {
    fields: 'id,name,businesses',
  });

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      metaAccessToken: tokenData.access_token,
      metaBusinessId: wabaData.businesses?.data?.[0]?.id ?? null,
    },
  });

  return workspace;
};

export const getOAuthStatus = async (workspaceId) => {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  return {
    connected: !!workspace.metaAccessToken,
    businessId: workspace.metaBusinessId,
    wabaId: workspace.metaWabaId,
  };
};

export const disconnectOAuth = (workspaceId) =>
  prisma.workspace.update({
    where: { id: workspaceId },
    data: { metaAccessToken: null, metaWabaId: null, metaBusinessId: null },
  });
