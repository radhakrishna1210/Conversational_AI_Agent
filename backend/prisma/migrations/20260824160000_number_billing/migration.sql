-- Recurring billing for rented numbers
-- (NUMBER_PURCHASE_MARKETPLACE.md phase D).
--
-- A number costs us roughly ₹200/month for as long as we hold it, every month,
-- whether or not the client is still paying. Before this, nothing debited a
-- wallet for a number and nothing knew when the next charge was due — so a
-- rented number was a permanent unbilled cost.
--
-- Four nullable columns on VoiceNumber. `status` needs no DDL: it is already a
-- free-text column documented as ACTIVE | RELEASED, and this adds the value
-- SUSPENDED_NONPAYMENT to that set.
--
-- Hand-written and strictly additive, for the same reason as
-- 20260811160000_plivo_subaccount and 20260824120000_plivo_compliance_end_user:
-- `prisma migrate diff` against this deployment emits unrelated destructive DDL
-- because schema.prisma has drifted from the live Supabase database. Nothing
-- altered, nothing dropped, every statement safe to re-run.

-- What Plivo charges us. Reconciliation only — never a client-facing price.
ALTER TABLE "VoiceNumber"
    ADD COLUMN IF NOT EXISTS "carrierMonthlyCents" INTEGER;

-- What the client pays, frozen at rent time so a rate-card change does not
-- retroactively reprice a live number.
ALTER TABLE "VoiceNumber"
    ADD COLUMN IF NOT EXISTS "clientMonthlyCents" INTEGER;

ALTER TABLE "VoiceNumber"
    ADD COLUMN IF NOT EXISTS "nextRenewalAt" TIMESTAMP(3);

ALTER TABLE "VoiceNumber"
    ADD COLUMN IF NOT EXISTS "renewalFailedAt" TIMESTAMP(3);

-- The renewal sweep's only query: numbers due for a charge. Without it the
-- sweep table-scans VoiceNumber every hour forever.
CREATE INDEX IF NOT EXISTS "VoiceNumber_nextRenewalAt_idx"
    ON "VoiceNumber"("nextRenewalAt")
    WHERE "nextRenewalAt" IS NOT NULL;
