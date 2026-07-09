-- CreateTable: Notification
CREATE TABLE IF NOT EXISTS "Notification" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "message"     TEXT NOT NULL,
    "type"        TEXT NOT NULL DEFAULT 'INFO',
    "read"        BOOLEAN NOT NULL DEFAULT false,
    "details"     TEXT,
    "actionText"  TEXT,
    "actionLink"  TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_workspaceId_read_createdAt_idx"
    ON "Notification"("workspaceId", "read", "createdAt");

-- AddForeignKey (only if it doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Notification_workspaceId_fkey'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
