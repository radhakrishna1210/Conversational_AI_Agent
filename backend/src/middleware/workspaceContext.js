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
  if (req.authType === 'apikey' && req.workspace?.id === workspaceId) {
    return next();
  }

  if (process.env.DB_STATUS === 'unavailable' || process.env.USE_MOCK_AUTH === 'true') {
    if (process.env.USE_MOCK_AUTH === 'true') {
      // Auto-provision the mock workspace into the database to satisfy foreign keys
      await prisma.workspace.upsert({
        where: { id: workspaceId },
        update: {},
        create: { id: workspaceId, name: 'Mock Workspace', slug: `mock-${workspaceId}` }
      }).catch(() => {});
    }
    
    req.workspace = { id: workspaceId, name: 'Mock Workspace' };
    req.membership = { userId: req.user.userId, workspaceId, role: 'Admin' };
    req.user.role = 'Admin';
    return next();
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: req.user.userId, workspaceId } },
    include: { workspace: true },
  });


  if (!membership) {
    logger.warn({
      msg: 'WorkspaceContext: 403 Not a member',
      requestUserId: req.user.userId,
      requestEmail: req.user.email,
      requestWorkspaceId: workspaceId
    });
    return res.status(403).json({ 
      error: 'Not a member of this workspace',
      debug: {
        requestWorkspaceId: workspaceId,
        requestUserId: req.user.userId,
        requestEmail: req.user.email
      }
    });
  }

  req.workspace = membership.workspace;
  req.membership = membership;
  req.user.role = membership.role; // Ensure role reflects workspace membership
  next();
};
