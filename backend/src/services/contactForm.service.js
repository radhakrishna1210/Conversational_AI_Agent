import prisma from '../config/prisma.js';

export const createContactSubmission = async (data) => {
  const { name, email, phone, callVolume, helpWith, useCase, heardAbout } = data;
  return prisma.contactSubmission.create({
    data: {
      name,
      email,
      phone,
      callVolume,
      helpWith,
      useCase,
      heardAbout: heardAbout || null,
    },
  });
};

export const listContactSubmissions = async () => {
  return prisma.contactSubmission.findMany({
    orderBy: { createdAt: 'desc' },
  });
};
