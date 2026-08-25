// TRAI / DLT compliance vocabulary.
//
// India does not let a platform hand a client a phone number and let them dial.
// Two separate verifications gate every outbound commercial call:
//
//   1. ENTITY  — the client registers itself as a Principal Entity (PE) on an
//      access provider's DLT portal and receives a 19-digit PE ID. Once.
//   2. NUMBER  — each caller ID is then registered as a header/voice CLI under
//      that PE ID. Once per number.
//
// Neither can be done by us on the client's behalf: the PE registration asserts
// a customer-consent relationship that belongs to them, and TRAI audits it.
//
// See docs/DLT_COMPLIANCE.md for the full workflow this vocabulary encodes.

/** Access-provider DLT portals, keyed by the 3-digit prefix of the PE IDs they issue. */
export const DLT_OPERATORS = Object.freeze({
  100: { code: 'AIRTEL', name: 'Airtel', portal: 'https://dltconnect.airtel.in' },
  110: { code: 'VI', name: 'Vodafone Idea', portal: 'https://www.vilpower.in' },
  120: { code: 'JIO', name: 'Jio', portal: 'https://trueconnect.jio.com' },
  130: { code: 'PINGCONNECT', name: 'PingConnect', portal: 'https://pingconnect.in' },
  140: { code: 'BSNL', name: 'BSNL', portal: 'https://www.ucc-bsnl.co.in' },
  160: { code: 'TATA', name: 'Tata (TTSL)', portal: 'https://telemarketer.tatateleservices.com' },
  170: { code: 'SMARTPING', name: 'SmartPing', portal: 'https://smartping.live' },
});

/** A PE ID is exactly 19 digits. */
export const PE_ID_LENGTH = 19;

/**
 * What the client says they will use the number for. Declared BEFORE a number is
 * bought, because it decides which series they get and the series cannot be
 * changed afterwards without releasing the number and starting again.
 */
export const USE_CASE = Object.freeze({
  PROMOTIONAL: 'PROMOTIONAL',
  TRANSACTIONAL: 'TRANSACTIONAL',
});

/**
 * Number series. The series a CLI belongs to legally constrains what may be said
 * on the call — this is enforced by TRAI, not by the carrier's API.
 */
export const NUMBER_SERIES = Object.freeze({
  // 140-xxx: promotional/telemarketing only. Allotted to registered
  // telemarketers; every voice template must be DLT-approved.
  PROMOTIONAL_140: 'PROMOTIONAL_140',
  // Landline STD series (022, 080, ...): service and transactional only.
  // Promotional content on these is a violation.
  TRANSACTIONAL_LANDLINE: 'TRANSACTIONAL_LANDLINE',
  // 1600-xx: service/transactional, restricted to BFSI and government.
  BFSI_1600: 'BFSI_1600',
  // A 10-digit mobile CLI. Never valid for commercial outbound in India — this
  // is exactly the pattern the network-level spam filters target.
  MOBILE: 'MOBILE',
  UNKNOWN: 'UNKNOWN',
});

/** Documents an Indian entity must supply before a carrier will provision a number. */
export const DOCUMENT_KIND = Object.freeze({
  COI: 'COI',                     // Certificate of Incorporation (MCA)
  UDYAM: 'UDYAM',                 // Udyam / MSME registration — alternative to COI
  PAN: 'PAN',                     // Business PAN
  GST: 'GST',                     // GST certificate — alternative to PAN
  AUTH_LETTER: 'AUTH_LETTER',     // Authorised-signatory letter
  ADDRESS_PROOF: 'ADDRESS_PROOF',
});

/**
 * Business registration and tax registration are each satisfiable two ways;
 * the carrier wants one from each group, not all four.
 */
export const DOCUMENT_GROUPS = Object.freeze([
  { key: 'business_registration', label: 'Business registration', anyOf: [DOCUMENT_KIND.COI, DOCUMENT_KIND.UDYAM] },
  { key: 'tax_registration', label: 'Tax registration', anyOf: [DOCUMENT_KIND.PAN, DOCUMENT_KIND.GST] },
]);

export const DOCUMENT_STATUS = Object.freeze({
  UPLOADED: 'UPLOADED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
});

/** Our reseller compliance application to the carrier, filed per end customer. */
export const CARRIER_APPLICATION_STATUS = Object.freeze({
  NOT_SUBMITTED: 'NOT_SUBMITTED',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

/**
 * Plivo's own compliance-application lifecycle, and how it collapses onto ours.
 *
 * Two of Plivo's five states are worse than a plain rejection and must not be
 * flattened into one: `suspended` and `expired` mean a previously ACCEPTED
 * application has stopped protecting the numbers linked to it, so the client's
 * live numbers are dialling against nothing. They map to REJECTED *and* suspend
 * the workspace — see plivo/compliance.service.js#applyCarrierStatus.
 */
export const PLIVO_COMPLIANCE_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
});

export const PLIVO_COMPLIANCE_STATUS_MAP = Object.freeze({
  [PLIVO_COMPLIANCE_STATUS.DRAFT]: CARRIER_APPLICATION_STATUS.SUBMITTED,
  [PLIVO_COMPLIANCE_STATUS.SUBMITTED]: CARRIER_APPLICATION_STATUS.SUBMITTED,
  [PLIVO_COMPLIANCE_STATUS.ACCEPTED]: CARRIER_APPLICATION_STATUS.APPROVED,
  [PLIVO_COMPLIANCE_STATUS.REJECTED]: CARRIER_APPLICATION_STATUS.REJECTED,
  [PLIVO_COMPLIANCE_STATUS.SUSPENDED]: CARRIER_APPLICATION_STATUS.REJECTED,
  [PLIVO_COMPLIANCE_STATUS.EXPIRED]: CARRIER_APPLICATION_STATUS.REJECTED,
});

/** Plivo statuses that revoke an approval we had already been granted. */
export const PLIVO_REVOKING_STATUSES = Object.freeze([
  PLIVO_COMPLIANCE_STATUS.SUSPENDED,
  PLIVO_COMPLIANCE_STATUS.EXPIRED,
]);

/**
 * Plivo's `number_type`, which is a carrier taxonomy and NOT our NUMBER_SERIES.
 * India sells no mobile numbers to any CPaaS, so `mobile` is listed for
 * completeness and refused by numberTypeForUseCase().
 */
export const PLIVO_NUMBER_TYPE = Object.freeze({
  LOCAL: 'local',
  MOBILE: 'mobile',
  TOLLFREE: 'tollfree',
});

/** The client's own PE registration on a DLT portal. We only record its outcome. */
export const PE_STATUS = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  SUBMITTED: 'SUBMITTED',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
});

/**
 * PE-TM chain binding: the client declares our telemarketer (aggregator) ID in
 * their DLT portal. Without it their PE ID and our infrastructure are unlinked
 * and the traffic is unregistered.
 */
export const TM_BINDING_STATUS = Object.freeze({
  NOT_BOUND: 'NOT_BOUND',
  REQUESTED: 'REQUESTED',
  BOUND: 'BOUND',
  REJECTED: 'REJECTED',
});

/** A DLT-registered voice template — the script the agent is allowed to open with. */
export const TEMPLATE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

/** Header (voice CLI) registration of one number under the client's PE ID. */
export const HEADER_STATUS = Object.freeze({
  NOT_REGISTERED: 'NOT_REGISTERED',
  SUBMITTED: 'SUBMITTED',
  REGISTERED: 'REGISTERED',
  REJECTED: 'REJECTED',
});

export const VOICE_NUMBER_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  // The monthly rental could not be taken from the wallet and the grace period
  // has run out. The number stops dialling but WE KEEP PAYING THE CARRIER for
  // it — deliberately. Releasing would destroy the client's DLT header
  // registration, which they cannot get back: a new number means a new header
  // application on their operator's portal. Holding a dead number costs us
  // ~₹200/month; releasing one costs the client days and us a support ticket.
  // It reactivates by itself on the next sweep once the wallet can pay.
  SUSPENDED_NONPAYMENT: 'SUSPENDED_NONPAYMENT',
  // Released numbers keep their row forever. A released number is never handed
  // to another workspace: its header registration and accumulated carrier
  // reputation travel with the number, not with us.
  RELEASED: 'RELEASED',
});

export const TELEPHONY_PROVIDER = Object.freeze({
  PLIVO: 'PLIVO',
  TWILIO: 'TWILIO',
});

/**
 * How hard the gate bites. Deliberately not a boolean.
 *
 * `enforce` blocks calls outright. Switching a live deployment straight to it
 * would stop every existing workspace dead, because none of them have a PE ID
 * on file yet. `warn` evaluates the same rules and logs the refusal reason
 * without blocking, which is what makes the backfill survivable.
 */
export const COMPLIANCE_MODE = Object.freeze({
  OFF: 'off',
  WARN: 'warn',
  ENFORCE: 'enforce',
});

/** Checklist item states, as rendered in the onboarding UI. */
export const CHECK_STATUS = Object.freeze({
  COMPLETE: 'complete',
  // Submitted; we are waiting on a third party (carrier, DLT portal).
  WAITING: 'waiting',
  // Someone has to do something. `actor` says who.
  TODO: 'todo',
  REJECTED: 'rejected',
});

/** Who is blocked on a given checklist item. Drives the UI's "your move" badge. */
export const ACTOR = Object.freeze({
  CLIENT: 'client',
  PLATFORM: 'platform',
  CARRIER: 'carrier',
  DLT: 'dlt',
});
