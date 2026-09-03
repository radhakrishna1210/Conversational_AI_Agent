-- Voice (bulk call) campaigns.
--
-- Campaign was built for WhatsApp broadcasts, so templateId and whatsappNumberId
-- are NOT NULL. A voice campaign has neither, which is why createBulkCampaign
-- could never insert a row and the Bulk Call page had zero campaigns. Relax both
-- and mark the channel explicitly rather than inferring it from a null column.

ALTER TABLE "Campaign" ALTER COLUMN "templateId" DROP NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "whatsappNumberId" DROP NOT NULL;

-- Existing rows are all WhatsApp broadcasts; the default keeps them correct.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'WHATSAPP';
-- Caller IDs to rotate across calls. Rotation spreads volume over several
-- numbers, which is what keeps a high-volume campaign from being flagged as spam.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "fromNumbers" JSONB;
-- 'conversation' (bundled xAI/ElevenLabs agent) or 'greeting' (one-way message).
-- Resolved and stored at launch so the record shows what was actually dialled.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "callMode" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "lastError" TEXT;

-- Per-recipient rows for voice campaigns come from an uploaded CSV, so they have
-- a phone number but no Contact row.
ALTER TABLE "CampaignRecipient" ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "callLogId" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);

-- Makes recipient creation idempotent: re-uploading or re-launching a campaign
-- cannot double-dial a number. (Postgres treats NULLs as distinct, so this does
-- not collide with the WhatsApp rows, whose phoneNumber is NULL.)
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignRecipient_campaignId_phoneNumber_key"
  ON "CampaignRecipient"("campaignId", "phoneNumber");

-- The dispatcher pages through pending recipients on every batch.
CREATE INDEX IF NOT EXISTS "CampaignRecipient_campaignId_status_idx"
  ON "CampaignRecipient"("campaignId", "status");
