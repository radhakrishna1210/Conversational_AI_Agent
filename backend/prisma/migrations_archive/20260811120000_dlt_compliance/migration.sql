-- TRAI / DLT compliance onboarding.
--
-- Hand-written rather than generated. `prisma migrate diff` against this
-- deployment's database emits a large amount of unrelated destructive DDL —
-- it wants to drop ApiKey.createdById, three WorkspaceInvite columns and
-- several indexes — because schema.prisma has drifted from the live Supabase
-- database. Applying a generated diff here would take the product down. This
-- migration is strictly additive: four new tables and one nullable column.
--
-- IF NOT EXISTS guards throughout, for the same reason: this database has been
-- reconciled by hand before, and a migration that fails halfway because an
-- object already exists is worse than one that is safe to re-run.

-- ─── WorkspaceCompliance ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "WorkspaceCompliance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "useCase" TEXT,
    "entityName" TEXT,
    "legalEntityType" TEXT,
    "carrierApplicationStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
    "carrierApplicationRef" TEXT,
    "carrierApplicationAt" TIMESTAMP(3),
    "carrierRejectionReason" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'PLIVO',
    "peId" TEXT,
    "peOperator" TEXT,
    "peStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "peVerifiedAt" TIMESTAMP(3),
    "tmId" TEXT,
    "tmBindingStatus" TEXT NOT NULL DEFAULT 'NOT_BOUND',
    "tmBoundAt" TIMESTAMP(3),
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceCompliance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceCompliance_workspaceId_key"
    ON "WorkspaceCompliance"("workspaceId");

-- ─── ComplianceDocument ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "complianceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- One live document per kind: re-uploading a rejected GST certificate replaces
-- it rather than leaving both rows for a reviewer to disambiguate.
CREATE UNIQUE INDEX IF NOT EXISTS "ComplianceDocument_complianceId_kind_key"
    ON "ComplianceDocument"("complianceId", "kind");
CREATE INDEX IF NOT EXISTS "ComplianceDocument_complianceId_status_idx"
    ON "ComplianceDocument"("complianceId", "status");

-- ─── DltVoiceTemplate ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DltVoiceTemplate" (
    "id" TEXT NOT NULL,
    "complianceId" TEXT NOT NULL,
    "dltTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DltVoiceTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DltVoiceTemplate_complianceId_status_idx"
    ON "DltVoiceTemplate"("complianceId", "status");

-- ─── VoiceNumber ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "VoiceNumber" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerNumberId" TEXT,
    "subaccountId" TEXT,
    "series" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "headerStatus" TEXT NOT NULL DEFAULT 'NOT_REGISTERED',
    "headerRejectionReason" TEXT,
    "headerRegisteredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "dailyDialCap" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceNumber_pkey" PRIMARY KEY ("id")
);

-- Globally unique, not unique per workspace. A caller ID is bound to one
-- entity's DLT header registration, and its carrier reputation follows the
-- number — so the same number must never appear under two workspaces, even
-- after the first one churns.
CREATE UNIQUE INDEX IF NOT EXISTS "VoiceNumber_phoneNumber_key"
    ON "VoiceNumber"("phoneNumber");
CREATE INDEX IF NOT EXISTS "VoiceNumber_workspaceId_status_idx"
    ON "VoiceNumber"("workspaceId", "status");

-- ─── Agent → approved voice template ────────────────────────────────────────
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "dltTemplateId" TEXT;
CREATE INDEX IF NOT EXISTS "Agent_dltTemplateId_idx" ON "Agent"("dltTemplateId");

-- ─── Foreign keys ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceCompliance_workspaceId_fkey') THEN
        ALTER TABLE "WorkspaceCompliance"
            ADD CONSTRAINT "WorkspaceCompliance_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplianceDocument_complianceId_fkey') THEN
        ALTER TABLE "ComplianceDocument"
            ADD CONSTRAINT "ComplianceDocument_complianceId_fkey"
            FOREIGN KEY ("complianceId") REFERENCES "WorkspaceCompliance"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DltVoiceTemplate_complianceId_fkey') THEN
        ALTER TABLE "DltVoiceTemplate"
            ADD CONSTRAINT "DltVoiceTemplate_complianceId_fkey"
            FOREIGN KEY ("complianceId") REFERENCES "WorkspaceCompliance"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VoiceNumber_workspaceId_fkey') THEN
        ALTER TABLE "VoiceNumber"
            ADD CONSTRAINT "VoiceNumber_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- SET NULL, not CASCADE: deleting a voice template must not delete the
    -- agents that referenced it. They become non-compliant, which the gate
    -- reports; they do not disappear.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Agent_dltTemplateId_fkey') THEN
        ALTER TABLE "Agent"
            ADD CONSTRAINT "Agent_dltTemplateId_fkey"
            FOREIGN KEY ("dltTemplateId") REFERENCES "DltVoiceTemplate"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
