import prisma from '../config/prisma.js';

/*
 * The `screenshotUrl` column holds the STORED FILENAME of the upload, not a URL.
 *
 * The name is a leftover from when the field was meant to hold a link to some
 * external bucket; renaming it means a migration against the live database for
 * no behavioural gain. The images are served through an admin-authenticated
 * route (they routinely contain customer data), so there is no public URL to
 * store in the first place — a filename is the honest thing to keep.
 *
 * Rows written by anything else are tolerated: a value that already looks like
 * an absolute URL is passed through to the client untouched.
 */
const isAbsoluteUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);

/** DB row → what the admin panel consumes. */
const toDto = (issue) => ({
  id: issue.id,
  issueTitle: issue.issueTitle,
  description: issue.description,
  createdAt: issue.createdAt,
  screenshotUrl: issue.screenshotUrl
    ? (isAbsoluteUrl(issue.screenshotUrl) ? issue.screenshotUrl : `/api/v1/report-issue/${issue.id}/screenshot`)
    : null,
});

export const createReportIssue = async (data) => {
  const { issueTitle, description, screenshotFile, screenshotUrl } = data;
  return prisma.reportIssue.create({
    data: {
      issueTitle,
      description,
      // screenshotUrl is still accepted so an existing caller that posts a link
      // keeps working; an actual upload always wins.
      screenshotUrl: screenshotFile || screenshotUrl || null,
    },
  });
};

export const listReportIssues = async () => {
  const rows = await prisma.reportIssue.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toDto);
};

/** Raw row — the screenshot route needs the stored filename, not the DTO. */
export const getReportIssue = async (id) =>
  prisma.reportIssue.findUnique({ where: { id } });
