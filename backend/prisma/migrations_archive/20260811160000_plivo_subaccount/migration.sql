-- Plivo subaccounts, one per workspace (PLIVO_INTEGRATION.md phase 2).
--
-- Hand-written and strictly additive, for the same reason as
-- 20260811120000_dlt_compliance: `prisma migrate diff` against this deployment
-- emits unrelated destructive DDL because schema.prisma has drifted from the
-- live Supabase database, and applying a generated diff would take the product
-- down. One new table, nothing altered, nothing dropped.
--
-- IF NOT EXISTS guards throughout so the migration is safe to re-run against a
-- database that has been reconciled by hand.

CREATE TABLE IF NOT EXISTS "PlivoSubaccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    -- Encrypted with lib/encryption.js (AES-256-CBC, ENCRYPTION_KEY). Plivo
    -- returns this token exactly once at creation; losing it orphans the
    -- subaccount, so it is never stored in plaintext and never logged.
    "authTokenEnc" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlivoSubaccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlivoSubaccount_workspaceId_key"
    ON "PlivoSubaccount"("workspaceId");

CREATE UNIQUE INDEX IF NOT EXISTS "PlivoSubaccount_authId_key"
    ON "PlivoSubaccount"("authId");

DO $$
BEGIN
    ALTER TABLE "PlivoSubaccount"
        ADD CONSTRAINT "PlivoSubaccount_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
