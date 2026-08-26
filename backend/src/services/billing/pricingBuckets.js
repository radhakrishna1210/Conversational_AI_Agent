/**
 * Volume price tiers a Super Admin can assign to a workspace.
 *
 * ── What a bucket is, and what it is NOT ─────────────────────────────────────
 * A bucket is a PRICE TIER. `minutes` names the tier and is the figure a
 * salesperson quotes against ("the 15,000 bucket"); it is deliberately NOT an
 * allowance. Nothing decrements it, nothing expires, and exhausting it is not a
 * state that exists. Assigning a workspace the 15,000 bucket means exactly one
 * thing: its calls are charged at that bucket's rupees-per-minute.
 *
 * The wallet balance remains the only gate on placing a call, unchanged from
 * before this file existed (see settlement.service.js / assertCanStartCall).
 *
 * ── Admin-only, by construction ──────────────────────────────────────────────
 * No customer-facing route reads this table, and none should be added. This
 * deployment is contact-led and quotes no price on the public site — plan and
 * subscription routes were already removed for exactly that reason (see the
 * note at routes/index.js). Buckets are a sales instrument, not a product page.
 */
import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';

/**
 * The tiers this platform sells, seeded on first read.
 *
 * Seeded rather than hardcoded at the point of use so a Super Admin can reprice
 * a tier without a deploy — these values are the STARTING point, not the
 * authority. Once a row exists, the database wins and this table is ignored.
 *
 * `name` is a stable machine key, never displayed. `label` is what the admin UI
 * shows, so renaming a tier cannot orphan the workspaces pointing at it.
 */
export const SEED_BUCKETS = [
  { name: 'bucket_2000', label: '2,000 minutes', minutes: 2000, perMinuteInr: 12, sortOrder: 1 },
  { name: 'bucket_5000', label: '5,000 minutes', minutes: 5000, perMinuteInr: 10, sortOrder: 2 },
  { name: 'bucket_15000', label: '15,000 minutes', minutes: 15000, perMinuteInr: 6, sortOrder: 3 },
];

/**
 * Create any missing seed bucket. Idempotent and safe to call on every boot.
 *
 * Deliberately createMany-with-skipDuplicates rather than upsert: an admin who
 * has repriced the 5,000 tier to ₹9 must not have it silently reset to ₹10 on
 * the next restart. Missing rows are created; existing rows are never touched.
 */
export async function ensureBucketsSeeded() {
  const existing = await prisma.pricingBucket.findMany({ select: { name: true } });
  const have = new Set(existing.map((b) => b.name));
  const missing = SEED_BUCKETS.filter((b) => !have.has(b.name));
  if (missing.length === 0) return;

  await prisma.pricingBucket.createMany({ data: missing, skipDuplicates: true });
  logger.info({ created: missing.map((b) => b.name) }, 'Seeded pricing buckets');
}

/** Every bucket, cheapest tier last, for the admin picker. */
export async function listBuckets() {
  await ensureBucketsSeeded();
  return prisma.pricingBucket.findMany({ orderBy: [{ sortOrder: 'asc' }, { minutes: 'asc' }] });
}

/**
 * Reprice or relabel one bucket.
 *
 * Changing a bucket's rate immediately changes what every workspace assigned to
 * it is charged on its NEXT call. Calls already settled are untouched — the rate
 * they were billed at is recorded on the call log row, so history stays
 * reproducible after a reprice.
 *
 * @param {string} id
 * @param {{ label?: string, minutes?: number, perMinuteInr?: number, active?: boolean }} patch
 */
export async function updateBucket(id, patch = {}) {
  const data = {};

  if (patch.label !== undefined) {
    const label = String(patch.label).trim();
    if (!label) throw Object.assign(new Error('Label cannot be empty'), { status: 400 });
    data.label = label;
  }

  if (patch.minutes !== undefined) {
    const minutes = Number(patch.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      throw Object.assign(new Error('Minutes must be a whole number greater than zero'), { status: 400 });
    }
    data.minutes = minutes;
  }

  if (patch.perMinuteInr !== undefined) {
    const inr = Number(patch.perMinuteInr);
    // Same guard as setWalletRate: zero or negative would make every call on
    // this tier free, and NaN would fall through money.js to the USD path and
    // bill something else entirely.
    if (!Number.isFinite(inr) || inr <= 0) {
      throw Object.assign(new Error('Rate must be a number greater than zero'), { status: 400 });
    }
    data.perMinuteInr = inr;
  }

  if (patch.active !== undefined) data.active = Boolean(patch.active);

  if (Object.keys(data).length === 0) {
    throw Object.assign(new Error('Nothing to update'), { status: 400 });
  }

  const row = await prisma.pricingBucket.update({ where: { id }, data });
  logger.info({ bucketId: id, ...data }, 'Pricing bucket updated');
  return row;
}
