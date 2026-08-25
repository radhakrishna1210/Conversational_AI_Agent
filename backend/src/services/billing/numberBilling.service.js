// Charging a client for the phone numbers they hold.
//
// A rented number costs us roughly ₹200/month, every month, whether or not the
// client is still paying — so unlike talk time, this is a cost that keeps
// running after the customer goes quiet. That shapes everything here:
//
//   Purchase is charged BEFORE the carrier is asked.  Renting first and billing
//     after means a client with an empty wallet gets a number we pay for.
//     plivo/number.service.js#rentNumber debits, rents, and refunds if the
//     carrier call fails.
//   Renewal is idempotent per month.  The key is the number plus the billing
//     month, so a sweep that overlaps a previous one, or a restart mid-run,
//     cannot charge twice. That is what makes a plain interval safe here, the
//     same reasoning as renewDueSubscriptions().
//   Non-payment suspends, never releases.  Product decision, 2026-08-24. A
//     released number destroys the client's DLT header registration, which
//     they cannot recover — a replacement number means a fresh header
//     application on their operator's portal. We would rather eat ~₹200/month
//     holding a dead number than hand a paying-again customer that problem.
//     Release stays a deliberate Super Admin action.
//
// See backend/docs/NUMBER_PURCHASE_MARKETPLACE.md §5 and phase D.

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { VOICE_NUMBER_STATUS } from '../../constants/compliance.js';
import { applyWalletTransaction, TX_TYPES } from './wallet.service.js';
import { getNumberRate } from './numberRate.js';
import { formatMinor } from './money.js';
import { notifyWorkspace, NOTIFY_TYPE } from '../notify.service.js';
import { generateInvoice } from './invoice.service.js';

/**
 * How long a number keeps working after its first failed renewal.
 *
 * Long by design. A client whose card bounced on a Friday should not lose their
 * campaigns before anyone has read the email — and the downside of waiting is
 * bounded and small (we carry ~₹200/month), while the downside of suspending
 * early lands mid-campaign on a customer who is merely late.
 */
export const GRACE_DAYS = Number(process.env.NUMBER_RENTAL_GRACE_DAYS) || 7;

/** Billing month for an instant, e.g. "2026-08". The idempotency unit. */
export const billingMonth = (date = new Date()) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

/**
 * The same calendar day next month, clamped to the month's length.
 *
 * Without the clamp, a number rented on the 31st would renew on the 31st of
 * every month that has one and silently skip February — `setUTCMonth(+1)` on
 * 31 January rolls over into March, so the number would be billed twice in
 * March and never in February.
 */
export function nextRenewalFrom(date = new Date()) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return d;
}

/**
 * Issue the invoice for a number charge.
 *
 * Invoices document what the wallet was SPENT on, not only what was paid into
 * it — `subscription.service.js` and `autoRenew.service.js` both invoice a
 * wallet debit the same way. Without this a client billed ₹500 a month has a
 * ledger line and nothing to give an accountant.
 *
 * The idempotency anchor is `paymentOrderId`, which despite its name is a plain
 * unique nullable string with no foreign key — it is the column that makes
 * generation safe to retry, and a synthetic key is exactly that use. Reusing
 * the ledger's own key keeps the invoice and the debit inseparable.
 *
 * Never throws: the money has already moved and been recorded in the ledger,
 * which is the authoritative audit record. A missing invoice is a document to
 * reissue, not a reason to fail a charge that already succeeded.
 */
async function invoiceNumberCharge(workspaceId, { amountCents, ledgerKey, planName }) {
  if (!(amountCents > 0)) return;
  try {
    await generateInvoice({
      workspaceId,
      amountCents,
      type: 'number',
      planName,
      paymentOrderId: ledgerKey,
    });
  } catch (err) {
    logger.error(
      { workspaceId, ledgerKey, amountCents, err: err.message },
      'Charge applied but its invoice could not be issued — reissue from the ledger row',
    );
  }
}

/**
 * Ledger keys. One charge per number per month, forever.
 *
 * Keyed on the PHONE NUMBER, not the VoiceNumber row id, for two reasons. The
 * purchase debit happens before the row exists — it has to, or an unaffordable
 * purchase rents a number first and discovers the empty wallet second. And the
 * number is the more durable identity anyway: `VoiceNumber.phoneNumber` is
 * globally unique and `assignNumber()` refuses to create a second row for one,
 * even after release, so a given number can be charged setup exactly once in
 * the lifetime of the platform.
 */
export const setupKey = (phoneNumber) => `number_setup:${phoneNumber}`;
export const rentalKey = (phoneNumber, month) => `number_rental:${phoneNumber}:${month}`;

/**
 * Charge for a number at purchase: the setup fee plus the first month.
 *
 * Called BEFORE the carrier is asked to rent, so an unaffordable purchase
 * fails while refusing is still free. Returns the price that was charged so the
 * caller can freeze it onto the VoiceNumber row.
 *
 * Two separate ledger rows rather than one combined debit: they are different
 * things on an invoice, the setup fee is one-off and the rental recurs, and a
 * refund may need to reverse only one of them.
 *
 * @returns {Promise<{ok: boolean, error?: string, code?: string, setupCents?: number, monthlyCents?: number, month?: string}>}
 */
export async function chargeNumberPurchase(workspaceId, { phoneNumber }) {
  const rate = await getNumberRate();
  const month = billingMonth();
  const charged = [];

  const debit = (amountCents, type, idempotencyKey, note) => applyWalletTransaction({
    workspaceId,
    amountCents: -Math.abs(amountCents),
    type,
    idempotencyKey,
    note,
    metadata: { phoneNumber, month },
  });

  try {
    if (rate.setupCents > 0) {
      await debit(rate.setupCents, TX_TYPES.NUMBER_SETUP, setupKey(phoneNumber),
        `One-time setup for ${phoneNumber}`);
      charged.push({ amountCents: rate.setupCents, key: setupKey(phoneNumber) });
    }

    await debit(rate.monthlyCents, TX_TYPES.NUMBER_RENTAL, rentalKey(phoneNumber, month),
      `${phoneNumber} — monthly rental, ${month}`);
    charged.push({ amountCents: rate.monthlyCents, key: rentalKey(phoneNumber, month) });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE') {
      // Put back anything that DID go through before the balance ran out —
      // otherwise a client who could afford the setup fee but not the first
      // month is left having paid for a number they never got.
      await refundCharges(workspaceId, charged, { phoneNumber, reason: 'purchase failed' });
      return {
        ok: false,
        code: 'INSUFFICIENT_BALANCE',
        error: `Your wallet does not cover this number (${formatMinor(rate.setupCents + rate.monthlyCents)} due now). Top up and try again.`,
      };
    }
    await refundCharges(workspaceId, charged, { phoneNumber, reason: 'purchase error' });
    throw err;
  }

  // Invoiced after both debits land, so a purchase that half-failed and was
  // refunded never leaves an invoice behind for money the client got back.
  if (rate.setupCents > 0) {
    await invoiceNumberCharge(workspaceId, {
      amountCents: rate.setupCents,
      ledgerKey: setupKey(phoneNumber),
      planName: `${phoneNumber} — number setup`,
    });
  }
  await invoiceNumberCharge(workspaceId, {
    amountCents: rate.monthlyCents,
    ledgerKey: rentalKey(phoneNumber, month),
    planName: `${phoneNumber} — monthly rental (${month})`,
  });

  return { ok: true, setupCents: rate.setupCents, monthlyCents: rate.monthlyCents, month };
}

/**
 * Reverse debits made for a purchase that did not complete.
 *
 * Recorded as `refund` credits rather than by deleting rows: the ledger is
 * append-only and is the only audit record of money movement, so a charge that
 * happened and was undone must show as both.
 *
 * Never throws. It runs on a path that is already failing, and a refund error
 * must not replace the original cause with a confusing second one — but it is
 * logged at error level because it is money the client is owed.
 */
export async function refundCharges(workspaceId, charges, { phoneNumber, reason } = {}) {
  for (const c of charges) {
    try {
      await applyWalletTransaction({
        workspaceId,
        amountCents: Math.abs(c.amountCents),
        type: TX_TYPES.REFUND,
        idempotencyKey: `refund:${c.key}`,
        note: `Refund — ${phoneNumber ?? 'number'} (${reason ?? 'reversed'})`,
        metadata: { phoneNumber, reversalOf: c.key, reason },
      });
    } catch (err) {
      logger.error(
        { workspaceId, phoneNumber, key: c.key, amountCents: c.amountCents, err: err.message },
        'REFUND FAILED — the client has been charged for a number they did not get',
      );
    }
  }
}

/**
 * Reverse a purchase after the carrier failed to provide the number.
 *
 * Takes what chargeNumberPurchase() returned, so the caller does not have to
 * remember which of the two debits actually happened.
 */
export async function refundNumberPurchase(workspaceId, { phoneNumber, setupCents, monthlyCents, month }) {
  const charges = [];
  if (setupCents > 0) charges.push({ amountCents: setupCents, key: setupKey(phoneNumber) });
  if (monthlyCents > 0) charges.push({ amountCents: monthlyCents, key: rentalKey(phoneNumber, month) });
  await refundCharges(workspaceId, charges, { phoneNumber, reason: 'carrier could not provide the number' });
}

// ── Renewal sweep ───────────────────────────────────────────────────────────

/**
 * Charge one number's monthly rental, and move its status accordingly.
 *
 * Also the reactivation path: a suspended number is retried on every sweep, so
 * topping up brings it back without a separate hook watching for payments.
 */
async function renewOne(number, now) {
  const month = billingMonth(now);
  // The price frozen at rent time, not today's rate card. A platform price rise
  // must not retroactively raise an existing customer's next renewal.
  const amountCents = number.clientMonthlyCents ?? (await getNumberRate()).monthlyCents;

  try {
    const result = await applyWalletTransaction({
      workspaceId: number.workspaceId,
      amountCents: -Math.abs(amountCents),
      type: TX_TYPES.NUMBER_RENTAL,
      idempotencyKey: rentalKey(number.phoneNumber, month),
      note: `${number.phoneNumber} — monthly rental, ${month}`,
      metadata: {
        voiceNumberId: number.id,
        phoneNumber: number.phoneNumber,
        month,
        carrierCostCents: number.carrierMonthlyCents ?? null,
      },
    });

    const wasSuspended = number.status === VOICE_NUMBER_STATUS.SUSPENDED_NONPAYMENT;

    // Only on a real charge. A duplicate means this month was already billed
    // and already invoiced, and generateInvoice would dedupe on the same key
    // anyway — but skipping avoids a pointless write on every retry sweep.
    if (!result.duplicate) {
      await invoiceNumberCharge(number.workspaceId, {
        amountCents,
        ledgerKey: rentalKey(number.phoneNumber, month),
        planName: `${number.phoneNumber} — monthly rental (${month})`,
      });
    }

    await prisma.voiceNumber.update({
      where: { id: number.id },
      data: {
        status: VOICE_NUMBER_STATUS.ACTIVE,
        renewalFailedAt: null,
        nextRenewalAt: nextRenewalFrom(number.nextRenewalAt ?? now),
      },
    });

    if (wasSuspended) {
      logger.info(
        { workspaceId: number.workspaceId, phoneNumber: number.phoneNumber },
        'Number reactivated — the wallet covered its overdue rental',
      );
      await notifyWorkspace(number.workspaceId, {
        title: `${number.phoneNumber} is active again`,
        message: 'The overdue rental was paid from your wallet and the number can make calls again.',
        type: NOTIFY_TYPE.SUCCESS,
        actionText: 'View numbers',
        actionLink: '/phone_numbers',
        email: true,
      });
    }
    return { id: number.id, charged: !result.duplicate, reactivated: wasSuspended };
  } catch (err) {
    if (err.code !== 'INSUFFICIENT_BALANCE') throw err;

    const failedAt = number.renewalFailedAt ?? now;
    const graceEndsAt = new Date(failedAt.getTime() + GRACE_DAYS * 86_400_000);
    const expired = now >= graceEndsAt;

    await prisma.voiceNumber.update({
      where: { id: number.id },
      data: {
        renewalFailedAt: failedAt,
        // nextRenewalAt is deliberately NOT advanced: the charge is still owed,
        // so the number stays in the due set and is retried on every sweep.
        // That retry is also what un-suspends it when the client tops up.
        ...(expired ? { status: VOICE_NUMBER_STATUS.SUSPENDED_NONPAYMENT } : {}),
      },
    });

    const newlySuspended = expired && number.status !== VOICE_NUMBER_STATUS.SUSPENDED_NONPAYMENT;
    const firstFailure = !number.renewalFailedAt;

    if (newlySuspended) {
      logger.warn(
        { workspaceId: number.workspaceId, phoneNumber: number.phoneNumber, graceDays: GRACE_DAYS },
        'Number suspended for non-payment — still rented from the carrier, so we keep paying for it',
      );
    }

    // Told twice, and only twice: once when the charge first fails (while there
    // is still time to act) and once when the number actually stops working.
    // The sweep retries hourly, so notifying on every failed attempt would send
    // 24 emails a day.
    if (firstFailure || newlySuspended) {
      await notifyWorkspace(number.workspaceId, {
        title: newlySuspended
          ? `${number.phoneNumber} has been suspended`
          : `Couldn't take the rental for ${number.phoneNumber}`,
        message: newlySuspended
          ? `This number can no longer make calls because its ${formatMinor(amountCents)} monthly rental is unpaid.`
          : `Your wallet does not cover the ${formatMinor(amountCents)} monthly rental. The number keeps working for ${GRACE_DAYS} days.`,
        details: 'Top up and it reactivates automatically — we have not given the number up, so you keep your DLT header registration.',
        type: newlySuspended ? NOTIFY_TYPE.ERROR : NOTIFY_TYPE.WARNING,
        actionText: 'Top up wallet',
        actionLink: '/billing',
        email: true,
      });
    }

    return { id: number.id, charged: false, suspended: expired, graceEndsAt };
  }
}

/**
 * Charge every number whose rental is due.
 *
 * Idempotent per number per month, so overlapping runs are harmless — the
 * ledger's unique key, not the schedule, is what guarantees correctness.
 * Released numbers are excluded: we no longer hold them and no longer pay.
 */
export async function renewDueNumbers({ now = new Date(), batchSize = 200 } = {}) {
  const due = await prisma.voiceNumber.findMany({
    where: {
      nextRenewalAt: { not: null, lte: now },
      status: { not: VOICE_NUMBER_STATUS.RELEASED },
    },
    orderBy: { nextRenewalAt: 'asc' },
    take: batchSize,
  });

  const results = [];
  for (const number of due) {
    try {
      results.push(await renewOne(number, now));
    } catch (err) {
      // One workspace's failure must not abandon the rest of the sweep.
      logger.error(
        { voiceNumberId: number.id, phoneNumber: number.phoneNumber, err: err.message },
        'Number rental renewal failed',
      );
      results.push({ id: number.id, charged: false, error: err.message });
    }
  }
  return results;
}
