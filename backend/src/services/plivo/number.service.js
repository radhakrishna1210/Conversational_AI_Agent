// Renting Indian numbers from Plivo into a client's subaccount.
//
// This is the step the whole compliance pipeline exists to reach. It can only
// run once plivo/compliance.service.js has an APPROVED application for the
// workspace, because Plivo refuses to sell an Indian number against anything
// else — and it will not let an application be created during the purchase.
//
// Three invariants, all of which cost money or reputation when broken:
//
//   Series must match the use case.  TRAI limits what may be said on a call by
//     the series of the caller ID. A promotional campaign from a landline is
//     legal on the carrier's API and a violation under TCCCPR. Checked here
//     BEFORE the money is spent, because a number in the wrong series cannot be
//     reconfigured — it has to be released and replaced.
//   A number is never handed to a second workspace.  Its header registration
//     and accumulated carrier reputation travel with the number, not with us.
//   Nothing is rented that we cannot record.  A rented number we have no row
//     for bills monthly and is invisible — the same orphan class as a
//     subaccount whose token we failed to persist.
//
// All calls use MAIN-account credentials: subaccount credentials cannot buy,
// assign or release numbers.
//
// See backend/docs/NUMBER_PURCHASE_MARKETPLACE.md phase C.

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import {
  CARRIER_APPLICATION_STATUS,
  NUMBER_SERIES,
  PLIVO_NUMBER_TYPE,
  TELEPHONY_PROVIDER,
  USE_CASE,
  VOICE_NUMBER_STATUS,
} from '../../constants/compliance.js';
import {
  classifyNumberSeries,
  describeSeries,
  isIndianNumber,
  seriesPermitsUseCase,
} from '../compliance/dlt.js';
import {
  assignNumber,
  getOrCreateCompliance,
  releaseNumber as recordRelease,
} from '../compliance/compliance.service.js';
import {
  chargeNumberPurchase,
  nextRenewalFrom,
  refundNumberPurchase,
} from '../billing/numberBilling.service.js';
import { getNumberRate } from '../billing/numberRate.js';
import { plivoRequest, mainCredentials, PlivoError } from './client.js';
import { createSubaccount } from './subaccount.service.js';

const COUNTRY_ISO = 'IN';

/** Plivo's search caps a page at 20. */
const MAX_SEARCH_LIMIT = 20;

/**
 * Plivo wants bare digits at the carrier boundary — "912269851741", not
 * "+912269851741". Same rule and same reasoning as plivo.provider.js: one
 * canonical `+`-prefixed format everywhere above this line, stripped only here.
 */
const carrierNumber = (n) => String(n ?? '').trim().replace(/^\+/, '');

/** E.164 for a number Plivo gave us back, which may or may not carry the plus. */
const toE164 = (n) => {
  const bare = carrierNumber(n);
  return bare ? `+${bare}` : '';
};

const requireMain = () => {
  const creds = mainCredentials();
  if (!creds) {
    throw new PlivoError(
      'Plivo is not configured on this server (PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN missing).',
      { status: 503 },
    );
  }
  return creds;
};

// ── Pure helpers (exported for the tests) ───────────────────────────────────

/**
 * The search pattern that yields numbers of the right series.
 *
 * Promotional traffic is only legal from the 140 series, so the pattern is
 * forced rather than merely defaulted — a caller-supplied pattern would
 * otherwise be able to surface landlines for a promotional workspace, and the
 * client would pick one before anything downstream noticed.
 *
 * Transactional traffic runs on landline STD ranges, which have no single
 * prefix. There the caller's pattern (an STD code like "22" or "80") is passed
 * through, and `city` narrows it instead.
 *
 * @returns {{pattern?: string, error?: string}}
 */
export function searchPatternFor(useCase, pattern) {
  const requested = String(pattern ?? '').replace(/\D/g, '');

  if (useCase === USE_CASE.PROMOTIONAL) {
    if (requested && !requested.startsWith('140')) {
      return {
        error: 'Promotional calling is only permitted from the 140 series, so the search is fixed to 140-prefixed numbers.',
      };
    }
    return { pattern: requested || '140' };
  }

  if (useCase === USE_CASE.TRANSACTIONAL) {
    // 140 is promotional-only. Searching for one under a transactional
    // declaration would sell the client a number they may not lawfully use.
    if (requested.startsWith('140')) {
      return {
        error: 'The 140 series is for promotional calls only. Your workspace is declared for service and transactional calls.',
      };
    }
    return { pattern: requested || undefined };
  }

  return { error: 'Declare your call type before searching for a number.' };
}

/**
 * The series to record for a number we are about to rent.
 *
 * `classifyNumberSeries` can only decide 140 and 1600 from the digits — Indian
 * landline and mobile ranges genuinely overlap, so it returns UNKNOWN for a
 * Mumbai landline. But at rent time we know something it does not: which series
 * we deliberately searched. UNKNOWN under a transactional declaration is a
 * landline, which is exactly what was asked for.
 *
 * Storing UNKNOWN instead would fail `seriesPermitsUseCase` forever and leave
 * the client with a number the checklist refuses to accept.
 *
 * @returns {{series?: string, error?: string}}
 */
export function seriesForRentedNumber(phoneNumber, useCase) {
  if (!isIndianNumber(phoneNumber)) {
    return { error: 'Only Indian (+91) numbers are provisioned through this flow.' };
  }

  const classified = classifyNumberSeries(phoneNumber);

  if (classified === NUMBER_SERIES.MOBILE) {
    return {
      error: 'That is a mobile number. A mobile CLI is never a compliant caller ID for commercial calls in India — it is the exact pattern the network spam filters target.',
    };
  }

  // 140 and 1600 are decidable from the digits, so the digits win.
  const series = classified === NUMBER_SERIES.UNKNOWN
    ? (useCase === USE_CASE.TRANSACTIONAL ? NUMBER_SERIES.TRANSACTIONAL_LANDLINE : classified)
    : classified;

  if (!seriesPermitsUseCase(series, useCase)) {
    return {
      error: `That number is a ${describeSeries(series)}, which does not permit ${
        useCase === USE_CASE.PROMOTIONAL ? 'promotional' : 'service and transactional'
      } calls. Pick a number in the right series — a number cannot be moved between series once rented.`,
    };
  }

  return { series };
}

/**
 * What Plivo charges us for a number, in integer minor units, or null.
 *
 * Recorded for reconciliation only — never to compute a client's price. Plivo
 * returns this as a decimal string in the account's own billing currency, and
 * which currency that is depends on the account's region, so a mismatched
 * assumption here would make margin reporting wrong rather than merely absent.
 * Nothing derives money from it; it exists to be compared against an invoice.
 */
export function carrierRentalCents(bought) {
  const raw = bought?.monthly_rental_rate ?? bought?.numbers?.[0]?.monthly_rental_rate;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

/** One search result, in the shape the client picker needs. */
export function normalizeSearchResult(raw, useCase) {
  const phoneNumber = toE164(raw?.number);
  const { series, error } = seriesForRentedNumber(phoneNumber, useCase);
  return {
    phoneNumber,
    city: raw?.city ?? null,
    region: raw?.region ?? null,
    type: raw?.type ?? null,
    // What PLIVO charges US, per month, in whatever currency the account bills
    // in. Never render this to a client as their price — the client's price is
    // set by our rate card, not by carrier cost. Phase D owns that.
    carrierMonthlyRental: raw?.monthly_rental_rate ?? null,
    voiceEnabled: raw?.voice_enabled ?? null,
    series: series ?? null,
    // Present only when the number is unusable for this workspace, so a picker
    // can grey it out with the reason rather than dropping it silently.
    unusableReason: error ?? null,
  };
}

// ── Gate ────────────────────────────────────────────────────────────────────

/**
 * Can this workspace be sold a number right now?
 *
 * Returns the compliance record on success so callers do not re-read it.
 */
export async function assertProvisionable(workspaceId) {
  const record = await getOrCreateCompliance(workspaceId);

  if (record.provider !== TELEPHONY_PROVIDER.PLIVO) {
    return { ok: false, error: `This workspace is provisioned on ${record.provider}, not Plivo.` };
  }
  if (record.suspended) {
    return { ok: false, error: record.suspendedReason ?? 'This workspace is suspended.' };
  }
  if (!record.useCase) {
    return { ok: false, error: 'Declare your call type before searching for a number — it decides which series you can be sold.' };
  }
  if (record.carrierApplicationStatus !== CARRIER_APPLICATION_STATUS.APPROVED) {
    return {
      ok: false,
      error: record.carrierApplicationStatus === CARRIER_APPLICATION_STATUS.SUBMITTED
        ? 'Your business verification is still with the carrier. Numbers can be allocated once it is approved.'
        : 'Complete business verification before requesting a number.',
    };
  }
  if (!record.carrierApplicationRef) {
    // Approved with no reference is a data fault, not a client problem: the buy
    // call cannot be made without the application id.
    logger.error({ workspaceId }, 'Compliance is APPROVED but carrierApplicationRef is empty');
    return { ok: false, error: 'Your verification record is incomplete. Support has been notified.' };
  }

  return { ok: true, record };
}

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * Available inventory for this workspace, restricted to the series its declared
 * use case permits.
 *
 * Costs nothing and reserves nothing — Plivo has no hold mechanism, so a number
 * shown here can be gone by the time it is picked. rentNumber() is where that
 * race surfaces, as a carrier error rather than a wrong number.
 */
export async function searchNumbers(workspaceId, { pattern, city, limit = MAX_SEARCH_LIMIT, offset = 0 } = {}) {
  const gate = await assertProvisionable(workspaceId);
  if (!gate.ok) return gate;

  const { useCase } = gate.record;
  const chosen = searchPatternFor(useCase, pattern);
  if (chosen.error) return { ok: false, error: chosen.error };

  const credentials = requireMain();
  const response = await plivoRequest('/PhoneNumber/', {
    method: 'GET',
    query: {
      country_iso: COUNTRY_ISO,
      type: PLIVO_NUMBER_TYPE.LOCAL,
      ...(chosen.pattern ? { pattern: chosen.pattern } : {}),
      ...(city ? { city } : {}),
      services: 'voice',
      limit: String(Math.min(Math.max(1, Number(limit) || MAX_SEARCH_LIMIT), MAX_SEARCH_LIMIT)),
      offset: String(Math.max(0, Number(offset) || 0)),
    },
    credentials,
  });

  const rows = Array.isArray(response?.objects) ? response.objects : [];
  const numbers = rows
    .map((raw) => normalizeSearchResult(raw, useCase))
    .filter((n) => n.phoneNumber && !n.unusableReason);

  // What the CLIENT would pay, from our rate card — the only price a picker
  // should ever render. Returned once for the page rather than per number
  // because it is the same for all of them, and because copying it onto each
  // row invites someone to show the carrier cost by mistake.
  const rate = await getNumberRate();

  return {
    ok: true,
    useCase,
    numbers,
    pricing: {
      setupCents: rate.setupCents,
      monthlyCents: rate.monthlyCents,
      dueNowCents: rate.setupCents + rate.monthlyCents,
      currency: 'INR',
    },
    // Plivo pages at 20; report what it said so a picker can page rather than
    // guess whether an empty second page means "no more" or "ask again".
    total: response?.meta?.total_count ?? null,
  };
}

// ── Rent ────────────────────────────────────────────────────────────────────

/**
 * Rent one number into the workspace's subaccount and record it.
 *
 * Order is deliberate and every step is a guard against spending money we
 * cannot account for:
 *
 *   1. Gate on the approved application.
 *   2. Validate the series BEFORE buying — a wrong-series number cannot be
 *      reconfigured, only released and replaced.
 *   3. Check nobody already holds this number, so the carrier call is not made
 *      for a purchase that assignNumber() would refuse anyway.
 *   4. Create the subaccount (idempotent). It lives here rather than in the
 *      compliance step so a client who files KYC and never buys leaves none.
 *   5. Buy, passing `subaccount` so there is no buy-then-transfer window during
 *      which the number sits on the parent account.
 *   6. Record. If this fails, release at the carrier — an untracked rented
 *      number bills monthly and is invisible to us.
 *
 * @returns {Promise<{ok: boolean, error?: string, number?: object}>}
 */
export async function rentNumber(workspaceId, { phoneNumber } = {}) {
  const gate = await assertProvisionable(workspaceId);
  if (!gate.ok) return gate;
  const { record } = gate;

  const e164 = toE164(phoneNumber);
  const chosenSeries = seriesForRentedNumber(e164, record.useCase);
  if (chosenSeries.error) return { ok: false, error: chosenSeries.error };

  const appId = process.env.PLIVO_VOICE_APP_ID;
  if (!appId) {
    // Bought without an app, the number falls back to Plivo's
    // `default_number_app` and never reaches our answer URL — inbound calls
    // land nowhere, silently, on a number we are now paying for.
    throw new PlivoError(
      'PLIVO_VOICE_APP_ID is not set. A number rented without a voice application cannot receive calls on this platform.',
      { status: 503 },
    );
  }

  const existing = await prisma.voiceNumber.findUnique({ where: { phoneNumber: e164 } });
  if (existing) {
    return {
      ok: false,
      error: existing.workspaceId === workspaceId
        ? 'This number is already assigned to this workspace.'
        : 'That number is already held by another customer.',
    };
  }

  const credentials = requireMain();

  // Charge BEFORE asking the carrier. Renting first and billing after hands a
  // number we pay ~₹200/month for to a client with an empty wallet, and the
  // only way back is to release it — which destroys the DLT header they will
  // have started registering. Refusing here is free.
  const charge = await chargeNumberPurchase(workspaceId, { phoneNumber: e164 });
  if (!charge.ok) return charge;

  const subaccount = await createSubaccount(workspaceId, { entityName: record.entityName });

  let bought;
  try {
    bought = await plivoRequest(`/PhoneNumber/${carrierNumber(e164)}/`, {
      method: 'POST',
      json: {
        subaccount: subaccount.authId,
        compliance_application_id: record.carrierApplicationRef,
        app_id: appId,
        alias: `ws_${workspaceId}`,
      },
      credentials,
      // A retried buy is a second rented number on a different digits string, or
      // a confusing 4xx on the same one. Neither is worth the retry.
      idempotent: false,
    });
  } catch (err) {
    // The carrier said no — most often because someone else took the number
    // between the search and the click, since Plivo has no hold mechanism. The
    // client must not be left paying for it.
    await refundNumberPurchase(workspaceId, { phoneNumber: e164, ...charge });
    throw err;
  }

  const result = await assignNumber(workspaceId, {
    phoneNumber: e164,
    provider: TELEPHONY_PROVIDER.PLIVO,
    providerNumberId: carrierNumber(e164),
    subaccountId: subaccount.authId,
    series: chosenSeries.series,
    clientMonthlyCents: charge.monthlyCents,
    carrierMonthlyCents: carrierRentalCents(bought),
    // The first month is paid; the next charge is a month out.
    nextRenewalAt: nextRenewalFrom(new Date()),
  });

  if (!result.ok) {
    // Same shape as the orphaned-subaccount cleanup in subaccount.service.js:
    // the resource exists at the carrier and we cannot account for it, so undo
    // it rather than leave it billing against a workspace that has no row.
    await refundNumberPurchase(workspaceId, { phoneNumber: e164, ...charge });
    logger.error(
      { workspaceId, phoneNumber: e164, err: result.error },
      'Rented a number but could not record it — releasing it at the carrier',
    );
    await plivoRequest(`/Number/${carrierNumber(e164)}/`, {
      method: 'DELETE',
      credentials,
      idempotent: false,
    }).catch((cleanupError) => {
      logger.error(
        { workspaceId, phoneNumber: e164, err: cleanupError.message },
        'ORPHANED PLIVO NUMBER — rented, unrecorded, and could not be released. Release it manually in the Plivo console.',
      );
    });
    return result;
  }

  logger.info(
    { workspaceId, phoneNumber: e164, subaccountId: subaccount.authId, series: chosenSeries.series },
    'Rented a Plivo number into the workspace subaccount',
  );

  return { ok: true, number: result.number, carrier: bought };
}

// ── Release ─────────────────────────────────────────────────────────────────

/**
 * Give a number back to the carrier and mark our row released.
 *
 * The carrier call comes FIRST. `compliance.releaseNumber()` on its own only
 * flips a status column — a number released our side but never unrented keeps
 * billing monthly for as long as the account exists, which is the quiet way a
 * reseller's margin disappears.
 *
 * Not reversible and not a transfer: a released number is never handed to
 * another workspace, because its DLT header registration and carrier reputation
 * belong to the entity that burned them.
 */
export async function releaseRentedNumber(workspaceId, { numberId } = {}) {
  const number = await prisma.voiceNumber.findFirst({ where: { id: numberId, workspaceId } });
  if (!number) return { ok: false, error: 'Number not found in this workspace.' };
  if (number.status === VOICE_NUMBER_STATUS.RELEASED) {
    return { ok: false, error: 'That number has already been released.' };
  }

  if (number.provider === TELEPHONY_PROVIDER.PLIVO) {
    const credentials = requireMain();
    try {
      await plivoRequest(`/Number/${carrierNumber(number.phoneNumber)}/`, {
        method: 'DELETE',
        credentials,
        idempotent: false,
      });
    } catch (err) {
      // A 404 means Plivo does not hold it — already unrented, or never ours.
      // Recording the release is then the correct end state, not a failure.
      if (err instanceof PlivoError && err.status === 404) {
        logger.warn(
          { workspaceId, phoneNumber: number.phoneNumber },
          'Plivo does not hold this number; recording the release anyway',
        );
      } else {
        // Deliberately fatal. Marking it released here while the carrier still
        // bills us is the exact drift this function exists to prevent.
        throw err;
      }
    }
  }

  const recorded = await recordRelease(workspaceId, { numberId });
  if (!recorded.ok) return recorded;

  logger.info({ workspaceId, phoneNumber: number.phoneNumber }, 'Released a number back to the carrier');
  return { ok: true, phoneNumber: number.phoneNumber };
}
