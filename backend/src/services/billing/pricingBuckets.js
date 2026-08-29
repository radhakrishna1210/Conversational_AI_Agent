/**
 * Volume price tiers a Super Admin can assign to a workspace.
 *
 * ── What a bucket is, and what it is NOT ─────────────────────────────────────
 * A bucket is a PRICE TIER covering a BAND of monthly volume — under 200
 * minutes, 200 to 1,500, and so on. The band is what an admin reads to pick the
 * right tier for a customer; it is deliberately NOT an allowance and NOT a
 * quota. Nothing decrements it, nothing expires, and exhausting it is not a
 * state that exists. Assigning a workspace a tier means exactly one thing: its
 * calls are charged at that tier's rupees-per-minute.
 *
 * NOTHING SELECTS A TIER AUTOMATICALLY. A customer whose usage grows past their
 * band is not moved and not repriced — an admin reassigns them, deliberately.
 * That is why the band can be honest about what it describes without
 * workspaceRate.js ever reading it: resolution there is still
 * override -> assigned bucket -> platform default, and it never sees a minute
 * count. Making the band self-selecting would be a real billing change and a
 * separate decision, not an extension of this one.
 *
 * The wallet balance remains the only gate on placing a call, unchanged from
 * before this file existed (see settlement.service.js / assertCanStartCall).
 *
 * ── The band's boundaries ────────────────────────────────────────────────────
 * MIN INCLUSIVE, MAX EXCLUSIVE. 1,500 minutes belongs to the 1,500-5,000 tier
 * and not to the 200-1,500 one. A null `maxMinutes` is the open-ended top
 * bracket. Stated once here because "which tier is 1,500 in" has to have one
 * answer, and half-open intervals are the convention that makes adjacent bands
 * tile without a gap or an overlap.
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
 * a tier without a deploy — these rates are the STARTING point, not the
 * authority. Once a row exists, the database wins and this table is ignored.
 *
 * `name` is a stable machine key, never displayed, and encodes the band so the
 * seeder can tell "the 200-1,500 tier" from "the tier that happens to be
 * labelled that today". `label` is what the admin UI shows, so relabelling a
 * tier cannot orphan the workspaces pointing at it.
 *
 * The four bands tile the whole range with no gap and no overlap. The rates
 * descend as volume rises and are placeholders — the real ones are typed in
 * Super Admin -> Pricing, and the 1,500-5,000 and over-5,000 rows already exist
 * in production carrying rates an admin set, so this table never reaches them.
 */
export const SEED_BUCKETS = [
  { name: 'bucket_0_200', label: 'Under 200 min', minMinutes: 0, maxMinutes: 200, perMinuteInr: 16, sortOrder: 1 },
  { name: 'bucket_200_1500', label: '200-1,500 min', minMinutes: 200, maxMinutes: 1500, perMinuteInr: 14, sortOrder: 2 },
  { name: 'bucket_1500_5000', label: '1,500-5,000 min', minMinutes: 1500, maxMinutes: 5000, perMinuteInr: 12, sortOrder: 3 },
  { name: 'bucket_5000_plus', label: 'Over 5,000 min', minMinutes: 5000, maxMinutes: null, perMinuteInr: 10, sortOrder: 4 },
];

/**
 * Create any missing seed bucket. Idempotent and safe to call on every boot.
 *
 * Deliberately createMany-with-skipDuplicates rather than upsert: an admin who
 * has repriced a tier to ₹9 must not have it silently reset on the next
 * restart. Missing rows are created; existing rows are never touched.
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

/**
 * The band's floor. Zero is valid — it is the bottom bracket's floor.
 *
 * Absent is NOT zero, and has to be rejected explicitly: `Number(null)` and
 * `Number('')` are both 0, so without this an omitted floor would pass the
 * integer check and silently widen the band down to nothing. Zero has to be
 * typed to be meant. The ceiling is the opposite — see parseMaxMinutes, where
 * absent legitimately means the open-ended top bracket.
 */
const parseMinMinutes = (v) => {
  const missing = v === null || v === undefined || v === '';
  const minutes = Number(v);
  if (missing || !Number.isInteger(minutes) || minutes < 0) {
    throw Object.assign(new Error('The band must start at a whole number of minutes, zero or more'), { status: 400 });
  }
  return minutes;
};

/** The band's ceiling, or null for the open-ended top bracket. */
const parseMaxMinutes = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const minutes = Number(v);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw Object.assign(new Error('The band must end at a whole number of minutes, or be left open'), { status: 400 });
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
 * A band has to contain something.
 *
 * Checked against the values the row will END UP with, not just the ones in the
 * patch: raising a tier's floor above an untouched ceiling is exactly how an
 * empty band gets saved, and the patch alone cannot see it. Max is exclusive,
 * so equal bounds are empty too.
 */
const assertBandOrdered = (minMinutes, maxMinutes) => {
  if (maxMinutes !== null && maxMinutes <= minMinutes) {
    throw Object.assign(
      new Error(`A band from ${minMinutes.toLocaleString('en-IN')} to ${maxMinutes.toLocaleString('en-IN')} contains no minutes — the end must be above the start, or left open.`),
      { status: 400 },
    );
  }
};

/** The stable machine key for a band. Encodes the band, never the label. */
const bandName = (minMinutes, maxMinutes) =>
  (maxMinutes === null ? `bucket_${minMinutes}_plus` : `bucket_${minMinutes}_${maxMinutes}`);

/** How a band reads in an error message. */
const bandText = (minMinutes, maxMinutes) => (maxMinutes === null
  ? `over ${minMinutes.toLocaleString('en-IN')} min`
  : `${minMinutes.toLocaleString('en-IN')}-${maxMinutes.toLocaleString('en-IN')} min`);

/**
 * Every bucket, smallest band first, with how many clients sit on each.
 *
 * Ordered by the band's floor rather than `sortOrder` so the list always reads
 * small-to-large however the tiers were entered — an admin adding a 200-1,500
 * band after the 1,500-5,000 one expects it to appear above, not at the bottom.
 * `sortOrder` stays as the tiebreaker for two tiers sharing a floor.
 *
 * The client count is what makes deactivating a tier a decision rather than a
 * guess: retiring one does not reprice anybody (see workspaceRate.js), and the
 * admin needs to see how many accounts that promise is covering.
 */
export async function listBuckets() {
  await ensureBucketsSeeded();
  const rows = await prisma.pricingBucket.findMany({
    orderBy: [{ minMinutes: 'asc' }, { sortOrder: 'asc' }],
    include: { _count: { select: { workspaces: true } } },
  });
  return rows.map(({ _count, ...b }) => ({ ...b, workspaceCount: _count.workspaces }));
}

/**
 * Add a tier.
 *
 * `name` is derived from the band rather than typed, because it is a machine
 * key nobody should have to invent, and deriving it makes "the 200-1,500 tier"
 * exactly one row by construction. Two tiers covering the identical band is
 * therefore rejected — it is far more likely a double submit than a real
 * commercial structure, and the two would be indistinguishable in the picker a
 * salesperson uses.
 *
 * Bands that merely OVERLAP are allowed. Nothing resolves a rate from a band,
 * so an overlap is untidy rather than wrong, and forbidding it would block the
 * ordinary case of widening one band before narrowing its neighbour. The admin
 * console flags overlaps and gaps instead of refusing them.
 *
 * A new tier starts assigned to nobody, so creating one can never change what
 * any existing client is charged.
 *
 * @param {{ label?: string, minMinutes: number, maxMinutes?: number|null, perMinuteInr: number }} input
 */
export async function createBucket(input = {}) {
  const minMinutes = parseMinMinutes(input.minMinutes);
  const maxMinutes = parseMaxMinutes(input.maxMinutes);
  assertBandOrdered(minMinutes, maxMinutes);
  const perMinuteInr = parseRate(input.perMinuteInr);

  // Default the label to the band it covers, matching the seeded tiers, so an
  // admin who only fills in the numbers still gets a sensible picker entry.
  const band = bandText(minMinutes, maxMinutes);
  const label = input.label === undefined || String(input.label).trim() === ''
    ? band.charAt(0).toUpperCase() + band.slice(1)
    : parseLabel(input.label);

  const name = bandName(minMinutes, maxMinutes);
  const clash = await prisma.pricingBucket.findUnique({ where: { name } });
  if (clash) {
    throw Object.assign(
      new Error(`A tier for ${band} already exists (${clash.label}). Edit that one instead.`),
      { status: 409 },
    );
  }

  const row = await prisma.pricingBucket.create({
    data: { name, label, minMinutes, maxMinutes, perMinuteInr, active: true, sortOrder: 0 },
  });

  logger.info({ bucketId: row.id, name, minMinutes, maxMinutes, perMinuteInr }, 'Pricing bucket created');
  return { ...row, workspaceCount: 0 };
}

/**
 * Reprice, relabel, re-band or retire one bucket.
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
 * @param {{ label?: string, minMinutes?: number, maxMinutes?: number|null,
 *           perMinuteInr?: number, active?: boolean }} patch
 */
export async function updateBucket(id, patch = {}) {
  const data = {};

  if (patch.label !== undefined) data.label = parseLabel(patch.label);
  if (patch.minMinutes !== undefined) data.minMinutes = parseMinMinutes(patch.minMinutes);
  if (patch.maxMinutes !== undefined) data.maxMinutes = parseMaxMinutes(patch.maxMinutes);
  if (patch.perMinuteInr !== undefined) data.perMinuteInr = parseRate(patch.perMinuteInr);
  if (patch.active !== undefined) data.active = Boolean(patch.active);

  if (Object.keys(data).length === 0) {
    throw Object.assign(new Error('Nothing to update'), { status: 400 });
  }

  // A patch carrying both edges describes the whole band, so it can be checked
  // as it stands. Only a patch moving ONE edge needs the row read first —
  // raising a floor above an untouched ceiling is exactly how an empty band
  // gets saved, and the patch alone cannot see it.
  const movesMin = data.minMinutes !== undefined;
  const movesMax = data.maxMinutes !== undefined;

  if (movesMin && movesMax) {
    assertBandOrdered(data.minMinutes, data.maxMinutes);
  } else if (movesMin || movesMax) {
    const current = await prisma.pricingBucket.findUnique({
      where: { id },
      select: { minMinutes: true, maxMinutes: true },
    });
    if (!current) throw Object.assign(new Error('Unknown pricing tier'), { status: 404 });

    assertBandOrdered(
      movesMin ? data.minMinutes : current.minMinutes,
      movesMax ? data.maxMinutes : current.maxMinutes,
    );
  }

  // `name` deliberately does NOT follow a band change. It is the stable key the
  // seeder recognises: rewriting it would make ensureBucketsSeeded believe its
  // tier had gone missing and recreate a duplicate on the next boot. The one
  // place names are rewritten is a migration, where the seed list moves with
  // them.
  const row = await prisma.pricingBucket.update({
    where: { id },
    data,
    include: { _count: { select: { workspaces: true } } },
  });
  logger.info({ bucketId: id, ...data }, 'Pricing bucket updated');

  const { _count, ...bucket } = row;
  return { ...bucket, workspaceCount: _count.workspaces };
}
