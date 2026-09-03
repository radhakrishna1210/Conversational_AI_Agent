-- BUG-002: wallet ledger integrity, subscriptions, payment orders.
--
-- Every statement is additive (new tables, or new columns with defaults) so it
-- is safe against a populated database, and every one is IF NOT EXISTS so it is
-- safe to re-run. No column is dropped and no existing value is rewritten
-- except the explicit historical-call backfill at the end.
--
-- The one semantic change is Wallet.currency's DEFAULT (USD -> INR), which
-- affects only rows inserted from now on. Pre-existing wallets keep their
-- stored value and are reconciled separately, not silently reinterpreted.

-- ── Wallet ───────────────────────────────────────────────────────────────────
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "overdraftLimitCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "lowBalanceNotifiedAt" TIMESTAMP(3);
ALTER TABLE "Wallet" ALTER COLUMN "currency" SET DEFAULT 'INR';

-- ── WalletTransaction: the double-charge guard + audit fields ────────────────
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "balanceAfterCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "metadata" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "fxRateUsdToInr" DOUBLE PRECISION;

-- This unique index is what makes a retried webhook or a double-fired call-end
-- event fail loudly instead of charging the customer twice. Postgres allows
-- many NULLs under a UNIQUE index, so untracked admin adjustments still insert.
CREATE UNIQUE INDEX IF NOT EXISTS "WalletTransaction_idempotencyKey_key"
  ON "WalletTransaction"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "WalletTransaction_type_createdAt_idx"
  ON "WalletTransaction"("type", "createdAt");

-- ── Plan: machine-readable limits ────────────────────────────────────────────
-- `features` is a marketing string list ("3 agents"), so nothing could actually
-- be enforced against it. These are what the pre-call gate reads.
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "maxAgents" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "maxConcurrentCalls" INTEGER NOT NULL DEFAULT 1;

-- ── Invoice ──────────────────────────────────────────────────────────────────
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'topup';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "subtotalCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "taxCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentOrderId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "periodStart" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "periodEnd" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_number_key" ON "Invoice"("number");
-- One invoice per payment: this is what makes invoice generation safe to retry.
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_paymentOrderId_key" ON "Invoice"("paymentOrderId");
CREATE INDEX IF NOT EXISTS "Invoice_workspaceId_invoiceDate_idx" ON "Invoice"("workspaceId", "invoiceDate");

-- ── AgentCallLog: per-call billing outcome ───────────────────────────────────
-- billingStatus is the per-call idempotency guard. All three call-end paths
-- converge on settleCall(), which only charges a call still in PENDING.
ALTER TABLE "AgentCallLog" ADD COLUMN IF NOT EXISTS "billingStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "AgentCallLog" ADD COLUMN IF NOT EXISTS "billedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentCallLog" ADD COLUMN IF NOT EXISTS "billedAt" TIMESTAMP(3);
ALTER TABLE "AgentCallLog" ADD COLUMN IF NOT EXISTS "ratePerMinuteCents" INTEGER;
ALTER TABLE "AgentCallLog" ADD COLUMN IF NOT EXISTS "billedMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AgentCallLog" ADD COLUMN IF NOT EXISTS "actualCostMicroUsd" INTEGER;
CREATE INDEX IF NOT EXISTS "AgentCallLog_billingStatus_endedAt_idx"
  ON "AgentCallLog"("billingStatus", "endedAt");

-- Calls that already ended before billing existed must not be retro-charged the
-- first time settleCall() runs. Mark historical rows SKIPPED.
UPDATE "AgentCallLog"
   SET "billingStatus" = 'SKIPPED'
 WHERE "billingStatus" = 'PENDING'
   AND ("endedAt" IS NOT NULL OR "status" IN ('COMPLETED', 'FAILED'));

-- ── Subscription ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Subscription" (
  "id"                     TEXT NOT NULL,
  "workspaceId"            TEXT NOT NULL,
  "planId"                 TEXT NOT NULL,
  "planName"               TEXT NOT NULL,
  "status"                 TEXT NOT NULL DEFAULT 'active',
  "billingPeriod"          TEXT NOT NULL DEFAULT 'monthly',
  "currentPeriodStart"     TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd"       TIMESTAMP(3) NOT NULL,
  "cancelAtPeriodEnd"      BOOLEAN NOT NULL DEFAULT false,
  "pendingPlanId"          TEXT,
  "cancelledAt"            TIMESTAMP(3),
  "minutesIncluded"        INTEGER NOT NULL DEFAULT 0,
  "minutesUsed"            DOUBLE PRECISION NOT NULL DEFAULT 0,
  "razorpaySubscriptionId" TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_workspaceId_key" ON "Subscription"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_razorpaySubscriptionId_key" ON "Subscription"("razorpaySubscriptionId");
CREATE INDEX IF NOT EXISTS "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");

-- ── PaymentOrder ─────────────────────────────────────────────────────────────
-- Created BEFORE the customer pays, so a webhook naming an unknown order is
-- detectable as a misroute or forgery rather than silently crediting a wallet.
CREATE TABLE IF NOT EXISTS "PaymentOrder" (
  "id"                TEXT NOT NULL,
  "workspaceId"       TEXT NOT NULL,
  "provider"          TEXT NOT NULL DEFAULT 'razorpay',
  "providerOrderId"   TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "amountCents"       INTEGER NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'INR',
  "purpose"           TEXT NOT NULL DEFAULT 'topup',
  "planId"            TEXT,
  "status"            TEXT NOT NULL DEFAULT 'created',
  "notes"             TEXT NOT NULL DEFAULT '{}',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt"            TIMESTAMP(3),
  CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentOrder_providerOrderId_key" ON "PaymentOrder"("providerOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentOrder_providerPaymentId_key" ON "PaymentOrder"("providerPaymentId");
CREATE INDEX IF NOT EXISTS "PaymentOrder_workspaceId_createdAt_idx" ON "PaymentOrder"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentOrder_status_createdAt_idx" ON "PaymentOrder"("status", "createdAt");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
