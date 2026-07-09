-- CreateTable: agents
CREATE TABLE IF NOT EXISTS "agents" (
    "id"                   TEXT NOT NULL,
    "workspaceId"          TEXT NOT NULL,
    "name"                 TEXT NOT NULL,
    "language"             TEXT,
    "llm"                  TEXT,
    "voice"                TEXT,
    "aiModel"              TEXT,
    "transcription"        TEXT,
    "welcomeMessage"       TEXT,
    "languages"            TEXT,
    "flowItems"            TEXT,
    "maxDuration"          INTEGER NOT NULL DEFAULT 30,
    "silenceTimeout"       INTEGER NOT NULL DEFAULT 5,
    "dynamicEnabled"       BOOLEAN NOT NULL DEFAULT true,
    "interruptibleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "kbFiles"              INTEGER NOT NULL DEFAULT 0,
    "search"               TEXT NOT NULL DEFAULT 'Off',
    "postCall"             TEXT NOT NULL DEFAULT 'None',
    "integrations"         TEXT NOT NULL DEFAULT 'None',
    "status"               TEXT NOT NULL DEFAULT 'active',
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agents_workspaceId_idx" ON "agents"("workspaceId");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Call
CREATE TABLE IF NOT EXISTS "Call" (
    "id"           TEXT NOT NULL,
    "workspaceId"  TEXT NOT NULL,
    "assistantId"  TEXT,
    "direction"    TEXT NOT NULL DEFAULT 'OUTBOUND',
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "fromNumber"   TEXT NOT NULL,
    "toNumber"     TEXT NOT NULL,
    "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt"   TIMESTAMP(3),
    "endedAt"      TIMESTAMP(3),
    "duration"     INTEGER NOT NULL DEFAULT 0,
    "cost"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recordingUrl" TEXT,
    "transcript"   TEXT,
    "summary"      TEXT,
    "sentiment"    TEXT,
    "outcome"      TEXT,
    "tags"         TEXT NOT NULL DEFAULT '',
    "notes"        TEXT,
    "source"       TEXT NOT NULL DEFAULT 'manual',
    "campaignId"   TEXT,
    "qualityScore" INTEGER,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes for Call
CREATE INDEX IF NOT EXISTS "Call_workspaceId_startedAt_idx"  ON "Call"("workspaceId", "startedAt");
CREATE INDEX IF NOT EXISTS "Call_workspaceId_status_idx"     ON "Call"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "Call_workspaceId_assistantId_idx" ON "Call"("workspaceId", "assistantId");
CREATE INDEX IF NOT EXISTS "Call_workspaceId_direction_idx"  ON "Call"("workspaceId", "direction");
CREATE INDEX IF NOT EXISTS "Call_workspaceId_sentiment_idx"  ON "Call"("workspaceId", "sentiment");
CREATE INDEX IF NOT EXISTS "Call_workspaceId_outcome_idx"    ON "Call"("workspaceId", "outcome");
CREATE INDEX IF NOT EXISTS "Call_workspaceId_source_idx"     ON "Call"("workspaceId", "source");
CREATE INDEX IF NOT EXISTS "Call_startedAt_idx"              ON "Call"("startedAt");
CREATE INDEX IF NOT EXISTS "Call_assistantId_startedAt_idx"  ON "Call"("assistantId", "startedAt");

-- AddForeignKeys for Call
ALTER TABLE "Call" ADD CONSTRAINT "Call_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Call" ADD CONSTRAINT "Call_assistantId_fkey"
    FOREIGN KEY ("assistantId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
