-- Voice broadcast (one-way).
--
-- A broadcast plays a fixed recording to a list and hangs up. It reuses the
-- contact/cluster address book exactly as bulk calling does — nothing about
-- Contact, ContactCluster or ContactClusterMember changes here — and adds the
-- three things it needs of its own: the audio asset, the send, and the dial.
--
-- Strictly additive: three new tables, no column added to and no column altered
-- on any existing table. Nothing that predates this migration reads back
-- differently.

-- ── BroadcastRecording ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BroadcastRecording" (
  "id"            TEXT NOT NULL,
  "workspaceId"   TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "source"        TEXT NOT NULL DEFAULT 'UPLOAD',
  "storedPath"    TEXT NOT NULL,
  "mimeType"      TEXT NOT NULL DEFAULT 'audio/mpeg',
  "sizeBytes"     INTEGER NOT NULL DEFAULT 0,
  "durationSec"   INTEGER NOT NULL DEFAULT 0,
  "scriptText"    TEXT,
  "voiceId"       TEXT,
  "status"        TEXT NOT NULL DEFAULT 'READY',
  "failureReason" TEXT,
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BroadcastRecording_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BroadcastRecording_workspaceId_createdAt_idx"
  ON "BroadcastRecording"("workspaceId", "createdAt");

-- ── Broadcast ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Broadcast" (
  "id"              TEXT NOT NULL,
  "workspaceId"     TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "recordingId"     TEXT NOT NULL,
  "clusterIds"      JSONB,
  "fromNumbers"     JSONB,
  "fromNumber"      TEXT,
  "repeatCount"     INTEGER NOT NULL DEFAULT 1,
  "status"          TEXT NOT NULL DEFAULT 'DRAFT',
  "scheduledAt"     TIMESTAMP(3),
  "launchedAt"      TIMESTAMP(3),
  "completedAt"     TIMESTAMP(3),
  "lastError"       TEXT,
  "progress"        INTEGER NOT NULL DEFAULT 0,
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "answered"        INTEGER NOT NULL DEFAULT 0,
  "failed"          INTEGER NOT NULL DEFAULT 0,
  "spentCents"      INTEGER NOT NULL DEFAULT 0,
  "createdById"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Broadcast_workspaceId_createdAt_idx"
  ON "Broadcast"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "Broadcast_workspaceId_status_idx"
  ON "Broadcast"("workspaceId", "status");

-- ── BroadcastRecipient ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BroadcastRecipient" (
  "id"                 TEXT NOT NULL,
  "broadcastId"        TEXT NOT NULL,
  "phoneNumber"        TEXT NOT NULL,
  "contactId"          TEXT,
  "status"             TEXT NOT NULL DEFAULT 'pending',
  "attempts"           INTEGER NOT NULL DEFAULT 0,
  "providerCallId"     TEXT,
  "provider"           TEXT,
  "fromNumber"         TEXT,
  "durationSec"        INTEGER NOT NULL DEFAULT 0,
  "failureReason"      TEXT,
  "startedAt"          TIMESTAMP(3),
  "answeredAt"         TIMESTAMP(3),
  "endedAt"            TIMESTAMP(3),
  "billingStatus"      TEXT NOT NULL DEFAULT 'PENDING',
  "billedCents"        INTEGER NOT NULL DEFAULT 0,
  "ratePerMinuteCents" INTEGER,
  CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- Idempotent recipient creation, exactly as CampaignRecipient does it: a resumed
-- or duplicated build of the list can never produce a second dial to one person.
CREATE UNIQUE INDEX IF NOT EXISTS "BroadcastRecipient_broadcastId_phoneNumber_key"
  ON "BroadcastRecipient"("broadcastId", "phoneNumber");
CREATE INDEX IF NOT EXISTS "BroadcastRecipient_broadcastId_status_idx"
  ON "BroadcastRecipient"("broadcastId", "status");
CREATE INDEX IF NOT EXISTS "BroadcastRecipient_contactId_idx"
  ON "BroadcastRecipient"("contactId");
-- The carrier's status callback arrives knowing only its own call id.
CREATE INDEX IF NOT EXISTS "BroadcastRecipient_providerCallId_idx"
  ON "BroadcastRecipient"("providerCallId");

-- ── Foreign keys ──────────────────────────────────────────────────────────
-- Guarded individually: ADD CONSTRAINT has no IF NOT EXISTS, and this migration
-- must stay safe to re-run against a database where it partially applied.
DO $$ BEGIN
  ALTER TABLE "BroadcastRecording" ADD CONSTRAINT "BroadcastRecording_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RESTRICT (Prisma's default for a required relation): deleting a recording that
-- a broadcast was sent with would leave that send unable to say what it played.
-- The recording service refuses the delete with an explanation instead.
DO $$ BEGIN
  ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_recordingId_fkey"
    FOREIGN KEY ("recordingId") REFERENCES "BroadcastRecording"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey"
    FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SET NULL, not CASCADE: deleting a contact must not erase the record that we
-- called them, nor the charge that call carried.
DO $$ BEGIN
  ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
