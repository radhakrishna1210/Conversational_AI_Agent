// backend/src/services/billing/money.js
/**
 * Currency and rate-card arithmetic (BUG-002).
 *
 * WHY MINOR UNITS EVERYWHERE
 * --------------------------
 * Every monetary value in this system is an INTEGER number of minor units
 * (paise for INR). Floating point is never used to HOLD money, only to compute
 * a rate, and every conversion funnels through the rounding helpers below.
 * `0.1 + 0.2 !== 0.3` is not an acceptable property for a ledger.
 *
 * WHY TWO CURRENCIES
 * ------------------
 * The plan catalogue is denominated in USD (`Plan.priceUsd`, `perMinuteUsd`)
 * because that is how the upstream provider rates in the cost model are quoted.
 * Razorpay settles in INR. Rather than convert at read time and hope the rate
 * never moves, the FX rate used for a charge is RECORDED on the ledger row, so
 * any historical charge can be re-derived exactly even years later. A rate
 * change must never retroactively alter what a past call cost.
 *
 * Source of truth for rates: backend/docs/VOICE_AGENT_PRICE_PER_MINUTE.md
 * (FX 1 USD = ₹96, re-verified 2026-07-24).
 */

/** Fallback FX rate. Matches the rate card doc; override per-environment. */
export const DEFAULT_USD_TO_INR = 96;

export const getFxUsdToInr = () => {
  const v = Number(process.env.FX_USD_TO_INR);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_USD_TO_INR;
};

/** The single currency this deployment bills in. Razorpay settles INR. */
export const getBillingCurrency = () => process.env.BILLING_CURRENCY || 'INR';

/**
 * Round to whole minor units.
 *
 * Half-up on the ABSOLUTE value, so the sign does not change the magnitude of
 * the rounding. `Math.round(-0.5)` is -0 in JS (it rounds toward +Infinity),
 * which would make a debit and its mirror-image credit differ by one unit and
 * silently break refund symmetry.
 */
export const toMinorUnits = (amount) => {
  if (!Number.isFinite(amount)) return 0;
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(amount));
};

/** USD (major units) -> billing-currency minor units, at an explicit rate. */
export const usdToBillingMinor = (usd, fxRate = getFxUsdToInr()) =>
  toMinorUnits(Number(usd || 0) * fxRate * 100);

/** Format minor units for display/logs. Not for arithmetic. */
export const formatMinor = (minor, currency = getBillingCurrency()) => {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : '';
  return `${symbol}${(Number(minor || 0) / 100).toFixed(2)}`;
};

/**
 * Billable minutes for a call.
 *
 * Rounded UP to a whole billing increment, which is standard telephony practice
 * and — more importantly — is what the customer was quoted. The increment is
 * configurable because per-second and per-minute billing are both defensible;
 * what is NOT defensible is billing one way and quoting another.
 *
 * A zero-or-negative duration bills nothing. A call that never connected must
 * cost the customer nothing, and a negative duration means a clock problem,
 * which must fail closed rather than produce a negative charge.
 */
export const billableMinutes = (durationSec) => {
  const sec = Number(durationSec);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  const incrementSec = Number(process.env.BILLING_INCREMENT_SEC) || 60;
  const minMinutes = incrementSec / 60;
  return Math.ceil(sec / incrementSec) * minMinutes;
};

/**
 * A plan's monthly price in billing minor units.
 *
 * INR IS THE PRICE OF RECORD. `priceInr` is used when set, and only falls back
 * to `priceUsd x FX` for a plan created before INR pricing existed. That
 * ordering matters: while the price was derived from USD, changing
 * FX_USD_TO_INR silently repriced every plan and the advertised figure never
 * matched what was actually debited.
 *
 * @param {{ priceInr?: number|null, priceUsd?: number }|null} plan
 * @returns {{ amountCents: number, fxRate: number|null, native: boolean }}
 */
export const planPriceMinor = (plan) => {
  // `Number(null)` is 0, NOT NaN. Since a legitimate price of 0 must be honoured
  // (the Free plan), the check here is `>= 0` — which means a null priceInr
  // would coerce to 0 and price a paid plan as FREE rather than falling back to
  // USD. Absence has to be tested before coercion, never after.
  const raw = plan?.priceInr;
  const inr = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
  if (Number.isFinite(inr) && inr >= 0) {
    return { amountCents: toMinorUnits(inr * 100), fxRate: null, native: true };
  }
  const fxRate = getFxUsdToInr();
  return {
    amountCents: usdToBillingMinor(plan?.priceUsd ?? 0, fxRate),
    fxRate,
    native: false,
  };
};

/**
 * What one minute of this call costs the customer, in billing minor units.
 *
 * The CUSTOMER RATE CARD, deliberately — not measured provider COGS. The
 * customer was quoted a stable per-minute price and that is what they pay;
 * actual STT+LLM+TTS cost is recorded separately on the call log so margin
 * stays reportable per call without making the customer's bill depend on which
 * provider happened to serve a given turn.
 *
 * Prefers the plan's native INR rate; falls back to USD x FX.
 *
 * @param {{ perMinuteInr?: number|null, perMinuteUsd?: number }|null} plan
 */
export const resolveCallRate = (plan) => {
  const perMinuteInr = Number(plan?.perMinuteInr);
  if (Number.isFinite(perMinuteInr) && perMinuteInr > 0) {
    return {
      ratePerMinuteCents: toMinorUnits(perMinuteInr * 100),
      // null, not a number: no conversion happened, and recording a rate that
      // was not applied would make the ledger misleading to an auditor.
      fxRate: null,
      perMinuteInr,
      native: true,
    };
  }

  const fxRate = getFxUsdToInr();
  // No plan resolved (deleted plan, workspace never subscribed) falls back to
  // the most expensive published rate rather than to free. Failing open on
  // price would let an unsubscribed workspace run unlimited free minutes, which
  // is the one failure mode here that is actively exploitable.
  const perMinuteUsd = Number(plan?.perMinuteUsd);
  const rateUsd = Number.isFinite(perMinuteUsd) && perMinuteUsd > 0
    ? perMinuteUsd
    : Number(process.env.FALLBACK_PER_MINUTE_USD) || 0.12;
  return {
    ratePerMinuteCents: usdToBillingMinor(rateUsd, fxRate),
    fxRate,
    perMinuteUsd: rateUsd,
    native: false,
  };
};

/** Total charge for a call, in billing minor units (always >= 0). */
export const calculateCallCharge = (durationSec, plan) => {
  const rate = resolveCallRate(plan);
  const minutes = billableMinutes(durationSec);
  return {
    ...rate,
    minutes,
    amountCents: toMinorUnits(minutes * rate.ratePerMinuteCents),
  };
};

/**
 * Proration for a mid-period plan change.
 *
 * Credits the unused remainder of the current plan and charges the pro-rated
 * remainder of the new one. Returns a SIGNED amount: positive means the
 * customer owes, negative means they are owed a credit.
 *
 * Time is measured in whole milliseconds against the real period boundaries
 * rather than an assumed 30-day month, because billing periods are not all the
 * same length and a February upgrade must not be quietly overcharged.
 */
export const calculateProration = ({ oldPlan, newPlan, periodStart, periodEnd, now = new Date() }) => {
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();
  const at = Math.min(Math.max(new Date(now).getTime(), start), end);
  const total = end - start;
  if (!Number.isFinite(total) || total <= 0) {
    return { amountCents: 0, unusedFraction: 0, creditCents: 0, chargeCents: 0 };
  }
  const unusedFraction = (end - at) / total;
  const oldPrice = planPriceMinor(oldPlan);
  const newPrice = planPriceMinor(newPlan);
  const creditCents = toMinorUnits(oldPrice.amountCents * unusedFraction);
  const chargeCents = toMinorUnits(newPrice.amountCents * unusedFraction);
  return {
    unusedFraction,
    creditCents,
    chargeCents,
    // Only meaningful when a conversion actually happened on either side.
    fxRate: newPrice.fxRate ?? oldPrice.fxRate,
    amountCents: chargeCents - creditCents,
  };
};
