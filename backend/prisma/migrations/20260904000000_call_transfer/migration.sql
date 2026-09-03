-- CreateTable: one row per attempted human handover on a call.
-- See prisma/schema.prisma (model CallTransfer) and
-- backend/src/services/telephony/transfer.service.js.
CREATE TABLE IF NOT EXISTS "CallTransfer" (
    "id" TEXT NOT NULL,
    "callLogId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "carrier" TEXT,
    "carrierCallId" TEXT,
    "target" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'announce',
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "error" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dialedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "humanLegSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CallTransfer_callLogId_idx" ON "CallTransfer"("callLogId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CallTransfer_workspaceId_agentId_requestedAt_idx" ON "CallTransfer"("workspaceId", "agentId", "requestedAt");
