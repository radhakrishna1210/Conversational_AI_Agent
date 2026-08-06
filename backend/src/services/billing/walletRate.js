/**
 * THE platform wallet rate — the single ₹/min figure every call is charged.
 *
 * This deployment bills one way: a prepaid wallet, debited per talk-minute, at
 * one rate for everybody. There are no plans to pick and no per-tier pricing.
 * Super Admin → Wallet Rate is the only place this number is set, and it is the
 * number the public landing page quotes, so the two can never disagree.
 *
 * ── Why the rate lives in a Plan row ──────────────────────────────────────────
 * There is no key/value settings table in the schema, and adding one means a
 * migration against the live database. Rather than take that risk for a single
 * scalar, the rate is stored on ONE reserved `Plan` row named by
 * WALLET_RATE_PLAN below. That row already has exactly the columns needed
 * (perMinuteInr as the price of record, perMinuteUsd as the FX fallback), it
 * inherits the existing admin auth and audit path, and it is excluded from
 * every plan listing so it can never surface as something a customer could
 * subscribe to.
 *
 * It is a deliberate squat on an existing table, not a modelling opinion. If a
 * proper `Setting` model is ever added, move the value and delete this note —
 * getWalletRate/setWalletRate are the only two functions that need to change.
 */
import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';

/** Reserved. Excluded from every plan listing — see EXCLUDE_RESERVED in platform.controller.js. */
export const WALLET_RATE_PLAN = '__wallet_rate__';

/**
 * Seed value, applied only when the row does not exist yet.
 *
 * Deliberately the rate a brand-new workspace was already being charged (the
 * old Free plan's ₹11.52), NOT the cheapest published tier. Seeding low would
 * silently cut the price for every existing workspace the moment this ships;
 * seeding at the entry rate means no one is under-billed by the migration to
 * wallet-only, and the real number is one field away in the admin panel.
 */
const SEED_PER_MINUTE_INR = 11.52;
const SEED_PER_MINUTE_USD = 0.12;

/**
 * Read the platform rate, creating the row on first use.
 *
 * Returns a plan-shaped object so it can be handed straight to
 * money.js `resolveCallRate` / `calculateCallCharge`, which stay pure and
 * take their rate as an argument rather than reaching for the database.
 *
 * @returns {Promise<{ perMinuteInr: number, perMinuteUsd: number }>}
 */
export async function getWalletRate() {
  let row = await prisma.plan.findUnique({ where: { name: WALLET_RATE_PLAN } });

  if (!row) {
    row = await prisma.plan.create({
      data: {
        name: WALLET_RATE_PLAN,
        priceUsd: 0,
        priceInr: 0,
        perMinuteUsd: SEED_PER_MINUTE_USD,
        perMinuteInr: SEED_PER_MINUTE_INR,
        includedMinutes: 0,
        kbStorageMb: 0,
        maxAgents: 0,
        maxConcurrentCalls: 0,
        features: '[]',
        // Inactive so that even if a listing filter were ever missed, nothing
        // downstream treats this as a subscribable plan.
        active: false,
        sortOrder: -1,
      },
    });
    logger.info({ perMinuteInr: SEED_PER_MINUTE_INR }, 'Seeded platform wallet rate');
  }

  return {
    perMinuteInr: Number(row.perMinuteInr) || SEED_PER_MINUTE_INR,
    perMinuteUsd: Number(row.perMinuteUsd) || SEED_PER_MINUTE_USD,
  };
}

/**
 * Set the platform rate.
 *
 * @param {number} perMinuteInr rupees per minute; must be > 0
 * @returns {Promise<{ perMinuteInr: number, perMinuteUsd: number }>}
 */
export async function setWalletRate(perMinuteInr) {
  const inr = Number(perMinuteInr);
  // A zero or negative rate would make every call free, and a NaN would make
  // resolveCallRate fall through to its USD path and quietly bill something
  // else entirely. Neither is a state an admin can reach by accident here.
  if (!Number.isFinite(inr) || inr <= 0) {
    throw Object.assign(new Error('Rate must be a number greater than zero'), { status: 400 });
  }

  await getWalletRate(); // ensure the row exists before updating it

  const row = await prisma.plan.update({
    where: { name: WALLET_RATE_PLAN },
    // perMinuteUsd is kept roughly in step purely so the money.js USD fallback
    // is never wildly wrong if perMinuteInr is ever cleared. INR is the price
    // of record and is what actually gets charged.
    data: { perMinuteInr: inr, perMinuteUsd: Number((inr / 96).toFixed(4)) },
  });

  logger.info({ perMinuteInr: inr }, 'Platform wallet rate updated');
  return { perMinuteInr: Number(row.perMinuteInr), perMinuteUsd: Number(row.perMinuteUsd) };
}
