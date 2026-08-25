// backend/src/services/billing/wallet.service.js
/**
 * The wallet ledger (BUG-002). THE ONLY code permitted to change a balance.
 *
 * Three invariants, each enforced by the database rather than by convention:
 *
 *  1. ATOMICITY. Balance and ledger row are written in one DB transaction. They
 *     cannot disagree, because there is no interleaving in which one lands
 *     without the other.
 *
 *  2. IDEMPOTENCY. Every automated mutation carries an `idempotencyKey`, and
 *     the UNIQUE index on that column is what enforces it — not a
 *     read-then-write check, which races. A retried Razorpay webhook, a
 *     double-fired call-end event and a replayed client PATCH all produce the
 *     same key, so the second attempt hits the constraint and is reported as
 *     "already applied" instead of charging twice.
 *
 *  3. SERIALISATION. The wallet row is locked FOR UPDATE before reading its
 *     balance. Without it, two concurrent calls ending at the same instant both
 *     read balance B and both write B-x, losing one charge. This is the classic
 *     lost-update, and it is guaranteed to happen eventually on a system whose
 *     whole point is concurrent calls.
 *
 * Every row also stores `balanceAfterCents`, so an auditor can verify the
 * running balance without replaying the ledger, and a lost or out-of-order
 * write becomes visible instead of silent.
 */

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { getBillingCurrency, formatMinor } from './money.js';

/** Ledger entry types. Anything else is rejected — a typo must not become a
 *  new, unreportable category of money movement. */
export const TX_TYPES = Object.freeze({
  TOPUP: 'topup',
  USAGE: 'usage',
  ADMIN_CREDIT: 'admin_credit',
  REFUND: 'refund',
  SUBSCRIPTION: 'subscription',
  ADJUSTMENT: 'adjustment',
  // Phone numbers are the one thing besides talk time that costs the client
  // money, and they cost it on a different clock: once at purchase, then every
  // month for as long as the number is held. Kept as two types rather than one
  // so an invoice can say which is which — "why am I paying this again?" is the
  // first question a recurring line item gets.
  NUMBER_SETUP: 'number_setup',
  NUMBER_RENTAL: 'number_rental',
});
const VALID_TYPES = new Set(Object.values(TX_TYPES));

/** Postgres unique-violation. */
const isUniqueViolation = (err) => err?.code === 'P2002';

export const getOrCreateWallet = async (workspaceId, client = prisma) => {
  const wallet = await client.wallet.upsert({
    where: { workspaceId },
    update: {},
    create: { workspaceId, currency: getBillingCurrency() },
  });

  // Self-heal a mislabelled currency.
  //
  // There is exactly ONE billing currency per deployment, and every stored
  // amount is in its minor units — `usdToBillingMinor` converts on the way in,
  // so `Wallet.currency` is a LABEL, not a unit of account. When the two drift,
  // the UI formats real paise as dollars: a ₹500 balance renders as "$500.00",
  // wrong by the FX rate and wrong in symbol.
  //
  // This happened for real: a server running a stale Prisma client still had
  // `currency @default("USD")` in its generated types, and Prisma sends scalar
  // defaults IN THE INSERT rather than deferring to the database, so it wrote
  // 'USD' explicitly even though the column default was already 'INR'.
  //
  // Relabelling is safe precisely because the amounts were never in the other
  // currency — but it is still a data anomaly worth shouting about, because the
  // only way to get here is a deployment inconsistency.
  const billingCurrency = getBillingCurrency();
  if (wallet.currency !== billingCurrency) {
    logger.error(
      { workspaceId, stored: wallet.currency, expected: billingCurrency, balanceCents: wallet.balanceCents },
      'Wallet currency does not match the configured billing currency — relabelling. '
      + 'Amounts are unchanged; check for a stale deployment or a changed BILLING_CURRENCY.',
    );
    const [fixed] = await Promise.all([
      client.wallet.update({ where: { id: wallet.id }, data: { currency: billingCurrency } }),
      client.walletTransaction.updateMany({
        where: { walletId: wallet.id, NOT: { currency: billingCurrency } },
        data: { currency: billingCurrency },
      }),
    ]);
    return fixed;
  }

  return wallet;
};

/**
 * Apply one balance mutation.
 *
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {number} params.amountCents  signed: >0 credit, <0 debit
 * @param {string} params.type         one of TX_TYPES
 * @param {string} [params.idempotencyKey] REQUIRED for anything automated
 * @param {string} [params.note]
 * @param {object} [params.metadata]   explains the line item to a customer
 * @param {number} [params.fxRateUsdToInr]
 * @param {string} [params.createdById]
 * @param {boolean} [params.allowNegative=false] bypass the balance floor —
 *   used for usage settlement, which must never fail to record a call that
 *   already happened (see settleCall).
 * @returns {Promise<{ applied: boolean, duplicate: boolean, balanceCents: number, transaction?: object }>}
 */
export async function applyWalletTransaction({
  workspaceId,
  amountCents,
  type,
  idempotencyKey = null,
  note = null,
  metadata = {},
  fxRateUsdToInr = null,
  createdById = null,
  allowNegative = false,
}) {
  const amount = Math.trunc(Number(amountCents));
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error('amountCents must be a non-zero integer');
  }
  if (!VALID_TYPES.has(type)) {
    throw new Error(`Unknown wallet transaction type: ${type}`);
  }

  // Resolve the wallet OUTSIDE the transaction. The upsert is idempotent and
  // needs no lock, and every statement moved out of the critical section is
  // lock-hold time that concurrent settlements do not have to queue behind.
  const wallet = await getOrCreateWallet(workspaceId);

  try {
    return await prisma.$transaction(async (tx) => {
      // ONE statement that locks the row, enforces the balance floor, and
      // applies the delta. Doing it as SELECT ... FOR UPDATE followed by a
      // separate UPDATE meant holding the lock across two extra network round
      // trips; against a remote database that is ~200-400ms of lock hold per
      // settlement, and a burst of concurrent calls then queues past the
      // transaction timeout — which fails settlement and silently loses
      // revenue. An atomic guarded increment cuts the critical section to a
      // single round trip while giving the SAME serialisation guarantee,
      // because UPDATE takes a row lock for the rest of the transaction.
      //
      // The WHERE clause is the balance check: if it does not match, zero rows
      // come back and the debit was not affordable. Evaluated by the database
      // against the locked row, so it cannot race.
      const rows = await tx.$queryRawUnsafe(
        `UPDATE "Wallet"
            SET "balanceCents" = "balanceCents" + $2,
                "lowBalanceNotifiedAt" = CASE WHEN $2 > 0 THEN NULL ELSE "lowBalanceNotifiedAt" END,
                "updatedAt" = NOW()
          WHERE "id" = $1
            AND ($3::boolean OR $2 > 0 OR "balanceCents" + $2 >= -"overdraftLimitCents")
      RETURNING "balanceCents", "currency"`,
        wallet.id, amount, allowNegative,
      );

      if (!rows.length) {
        const err = new Error('Insufficient wallet balance');
        err.code = 'INSUFFICIENT_BALANCE';
        err.balanceCents = wallet.balanceCents;
        err.requiredCents = Math.abs(amount);
        throw err;
      }
      const next = Number(rows[0].balanceCents);

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amountCents: amount,
          balanceAfterCents: next,
          currency: wallet.currency,
          type,
          idempotencyKey,
          note,
          metadata: JSON.stringify(metadata ?? {}),
          fxRateUsdToInr,
          createdById,
        },
      });

      logger.info(
        { workspaceId, type, amountCents: amount, balanceAfterCents: next, idempotencyKey },
        `Wallet ${amount > 0 ? 'credit' : 'debit'} ${formatMinor(Math.abs(amount), wallet.currency)} ` +
        `-> balance ${formatMinor(next, wallet.currency)}`,
      );

      return { applied: true, duplicate: false, balanceCents: next, transaction };
    }, {
      // Headroom over the 5s default. Settlements serialise on the wallet row,
      // so a burst of calls ending together queues here; timing out would drop
      // a charge for minutes already served. The critical section is one
      // statement, so this ceiling is only ever reached under real contention.
      timeout: Number(process.env.BILLING_TX_TIMEOUT_MS) || 20_000,
      maxWait: Number(process.env.BILLING_TX_MAX_WAIT_MS) || 15_000,
    });
  } catch (err) {
    // The idempotency key already exists: this exact mutation was applied
    // before. That is a SUCCESS, not a failure — the caller's intent ("make
    // sure this charge is recorded once") is satisfied. Returning the existing
    // state lets webhook senders retry freely, which they will.
    if (isUniqueViolation(err) && idempotencyKey) {
      const existing = await prisma.walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      const wallet = await getOrCreateWallet(workspaceId);
      logger.info(
        { workspaceId, idempotencyKey, type },
        'Wallet transaction already applied — ignoring duplicate (idempotent replay)',
      );
      return {
        applied: false,
        duplicate: true,
        balanceCents: wallet.balanceCents,
        transaction: existing ?? undefined,
      };
    }
    throw err;
  }
}

/** Current balance, creating the wallet on first read. */
export async function getBalance(workspaceId) {
  const wallet = await getOrCreateWallet(workspaceId);
  return {
    balanceCents: wallet.balanceCents,
    currency: wallet.currency,
    overdraftLimitCents: wallet.overdraftLimitCents,
  };
}

/**
 * Does this workspace have enough balance to START a call?
 *
 * Deliberately checks for headroom of one billing increment rather than for a
 * strictly positive balance: letting a call begin with ₹0.10 left just means it
 * gets cut off mid-sentence, which is a worse experience than a clear refusal.
 */
export async function hasCallableBalance(workspaceId, minimumCents = 0) {
  const wallet = await getOrCreateWallet(workspaceId);
  return wallet.balanceCents + wallet.overdraftLimitCents >= minimumCents;
}

/**
 * Verify the ledger against the stored balance. Sum of all entries must equal
 * balanceCents, and each row's balanceAfterCents must equal the running total.
 *
 * This is the check that makes the whole design falsifiable: if any code ever
 * mutates a balance outside applyWalletTransaction, this reports it. Exposed
 * for admin/ops and asserted in the tests.
 */
export async function auditWallet(workspaceId) {
  const wallet = await getOrCreateWallet(workspaceId);
  const rows = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: 'asc' },
  });
  const sum = rows.reduce((acc, r) => acc + r.amountCents, 0);
  const discrepancies = [];
  let running = 0;
  for (const r of rows) {
    running += r.amountCents;
    if (r.balanceAfterCents !== running) {
      discrepancies.push({
        transactionId: r.id,
        expected: running,
        recorded: r.balanceAfterCents,
      });
    }
  }
  return {
    balanced: sum === wallet.balanceCents && discrepancies.length === 0,
    balanceCents: wallet.balanceCents,
    ledgerSumCents: sum,
    transactionCount: rows.length,
    discrepancies,
  };
}
