/**
 * What ONE workspace is charged per minute.
 *
 * Supersedes calling getWalletRate() directly at the charge site. The platform
 * rate is still the floor of this resolution — it just stopped being the whole
 * answer once tiers and bespoke deals existed.
 *
 * ── Precedence, highest first ────────────────────────────────────────────────
 *   1. workspace.rateOverrideInr  a bespoke rate typed by a Super Admin for
 *                                 this one account. Wins over everything,
 *                                 because the reason it exists is that the
 *                                 tiers did not fit the deal.
 *   2. assigned PricingBucket     the volume tier this workspace sits on.
 *   3. platform default           Super Admin -> Wallet Rate. What a workspace
 *                                 with neither of the above pays, and what
 *                                 every workspace paid before buckets existed.
 *
 * Each level is null-checked independently, so a workspace that has never been
 * touched by an admin resolves to exactly the rate it was already being billed.
 * That is the property that makes shipping this a no-op for existing accounts.
 *
 * ── Why an inactive bucket still bills ───────────────────────────────────────
 * `active: false` means "do not offer this tier to new accounts", NOT "stop
 * honouring it". Retiring a tier must never silently reprice the customers
 * already on it — that is a billing surprise, and it would land without anyone
 * choosing it. Deactivate to hide; reassign to reprice.
 */
import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { getWalletRate } from './walletRate.js';

/**
 * The precedence rule itself, as a pure function.
 *
 * Split out from the database read on purpose: this is the part with the
 * actual billing consequences, and keeping it pure means it can be tested
 * exhaustively without a database — the billing suite otherwise runs against
 * the LIVE one, where fabricating pricing states to satisfy a test would
 * change what real customers are charged for the length of the run.
 *
 * @param {{ rateOverrideInr?: number|null,
 *           pricingBucket?: { id: string, label: string, perMinuteInr: number }|null }|null} ws
 * @param {{ perMinuteInr: number, perMinuteUsd: number }} platform
 */
export function pickRate(ws, platform) {
  const base = { perMinuteUsd: platform.perMinuteUsd, bucketId: null, bucketLabel: null };
  const fallback = { ...base, perMinuteInr: platform.perMinuteInr, source: 'platform' };
  if (!ws) return fallback;

  const override = Number(ws.rateOverrideInr);
  if (Number.isFinite(override) && override > 0) {
    return { ...base, perMinuteInr: override, source: 'override' };
  }

  const bucketRate = Number(ws.pricingBucket?.perMinuteInr);
  if (ws.pricingBucket && Number.isFinite(bucketRate) && bucketRate > 0) {
    return {
      ...base,
      perMinuteInr: bucketRate,
      source: 'bucket',
      bucketId: ws.pricingBucket.id,
      bucketLabel: ws.pricingBucket.label,
    };
  }

  return fallback;
}

/**
 * Resolve the effective rate for a workspace.
 *
 * Returns a plan-shaped object so it can be handed straight to money.js
 * `calculateCallCharge`, exactly as getWalletRate() was — the charge site does
 * not need to know which of the three rules produced the number.
 *
 * `source` is returned for logging and for the admin UI to explain WHY an
 * account is on a given rate. Nothing in the billing maths reads it.
 *
 * @param {string} workspaceId
 * @returns {Promise<{ perMinuteInr: number, perMinuteUsd: number,
 *                     source: 'override'|'bucket'|'platform',
 *                     bucketId: string|null, bucketLabel: string|null }>}
 */
export async function resolveWorkspaceRate(workspaceId) {
  const platform = await getWalletRate();

  // A missing workspaceId is not an error worth failing a settled call over —
  // bill it at the platform rate and say so. Throwing here would strand a call
  // in PENDING forever, which is strictly worse than billing the default.
  if (!workspaceId) return pickRate(null, platform);

  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      rateOverrideInr: true,
      pricingBucketId: true,
      pricingBucket: { select: { id: true, label: true, perMinuteInr: true } },
    },
  });

  if (!ws) {
    logger.warn({ workspaceId }, 'Rate lookup for unknown workspace; using platform rate');
    return pickRate(null, platform);
  }

  return pickRate(ws, platform);
}

/**
 * Assign a bucket to a workspace, or clear it with null.
 *
 * Clearing drops the workspace to the platform default unless it also carries
 * an override, which continues to win.
 */
export async function assignBucket(workspaceId, bucketId) {
  if (bucketId) {
    const bucket = await prisma.pricingBucket.findUnique({ where: { id: bucketId } });
    if (!bucket) throw Object.assign(new Error('Unknown pricing bucket'), { status: 404 });
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { pricingBucketId: bucketId || null },
  });

  logger.info({ workspaceId, bucketId: bucketId || null }, 'Workspace pricing bucket set');
  return resolveWorkspaceRate(workspaceId);
}

/**
 * Set a bespoke rate for one workspace, or clear it with null.
 *
 * @param {string} workspaceId
 * @param {number|null} perMinuteInr rupees per minute, or null to remove
 */
export async function setRateOverride(workspaceId, perMinuteInr) {
  let value = null;

  if (perMinuteInr !== null && perMinuteInr !== undefined && perMinuteInr !== '') {
    const inr = Number(perMinuteInr);
    if (!Number.isFinite(inr) || inr <= 0) {
      throw Object.assign(new Error('Override must be a number greater than zero'), { status: 400 });
    }
    value = inr;
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { rateOverrideInr: value },
  });

  logger.info({ workspaceId, rateOverrideInr: value }, 'Workspace rate override set');
  return resolveWorkspaceRate(workspaceId);
}
