// backend/src/services/telephony/concurrency.js
/**
 * How many PSTN calls we may have up at once, globally and per workspace.
 *
 * WHY THIS IS BACK. settlement.service.js deliberately removed the per-plan
 * concurrency gate when the product went wallet-only, with this note:
 *
 *   "Concurrency is deliberately unbounded. The wallet caps the spend, so the
 *    remaining exposure is provider rate limits rather than unpaid usage; if
 *    that ever bites, the ceiling belongs in Super Admin as one platform-wide
 *    number, not back on a per-customer plan."
 *
 * It bit. Plivo support, 2026-08-16, confirming what their account-limits page
 * implies and what we could not previously get in writing:
 *
 *   - India defaults to 50 concurrent calls, enforced hard since 20 April 2026:
 *     past the ceiling calls fail instantly with 5030, with NO queuing.
 *   - Concurrency counts ringing/connecting calls, not just connected ones.
 *   - "All PSTN calls, inbound and outbound, across Voice API and SIP trunking,
 *     count toward the account concurrency limit" — and subaccounts share the
 *     parent's pool. There is no per-subaccount cap and no live per-subaccount
 *     usage API. Their own recommendation was to build this here.
 *
 * WHY CPS PACING WAS NOT ALREADY ENOUGH. Both dialers space dials one second
 * apart, inside the 2 CPS we have. But concurrency is arrival rate times holding
 * time, so 1 dial/sec against a 60-second conversation settles at ~60 calls up
 * at once — over a 50 ceiling without ever dialing faster than allowed. CPS
 * bounds how fast calls START; nothing bounded how many were alive.
 *
 * WHY IN PROCESS. There is one dialer process (Redis is unreachable in this
 * deployment — the bulk dispatcher runs in-process for the same reason), and
 * every path that starts a PSTN call goes through placeOutboundCall in this
 * process. A restart loses the table, which is correct rather than merely
 * tolerable: a restart also drops every media bridge, so those calls are ending
 * anyway. If a second dialer process ever exists this becomes wrong, and the
 * counter has to move to the database or Redis — that is the tripwire to watch.
 *
 * THE RESERVE IS DELIBERATELY PESSIMISTIC. A slot is taken when we ask the
 * carrier to dial and released when the call log is finalized. Between those two
 * points sits ringing, which the carrier counts and which is most of the holding
 * time on an unanswered bulk dial. Releasing on answer instead would undercount
 * exactly the calls that make up the ceiling breach.
 */

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';

/** Reserved, like __wallet_rate__ and __broadcast_rate__. See broadcastRate.js. */
export const CONCURRENCY_PLAN = '__concurrency__';

/**
 * Plivo India's documented default, and our live ceiling as of 2026-08-16
 * (support confirmed: plan free_trial, 50 concurrent, 2 outbound CPS).
 *
 * This is the CARRIER's number, not ours — the usable figure is this minus the
 * buffer below. Raising it here does not raise it at the carrier; it has to be
 * approved on the account first, or the only thing that changes is which side
 * rejects the call.
 */
const DEFAULT_CARRIER_CEILING = 50;

/**
 * Slots held back from the dialers.
 *
 * Inbound calls, a manual test dial from the dashboard, and the gap between our
 * reserve and the carrier's own accounting all draw on the same pool, and none
 * of them wait politely for a campaign. Without headroom the first inbound call
 * during a full campaign is the one that gets 5030 — the customer-visible
 * failure, caused by our own outbound traffic.
 */
const SAFETY_BUFFER = Math.max(0, Number(process.env.CARRIER_CONCURRENCY_BUFFER ?? 5));

/**
 * A slot nothing ever released. Backstop only — every normal path releases in
 * the call finalizer. Longer than the longest call any carrier permits (Exotel
 * caps a session at 60 minutes) so it can never reap a live call.
 */
const STALE_SLOT_MS = Number(process.env.CARRIER_SLOT_STALE_MS || 65 * 60 * 1000);

/** Limits change from Super Admin, not per dial; re-reading per dial would put a
 *  ~1s Supabase round trip in front of every call. */
const LIMIT_CACHE_MS = 30_000;

/** callLogId -> { workspaceId, takenAt } */
const slots = new Map();

let cachedLimits = null;
let cachedAt = 0;

/** Drop slots whose call cannot possibly still be running. */
function sweep(now = Date.now()) {
  if (!slots.size) return;
  for (const [callLogId, slot] of slots) {
    if (now - slot.takenAt > STALE_SLOT_MS) {
      slots.delete(callLogId);
      logger.warn(
        { callLogId, workspaceId: slot.workspaceId },
        'Carrier concurrency: reaped a slot nothing released — a call finalizer was missed',
      );
    }
  }
}

/**
 * Current ceilings, creating the row on first use.
 *
 * Squats a reserved `Plan` row, the same way the wallet and broadcast rates do.
 * `maxConcurrentCalls` means what its name says. `maxAgents` is REUSED to hold
 * the per-workspace ceiling — an ugly squat, and the honest reason is that the
 * live Supabase database has drifted from the schema history badly enough that
 * a migration for two integers is the riskier of the two options. If a real
 * Setting table ever lands, this is one of the three things to move onto it.
 *
 * @returns {Promise<{ carrierCeiling: number, perWorkspace: number }>}
 */
export async function getConcurrencyLimits() {
  if (cachedLimits && Date.now() - cachedAt < LIMIT_CACHE_MS) return cachedLimits;

  let row = await prisma.plan.findUnique({ where: { name: CONCURRENCY_PLAN } })
    .catch((e) => { logger.warn(`Could not read concurrency limits: ${e.message}`); return null; });

  if (!row) {
    row = await prisma.plan.create({
      data: {
        name: CONCURRENCY_PLAN,
        priceUsd: 0,
        priceInr: 0,
        perMinuteUsd: 0,
        perMinuteInr: 0,
        includedMinutes: 0,
        kbStorageMb: 0,
        maxAgents: 0,                                 // per-workspace: 0 = uncapped
        maxConcurrentCalls: DEFAULT_CARRIER_CEILING,  // carrier account ceiling
        features: '[]',
        active: false,
        sortOrder: -1,
      },
    }).catch((e) => { logger.warn(`Could not seed concurrency limits: ${e.message}`); return null; });
    if (row) logger.info({ carrierCeiling: DEFAULT_CARRIER_CEILING }, 'Seeded carrier concurrency limits');
  }

  // A failed read must not silently uncap the dialers, so fall back to the
  // documented default rather than to Infinity.
  cachedLimits = {
    carrierCeiling: Number(row?.maxConcurrentCalls) || DEFAULT_CARRIER_CEILING,
    perWorkspace: Math.max(0, Number(row?.maxAgents) || 0),
  };
  cachedAt = Date.now();
  return cachedLimits;
}

/**
 * @param {object} p
 * @param {number} [p.carrierCeiling] what the CARRIER allows, not what we want
 * @param {number} [p.perWorkspace]   0 to uncap per-tenant
 */
export async function setConcurrencyLimits({ carrierCeiling, perWorkspace } = {}) {
  const data = {};
  if (carrierCeiling !== undefined) {
    const n = Number(carrierCeiling);
    if (!Number.isInteger(n) || n < 1) {
      throw Object.assign(new Error('Carrier ceiling must be a whole number of calls, at least 1'), { status: 400 });
    }
    data.maxConcurrentCalls = n;
  }
  if (perWorkspace !== undefined) {
    const n = Number(perWorkspace);
    if (!Number.isInteger(n) || n < 0) {
      throw Object.assign(new Error('Per-workspace ceiling must be a whole number, or 0 to uncap'), { status: 400 });
    }
    data.maxAgents = n;
  }
  if (!Object.keys(data).length) return getConcurrencyLimits();

  await getConcurrencyLimits();  // ensure the row exists
  const row = await prisma.plan.update({ where: { name: CONCURRENCY_PLAN }, data });

  cachedLimits = null;           // next read reflects the change immediately
  logger.info(
    { carrierCeiling: row.maxConcurrentCalls, perWorkspace: row.maxAgents },
    'Carrier concurrency limits updated',
  );
  return { carrierCeiling: row.maxConcurrentCalls, perWorkspace: Math.max(0, row.maxAgents) };
}

/** Usable global ceiling: what the carrier allows, less the headroom we hold back. */
function usableCeiling(carrierCeiling) {
  return Math.max(1, carrierCeiling - SAFETY_BUFFER);
}

/**
 * May this workspace start one more PSTN call right now?
 *
 * Checks only — it does not reserve. The reservation happens in
 * placeOutboundCall once the carrier has actually accepted the dial, because
 * that is the first moment a call log id exists to key the slot on. The window
 * between the two is one dial in a single-threaded process, which the safety
 * buffer covers.
 *
 * The `CONCURRENCY_LIMIT` code is load bearing: campaignRunner.service.js
 * already has a wait-and-retry loop keyed on exactly that string, written for
 * the old per-plan gate and dormant since it was removed. Returning it here
 * makes that loop live again, which is why the campaign dialer needs no change.
 *
 * @returns {Promise<{allowed: boolean, code?: string, message?: string,
 *   active?: number, ceiling?: number}>}
 */
export async function checkConcurrency(workspaceId) {
  sweep();
  const { carrierCeiling, perWorkspace } = await getConcurrencyLimits();
  const ceiling = usableCeiling(carrierCeiling);

  if (slots.size >= ceiling) {
    return {
      allowed: false,
      code: 'CONCURRENCY_LIMIT',
      active: slots.size,
      ceiling,
      message: `All ${ceiling} concurrent call slots are in use. Calls resume as active ones end.`,
    };
  }

  if (perWorkspace > 0) {
    let mine = 0;
    for (const slot of slots.values()) if (slot.workspaceId === workspaceId) mine += 1;
    if (mine >= perWorkspace) {
      return {
        allowed: false,
        code: 'CONCURRENCY_LIMIT',
        active: mine,
        ceiling: perWorkspace,
        // Deliberately distinct wording: "the platform is busy" and "you are at
        // your own share" are different problems with different fixes, and an
        // operator reading a paused campaign needs to know which one happened.
        message: `This workspace is at its ${perWorkspace} concurrent call limit. Calls resume as its active ones end.`,
      };
    }
  }

  return { allowed: true, active: slots.size, ceiling };
}

/**
 * Take a slot. Idempotent per call log id.
 *
 * Note this does NOT re-check the ceiling: by the time it runs the carrier has
 * already accepted the dial, so the call exists whether we account for it or
 * not. Refusing to record it would only make our count wrong in the direction
 * that causes 5030s.
 */
export function acquireSlot({ workspaceId, callLogId }) {
  if (!callLogId) return;
  slots.set(callLogId, { workspaceId, takenAt: Date.now() });
}

/** Give a slot back. Safe to call for an id that never held one. */
export function releaseSlot(callLogId) {
  if (callLogId) slots.delete(callLogId);
}

/** For Super Admin and for tests. */
export function snapshot() {
  sweep();
  const byWorkspace = {};
  for (const slot of slots.values()) {
    byWorkspace[slot.workspaceId] = (byWorkspace[slot.workspaceId] || 0) + 1;
  }
  return { active: slots.size, byWorkspace, safetyBuffer: SAFETY_BUFFER };
}

/**
 * Tests only.
 *
 * Seeding `limits` primes the same cache a real read fills, which is what lets
 * the slot accounting be tested without a database — the ceilings are two
 * integers and everything interesting here is the counting around them.
 */
export function __resetForTests(limits = null) {
  slots.clear();
  cachedLimits = limits;
  cachedAt = limits ? Date.now() : 0;
}
