// Telling a workspace something happened, from inside the server.
//
// Notifications already existed, but only as an HTTP surface: the client could
// POST one to itself. Nothing in the backend could raise one, so every internal
// event that a customer needed to know about — a carrier approving their KYC, a
// number suspended for non-payment — happened silently, and any UI copy
// promising to tell them was a lie.
//
// One in-app notification row (which the SSE stream pushes live), plus an email
// when the platform has a mailer and the event is worth an inbox. Neither is
// allowed to fail the operation that raised it: a notification that throws must
// not roll back an approved compliance application or an applied wallet charge.

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { broadcast } from '../lib/sse.js';
import { sendMail, isMailerConfigured } from '../lib/mailer.js';

/** Matches the `type` values the notification UI already styles. */
export const NOTIFY_TYPE = Object.freeze({
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
});

/**
 * Who should receive email for a workspace.
 *
 * Members, not the compliance `contactEmail`: that address belongs to the legal
 * entity and is what the CARRIER writes to. The people who need to know their
 * numbers stopped working are the ones who log in.
 */
async function workspaceEmails(workspaceId) {
  try {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { user: { select: { email: true } } },
      take: 20,
    });
    return [...new Set(members.map((m) => m.user?.email).filter(Boolean))];
  } catch (err) {
    logger.warn({ workspaceId, err: err.message }, 'Could not resolve workspace emails');
    return [];
  }
}

/**
 * Raise a notification for a workspace.
 *
 * @param {string} workspaceId
 * @param {object} p
 * @param {string} p.title
 * @param {string} p.message      one or two sentences; shown in the bell menu
 * @param {string} [p.type]       NOTIFY_TYPE
 * @param {string} [p.details]
 * @param {string} [p.actionText] label for the deep link
 * @param {string} [p.actionLink] in-app path, e.g. '/number_verification'
 * @param {boolean} [p.email=false] also send email. Reserve for things a
 *   customer would want to know while not looking at the app.
 * @returns {Promise<{notified: boolean, emailed: boolean}>} never throws
 */
export async function notifyWorkspace(workspaceId, {
  title, message, type = NOTIFY_TYPE.INFO, details = null,
  actionText = null, actionLink = null, email = false,
} = {}) {
  let notified = false;
  let emailed = false;

  try {
    const row = await prisma.notification.create({
      data: { workspaceId, title, message, type, details, actionText, actionLink },
    });
    notified = true;
    // Live push to any open tab. Best-effort by nature — a closed stream is
    // normal, not an error.
    try { broadcast(workspaceId, 'notification:new', row); } catch { /* no listeners */ }
  } catch (err) {
    logger.error({ workspaceId, title, err: err.message }, 'Could not record a notification');
  }

  if (email && isMailerConfigured()) {
    const recipients = await workspaceEmails(workspaceId);
    for (const to of recipients) {
      try {
        await sendMail({
          to,
          subject: title,
          text: details ? `${message}\n\n${details}` : message,
        });
        emailed = true;
      } catch (err) {
        // Logged, never thrown. The in-app notification is already recorded, so
        // the customer is not left with nothing.
        logger.warn({ workspaceId, to, err: err.message }, 'Could not email a notification');
      }
    }
  } else if (email && !isMailerConfigured()) {
    // Worth a line in the log: UI copy promises email, and this is the one
    // condition under which that promise silently is not kept.
    logger.warn(
      { workspaceId, title },
      'Notification wanted email but no mailer is configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD/EMAIL_FROM)',
    );
  }

  return { notified, emailed };
}
