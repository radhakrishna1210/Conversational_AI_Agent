-- BUG-002 follow-up: INR-native plan pricing.
--
-- Plans were catalogued only in USD and converted at charge time, so the
-- pricing page advertised "$89/month" while the customer was actually debited
-- 8,544 from an INR wallet. Worse, the price MOVED with FX_USD_TO_INR: changing
-- that rate silently repriced every plan.
--
-- These columns make INR the price of record. Nullable, so a plan without them
-- still falls back to priceUsd x FX and nothing breaks mid-deploy.

ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "priceInr" DOUBLE PRECISION;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "perMinuteInr" DOUBLE PRECISION;

-- Backfill at the documented rate (1 USD = 96, VOICE_AGENT_PRICE_PER_MINUTE.md).
-- Deliberately the EXACT converted figure rather than a rounded marketing price:
-- seeding 3,499 where the plan currently costs 3,456 would silently reprice the
-- product. Preserving the current economics is the neutral migration; choosing
-- round price points is a commercial decision for an admin to make afterwards.
UPDATE "Plan" SET "priceInr" = ROUND(("priceUsd" * 96)::numeric, 2) WHERE "priceInr" IS NULL;
UPDATE "Plan" SET "perMinuteInr" = ROUND(("perMinuteUsd" * 96)::numeric, 4) WHERE "perMinuteInr" IS NULL;
