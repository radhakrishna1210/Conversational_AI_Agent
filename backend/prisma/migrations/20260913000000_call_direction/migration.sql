-- Which way a phone call went.
--
-- Until now every PHONE_CALL row was outbound, because only the dialler created
-- them: a customer ringing one of our rented Plivo numbers produced no call log
-- at all, and so no transcript, no charge and no post-call delivery. Inbound
-- calls now get a row too, and the two need telling apart — the Calls page
-- labelled every phone call OUTBOUND, which was true only by accident.
--
-- Hand-written and additive, like the migrations before it: nullable (web calls
-- and chats have no direction), guarded, safe to re-run.

ALTER TABLE "AgentCallLog" ADD COLUMN IF NOT EXISTS "direction" TEXT;

-- Backfill is exact, not a guess: before this migration no code path created an
-- inbound PHONE_CALL row, so every existing one was placed by the dialler.
UPDATE "AgentCallLog" SET "direction" = 'OUTBOUND'
WHERE "type" = 'PHONE_CALL' AND "direction" IS NULL;
