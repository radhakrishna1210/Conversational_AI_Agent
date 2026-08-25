/**
 * What a phone number costs a client: a one-time setup fee and a monthly rental.
 *
 * Two figures, one platform-wide, set in Super Admin — the same shape as the
 * ₹/min wallet rate. There are no per-customer number prices.
 *
 * ── Why the setup fee exists ─────────────────────────────────────────────────
 * We are a Plivo RESELLER, so every client needs their own compliance
 * application filed with their own documents (NUMBER_PURCHASE_MARKETPLACE.md
 * §2). That is real per-customer labour we perform once and never recover from
 * a per-minute rate. The setup fee is what pays for it. It defaults to zero, so
 * shipping this changes nobody's bill until someone sets a number.
 *
 * ── Why the rates live in a Plan row ────────────────────────────────────────
 * Same deliberate squat as walletRate.js and broadcastRate.js: there is no
 * key/value settings table, and adding one means a migration against a live
 * database that has already drifted. One reserved `Plan` row, excluded from
 * every listing, `active: false` so nothing can subscribe to it.
 *
 * The column mapping is the ugly part and is stated once, here:
 *
 *     priceInr      →  MONTHLY RENTAL, rupees
 *     perMinuteInr  →  ONE-TIME SETUP FEE, rupees
 *
 * `perMinuteInr` holding a one-off fee reads wrong, and it is. It is used
 * because it is a rupee-denominated numeric column that already exists, so the
 * two figures cannot drift into different currencies. Nothing reads this row
 * except the two functions below. If a proper `Setting` model is ever added,
 * move both values and delete this note.
 */
import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';

/** Reserved, like __wallet_rate__ and __broadcast_rate__. */
export const NUMBER_RATE_PLAN = '__number_rate__';

/**
 * Seeds, applied only when the row does not exist.
 *
 * Plivo's published India domestic rental is about ₹200/month, so ₹500 leaves
 * roughly 2.5x to cover the carrier's reseller price differing from the list
 * price, GST, and the months a suspended number is held without being paid for
 * (see VOICE_NUMBER_STATUS.SUSPENDED_NONPAYMENT — we keep paying for those).
 *
 * Setup seeds at ZERO on purpose. A non-zero default would start charging every
 * new client a fee nobody chose, on the first deploy.
 */
const SEED_MONTHLY_INR = 500;
const SEED_SETUP_INR = 0;

/** Rupees → integer paise, the unit the wallet ledger works in. */
export const inrToCents = (inr) => Math.round(Number(inr) * 100);

/**
 * Read the number rate card, creating the row on first use.
 *
 * @returns {Promise<{monthlyInr: number, setupInr: number, monthlyCents: number, setupCents: number}>}
 */
export async function getNumberRate() {
  let row = await prisma.plan.findUnique({ where: { name: NUMBER_RATE_PLAN } });

  if (!row) {
    row = await prisma.plan.create({
      data: {
        name: NUMBER_RATE_PLAN,
        priceUsd: 0,
        priceInr: SEED_MONTHLY_INR,
        perMinuteUsd: 0,
        perMinuteInr: SEED_SETUP_INR,
        includedMinutes: 0,
        kbStorageMb: 0,
        maxAgents: 0,
        maxConcurrentCalls: 0,
        features: '[]',
        active: false,
        sortOrder: -1,
      },
    });
    logger.info(
      { monthlyInr: SEED_MONTHLY_INR, setupInr: SEED_SETUP_INR },
      'Seeded platform phone-number rate card',
    );
  }

  // A zero or missing MONTHLY falls back to the seed rather than to free: a
  // cleared column must not silently hand out numbers we pay ₹200/month for.
  // A zero SETUP is a legitimate choice and is honoured as written.
  const monthlyInr = Number(row.priceInr) > 0 ? Number(row.priceInr) : SEED_MONTHLY_INR;
  const setupInr = Number.isFinite(Number(row.perMinuteInr)) ? Math.max(0, Number(row.perMinuteInr)) : SEED_SETUP_INR;

  return {
    monthlyInr,
    setupInr,
    monthlyCents: inrToCents(monthlyInr),
    setupCents: inrToCents(setupInr),
  };
}

/**
 * Set the number rate card.
 *
 * Both figures are optional; whichever is supplied is updated. Changing them
 * affects only numbers rented AFTERWARDS — `VoiceNumber.clientMonthlyCents` is
 * frozen at rent time, so a price rise never retroactively repriced someone's
 * existing number.
 *
 * @param {{monthlyInr?: number, setupInr?: number}} patch
 */
export async function setNumberRate({ monthlyInr, setupInr } = {}) {
  const data = {};

  if (monthlyInr !== undefined) {
    const inr = Number(monthlyInr);
    // Zero would mean giving away a number that costs us real money every month
    // for as long as the client keeps it, which is not a price an admin should
    // be able to set by leaving a field blank.
    if (!Number.isFinite(inr) || inr <= 0) {
      throw Object.assign(new Error('Monthly rental must be a number greater than zero'), { status: 400 });
    }
    data.priceInr = inr;
  }

  if (setupInr !== undefined) {
    const inr = Number(setupInr);
    // Zero IS valid here — "no setup fee" is a real commercial choice.
    if (!Number.isFinite(inr) || inr < 0) {
      throw Object.assign(new Error('Setup fee must be zero or a positive number'), { status: 400 });
    }
    data.perMinuteInr = inr;
  }

  if (!Object.keys(data).length) {
    throw Object.assign(new Error('Nothing to update'), { status: 400 });
  }

  await getNumberRate(); // ensure the row exists
  const row = await prisma.plan.update({ where: { name: NUMBER_RATE_PLAN }, data });

  logger.info(
    { monthlyInr: Number(row.priceInr), setupInr: Number(row.perMinuteInr) },
    'Platform phone-number rate card updated',
  );
  return getNumberRate();
}
