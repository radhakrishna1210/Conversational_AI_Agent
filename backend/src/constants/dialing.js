// Dialling hygiene vocabulary — the controls that keep caller IDs alive.
//
// DLT (see ./compliance.js) answers "is this workspace allowed to dial at all?"
// This file answers the separate question "may we dial THIS person, from THIS
// number, right now?" — a per-dial decision that DLT registration does not
// make. Both gates have to pass.
//
// The binding constraint at scale is not the spam algorithm, it is TCCCPR's
// complaint threshold: 5 complaints in 10 days triggers enforcement. At 20,000
// calls/day that is one complaint per 40,000 calls, so the only durable defence
// is not calling people who did not ask. Everything here is damage limitation
// around that fact, not a substitute for it.

/** Why a number is on the do-not-dial list. */
export const SUPPRESSION_REASON = Object.freeze({
  // The person told us to stop. Permanent, and platform-wide by default: they
  // did not consent to being passed between our tenants.
  OPT_OUT: 'OPT_OUT',
  // National DND / NDNC registry. Blocks PROMOTIONAL traffic only —
  // service and transactional calls remain lawful to a DND number.
  DND: 'DND',
  // A complaint was raised against this number's traffic.
  COMPLAINT: 'COMPLAINT',
  // Added by an operator through Super Admin.
  MANUAL: 'MANUAL',
});

/** Platform-wide vs one workspace. */
export const SUPPRESSION_SCOPE = Object.freeze({
  PLATFORM: 'PLATFORM',
  WORKSPACE: 'WORKSPACE',
});

/**
 * Why a recipient was refused before dialling.
 *
 * Distinct from a call failure: these are calls we chose not to place. They are
 * the audit trail that proves scrubbing happened, so they are recorded on the
 * recipient row rather than only logged.
 */
export const SKIP_REASON = Object.freeze({
  OPTED_OUT: 'OPTED_OUT',
  DND: 'DND',
  SUPPRESSED: 'SUPPRESSED',
  ATTEMPTS_EXHAUSTED: 'ATTEMPTS_EXHAUSTED',
  INVALID_NUMBER: 'INVALID_NUMBER',
});

/** Why the dispatcher is holding rather than dialling. Transient, not a skip. */
export const HOLD_REASON = Object.freeze({
  OUTSIDE_CALL_WINDOW: 'OUTSIDE_CALL_WINDOW',
  ALL_NUMBERS_CAPPED: 'ALL_NUMBERS_CAPPED',
  ALL_NUMBERS_QUARANTINED: 'ALL_NUMBERS_QUARANTINED',
});

/** Why a caller ID was pulled out of rotation. */
export const QUARANTINE_REASON = Object.freeze({
  ANSWER_RATE_COLLAPSE: 'ANSWER_RATE_COLLAPSE',
  SHORT_HANGUP_SPIKE: 'SHORT_HANGUP_SPIKE',
  MANUAL: 'MANUAL',
});

// ─── Defaults ───────────────────────────────────────────────────────────────
// Every one of these is overridable by env (see config/env.js). The values are
// deliberately conservative: the cost of dialling too slowly is a slower
// campaign, the cost of dialling too fast is a dead number and a TCCCPR notice.

/** TRAI's permitted calling window, IST minutes from midnight: 09:00–21:00. */
export const DEFAULT_WINDOW_START_MIN = 9 * 60;
export const DEFAULT_WINDOW_END_MIN = 21 * 60;

/** India is UTC+5:30 year-round with no DST, so this is a constant, not a tz lookup. */
export const IST_OFFSET_MIN = 330;

/**
 * Warm-up ramp. A new CLI that jumps straight to 200 calls/day reads as a
 * burner; carriers score the *slope* as much as the volume. The effective cap
 * is a fraction of dailyDialCap for this many days after warmupStartedAt.
 */
export const WARMUP_DAYS = 14;
/** Floor for day 1, as a fraction of the full cap. Ramps linearly to 1.0. */
export const WARMUP_FLOOR_FRACTION = 0.1;

/**
 * A call shorter than this is a hangup, not a conversation. The ratio of these
 * is the earliest available signal that a number is being filtered or
 * screen-rejected — it moves before complaints and long before a carrier
 * notice.
 */
export const SHORT_CALL_SEC = 6;

/** Rolling window the health score is computed over. */
export const HEALTH_WINDOW_HOURS = 72;
/**
 * Below this many calls the rates are noise. Quarantining a number on a sample
 * of four calls would take healthy numbers out of rotation at random.
 */
export const HEALTH_MIN_SAMPLE = 40;
/** Quarantine below this answer rate. */
export const HEALTH_MIN_ANSWER_RATE = 0.15;
/** Quarantine above this short-hangup ratio. */
export const HEALTH_MAX_SHORT_RATE = 0.7;

/** Attempts per recipient per campaign, and the gap between them. */
export const DEFAULT_MAX_ATTEMPTS = 1;
export const DEFAULT_RETRY_BACKOFF_MIN = 240;
/** Never more than this many attempts on one recipient in a single IST day. */
export const MAX_ATTEMPTS_PER_DAY = 3;
