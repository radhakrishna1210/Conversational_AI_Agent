-- Carrier `end_user` facts for a Plivo compliance application
-- (NUMBER_PURCHASE_MARKETPLACE.md phase A).
--
-- Plivo's compliance API needs more about the legal entity than the DLT
-- checklist ever collected: a registration number (CIN or Udyam), a full
-- registered address, and a contact email for the entity rather than for the
-- account owner. Without all three the application is rejected on submission.
--
-- Hand-written and strictly additive, for the same reason as
-- 20260811160000_plivo_subaccount: `prisma migrate diff` against this
-- deployment emits unrelated destructive DDL because schema.prisma has drifted
-- from the live Supabase database. Three nullable columns, nothing altered,
-- nothing dropped, and every statement guarded so it is safe to re-run.

ALTER TABLE "WorkspaceCompliance"
    ADD COLUMN IF NOT EXISTS "registrationNumber" TEXT;

-- JSON: { addressLine1, city, state, postalCode, country }. Stored as TEXT to
-- match the convention the rest of this schema uses for JSON payloads
-- (WalletTransaction.metadata et al) — Prisma reads it as a string either way.
ALTER TABLE "WorkspaceCompliance"
    ADD COLUMN IF NOT EXISTS "registeredAddress" TEXT;

ALTER TABLE "WorkspaceCompliance"
    ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
