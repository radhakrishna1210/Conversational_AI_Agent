-- RAG for knowledge base files: chunk + embed a file once at upload instead of
-- pasting its whole (capped) text into every LLM prompt on every turn.
--
-- Hand-written rather than `prisma migrate dev`-generated: pgvector's `vector`
-- type and its similarity index aren't expressible in schema.prisma (the
-- KbChunk.embedding field is `Unsupported("vector(1536)")` there) so the real
-- column type and index have to be declared here directly.
--
-- Every statement is idempotent (IF NOT EXISTS) because
-- scripts/prisma-migrate-deploy.js disables Prisma's advisory lock for this
-- project's Supabase/PgBouncer setup, so concurrent server instances booting at
-- once could theoretically race to apply this.

CREATE EXTENSION IF NOT EXISTS vector;

-- KbFile: processing state for the background chunk+embed pipeline. 'ready' is
-- the default so every pre-existing row is untouched by this migration — it
-- only ever matters for files large enough to be chunked (see
-- kbChunking.service.js's size threshold).
ALTER TABLE "KbFile" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE "KbFile" ADD COLUMN IF NOT EXISTS "chunked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KbFile" ADD COLUMN IF NOT EXISTS "embeddingError" TEXT;
-- Backfilled from createdAt for existing rows (Prisma's @updatedAt has no
-- migration-time equivalent of a default that tracks another column, so this
-- sets a sane starting value once and the ORM maintains it from here on).
ALTER TABLE "KbFile" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "KbFile" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "KbFile" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "KbFile" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "KbChunk" (
    "id" TEXT NOT NULL,
    "kbFileId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KbChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KbChunk_workspaceId_agentId_idx" ON "KbChunk"("workspaceId", "agentId");
CREATE INDEX IF NOT EXISTS "KbChunk_kbFileId_idx" ON "KbChunk"("kbFileId");

-- hnsw over ivfflat: no `lists` parameter to tune, and it performs reasonably
-- well starting from an empty table (ivfflat's clustering is poor until it has
-- a representative sample of rows, which an empty table at migration time
-- never has).
CREATE INDEX IF NOT EXISTS "KbChunk_embedding_hnsw_idx"
    ON "KbChunk" USING hnsw ("embedding" vector_cosine_ops);
