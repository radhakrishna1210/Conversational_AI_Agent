-- WhatsApp confirmations after a call (Spandan -> ChatFlow).
-- See prisma/schema.prisma (models WhatsAppTemplateBinding, WhatsAppPostCallSend),
-- backend/src/services/whatsappTemplates.service.js and the `whatsapp` branch in
-- backend/src/controllers/platform.controller.js.

-- CreateTable: the approved-once, reused-forever binding between a Spandan preset
-- and the template it became on ChatFlow/Meta.
CREATE TABLE IF NOT EXISTS "WhatsAppTemplateBinding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "chatflowTemplateId" TEXT,
    "chatflowName" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectedReason" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplateBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: the dedupe guard. ChatFlow's own Template table has no unique
-- constraint on (workspaceId, name, language) and its send path resolves with
-- findFirst, so submitting one preset twice would leave two templates and make
-- later sends pick between them at random. This is what prevents that.
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppTemplateBinding_workspaceId_presetId_key" ON "WhatsAppTemplateBinding"("workspaceId", "presetId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WhatsAppTemplateBinding_workspaceId_idx" ON "WhatsAppTemplateBinding"("workspaceId");

-- CreateTable: one send attempt per (call, post-call destination).
CREATE TABLE IF NOT EXISTS "WhatsAppPostCallSend" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "callLogId" TEXT NOT NULL,
    "postCallConfigId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recipient" TEXT,
    "chatflowMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppPostCallSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: this is the idempotency key, not a nicety. ChatFlow's
-- POST /public/messages accepts no idempotency token, so a retry after a lost
-- response would send the customer a second confirmation. The row is claimed
-- before ChatFlow is called; a violation here against a SENT row means stop.
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppPostCallSend_callLogId_postCallConfigId_key" ON "WhatsAppPostCallSend"("callLogId", "postCallConfigId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WhatsAppPostCallSend_workspaceId_status_idx" ON "WhatsAppPostCallSend"("workspaceId", "status");

-- CreateIndex: delivery-status webhooks arrive keyed on ChatFlow's message id.
CREATE INDEX IF NOT EXISTS "WhatsAppPostCallSend_chatflowMessageId_idx" ON "WhatsAppPostCallSend"("chatflowMessageId");

-- AddForeignKey
ALTER TABLE "WhatsAppTemplateBinding" DROP CONSTRAINT IF EXISTS "WhatsAppTemplateBinding_workspaceId_fkey";
ALTER TABLE "WhatsAppTemplateBinding" ADD CONSTRAINT "WhatsAppTemplateBinding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppPostCallSend" DROP CONSTRAINT IF EXISTS "WhatsAppPostCallSend_workspaceId_fkey";
ALTER TABLE "WhatsAppPostCallSend" ADD CONSTRAINT "WhatsAppPostCallSend_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
