-- CreateTable: Integration
CREATE TABLE IF NOT EXISTS "Integration" (
    "id"              TEXT NOT NULL,
    "workspaceId"     TEXT NOT NULL,
    "provider"        TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'disconnected',
    "connected"       BOOLEAN NOT NULL DEFAULT false,
    "accountId"       TEXT,
    "accountLabel"    TEXT,
    "lastSyncAt"      TIMESTAMP(3),
    "lastError"       TEXT,
    "tokenExpiresAt"  TIMESTAMP(3),
    "webhookStatus"   TEXT NOT NULL DEFAULT 'not_configured',
    "webhookEnabled"  BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedCount" INTEGER NOT NULL DEFAULT 0,
    "metadata"        TEXT DEFAULT '{}',
    "settingsJson"    TEXT NOT NULL DEFAULT '{}',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Integration_workspaceId_provider_key"
    ON "Integration"("workspaceId", "provider");

CREATE INDEX IF NOT EXISTS "Integration_workspaceId_status_idx"
    ON "Integration"("workspaceId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Integration_workspaceId_fkey') THEN
    ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: IntegrationToken
CREATE TABLE IF NOT EXISTS "IntegrationToken" (
    "id"                  TEXT NOT NULL,
    "integrationId"       TEXT NOT NULL,
    "workspaceId"         TEXT NOT NULL,
    "provider"            TEXT NOT NULL,
    "accessTokenCipher"   TEXT NOT NULL,
    "refreshTokenCipher"  TEXT,
    "tokenType"           TEXT,
    "scopes"              TEXT NOT NULL DEFAULT '',
    "expiresAt"           TIMESTAMP(3),
    "revokedAt"           TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationToken_integrationId_key"
    ON "IntegrationToken"("integrationId");

CREATE INDEX IF NOT EXISTS "IntegrationToken_workspaceId_provider_idx"
    ON "IntegrationToken"("workspaceId", "provider");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationToken_integrationId_fkey') THEN
    ALTER TABLE "IntegrationToken" ADD CONSTRAINT "IntegrationToken_integrationId_fkey"
      FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationToken_workspaceId_fkey') THEN
    ALTER TABLE "IntegrationToken" ADD CONSTRAINT "IntegrationToken_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: IntegrationLog
CREATE TABLE IF NOT EXISTS "IntegrationLog" (
    "id"            TEXT NOT NULL,
    "workspaceId"   TEXT NOT NULL,
    "integrationId" TEXT,
    "provider"      TEXT NOT NULL,
    "level"         TEXT NOT NULL DEFAULT 'info',
    "event"         TEXT NOT NULL,
    "message"       TEXT NOT NULL,
    "status"        TEXT,
    "metadata"      TEXT DEFAULT '{}',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntegrationLog_workspaceId_provider_createdAt_idx"
    ON "IntegrationLog"("workspaceId", "provider", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationLog_workspaceId_fkey') THEN
    ALTER TABLE "IntegrationLog" ADD CONSTRAINT "IntegrationLog_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationLog_integrationId_fkey') THEN
    ALTER TABLE "IntegrationLog" ADD CONSTRAINT "IntegrationLog_integrationId_fkey"
      FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: OAuthSession
CREATE TABLE IF NOT EXISTS "OAuthSession" (
    "id"            TEXT NOT NULL,
    "workspaceId"   TEXT NOT NULL,
    "integrationId" TEXT,
    "provider"      TEXT NOT NULL,
    "userId"        TEXT,
    "state"         TEXT NOT NULL,
    "codeVerifier"  TEXT,
    "redirectUri"   TEXT,
    "expiresAt"     TIMESTAMP(3) NOT NULL,
    "consumedAt"    TIMESTAMP(3),
    "metadata"      TEXT DEFAULT '{}',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthSession_state_key" ON "OAuthSession"("state");

CREATE INDEX IF NOT EXISTS "OAuthSession_workspaceId_provider_idx"
    ON "OAuthSession"("workspaceId", "provider");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OAuthSession_workspaceId_fkey') THEN
    ALTER TABLE "OAuthSession" ADD CONSTRAINT "OAuthSession_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OAuthSession_integrationId_fkey') THEN
    ALTER TABLE "OAuthSession" ADD CONSTRAINT "OAuthSession_integrationId_fkey"
      FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: SyncJob
CREATE TABLE IF NOT EXISTS "SyncJob" (
    "id"            TEXT NOT NULL,
    "workspaceId"   TEXT NOT NULL,
    "integrationId" TEXT,
    "provider"      TEXT NOT NULL,
    "jobType"       TEXT NOT NULL DEFAULT 'manual',
    "status"        TEXT NOT NULL DEFAULT 'queued',
    "attempts"      INTEGER NOT NULL DEFAULT 0,
    "scheduledAt"   TIMESTAMP(3),
    "startedAt"     TIMESTAMP(3),
    "completedAt"   TIMESTAMP(3),
    "error"         TEXT,
    "metadata"      TEXT DEFAULT '{}',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SyncJob_workspaceId_provider_status_idx"
    ON "SyncJob"("workspaceId", "provider", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SyncJob_workspaceId_fkey') THEN
    ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SyncJob_integrationId_fkey') THEN
    ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_integrationId_fkey"
      FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: IntegrationSetting
CREATE TABLE IF NOT EXISTS "IntegrationSetting" (
    "id"               TEXT NOT NULL,
    "workspaceId"      TEXT NOT NULL,
    "integrationId"    TEXT NOT NULL,
    "provider"         TEXT NOT NULL,
    "settingsJson"     TEXT NOT NULL DEFAULT '{}',
    "enabled"          BOOLEAN NOT NULL DEFAULT true,
    "webhookEnabled"   BOOLEAN NOT NULL DEFAULT false,
    "selectedChannels" TEXT DEFAULT '[]',
    "lastValidatedAt"  TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationSetting_integrationId_key"
    ON "IntegrationSetting"("integrationId");

CREATE INDEX IF NOT EXISTS "IntegrationSetting_workspaceId_provider_idx"
    ON "IntegrationSetting"("workspaceId", "provider");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationSetting_workspaceId_fkey') THEN
    ALTER TABLE "IntegrationSetting" ADD CONSTRAINT "IntegrationSetting_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationSetting_integrationId_fkey') THEN
    ALTER TABLE "IntegrationSetting" ADD CONSTRAINT "IntegrationSetting_integrationId_fkey"
      FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: WebhookEvent
CREATE TABLE IF NOT EXISTS "WebhookEvent" (
    "id"               TEXT NOT NULL,
    "workspaceId"      TEXT NOT NULL,
    "integrationId"    TEXT,
    "provider"         TEXT NOT NULL,
    "providerEventId"  TEXT,
    "eventType"        TEXT NOT NULL,
    "payload"          TEXT NOT NULL,
    "headers"          TEXT DEFAULT '{}',
    "signatureValid"   BOOLEAN NOT NULL DEFAULT true,
    "processingStatus" TEXT NOT NULL DEFAULT 'received',
    "processedAt"      TIMESTAMP(3),
    "error"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebhookEvent_workspaceId_provider_createdAt_idx"
    ON "WebhookEvent"("workspaceId", "provider", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookEvent_workspaceId_fkey') THEN
    ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookEvent_integrationId_fkey') THEN
    ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_integrationId_fkey"
      FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: CustomApiConfig
CREATE TABLE IF NOT EXISTS "CustomApiConfig" (
    "id"              TEXT NOT NULL,
    "workspaceId"     TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "endpointUrl"     TEXT NOT NULL,
    "method"          TEXT NOT NULL DEFAULT 'GET',
    "authType"        TEXT NOT NULL DEFAULT 'none',
    "authValueCipher" TEXT,
    "headersJson"     TEXT NOT NULL DEFAULT '{}',
    "queryParamsJson" TEXT NOT NULL DEFAULT '{}',
    "bodyTemplate"    TEXT,
    "enabled"         BOOLEAN NOT NULL DEFAULT true,
    "lastTestAt"      TIMESTAMP(3),
    "lastTestStatus"  INTEGER,
    "lastTestError"   TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomApiConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomApiConfig_workspaceId_name_idx"
    ON "CustomApiConfig"("workspaceId", "name");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomApiConfig_workspaceId_fkey') THEN
    ALTER TABLE "CustomApiConfig" ADD CONSTRAINT "CustomApiConfig_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
