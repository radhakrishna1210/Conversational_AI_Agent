-- Retire the legacy 'Owner' workspace role.
--
-- `constants/roles.js` defines exactly two roles — 'Member' and 'Superadmin' —
-- and no code path has assigned 'Owner' since the roles were collapsed. But ten
-- membership rows predating that change still carried it, and `authorize()`
-- accepts only the two it knows about. The result was silent and total: every
-- one of those accounts could read the whole product and write none of it —
-- no campaign creation, no start/pause, no API keys, no compliance submission,
-- no contacts — all answered with a bare "Insufficient permissions".
--
-- This grants access those accounts were always meant to have and takes none
-- away. 'Superadmin' rows are deliberately untouched: they outrank Member, and
-- rewriting them would be a demotion.
--
-- Idempotent, and a no-op on any database that never held the legacy value.

UPDATE "WorkspaceMember" SET "role" = 'Member' WHERE "role" = 'Owner';
