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

/**
 * Field validation, shared by create and update.
 *
 * Extracted rather than written twice: these are the guards that stop a tier
 * being saved at a rate that would bill every client on it wrongly, and a
 * create path that validated even slightly differently from the update path
 * would be a hole in exactly the place it matters. Each returns the cleaned
 * value or throws a 400 carrying the message the admin UI shows verbatim.
 */
const parseLabel = (v) => {
  const label = String(v).trim();
  if (!label) throw Object.assign(new Error('Label cannot be empty'), { status: 400 });
  return label;
};

const parseMinutes = (v) => {
  const minutes = Number(v);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw Object.assign(new Error('Minutes must be a whole number greater than zero'), { status: 400 });
  }
  return minutes;
};

const parseRate = (v) => {
  const inr = Number(v);
  // Same guard as setWalletRate: zero or negative would make every call on this
  // tier free, and NaN would fall through money.js to the USD path and bill
  // something else entirely.
  if (!Number.isFinite(inr) || inr <= 0) {
    throw Object.assign(new Error('Rate must be a number greater than zero'), { status: 400 });
  }
  return inr;
};

/**
 * Every bucket, smallest tier first, with how many clients sit on each.
 *
 * Ordered by `minutes` rather than `sortOrder` so the list always reads
 * small-to-large however the tiers were entered — an admin adding a 3,000 tier
 * after the 15,000 one expects it to appear in the middle, not at the bottom.
 * The three seeded tiers were already numbered in minutes order, so this
 * changes nothing about what an existing install displays. `sortOrder` stays as
 * the tiebreaker for two tiers quoting the same minutes.
 *
 * The client count is what makes deactivating a tier a decision rather than a
 * guess: retiring one does not reprice anybody (see workspaceRate.js), and the
 * admin needs to see how many accounts that promise is covering.
 */
export async function listBuckets() {
  await ensureBucketsSeeded();
  const rows = await prisma.pricingBucket.findMany({
    orderBy: [{ minutes: 'asc' }, { sortOrder: 'asc' }],
    include: { _count: { select: { workspaces: true } } },
  });
  return rows.map(({ _count, ...b }) => ({ ...b, workspaceCount: _count.workspaces }));
}

/**
 * Add a tier.
 *
 * `name` is derived from the minutes rather than typed, because it is a machine
 * key nobody should have to invent, and deriving it makes "the 5,000 tier"
 * exactly one row by construction. Two tiers quoting the same minutes is
 * therefore rejected — it is far more likely a double submit than a real
 * commercial structure, and the two would be indistinguishable in the picker
 * a salesperson uses.
 *
 * A new tier starts assigned to nobody, so creating one can never change what
 * any existing client is charged.
 *
 * @param {{ label?: string, minutes: number, perMinuteInr: number }} input
 */
export async function createBucket(input = {}) {
  const minutes = parseMinutes(input.minutes);
  const perMinuteInr = parseRate(input.perMinuteInr);
  // Default the label to the figure it quotes, matching the seeded tiers, so
  // an admin who only fills in the numbers still gets a sensible picker entry.
  const label = input.label === undefined || String(input.label).trim() === ''
    ? `${minutes.toLocaleString('en-IN')} minutes`
    : parseLabel(input.label);

  const name = `bucket_${minutes}`;
  const clash = await prisma.pricingBucket.findUnique({ where: { name } });
  if (clash) {
    throw Object.assign(
      new Error(`A ${minutes.toLocaleString('en-IN')}-minute tier already exists (${clash.label}). Edit that one instead.`),
      { status: 409 },
    );
  }

  const row = await prisma.pricingBucket.create({
    data: { name, label, minutes, perMinuteInr, active: true, sortOrder: 0 },
  });

  logger.info({ bucketId: row.id, name, minutes, perMinuteInr }, 'Pricing bucket created');
  return { ...row, workspaceCount: 0 };
}

/**
 * Reprice, relabel, resize or retire one bucket.
 *
 * Changing a bucket's rate immediately changes what every workspace assigned to
 * it is charged on its NEXT call. Calls already settled are untouched — the rate
 * they were billed at is recorded on the call log row, so history stays
 * reproducible after a reprice.
 *
 * Setting `active: false` retires the tier from the picker WITHOUT repricing
 * anyone already on it; see the note in workspaceRate.js for why that has to be
 * true. To move those clients, reassign them.
 *
 * @param {string} id
 * @param {{ label?: string, minutes?: number, perMinuteInr?: number, active?: boolean }} patch
 */
export async function updateBucket(id, patch = {}) {
  const data = {};

  if (patch.label !== undefined) data.label = parseLabel(patch.label);
  if (patch.minutes !== undefined) data.minutes = parseMinutes(patch.minutes);
  if (patch.perMinuteInr !== undefined) data.perMinuteInr = parseRate(patch.perMinuteInr);
  if (patch.active !== undefined) data.active = Boolean(patch.active);

  if (Object.keys(data).length === 0) {
    throw Object.assign(new Error('Nothing to update'), { status: 400 });
  }

  // `name` deliberately does NOT follow a minutes change. It is the stable key
  // the seeder recognises: rewriting it would make ensureBucketsSeeded believe
  // its tier had gone missing and recreate a duplicate on the next boot.
  const row = await prisma.pricingBucket.update({
    where: { id },
    data,
    include: { _count: { select: { workspaces: true } } },
  });
  logger.info({ bucketId: id, ...data }, 'Pricing bucket updated');

  const { _count, ...bucket } = row;
  return { ...bucket, workspaceCount: _count.workspaces };
}
