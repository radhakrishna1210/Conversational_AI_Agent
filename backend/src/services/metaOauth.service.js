import prisma from '../config/prisma.js';
import { exchangeCodeForToken, metaGet } from '../lib/metaApi.js';
import { encryptToken } from '../lib/encryption.js';
import { env } from '../config/env.js';
import { createSubWABA } from '../lib/meta.service.js';
import logger from '../lib/logger.js';

export const handleOAuthCallback = async (workspaceId, code) => {
  const redirectUri = `${env.CLIENT_URL}/dashboard/number-setup`;  // must match Meta App → Valid OAuth Redirect URIs
  const tokenData = await exchangeCodeForToken(code, redirectUri);
  const accessToken = tokenData.access_token;

  // Fetch businesses (satisfies business_management permission requirement)
  const businessesResp = await metaGet('/me/businesses', accessToken, {
    fields: 'id,name',
  });
  const primaryBusiness = businessesResp.data?.[0] ?? null;

  // Fetch all WABAs the user has access to
  const wabaResp = await metaGet('/me/whatsapp_business_accounts', accessToken, {
    fields: 'id,name',
  });
  const wabaList = wabaResp.data ?? [];
  const primaryWaba = wabaList[0];

  // Create a sub-WABA under the platform business for this workspace
  // so each client gets isolated WABA even when connecting via Embedded Signup
  let assignedWabaId = primaryWaba?.id ?? null;
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    const businessName = workspace?.name ?? `Workspace-${workspaceId.slice(0, 8)}`;
    assignedWabaId = await createSubWABA(workspaceId, businessName);
  } catch (err) {
    // Non-fatal: fall back to the user's own WABA
    logger.warn({ workspaceId, err: err.message }, 'Sub-WABA creation skipped during Embedded Signup — using client WABA');
  }

  // Save token + sub-WABA + business ID to workspace
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      metaAccessToken: accessToken,
      metaWabaId: assignedWabaId,
      metaBusinessId: primaryBusiness?.id ?? null,
    },
  });

  // For each WABA, fetch phone numbers + templates (satisfies whatsapp_business_management test call)
  const savedNumbers = [];
  for (const waba of wabaList) {
    // Test call for whatsapp_business_management permission
    await metaGet(`/${waba.id}/message_templates`, accessToken, { limit: '1' }).catch(() => null);

    const numbersResp = await metaGet(`/${waba.id}/phone_numbers`, accessToken, {
      fields: 'id,display_phone_number,verified_name,quality_rating,status',
    });

    for (const num of (numbersResp.data ?? [])) {
      const phoneNumber = num.display_phone_number.replace(/\s/g, '');
      const record = await prisma.whatsappNumber.upsert({
        where: { workspaceId_phoneNumber: { workspaceId, phoneNumber } },
        create: {
          workspaceId,
          phoneNumber,
          displayName: num.verified_name ?? phoneNumber,
          metaPhoneNumberId: num.id,
          wabaId: waba.id,
          accessToken: encryptToken(accessToken),
          status: num.status ?? 'CONNECTED',
          qualityRating: num.quality_rating ?? null,
        },
        update: {
          displayName: num.verified_name ?? phoneNumber,
          metaPhoneNumberId: num.id,
          wabaId: waba.id,
          accessToken: encryptToken(accessToken),
          status: num.status ?? 'CONNECTED',
          qualityRating: num.quality_rating ?? null,
        },
      });
      savedNumbers.push(record);
    }
  }

  return { wabaCount: wabaList.length, numbers: savedNumbers };
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
