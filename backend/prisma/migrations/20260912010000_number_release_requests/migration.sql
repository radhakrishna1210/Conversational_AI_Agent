-- Let a client ask for a number to be released, not only allocated.
--
-- Releasing is a Super Admin action on purpose — it destroys the client's DLT
-- header registration, which they cannot get back — but until now there was no
-- way for a client to ask for it at all, so a workspace was billed the monthly
-- rental indefinitely with support email as the only exit.
--
-- The same queue carries both directions, because an admin works one list.

ALTER TABLE "NumberRequest" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'RENT';

-- The queue is read as "open requests, oldest first", now split by direction.
CREATE INDEX IF NOT EXISTS "NumberRequest_kind_status_createdAt_idx"
  ON "NumberRequest"("kind", "status", "createdAt");
