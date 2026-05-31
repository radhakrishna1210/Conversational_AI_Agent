import logger from '../lib/logger.js';

/**
 * Role guard factory.
 * Usage: router.delete('/...', authorize('Admin'), handler)
 *        router.get('/...', authorize('Admin', 'Agent'), handler)
 */
export const authorize = (...allowedRoles) => (req, res, next) => {
  const role = req.user?.role;
  if (!role || !allowedRoles.includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

/**
 * Restrict route to Admin role only.
 * Logs unauthorized attempts with the requesting user's id.
 */
export const isAdmin = (req, res, next) => {
  if (req.user?.role !== 'Admin') {
    logger.warn({ userId: req.user?.id ?? req.user?.userId, role: req.user?.role }, 'Admin access denied');
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
