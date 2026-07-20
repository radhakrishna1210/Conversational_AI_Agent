import logger from '../lib/logger.js';
import { ROLES } from '../constants/roles.js';

/**
 * Role guard factory.
 * Usage: router.delete('/...', authorize('Member'), handler)
 *
 * The Superadmin (platform owner) always passes — full access to everything.
 * There is no Admin role; Member is the standard role for all workspace features.
 */
export const authorize = (...allowedRoles) => (req, res, next) => {
  const role = req.user?.role;
  if (role === ROLES.SUPER_ADMIN) return next();
  if (!role || !allowedRoles.includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

/**
 * Restrict route to the platform owner (Superadmin) only.
 * Gates the /admin platform panel. Logs unauthorized attempts.
 */
export const isAdminRole = (role) => String(role ?? '').trim().toLowerCase() === 'superadmin';

export const isAdmin = (req, res, next) => {
  if (!isAdminRole(req.user?.role)) {
    logger.warn({ userId: req.user?.id ?? req.user?.userId, role: req.user?.role }, 'Superadmin access denied');
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  next();
};
