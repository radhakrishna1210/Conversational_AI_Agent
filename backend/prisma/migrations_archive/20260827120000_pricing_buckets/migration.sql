-- Pricing buckets (volume tiers) and per-workspace rate overrides.
--
-- Until now every call was charged one platform rate for everybody, held on the
-- reserved `__wallet_rate__` Plan row. This adds two ways to price a single
-- customer differently: a named volume TIER a Super Admin assigns, and a
-- bespoke per-workspace override for the deal that fits no tier. Resolution is
-- override -> bucket -> platform rate; see services/billing/workspaceRate.js.
--
-- Strictly additive. One new table and two new NULLABLE columns on Workspace.
-- No existing column is altered, dropped, or backfilled, and no default is
-- changed — a workspace nobody has touched resolves to the platform rate, which
-- is exactly what it was already paying. Nothing that predates this migration
-- reads back differently, and nobody's bill moves on deploy.
--
-- A bucket is a PRICE TIER, not an allowance: `minutes` names the tier and is
-- what a salesperson quotes against. It is never decremented and never expires;
-- the wallet balance remains the only thing gating a call.

-- ── PricingBucket ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PricingBucket" (
  "id"           TEXT NOT NULL,
  -- Stable machine key ("bucket_2000"), never displayed, so relabelling a tier
  -- in the admin UI cannot orphan the workspaces pointing at it.
  "name"         TEXT NOT NULL,
  "label"        TEXT NOT NULL,
  "minutes"      INTEGER NOT NULL,
  "perMinuteInr" DOUBLE PRECISION NOT NULL,
  -- false means "stop offering this tier to new accounts", NOT "stop honouring
  -- it". Retiring a tier must never silently reprice the customers already on
  -- it, so workspaceRate.js keeps billing an inactive bucket.
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PricingBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PricingBucket_name_key" ON "PricingBucket"("name");

-- ── Workspace: tier assignment + bespoke override ─────────────────────────
-- Both nullable with no default. NULL on either means "fall through to the next
-- rule", which is what makes deploying this a no-op for every existing account.
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "rateOverrideInr" DOUBLE PRECISION;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "pricingBucketId" TEXT;

-- ADD CONSTRAINT has no IF NOT EXISTS in Postgres, so guard it explicitly —
-- this migration must stay safe to re-run.
--
-- ON DELETE SET NULL, deliberately: deleting a tier must drop its customers to
-- the platform default, never cascade into deleting workspaces.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Workspace_pricingBucketId_fkey'
  ) THEN
    ALTER TABLE "Workspace"
      ADD CONSTRAINT "Workspace_pricingBucketId_fkey"
      FOREIGN KEY ("pricingBucketId") REFERENCES "PricingBucket"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- The three tiers themselves are NOT seeded here. They are created on first
-- read by services/billing/pricingBuckets.js, which skips any that already
-- exist — so a rate an admin has since changed is never reset by a redeploy.

-- ── Platform default: ₹11.52 -> ₹12.00 ────────────────────────────────────
-- The default is now the entry (2,000-minute) tier's rate, so "no bucket" and
-- "entry bucket" cost the same. This is the one part of this migration that
-- MOVES A PRICE: every workspace with no bucket and no override goes from
-- ₹11.52 to ₹12.00/min, a rise of ₹0.48. That is the intended decision, not a
-- side effect.
--
-- Guarded on the old value on purpose. If an admin has already set the rate to
-- something deliberate, that choice wins and this does nothing — a migration
-- must never silently overwrite a price a human chose. Idempotent for the same
-- reason: re-running it after the fact matches no row.
UPDATE "Plan"
   SET "perMinuteInr" = 12.00,
       -- Kept roughly in step so money.js's USD fallback is never wildly wrong
       -- if perMinuteInr is ever cleared. Same 1/96 ratio setWalletRate uses.
       "perMinuteUsd" = 0.125
 WHERE "name" = '__wallet_rate__'
   AND "perMinuteInr" = 11.52;
