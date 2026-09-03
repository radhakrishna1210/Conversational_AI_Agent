-- The two volume bands that no existing tier could carry.
--
-- The previous migration re-ranged the three live tiers onto the bands their
-- own figures fell inside, which covered 1,500-5,000 and over-5,000. Nothing
-- covered the bottom two bands, so they are created here.
--
-- WHY HERE AND NOT IN THE SEEDER. services/billing/pricingBuckets.js used to
-- create any seed tier that was missing by name, and that is where these two
-- would have come from. It cannot any more: tiers are now deletable from the
-- admin console, and a seeder that recreates whatever is missing would raise a
-- deleted band from the dead on the very next boot. It seeds a genuinely empty
-- table and nothing else, so on an install that already has tiers — which is
-- every existing one — these two have to be inserted explicitly.
--
-- Rates are PLACEHOLDERS, descending as volume rises and sitting above the
-- 1,500-5,000 tier's rate so the ladder reads correctly on arrival. The real
-- numbers are typed in Super Admin -> Pricing.
--
-- Ids are literals rather than cuids because SQL cannot call Prisma's
-- generator. The column is a plain string with no format constraint, and a
-- readable id is easier to recognise in a support query than a random one.
--
-- ON CONFLICT on the unique name, so re-running this is a no-op and so is
-- running it on a fresh install where the seeder already created them.
INSERT INTO "PricingBucket"
  ("id", "name", "label", "minutes", "maxMinutes", "perMinuteInr", "active", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('pbkt_band_0_200',    'bucket_0_200',    'Under 200 min',   0,   200,  16, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pbkt_band_200_1500', 'bucket_200_1500', '200-1,500 min', 200,  1500,  14, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
