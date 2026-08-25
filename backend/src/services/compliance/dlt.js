// Pure DLT compliance logic — no database, no network, no Express.
//
// Everything here is a total function over plain data so the rules can be tested
// directly. compliance.service.js is the thin layer that loads state from
// Postgres and feeds it to evaluateCompliance().

import {
  ACTOR,
  CARRIER_APPLICATION_STATUS,
  CHECK_STATUS,
  DLT_OPERATORS,
  DOCUMENT_GROUPS,
  DOCUMENT_STATUS,
  HEADER_STATUS,
  NUMBER_SERIES,
  PE_ID_LENGTH,
  PE_STATUS,
  TEMPLATE_STATUS,
  TM_BINDING_STATUS,
  USE_CASE,
  VOICE_NUMBER_STATUS,
} from '../../constants/compliance.js';

// ─── Principal Entity IDs ────────────────────────────────────────────────────

/**
 * Validate a 19-digit PE ID and identify which portal issued it.
 *
 * The first three digits identify the access provider, which is genuinely
 * useful: a client who registered on Jio's portal but whose traffic terminates
 * on an Airtel route has a problem worth catching at the form, not at the first
 * failed campaign.
 *
 * An unrecognised prefix is accepted with a warning rather than rejected. The
 * operator list is not constitutional — TRAI can add a provider, and refusing a
 * legitimate PE ID because our table is stale is the worse failure.
 *
 * @returns {{ok: boolean, peId?: string, operator?: object|null, warning?: string, error?: string}}
 */
export function parsePeId(raw) {
  const peId = String(raw ?? '').replace(/[\s-]/g, '');
  if (!peId) return { ok: false, error: 'Enter the 19-digit Entity ID from your DLT portal.' };
  if (!/^\d+$/.test(peId)) {
    return { ok: false, error: 'The Entity ID is all digits — remove any letters or symbols.' };
  }
  if (peId.length !== PE_ID_LENGTH) {
    return {
      ok: false,
      error: `The Entity ID must be exactly ${PE_ID_LENGTH} digits; this one has ${peId.length}.`,
    };
  }

  const operator = DLT_OPERATORS[peId.slice(0, 3)] ?? null;
  return operator
    ? { ok: true, peId, operator }
    : {
      ok: true,
      peId,
      operator: null,
      warning: 'We could not match this Entity ID to a known DLT portal. Double-check it was copied from the portal dashboard.',
    };
}

// ─── Number series ───────────────────────────────────────────────────────────

/** STD codes common enough to be worth disambiguating from mobile prefixes. */
const KNOWN_STD_CODES = new Set([
  '11', '20', '22', '33', '40', '44', '79', '80',  // Delhi, Pune, Mumbai, Kolkata, Hyderabad, Chennai, Ahmedabad, Bengaluru
  '120', '124', '129', '141', '161', '172', '175', '181', '183',
  '212', '231', '253', '257', '265', '278', '281', '294',
  '343', '353', '361', '364', '381', '385', '389',
  '422', '431', '452', '461', '462', '471', '481', '484', '487',
  '512', '522', '532', '542', '551', '562', '581', '591',
  '612', '621', '631', '641', '651', '657', '661', '671', '674',
  '712', '721', '724', '731', '744', '751', '755', '761', '771', '788',
  '821', '824', '831', '832', '836', '866', '870', '877', '883', '891',
  '904', '915', '916',
]);

/** True when the number is Indian (E.164 +91). DLT applies to nothing else. */
export function isIndianNumber(e164) {
  return /^\+91\d{10,}$/.test(String(e164 ?? '').replace(/[\s-]/g, ''));
}

/** National significant number for an Indian E.164 string, or null. */
function nationalPart(e164) {
  const n = String(e164 ?? '').replace(/[\s-]/g, '');
  return /^\+91\d+$/.test(n) ? n.slice(3) : null;
}

/**
 * Classify an Indian caller ID into a TRAI number series.
 *
 * Only 140 and 1600 are decidable from the digits alone. Landline and mobile
 * ranges genuinely overlap — Bengaluru landlines are `80xxxxxxxx` and mobile
 * numbers also start with 8 — so this returns UNKNOWN rather than guessing.
 *
 * The authoritative series is the one recorded when the number is provisioned,
 * because the carrier tells us what it sold us. This function is a sanity check
 * on that record and a way to reject an obviously wrong caller ID early.
 *
 * @returns {string|null} a NUMBER_SERIES value, or null for non-Indian numbers.
 */
export function classifyNumberSeries(e164) {
  const national = nationalPart(e164);
  if (national === null) return null;

  if (national.startsWith('140')) return NUMBER_SERIES.PROMOTIONAL_140;
  if (national.startsWith('1600')) return NUMBER_SERIES.BFSI_1600;

  // A 10-digit number in the 6–9 ranges that is not a recognised STD code is
  // almost certainly a mobile CLI, which is never a compliant commercial
  // caller ID. Worth naming explicitly so the error message can say why.
  if (/^[6-9]\d{9}$/.test(national)) {
    const isStd = [2, 3].some((len) => KNOWN_STD_CODES.has(national.slice(0, len)));
    if (!isStd) return NUMBER_SERIES.MOBILE;
  }

  return NUMBER_SERIES.UNKNOWN;
}

/**
 * Does a number series permit the declared use case?
 *
 * This is the rule that stops a client running a sales campaign from a landline
 * number provisioned for service calls — legal on the carrier's API, a
 * violation under TCCCPR.
 */
export function seriesPermitsUseCase(series, useCase) {
  if (useCase === USE_CASE.PROMOTIONAL) return series === NUMBER_SERIES.PROMOTIONAL_140;
  if (useCase === USE_CASE.TRANSACTIONAL) {
    return series === NUMBER_SERIES.TRANSACTIONAL_LANDLINE || series === NUMBER_SERIES.BFSI_1600;
  }
  return false;
}

/** Human-readable series name, for error messages and the checklist UI. */
export function describeSeries(series) {
  switch (series) {
    case NUMBER_SERIES.PROMOTIONAL_140: return '140-series (promotional)';
    case NUMBER_SERIES.TRANSACTIONAL_LANDLINE: return 'landline series (service/transactional)';
    case NUMBER_SERIES.BFSI_1600: return '1600-series (BFSI service/transactional)';
    case NUMBER_SERIES.MOBILE: return 'mobile number';
    default: return 'unrecognised series';
  }
}

// ─── Checklist evaluation ────────────────────────────────────────────────────

const check = (key, label, status, actor, detail) => ({ key, label, status, actor, detail });

/** Have we got one accepted document from each required group? */
function documentChecks(documents) {
  const accepted = new Set(
    (documents ?? [])
      .filter((d) => d.status === DOCUMENT_STATUS.ACCEPTED)
      .map((d) => d.kind),
  );
  const rejected = new Set(
    (documents ?? [])
      .filter((d) => d.status === DOCUMENT_STATUS.REJECTED)
      .map((d) => d.kind),
  );
  const uploaded = new Set(
    (documents ?? [])
      .filter((d) => d.status === DOCUMENT_STATUS.UPLOADED)
      .map((d) => d.kind),
  );

  return DOCUMENT_GROUPS.map((group) => {
    const options = group.anyOf.join(' or ');
    if (group.anyOf.some((k) => accepted.has(k))) {
      return check(group.key, group.label, CHECK_STATUS.COMPLETE, ACTOR.PLATFORM, null);
    }
    if (group.anyOf.some((k) => uploaded.has(k))) {
      return check(group.key, group.label, CHECK_STATUS.WAITING, ACTOR.PLATFORM, 'Uploaded — awaiting review.');
    }
    if (group.anyOf.some((k) => rejected.has(k))) {
      return check(group.key, group.label, CHECK_STATUS.REJECTED, ACTOR.CLIENT, `Rejected. Re-upload ${options}.`);
    }
    return check(group.key, group.label, CHECK_STATUS.TODO, ACTOR.CLIENT, `Upload ${options}.`);
  });
}

/**
 * Evaluate a workspace's compliance state into an ordered checklist.
 *
 * Ordered by the workflow, but deliberately NOT a linear state machine: the
 * client's PE registration and our carrier application run in parallel and
 * either can finish first. Each item reports independently so the UI can show
 * real progress on both tracks instead of a single misleading step counter.
 *
 * @param {object} state
 * @returns {{ready: boolean, checklist: Array, blocking: Array}}
 */
export function evaluateCompliance(state = {}) {
  const {
    suspended = false,
    suspendedReason = null,
    useCase = null,
    documents = [],
    carrierApplicationStatus = CARRIER_APPLICATION_STATUS.NOT_SUBMITTED,
    carrierRejectionReason = null,
    peId = null,
    peStatus = PE_STATUS.NOT_STARTED,
    tmBindingStatus = TM_BINDING_STATUS.NOT_BOUND,
    templates = [],
    numbers = [],
  } = state;

  const checklist = [];

  // 1 — Use case. First, because it decides which number series is bought and
  // the series cannot be changed later without releasing the number.
  checklist.push(useCase
    ? check('use_case', 'Call type declared', CHECK_STATUS.COMPLETE, ACTOR.CLIENT,
      useCase === USE_CASE.PROMOTIONAL ? 'Promotional — needs a 140-series number.' : 'Service/transactional — needs a landline or 1600-series number.')
    : check('use_case', 'Call type declared', CHECK_STATUS.TODO, ACTOR.CLIENT,
      'Declare whether calls are promotional or service/transactional.'));

  // 2 — Entity documents.
  checklist.push(...documentChecks(documents));

  // 3 — Our reseller compliance application to the carrier, filed per customer.
  switch (carrierApplicationStatus) {
    case CARRIER_APPLICATION_STATUS.APPROVED:
      checklist.push(check('carrier_application', 'Carrier compliance application', CHECK_STATUS.COMPLETE, ACTOR.CARRIER, null));
      break;
    case CARRIER_APPLICATION_STATUS.SUBMITTED:
      checklist.push(check('carrier_application', 'Carrier compliance application', CHECK_STATUS.WAITING, ACTOR.CARRIER, 'Submitted — typically approved within one business day.'));
      break;
    case CARRIER_APPLICATION_STATUS.REJECTED:
      checklist.push(check('carrier_application', 'Carrier compliance application', CHECK_STATUS.REJECTED, ACTOR.PLATFORM, carrierRejectionReason || 'Rejected by the carrier.'));
      break;
    default:
      checklist.push(check('carrier_application', 'Carrier compliance application', CHECK_STATUS.TODO, ACTOR.PLATFORM, 'Filed by us once the entity documents are accepted.'));
  }

  // 4 — The client's own PE registration. We record the outcome; we cannot do it.
  switch (peStatus) {
    case PE_STATUS.VERIFIED:
      checklist.push(check('pe_registration', 'DLT Principal Entity ID', CHECK_STATUS.COMPLETE, ACTOR.DLT, peId ? `PE ID ${peId}` : null));
      break;
    case PE_STATUS.SUBMITTED:
      checklist.push(check('pe_registration', 'DLT Principal Entity ID', CHECK_STATUS.WAITING, ACTOR.DLT, 'Submitted to the DLT portal — verification takes 3–7 working days.'));
      break;
    case PE_STATUS.REJECTED:
      checklist.push(check('pe_registration', 'DLT Principal Entity ID', CHECK_STATUS.REJECTED, ACTOR.CLIENT, 'The DLT portal rejected the registration. Correct the documents and resubmit.'));
      break;
    default:
      checklist.push(check('pe_registration', 'DLT Principal Entity ID', CHECK_STATUS.TODO, ACTOR.CLIENT, 'Register as a Principal Entity on your operator\'s DLT portal. Start this on day one — it is the slowest step.'));
  }

  // 5 — PE-TM chain binding. Without it the PE ID and our infrastructure are
  // unlinked, and the traffic counts as unregistered however valid the PE is.
  switch (tmBindingStatus) {
    case TM_BINDING_STATUS.BOUND:
      checklist.push(check('tm_binding', 'Telemarketer binding', CHECK_STATUS.COMPLETE, ACTOR.DLT, null));
      break;
    case TM_BINDING_STATUS.REQUESTED:
      checklist.push(check('tm_binding', 'Telemarketer binding', CHECK_STATUS.WAITING, ACTOR.DLT, 'Binding requested — awaiting approval on the DLT portal.'));
      break;
    case TM_BINDING_STATUS.REJECTED:
      checklist.push(check('tm_binding', 'Telemarketer binding', CHECK_STATUS.REJECTED, ACTOR.CLIENT, 'The binding request was rejected. Re-add our telemarketer ID in your DLT portal.'));
      break;
    default:
      checklist.push(check('tm_binding', 'Telemarketer binding', CHECK_STATUS.TODO, ACTOR.CLIENT,
        'In your DLT portal, open PE-TM Chain / Manage Telemarketer and add our telemarketer ID.'));
  }

  // 6 — At least one approved voice template. The agent's opening is a
  // registered artifact, not free-form text.
  const approvedTemplates = (templates ?? []).filter((t) => t.status === TEMPLATE_STATUS.APPROVED);
  const pendingTemplates = (templates ?? []).filter((t) => t.status === TEMPLATE_STATUS.SUBMITTED);
  if (approvedTemplates.length) {
    checklist.push(check('voice_template', 'Approved voice template', CHECK_STATUS.COMPLETE, ACTOR.DLT,
      `${approvedTemplates.length} approved.`));
  } else if (pendingTemplates.length) {
    checklist.push(check('voice_template', 'Approved voice template', CHECK_STATUS.WAITING, ACTOR.DLT, 'Submitted — awaiting DLT approval.'));
  } else {
    checklist.push(check('voice_template', 'Approved voice template', CHECK_STATUS.TODO, ACTOR.CLIENT,
      'Register the agent\'s opening script as a voice template and record the approved template ID here.'));
  }

  // 7 — A live number of the right series, with its header registered.
  const active = (numbers ?? []).filter((n) => n.status === VOICE_NUMBER_STATUS.ACTIVE);
  const rightSeries = active.filter((n) => seriesPermitsUseCase(n.series, useCase));
  const usable = rightSeries.filter((n) => n.headerStatus === HEADER_STATUS.REGISTERED);

  // A number suspended for non-payment is still OURS and still rented — it has
  // simply stopped dialling. Reported separately because the alternative is
  // what this code used to do: fall into the "no number" branch and tell the
  // client "we provision this once the carrier application is approved", which
  // is both wrong and unactionable when the real answer is "top up your wallet".
  // Named for the numbers, not shortened to `suspended` — that identifier is
  // already the WORKSPACE suspension flag in this function's parameters, and
  // the two mean very different things.
  const unpaidNumbers = (numbers ?? []).filter((n) => n.status === VOICE_NUMBER_STATUS.SUSPENDED_NONPAYMENT);

  if (!active.length && unpaidNumbers.length) {
    checklist.push(check('number_assigned', 'Caller number assigned', CHECK_STATUS.REJECTED, ACTOR.CLIENT,
      `${unpaidNumbers[0].phoneNumber} is suspended because its monthly rental is unpaid. Top up your wallet and it reactivates automatically — the number has not been given up.`));
  } else if (!active.length) {
    checklist.push(check('number_assigned', 'Caller number assigned', CHECK_STATUS.TODO, ACTOR.PLATFORM,
      'We provision this once the carrier application is approved.'));
  } else if (!rightSeries.length) {
    checklist.push(check('number_assigned', 'Caller number assigned', CHECK_STATUS.REJECTED, ACTOR.PLATFORM,
      `The assigned number is a ${describeSeries(active[0].series)}, which does not permit ${useCase ?? 'the declared'} calls. It must be replaced, not reconfigured.`));
  } else {
    checklist.push(check('number_assigned', 'Caller number assigned', CHECK_STATUS.COMPLETE, ACTOR.PLATFORM,
      `${rightSeries[0].phoneNumber} — ${describeSeries(rightSeries[0].series)}`));
  }

  if (usable.length) {
    checklist.push(check('header_registered', 'Caller ID registered on DLT', CHECK_STATUS.COMPLETE, ACTOR.DLT, null));
  } else if (rightSeries.some((n) => n.headerStatus === HEADER_STATUS.SUBMITTED)) {
    checklist.push(check('header_registered', 'Caller ID registered on DLT', CHECK_STATUS.WAITING, ACTOR.DLT, 'Header submitted — awaiting approval.'));
  } else if (rightSeries.some((n) => n.headerStatus === HEADER_STATUS.REJECTED)) {
    checklist.push(check('header_registered', 'Caller ID registered on DLT', CHECK_STATUS.REJECTED, ACTOR.CLIENT, 'The header was rejected on the DLT portal. Resubmit it under your PE ID.'));
  } else {
    checklist.push(check('header_registered', 'Caller ID registered on DLT', CHECK_STATUS.TODO, ACTOR.CLIENT,
      'Register the assigned number as a voice CLI/header under your PE ID.'));
  }

  const blocking = checklist.filter((c) => c.status !== CHECK_STATUS.COMPLETE);
  return {
    ready: !suspended && blocking.length === 0,
    suspended,
    suspendedReason,
    checklist,
    blocking,
  };
}

/**
 * The one-line reason a workspace cannot dial, for logs and API errors.
 * Returns null when it can.
 */
export function firstBlockingReason(evaluation) {
  if (evaluation.suspended) {
    return evaluation.suspendedReason
      ? `Outbound calling is suspended: ${evaluation.suspendedReason}`
      : 'Outbound calling is suspended for this workspace.';
  }
  const first = evaluation.blocking?.[0];
  if (!first) return null;
  return first.detail ? `${first.label} — ${first.detail}` : `${first.label} is not complete.`;
}
