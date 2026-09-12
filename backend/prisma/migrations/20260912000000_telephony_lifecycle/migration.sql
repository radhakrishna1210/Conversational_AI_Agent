-- Telephony lifecycle: dialling as the workspace's Plivo subaccount, inbound
-- routing for rented numbers, customer number requests, and carrier usage
-- reconciliation. See backend/docs/PLIVO_INTEGRATION.md §13.
--
-- Hand-written and additive, like the migrations before it: every new column is
-- nullable, every statement is guarded, so the file is safe to re-run and needs
-- no backfill.

-- Which carrier placed a phone leg, from which caller ID, and the carrier's own
-- id for it. Reconciliation matches the carrier's call records on
-- providerCallId; fromNumber is also what dial hygiene has been waiting on.
ALTER TABLE "AgentCallLog" ADD COLUMN IF NOT EXISTS "provider"       TEXT;
ALTER TABLE "AgentCallLog" ADD COLUMN IF NOT EXISTS "providerCallId" TEXT;
ALTER TABLE "AgentCallLog" ADD COLUMN IF NOT EXISTS "fromNumber"     TEXT;
CREATE INDEX IF NOT EXISTS "AgentCallLog_providerCallId_idx" ON "AgentCallLog"("providerCallId");

-- The agent that answers a call placed TO a rented number. A plain column, not a
-- foreign key: deleting an agent must leave the number in place and unrouted,
-- not cascade into a rented number we are still paying for.
ALTER TABLE "VoiceNumber" ADD COLUMN IF NOT EXISTS "inboundAgentId" TEXT;

-- The Plivo application created under the subaccount and attached to every
-- number rented into it.
ALTER TABLE "PlivoSubaccount" ADD COLUMN IF NOT EXISTS "appId" TEXT;

-- A client asking for a specific number while self-serve renting is switched
-- off. An admin fulfils it (which rents it) or declines it.
CREATE TABLE IF NOT EXISTS "NumberRequest" (
    "id"            TEXT NOT NULL,
    "workspaceId"   TEXT NOT NULL,
    "phoneNumber"   TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'PENDING',
    "note"          TEXT,
    "requestedBy"   TEXT,
    "resolvedBy"    TEXT,
    "resolvedAt"    TIMESTAMP(3),
    "resolution"    TEXT,
    "voiceNumberId" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NumberRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NumberRequest_status_createdAt_idx" ON "NumberRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "NumberRequest_workspaceId_status_idx" ON "NumberRequest"("workspaceId", "status");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NumberRequest_workspaceId_fkey') THEN
    ALTER TABLE "NumberRequest" ADD CONSTRAINT "NumberRequest_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- One pass of carrier usage against our own call records.
CREATE TABLE IF NOT EXISTS "CarrierReconciliationRun" (
    "id"            TEXT NOT NULL,
    "provider"      TEXT NOT NULL DEFAULT 'PLIVO',
    "trigger"       TEXT NOT NULL DEFAULT 'manual',
    "windowStart"   TIMESTAMP(3) NOT NULL,
    "windowEnd"     TIMESTAMP(3) NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'RUNNING',
    "summary"       JSONB,
    "discrepancies" JSONB,
    "error"         TEXT,
    "triggeredBy"   TEXT,
    "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"    TIMESTAMP(3),

    CONSTRAINT "CarrierReconciliationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CarrierReconciliationRun_provider_startedAt_idx" ON "CarrierReconciliationRun"("provider", "startedAt");
