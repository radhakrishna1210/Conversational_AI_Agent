import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';

export const createContactSubmission = async (payload) => {
  const submission = {
    name: payload.name.trim(),
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone.trim(),
    monthlyCallVolume: payload.monthlyCallVolume.trim(),
    helpTopic: payload.helpTopic.trim(),
    useCase: payload.useCase.trim(),
    referralSource: payload.referralSource?.trim() || null,
  };

  if (prisma.contactSubmission?.create) {
    return prisma.contactSubmission.create({ data: submission });
  }

  logger.info({ contactSubmission: submission }, 'Contact submission received before Prisma model generation');
  return {
    id: `logged-${Date.now()}`,
    ...submission,
    createdAt: new Date(),
  };
};
