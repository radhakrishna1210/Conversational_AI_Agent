-- Pricing tiers become volume RANGES instead of single figures.
--
-- A tier used to carry one number ("the 2,000-minute tier") which a salesperson
-- quoted against. The brackets replacing it are ranges — under 200, 200-1,500,
-- 1,500-5,000, over 5,000 — so a tier now says which band of monthly volume it
-- prices rather than naming one point inside it.
--
-- MIN INCLUSIVE, MAX EXCLUSIVE. 1,500 minutes belongs to the 1,500-5,000
-- bracket, not to the one below it. A NULL max is the open-ended top bracket.
--
-- NOTHING HERE SELECTS A TIER AUTOMATICALLY. Assignment stays manual, the
-- range is what an admin reads to pick the right one, and services/billing/
-- workspaceRate.js is untouched: resolution is still override -> assigned
-- bucket -> platform default. A tier is still a PRICE, not an allowance —
-- nothing decrements, nothing expires, and the wallet balance is still the
-- only thing that gates a call.
--
-- NO RATE MOVES IN THIS MIGRATION. Every `perMinuteInr` is left exactly as the
-- admin last set it; the new prices are typed in Super Admin -> Pricing.

-- ── The bracket's upper bound ─────────────────────────────────────────────
-- Additive and nullable. The lower bound reuses the existing `minutes` column
-- (Prisma maps it as `minMinutes`) because the figure a tier used to quote
-- against IS the bottom of the bracket that replaces it — so no NOT NULL
-- column with live rows in it has to be dropped or backfilled.
ALTER TABLE "PricingBucket" ADD COLUMN IF NOT EXISTS "maxMinutes" INTEGER;

-- ── Re-range the tiers that have customers on them ────────────────────────
-- Each existing tier moves to the bracket its own quoted figure falls inside,
-- so nobody is silently shifted into a band they were not sold: 2,000 lands in
-- 1,500-5,000, and 5,000 lands in the over-5,000 bracket.
--
-- The `name` is rewritten too. It is the stable key services/billing/
-- pricingBuckets.js seeds against, so leaving it as "bucket_2000" would make
-- ensureBucketsSeeded believe the 1,500-5,000 bracket was missing and create a
-- duplicate on the next boot.
--
-- Guarded on the OLD name, so re-running this matches nothing.
UPDATE "PricingBucket"
   SET "name"       = 'bucket_1500_5000',
       "label"      = '1,500-5,000 min',
       "minutes"    = 1500,
       "maxMinutes" = 5000,
       "sortOrder"  = 3,
       "updatedAt"  = CURRENT_TIMESTAMP
 WHERE "name" = 'bucket_2000';

UPDATE "PricingBucket"
   SET "name"       = 'bucket_5000_plus',
       "label"      = 'Over 5,000 min',
       "minutes"    = 5000,
       "maxMinutes" = NULL,
       "sortOrder"  = 4,
       "updatedAt"  = CURRENT_TIMESTAMP
 WHERE "name" = 'bucket_5000';

-- ── Retire the 15,000 tier ────────────────────────────────────────────────
-- It has no customers, and its volume falls in the same over-5,000 bracket as
-- the tier above, so keeping both would leave two tiers pricing one band.
--
-- Retired rather than deleted: `active = false` means "stop offering this",
-- never "stop honouring it" (see services/billing/workspaceRate.js), and
-- deleting it would set pricingBucketId to NULL on anyone assigned later. It
-- stays visible in the admin console as a retired tier.
UPDATE "PricingBucket"
   SET "active"    = false,
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "name" = 'bucket_15000';

-- ── Backfill any tier this migration did not name ─────────────────────────
-- Defensive: a tier added by hand before this deploy has no upper bound, which
-- would read as the open-ended top bracket and quietly claim every volume above
-- its floor. Give it a bounded bracket starting at its own figure instead.
--
-- Only the genuine top bracket is exempt. The retired 15,000 tier is included
-- rather than special-cased: bounding it is meaningless but harmless, and one
-- fewer exception is one fewer thing to reason about.
UPDATE "PricingBucket"
   SET "maxMinutes" = "minutes" * 2,
       "updatedAt"  = CURRENT_TIMESTAMP
 WHERE "maxMinutes" IS NULL
   AND "name" <> 'bucket_5000_plus';

-- The two brackets with no existing tier to carry them — under 200 and
-- 200-1,500 — are NOT inserted here. They are created on first read by
-- services/billing/pricingBuckets.js, which generates a proper cuid for the id
-- and skips anything that already exists, so an admin's later reprice is never
-- reset by a redeploy.
