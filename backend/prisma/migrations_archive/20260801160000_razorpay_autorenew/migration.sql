-- Auto-renewal via Razorpay Subscriptions (card on file).
--
-- A local Plan has to be mirrored as a Razorpay "plan" object before a
-- recurring subscription can reference it. Caching that id avoids recreating
-- the mirror on every checkout.
--
-- TEST AND LIVE IDS ARE STORED SEPARATELY AND DELIBERATELY SO. Razorpay's test
-- and live modes are entirely different datasets: a plan created with
-- rzp_test_ keys does not exist in live mode. A single column would silently
-- carry a test-mode id into production, where every subscription creation
-- would fail with a confusing "plan does not exist". Keying by mode makes the
-- switch a no-op instead of an outage.
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "razorpayPlanIdTest" TEXT;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "razorpayPlanIdLive" TEXT;

-- Whether this subscription renews itself on a saved card. False means the
-- period simply lapses (the previous wallet-funded behaviour), so existing
-- subscriptions keep working exactly as they do today.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT false;
-- Last gateway charge seen, so a replayed subscription.charged webhook for a
-- cycle already applied can be recognised and ignored.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lastChargeId" TEXT;

CREATE INDEX IF NOT EXISTS "Subscription_autoRenew_status_idx"
  ON "Subscription"("autoRenew", "status");
