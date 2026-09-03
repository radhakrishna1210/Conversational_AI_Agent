-- Contacts and clusters.
--
-- Bulk campaigns used to swallow their own CSV: the numbers went straight into
-- CampaignRecipient rows and the list ceased to exist as anything reusable. This
-- introduces the two objects the product was missing — a Contact (one row per
-- person per workspace) and a ContactCluster (a named list) — and makes the
-- campaign point at clusters rather than at a file.
--
-- Strictly additive. Every existing campaign keeps its recipient rows untouched;
-- Campaign."clusterIds" and CampaignRecipient."contactId" are both nullable, so
-- a campaign created before this migration reads back exactly as it did.
--
-- Note: CampaignRecipient."contactId" existed once (WhatsApp era) and was
-- dropped with that feature. It is recreated here pointing at the new Contact
-- table; the old FK is long gone, so there is nothing to drop first.

-- ── Contact ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Contact" (
  "id"           TEXT NOT NULL,
  "workspaceId"  TEXT NOT NULL,
  "phoneNumber"  TEXT NOT NULL,
  "name"         TEXT,
  "email"        TEXT,
  "company"      TEXT,
  "attributes"   JSONB,
  "status"       TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes"        TEXT,
  "lastCalledAt" TIMESTAMP(3),
  "callCount"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- One person, one row. This is what makes re-importing a list an update rather
-- than a second copy of the same human being.
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_workspaceId_phoneNumber_key"
  ON "Contact"("workspaceId", "phoneNumber");
CREATE INDEX IF NOT EXISTS "Contact_workspaceId_status_idx"
  ON "Contact"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "Contact_workspaceId_createdAt_idx"
  ON "Contact"("workspaceId", "createdAt");

-- ── ContactCluster ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ContactCluster" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "source"      TEXT NOT NULL DEFAULT 'MANUAL',
  "csvFileName" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactCluster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactCluster_workspaceId_name_key"
  ON "ContactCluster"("workspaceId", "name");
CREATE INDEX IF NOT EXISTS "ContactCluster_workspaceId_idx"
  ON "ContactCluster"("workspaceId");

-- ── ContactClusterMember ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ContactClusterMember" (
  "id"        TEXT NOT NULL,
  "clusterId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "addedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactClusterMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactClusterMember_clusterId_contactId_key"
  ON "ContactClusterMember"("clusterId", "contactId");
CREATE INDEX IF NOT EXISTS "ContactClusterMember_contactId_idx"
  ON "ContactClusterMember"("contactId");

-- ── Campaign / CampaignRecipient links ────────────────────────────────────
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "clusterIds" JSONB;
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "contactId" TEXT;

CREATE INDEX IF NOT EXISTS "CampaignRecipient_contactId_idx"
  ON "CampaignRecipient"("contactId");

-- ── Foreign keys ──────────────────────────────────────────────────────────
-- Guarded individually: ADD CONSTRAINT has no IF NOT EXISTS, and this migration
-- must stay safe to re-run against a database where it partially applied.
DO $$ BEGIN
  ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContactCluster" ADD CONSTRAINT "ContactCluster_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContactClusterMember" ADD CONSTRAINT "ContactClusterMember_clusterId_fkey"
    FOREIGN KEY ("clusterId") REFERENCES "ContactCluster"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContactClusterMember" ADD CONSTRAINT "ContactClusterMember_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SET NULL, not CASCADE: deleting a contact must not erase the record that we
-- called them. The recipient row keeps its phoneNumber and its outcome.
DO $$ BEGIN
  ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
