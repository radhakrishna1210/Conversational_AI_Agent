export const ROLES = {
  // Platform owner. Manages the whole platform and has access to everything,
  // including the /admin panel. Assigned by email via SUPER_ADMIN_EMAIL in .env.
  SUPER_ADMIN: 'Superadmin',
  // Standard user. Full access to all workspace features (there is no separate
  // Admin role); cannot access the platform /admin panel.
  MEMBER: 'Member',
};
