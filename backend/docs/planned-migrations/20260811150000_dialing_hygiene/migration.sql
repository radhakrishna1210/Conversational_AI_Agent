-- Dialling hygiene: suppression, dial caps, warm-up, health/quarantine, retries.
--
-- Hand-written and strictly additive, for the same reason as
-- 20260811120000_dlt_compliance: `prisma migrate diff` against this deployment
-- emits unrelated destructive DDL because schema.prisma has drifted from the
-- live Supabase database. IF NOT EXISTS guards throughout so the migration is
-- safe to re-run after a partial apply.
--
-- Two new tables, seven columns on VoiceNumber, four on Campaign, three on
-- CampaignRecipient. Nothing is dropped or altered in place, and every new
-- column is nullable or defaulted so existing rows stay valid.

-- ─── VoiceNumber: warm-up, health, quarantine ───────────────────────────────
ALTER TABLE "VoiceNumber" ADD COLUMN IF NOT EXISTS "warmupStartedAt" TIMESTAMP(3);
ALTER TABLE "VoiceNumber" ADD COLUMN IF NOT EXISTS "lastHealthAt" TIMESTAMP(3);
ALTER TABLE "VoiceNumber" ADD COLUMN IF NOT EXISTS "healthSample" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "VoiceNumber" ADD COLUMN IF NOT EXISTS "healthAnswerRate" DOUBLE PRECISION;
ALTER TABLE "VoiceNumber" ADD COLUMN IF NOT EXISTS "healthShortRate" DOUBLE PRECISION;
ALTER TABLE "VoiceNumber" ADD COLUMN IF NOT EXISTS "quarantinedAt" TIMESTAMP(3);
ALTER TABLE "VoiceNumber" ADD COLUMN IF NOT EXISTS "quarantineReason" TEXT;

-- ─── Campaign: call window + retry policy ───────────────────────────────────
-- maxAttempts defaults to 1 so every campaign that exists today keeps its
-- current single-attempt behaviour. Retry is opt-in, never retroactive.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "windowStartMin" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "windowEndMin" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "maxAttempts" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "retryBackoffMin" INTEGER NOT NULL DEFAULT 240;

-- ─── CampaignRecipient: skip reason + retry scheduling ──────────────────────
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "skipReason" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "nextEligibleAt" TIMESTAMP(3);

-- The dispatcher's batch query selects pending + due retries in one pass.
CREATE INDEX IF NOT EXISTS "CampaignRecipient_campaignId_status_nextEligibleAt_idx"
    ON "CampaignRecipient"("campaignId", "status", "nextEligibleAt");

-- ─── SuppressionEntry ───────────────────────────────────────────────────────
-- A null workspaceId is a platform-wide suppression. Postgres treats NULLs as
-- distinct in a unique index, so the unique constraint below does NOT dedupe
-- platform-wide rows; suppression.service.js reads before inserting those.
CREATE TABLE IF NOT EXISTS "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SuppressionEntry_phoneNumber_idx"
    ON "SuppressionEntry"("phoneNumber");
CREATE INDEX IF NOT EXISTS "SuppressionEntry_reason_expiresAt_idx"
    ON "SuppressionEntry"("reason", "expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "SuppressionEntry_workspaceId_phoneNumber_reason_key"
    ON "SuppressionEntry"("workspaceId", "phoneNumber", "reason");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SuppressionEntry_workspaceId_fkey'
    ) THEN
        ALTER TABLE "SuppressionEntry"
            ADD CONSTRAINT "SuppressionEntry_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── NumberDialCounter ──────────────────────────────────────────────────────
-- dialDate is an IST calendar date (YYYY-MM-DD), not a timestamp: the cap is a
-- per-day limit in the recipient's timezone, which is how a carrier abuse desk
-- reads volume. Storing it as text keeps the unique key trivially correct
-- without depending on the database's session timezone.
CREATE TABLE IF NOT EXISTS "NumberDialCounter" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "dialDate" TEXT NOT NULL,
    "dialled" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NumberDialCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NumberDialCounter_phoneNumber_dialDate_key"
    ON "NumberDialCounter"("phoneNumber", "dialDate");
CREATE INDEX IF NOT EXISTS "NumberDialCounter_dialDate_idx"
    ON "NumberDialCounter"("dialDate");
