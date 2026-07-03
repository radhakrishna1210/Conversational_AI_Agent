import prisma from '../config/prisma.js';

export const createReportIssue = async (data) => {
  const { issueTitle, description, screenshotUrl } = data;
  return prisma.reportIssue.create({
    data: {
      issueTitle,
      description,
      screenshotUrl: screenshotUrl || null,
    },
  });
};

export const listReportIssues = async () => {
  return prisma.reportIssue.findMany({
    orderBy: { createdAt: 'desc' },
  });
};
