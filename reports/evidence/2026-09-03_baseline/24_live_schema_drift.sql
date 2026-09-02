-- DropForeignKey
ALTER TABLE "QueryCache" DROP CONSTRAINT "QueryCache_agentId_fkey";

-- DropForeignKey
ALTER TABLE "QueryCache" DROP CONSTRAINT "QueryCache_workspaceId_fkey";

-- DropTable
DROP TABLE "QueryCache";

-- CreateIndex
CREATE INDEX "VoiceNumber_nextRenewalAt_idx" ON "VoiceNumber"("nextRenewalAt");

