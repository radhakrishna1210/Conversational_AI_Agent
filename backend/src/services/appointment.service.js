import prisma from '../config/prisma.js';

export const createAppointment = async (data) => {
  const { name, email, phone, projectType, role, reason, callVolume, userType, industry, useCase } = data;
  return prisma.appointmentBooking.create({
    data: { name, email, phone, projectType, role, reason, callVolume, userType, industry, useCase },
  });
};

export const listAppointments = async () => {
  return prisma.appointmentBooking.findMany({
    orderBy: { createdAt: 'desc' },
  });
};
