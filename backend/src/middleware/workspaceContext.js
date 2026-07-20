import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';

/**
 * Loads the workspace from :workspaceId param and verifies
 * the authenticated user is a member of it.
 * Sets req.workspace and req.membership.
 */
export const workspaceContext = async (req, res, next) => {
  const workspaceId = req.params.workspaceId;
  if (!workspaceId) return next();

  // For API key auth, workspace is already set in authenticate middleware
  if (req.authType === 'apikey') {
    if (req.workspace?.id !== workspaceId) {
      return res.status(403).json({ error: 'API key does not belong to this workspace' });
    }
    return next();
  }

  // Explicit local-dev mock mode only (never enabled implicitly)
  if (process.env.USE_MOCK_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      update: {},
      create: { id: workspaceId, name: 'Mock Workspace', slug: `mock-${workspaceId}` },
    }).catch(() => {});
    req.workspace = { id: workspaceId, name: 'Mock Workspace' };
    req.membership = { userId: req.user.userId, workspaceId, role: req.user.role ?? 'Member' };
    return next();
  }

  // Normal path: the user must actually be a member of the requested workspace.
  let membership = null;
  try {
    membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.userId, workspaceId } },
      include: { workspace: true },
    });
  } catch (dbErr) {
    // Fail closed: never grant mock Admin access because the DB is down.
    logger.error(`WorkspaceContext: DB lookup failed: ${dbErr.message}`);
    return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
  }

  if (!membership) {
    logger.warn({
      msg: 'WorkspaceContext: 403 Not a member',
      requestUserId: req.user.userId,
      requestWorkspaceId: workspaceId,
    });
    return res.status(403).json({ error: 'Not a member of this workspace' });
  }

  req.workspace = membership.workspace;
  req.membership = membership;
  req.user.role = membership.role; // Ensure role reflects workspace membership
  next();
};
