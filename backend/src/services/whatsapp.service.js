import prisma from '../config/prisma.js';
import { metaPost } from '../lib/metaApi.js';
import { decryptToken } from '../lib/encryption.js';

export const listNumbers = (workspaceId) =>
  prisma.whatsappNumber.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });

export const getNumber = (workspaceId, numberId) =>
  prisma.whatsappNumber.findFirstOrThrow({ where: { id: numberId, workspaceId } });

export const requestOtp = async (workspaceId, phoneNumber, countryCode = '91') => {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

  if (workspace.metaAccessToken && workspace.metaWabaId) {
    await metaPost(
      `/${workspace.metaWabaId}/phone_numbers`,
      { cc: countryCode, phone_number: phoneNumber, method: 'SMS' },
      workspace.metaAccessToken
    );
  }

  return prisma.whatsappNumber.upsert({
    where: { workspaceId_phoneNumber: { workspaceId, phoneNumber } },
    create: { workspaceId, phoneNumber, displayName: phoneNumber, status: 'Pending' },
    update: { status: 'Pending' },
  });
};

export const verifyOtp = async (workspaceId, phoneNumber, otp) => {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const number = await prisma.whatsappNumber.findFirstOrThrow({
    where: { workspaceId, phoneNumber },
  });

  if (workspace.metaAccessToken && number.metaPhoneNumberId) {
    const result = await metaPost(
      `/${number.metaPhoneNumberId}/verify_code`,
      { code: otp },
      workspace.metaAccessToken
    );
    if (result?.success) {
      return prisma.whatsappNumber.update({
        where: { id: number.id },
        data: { status: 'Approved' },
      });
    }
    throw Object.assign(new Error('OTP verification failed'), { statusCode: 400 });
  }

  // Dev fallback when Meta is not configured: auto-approve
  return prisma.whatsappNumber.update({
    where: { id: number.id },
    data: { status: 'Approved' },
  });
};

export const updateBusinessProfile = (workspaceId, numberId, data) =>
  prisma.whatsappNumber.update({
    where: { id: numberId, workspaceId },
    data,
  });

export const deleteNumber = (workspaceId, numberId) =>
  prisma.whatsappNumber.delete({ where: { id: numberId, workspaceId } });

export const sendMessage = async (workspace, to, message) => {
  const number = await prisma.whatsappNumber.findFirst({
    where: { workspaceId: workspace.id, status: { in: ['Approved', 'ACTIVE', 'CONNECTED'] } },
  });

  if (!number?.metaPhoneNumberId) {
    throw Object.assign(new Error('No active phone number found for this workspace'), { statusCode: 422 });
  }

  if (!number.accessToken) {
    throw Object.assign(new Error('WhatsApp access token not configured'), { statusCode: 422 });
  }

  const plainToken = decryptToken(number.accessToken);

  return metaPost(
    `/${number.metaPhoneNumberId}/messages`,
    { messaging_product: 'whatsapp', to, ...message },
    plainToken
  );
};
