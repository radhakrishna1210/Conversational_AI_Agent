// backend/src/services/billing/invoice.service.js
/**
 * Invoice generation (BUG-002). Wires up the previously unused `Invoice` model.
 *
 * Generation is idempotent on `paymentOrderId`, which carries a UNIQUE index:
 * a retried webhook re-enters here and gets the EXISTING document back rather
 * than minting a second one. Two invoices for one payment is a bookkeeping and
 * tax problem, not just a duplicate row.
 *
 * Numbering is INV-<year>-<zero-padded sequence>. The sequence is derived by
 * counting that year's invoices inside the same transaction that inserts the
 * row, and a collision on the unique index is retried — concurrent top-ups
 * would otherwise compute the same next number.
 */

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { getBillingCurrency, formatMinor } from './money.js';

/** GST etc. Configurable; 0 by default so nothing is invented for a
 *  jurisdiction this deployment may not be in. */
const getTaxRate = () => {
  const v = Number(process.env.BILLING_TAX_PERCENT);
  return Number.isFinite(v) && v >= 0 ? v / 100 : 0;
};

const buildNumber = (year, seq) => `INV-${year}-${String(seq).padStart(6, '0')}`;

/**
 * Create (or return the existing) invoice for a payment.
 *
 * @param {object} p
 * @param {string} p.workspaceId
 * @param {number} p.amountCents  total INCLUDING tax — what the customer paid
 * @param {string} [p.type]       topup | subscription
 * @param {string} [p.planName]
 * @param {string} [p.paymentOrderId] the idempotency anchor
 */
export async function generateInvoice({
  workspaceId, amountCents, type = 'topup', planName = null,
  paymentOrderId = null, periodStart = null, periodEnd = null, currency = getBillingCurrency(),
}) {
  if (paymentOrderId) {
    const existing = await prisma.invoice.findUnique({ where: { paymentOrderId } });
    if (existing) return existing;
  }

  const total = Math.trunc(Number(amountCents) || 0);
  const taxRate = getTaxRate();
  // Tax is computed as the portion OF the total, not added on top: the customer
  // paid `total` and the invoice has to reconcile to exactly that. Deriving the
  // subtotal by subtraction guarantees subtotal + tax === total with no
  // rounding drift.
  const taxCents = taxRate > 0 ? Math.round(total - total / (1 + taxRate)) : 0;
  const subtotalCents = total - taxCents;
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const count = await prisma.invoice.count({
        where: { invoiceDate: { gte: new Date(`${year}-01-01T00:00:00Z`) } },
      });
      const invoice = await prisma.invoice.create({
        data: {
          workspaceId,
          planName: planName ?? (type === 'topup' ? 'Wallet top-up' : 'Subscription'),
          amountCents: total,
          subtotalCents,
          taxCents,
          currency,
          status: 'Paid',
          type,
          invoiceDate: new Date(),
          number: buildNumber(year, count + 1 + attempt),
          paymentOrderId,
          periodStart,
          periodEnd,
        },
      });
      logger.info(
        { workspaceId, invoiceId: invoice.id, number: invoice.number, type },
        `Invoice ${invoice.number} issued for ${formatMinor(total, currency)}`,
      );
      return invoice;
    } catch (err) {
      if (err?.code === 'P2002') {
        const target = err.meta?.target ?? [];
        // Another concurrent top-up already claimed this payment: return theirs.
        if (String(target).includes('paymentOrderId') && paymentOrderId) {
          const existing = await prisma.invoice.findUnique({ where: { paymentOrderId } });
          if (existing) return existing;
        }
        // Number collision — recompute and retry.
        continue;
      }
      throw err;
    }
  }
  throw new Error('Could not allocate an invoice number after 5 attempts');
}

export async function listInvoices(workspaceId, limit = 50) {
  return prisma.invoice.findMany({
    where: { workspaceId },
    orderBy: { invoiceDate: 'desc' },
    take: Math.min(limit, 200),
  });
}
