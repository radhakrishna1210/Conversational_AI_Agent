/**
 * THE platform broadcast rate — the ₹/min every one-way broadcast call is charged.
 *
 * Separate from the conversational wallet rate on purpose, because the two
 * products cost us wildly different amounts to serve:
 *
 *   conversational call   carrier minute + streaming + STT + LLM + TTS, every
 *                         second of every call            ≈ ₹2.50–5.50/min COGS
 *   broadcast call        carrier minute. That is the whole list — the audio was
 *                         rendered once, weeks ago        ₹0.60/min COGS, flat
 *
 * Charging a broadcast at the conversational rate would price a 30-second
 * recorded message at ₹5.76 against a carrier cost of about ₹0.30, which is not
 * a margin, it is a reason to lose the deal. Charging it at zero gives away the
 * carrier minutes. So it is its own number, set by Super Admin, next to the
 * other one.
 *
 * Stored the same way the wallet rate is: on ONE reserved `Plan` row. See
 * walletRate.js for why that squat exists — the reasoning and the migration risk
 * are identical, and having two of these is the argument for a real `Setting`
 * table, not a reason to invent a second mechanism.
 */
import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';

/** Reserved. Excluded from every plan listing — see EXCLUDE_RESERVED in platform.controller.js. */
export const BROADCAST_RATE_PLAN = '__broadcast_rate__';

/**
 * Seed value.
 *
 * ₹3.00/min is ₹1.50 for a typical 30-second message, against a verified carrier
 * cost of ₹0.30 for the same call — Plivo India is a FLAT ₹0.60/min, and on a
 * broadcast there is nothing else in the bill. That is an 80% gross margin,
 * ahead of what the conversational rate card manages.
 *
 * The number rental (₹250/month) is deliberately NOT amortised into this. It is
 * a fixed cost of holding the number, which the workspace pays for its
 * conversational calls regardless; folding it into a broadcast ₹/min would
 * charge the same ₹250 to two products and make a flat rate look variable.
 *
 * A starting point, not a finding: bulk-OBD in India is a price-led market and
 * this is the number to move first when competing on volume — there is room down
 * to about ₹1.20/min before the 50% margin line.
 */
const SEED_PER_MINUTE_INR = 3.0;
const SEED_PER_MINUTE_USD = 0.031;

/**
 * Read the broadcast rate, creating the row on first use.
 *
 * Returns a plan-shaped object so it can be handed straight to money.js
 * `resolveCallRate` / `calculateCallCharge`, exactly like getWalletRate().
 *
 * @returns {Promise<{ perMinuteInr: number, perMinuteUsd: number }>}
 */
export async function getBroadcastRate() {
  let row = await prisma.plan.findUnique({ where: { name: BROADCAST_RATE_PLAN } });

  if (!row) {
    row = await prisma.plan.create({
      data: {
        name: BROADCAST_RATE_PLAN,
        priceUsd: 0,
        priceInr: 0,
        perMinuteUsd: SEED_PER_MINUTE_USD,
        perMinuteInr: SEED_PER_MINUTE_INR,
        includedMinutes: 0,
        kbStorageMb: 0,
        maxAgents: 0,
        maxConcurrentCalls: 0,
        features: '[]',
        active: false,
        sortOrder: -1,
      },
    });
    logger.info({ perMinuteInr: SEED_PER_MINUTE_INR }, 'Seeded platform broadcast rate');
  }

  return {
    perMinuteInr: Number(row.perMinuteInr) || SEED_PER_MINUTE_INR,
    perMinuteUsd: Number(row.perMinuteUsd) || SEED_PER_MINUTE_USD,
  };
}

/**
 * Set the broadcast rate.
 *
 * @param {number} perMinuteInr rupees per minute; must be > 0
 */
export async function setBroadcastRate(perMinuteInr) {
  const inr = Number(perMinuteInr);
  // Zero or negative would make every broadcast free; NaN would fall through to
  // money.js's USD path and quietly bill something else entirely.
  if (!Number.isFinite(inr) || inr <= 0) {
    throw Object.assign(new Error('Rate must be a number greater than zero'), { status: 400 });
  }

  await getBroadcastRate(); // ensure the row exists before updating it

  const row = await prisma.plan.update({
    where: { name: BROADCAST_RATE_PLAN },
    data: { perMinuteInr: inr, perMinuteUsd: Number((inr / 96).toFixed(4)) },
  });

  logger.info({ perMinuteInr: inr }, 'Platform broadcast rate updated');
  return { perMinuteInr: Number(row.perMinuteInr), perMinuteUsd: Number(row.perMinuteUsd) };
}
