// Plivo compliance applications — the KYC gate in front of every Indian number.
//
// We are registered with Plivo as a RESELLER, which means one compliance
// application per end customer, filed by us, with that customer's documents.
// Plivo will not sell an Indian number against an application that is not
// already `accepted`, and it will not let one be created during the purchase
// flow. So this module is the long pole of number provisioning: nothing in
// plivo/number.service.js (phase C) can run until an application here reaches
// APPROVED.
//
// The application is always filed on the MAIN account. Subaccount credentials
// cannot file compliance, and the subaccount is not created here — it belongs
// to the purchase step, because a client who files KYC and never buys should
// not leave a subaccount behind.
//
// See backend/docs/NUMBER_PURCHASE_MARKETPLACE.md for the whole pipeline.

import { readFile } from 'fs/promises';
import path from 'path';

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { publicHttpBase } from '../../lib/publicUrl.js';
import {
  CARRIER_APPLICATION_STATUS,
  DOCUMENT_KIND,
  PLIVO_COMPLIANCE_STATUS,
  PLIVO_COMPLIANCE_STATUS_MAP,
  PLIVO_NUMBER_TYPE,
  PLIVO_REVOKING_STATUSES,
  TELEPHONY_PROVIDER,
  USE_CASE,
} from '../../constants/compliance.js';
import { getOrCreateCompliance } from '../compliance/compliance.service.js';
import { notifyWorkspace, NOTIFY_TYPE } from '../notify.service.js';
import { plivoRequest, mainCredentials, PlivoError } from './client.js';

const COUNTRY_ISO = 'IN';
const USER_TYPE_BUSINESS = 'business';

/** Plivo's cap on a compliance document upload. */
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

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
 * Plivo's `number_type` for a declared use case.
 *
 * Both Indian use cases resolve to `local`, which looks redundant but is not:
 * the series *within* local (022/080 vs 140 vs 160) is chosen at search time in
 * phase C, and it is the compliance application's `number_type` that has to
 * agree with the number eventually linked to it. India sells no mobile CLIs to
 * any CPaaS, so there is no third branch to add later.
 */
export function numberTypeForUseCase(useCase) {
  if (useCase === USE_CASE.PROMOTIONAL || useCase === USE_CASE.TRANSACTIONAL) {
    return PLIVO_NUMBER_TYPE.LOCAL;
  }
  return null;
}

/**
 * Collapse a business name to the form a human would call "the same name".
 *
 * Used only to COMPARE names, never to send one — Plivo matches the name we
 * submit against the registration certificate byte-for-byte, so the string on
 * the wire is always exactly what the client typed.
 */
export function normalizeBusinessName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Advisory warnings about the single most common rejection cause.
 *
 * We cannot read the uploaded PDFs, so this cannot be a real cross-document
 * check — it flags the shapes that get rejected, and says so. Never blocking:
 * a client whose certificate genuinely reads "Pvt Ltd" must be able to submit
 * "Pvt Ltd".
 */
export function businessNameWarnings(entityName) {
  const raw = String(entityName ?? '');
  const warnings = [];

  if (raw !== raw.trim()) {
    warnings.push('The entity name has leading or trailing spaces. Plivo compares it character by character against your registration certificate.');
  }
  if (/\s{2,}/.test(raw)) {
    warnings.push('The entity name contains a double space, which will not match a certificate that has one.');
  }
  if (/\b(pvt|ltd|llp|inc|co)\b(?!\.)/i.test(raw)) {
    warnings.push('Abbreviations like "Pvt Ltd" must be punctuated exactly as they appear on your Certificate of Incorporation — "Pvt. Ltd." and "Pvt Ltd" are different names to Plivo.');
  }
  if (raw && raw === raw.toUpperCase() && /[A-Z]{4,}/.test(raw)) {
    warnings.push('The entity name is in capitals. Check that matches the certificate — most MCA certificates are, but GST certificates often are not.');
  }
  return warnings;
}

/** Parse the JSON address column, tolerating the empty and corrupt cases. */
export function parseAddress(json) {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Plivo's `end_user` object.
 *
 * ⚠ These field names are FLAT (`address_line1`, `state`, `postal_code`), not
 * nested under an address object — an earlier draft in PLIVO_INTEGRATION.md §4
 * had them as `contact_email` and a nested `street_address`, which is wrong.
 * They are taken from Plivo's compliance docs and remain **unverified against a
 * live submission**. Everything that builds this payload lives in this one
 * function so a correction is a one-line change.
 */
export function buildEndUser(record) {
  const address = parseAddress(record.registeredAddress);
  return {
    name: record.entityName,
    type: USER_TYPE_BUSINESS,
    email: record.contactEmail,
    registration_number: record.registrationNumber,
    address_line1: address.addressLine1,
    city: address.city,
    state: address.state,
    postal_code: address.postalCode,
    country: address.country || COUNTRY_ISO,
  };
}

/**
 * Where Plivo posts status changes.
 *
 * `PLIVO_WEBHOOK_URL` wins because the signature is computed over this exact
 * string: if a deployment registered a URL with Plivo that our derivation would
 * not reproduce byte-for-byte, every genuine callback would be rejected.
 */
export function complianceCallbackUrl() {
  // process.env rather than the config/env.js snapshot, matching how every
  // other PLIVO_* key is read in this directory (see client.js) — and so this
  // stays testable without reloading the whole config module.
  if (process.env.PLIVO_WEBHOOK_URL) return process.env.PLIVO_WEBHOOK_URL;
  const base = publicHttpBase();
  return base ? `${base}/api/v1/plivo/compliance` : '';
}

// ── Requirements discovery ──────────────────────────────────────────────────

/**
 * What documents India currently wants.
 *
 * Called at runtime rather than hardcoded: Plivo revises the list as DoT rules
 * change, and the `document_type_id` values are UUIDs we could not invent. A
 * stale hardcoded list produces rejections that read like client errors.
 */
export async function getRequirements({ numberType = PLIVO_NUMBER_TYPE.LOCAL, userType = USER_TYPE_BUSINESS } = {}) {
  const credentials = requireMain();
  return plivoRequest('/PhoneNumber/Compliance/Requirements', {
    method: 'GET',
    query: { country_iso: COUNTRY_ISO, number_type: numberType, user_type: userType },
    credentials,
  });
}

/** The document-type array, wherever Plivo has hung it on the response. */
const requirementList = (requirements) => {
  const candidates = [
    requirements?.document_types,
    requirements?.documents,
    requirements?.requirements,
    Array.isArray(requirements) ? requirements : null,
  ];
  return candidates.find(Array.isArray) ?? [];
};

const requirementText = (req) =>
  [req?.document_name, req?.name, req?.description, req?.type]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const requirementId = (req) => req?.document_type_id ?? req?.id ?? null;

const dataFieldNames = (req) => {
  const fields = req?.data_fields ?? req?.fields ?? [];
  if (Array.isArray(fields)) return fields.map((f) => (typeof f === 'string' ? f : f?.name)).filter(Boolean);
  if (fields && typeof fields === 'object') return Object.keys(fields);
  return [];
};

/**
 * Decide which of OUR documents satisfies each of Plivo's document types.
 *
 * Two signals, in order of trustworthiness:
 *
 *   1. Keywords in the type's name/description. "gst" is unambiguous;
 *      "incorporation"/"registration"/"udyam" identifies the other one.
 *   2. Whether the type declares a `business_name` data field. For India/local/
 *      business, the registration certificate is the one that does and the GST
 *      certificate is the one that does not — a structural signal that survives
 *      Plivo rewording its labels.
 *
 * Anything this cannot resolve is returned as `unmatched` rather than guessed
 * at. Sending a GST certificate as a registration certificate does not fail
 * fast; it fails days later as a rejection, and a reseller's rejections are
 * charged to the end customer's patience.
 *
 * @returns {{matched: Array, unmatched: Array}} matched entries are
 *   `{ requirement, documentTypeId, kind, dataFields }`
 */
export function matchRequirementsToDocuments(requirements, documents) {
  const byKind = new Map(documents.map((d) => [d.kind, d]));
  const registrationDoc = byKind.get(DOCUMENT_KIND.COI) ?? byKind.get(DOCUMENT_KIND.UDYAM) ?? null;
  const gstDoc = byKind.get(DOCUMENT_KIND.GST) ?? null;

  const matched = [];
  const unmatched = [];

  for (const req of requirementList(requirements)) {
    const id = requirementId(req);
    const text = requirementText(req);
    const fields = dataFieldNames(req);

    let doc = null;
    if (/\bgst\b/.test(text)) doc = gstDoc;
    else if (/incorporat|registration certificate|udyam|\bmca\b/.test(text)) doc = registrationDoc;
    else if (fields.includes('business_name')) doc = registrationDoc;

    if (!id || !doc) {
      unmatched.push({ requirement: req, reason: !id ? 'no document_type_id' : 'no uploaded document matches' });
      continue;
    }
    matched.push({ requirement: req, documentTypeId: id, kind: doc.kind, document: doc, dataFields: fields });
  }

  return { matched, unmatched };
}

// ── Preflight ───────────────────────────────────────────────────────────────

/**
 * Everything that would make Plivo reject this application, checked locally.
 *
 * A Plivo rejection costs days of the client's onboarding, so the cheap checks
 * belong on our side of the wire. `errors` block submission; `warnings` are
 * advisory and shown to the client alongside the submit button.
 */
export async function preflight(workspaceId) {
  const record = await getOrCreateCompliance(workspaceId);
  const errors = [];

  if (!record.useCase) {
    errors.push('Declare whether your calls are promotional or transactional — it decides which number series you can be sold.');
  }
  if (!record.entityName?.trim()) {
    errors.push('Enter your legal entity name exactly as it appears on your registration certificate.');
  }
  if (!record.registrationNumber?.trim()) {
    errors.push('Enter your CIN (or Udyam registration number).');
  }
  if (!record.contactEmail?.trim()) {
    errors.push('Enter a contact email for the registered entity.');
  }

  const address = parseAddress(record.registeredAddress);
  const missingAddress = ['addressLine1', 'city', 'state', 'postalCode']
    .filter((k) => !String(address[k] ?? '').trim());
  if (missingAddress.length) {
    errors.push(`Complete the registered address (missing: ${missingAddress.join(', ')}).`);
  }

  const kinds = new Set((record.documents ?? []).map((d) => d.kind));
  if (!kinds.has(DOCUMENT_KIND.COI) && !kinds.has(DOCUMENT_KIND.UDYAM)) {
    errors.push('Upload your Certificate of Incorporation (or Udyam registration certificate).');
  }
  // Our DOCUMENT_GROUPS accepts PAN or GST for tax registration. Plivo accepts
  // GST only, so a PAN-only client would sail through our own checklist and be
  // rejected by the carrier days later.
  if (!kinds.has(DOCUMENT_KIND.GST)) {
    errors.push(
      kinds.has(DOCUMENT_KIND.PAN)
        ? 'Plivo requires your GST registration certificate (Form GST REG-06) specifically — a PAN card does not satisfy it.'
        : 'Upload your GST registration certificate (Form GST REG-06).',
    );
  }

  const oversized = (record.documents ?? []).filter((d) => (d.sizeBytes ?? 0) > MAX_DOCUMENT_BYTES);
  for (const doc of oversized) {
    errors.push(`${doc.fileName} is larger than the 5 MB the carrier accepts.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings: businessNameWarnings(record.entityName),
    record,
  };
}

// ── Submission ──────────────────────────────────────────────────────────────

/** Read one uploaded document off disk as a Blob Plivo's multipart can carry. */
async function readDocumentBlob(doc) {
  // storageKey is multer's generated filename, but basename() it anyway: this
  // is the one place a stored string becomes a filesystem path, and a traversal
  // here would read arbitrary files off the server into a carrier upload.
  const filePath = path.join(env.UPLOAD_DIR, path.basename(doc.storageKey));
  let bytes;
  try {
    bytes = await readFile(filePath);
  } catch (err) {
    throw new PlivoError(
      `Could not read the uploaded document "${doc.fileName}" — re-upload it and try again.`,
      { status: 409, body: { storageKey: doc.storageKey, cause: err.message } },
    );
  }
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new PlivoError(`${doc.fileName} is larger than the 5 MB the carrier accepts.`, { status: 400 });
  }
  return new Blob([bytes], { type: doc.mimeType || 'application/octet-stream' });
}

/**
 * Build the multipart body for a create or update.
 *
 * The `documents[i].file` index MUST line up with position `i` in the JSON
 * `documents` array, so both are built from one ordered list rather than two
 * passes that could drift.
 */
export async function buildComplianceForm({ record, matched, numberType, includeCallback = true }) {
  const documents = matched.map(({ documentTypeId, dataFields }) => {
    const entry = { document_type_id: documentTypeId };
    // Only send data fields the requirement actually asked for. An unexpected
    // key is a validation error, not an ignored extra.
    if (dataFields.includes('business_name')) {
      entry.data_fields = { business_name: record.entityName };
    }
    return entry;
  });

  const data = {
    country_iso: COUNTRY_ISO,
    number_type: numberType,
    // Plivo requires the alias to be unique per end user. The workspace id is
    // the only identifier guaranteed unique and stable across a rename.
    alias: `ws_${record.workspaceId} ${record.entityName ?? ''}`.trim().slice(0, 99),
    end_user: buildEndUser(record),
    documents,
  };

  if (includeCallback) {
    const callbackUrl = complianceCallbackUrl();
    if (callbackUrl) {
      data.callback_url = callbackUrl;
      data.callback_method = 'POST';
    } else {
      // Not fatal: refreshApplication() polls. But without a callback the
      // client's approval is invisible until someone asks for it.
      logger.warn(
        'No PLIVO_WEBHOOK_URL or PUBLIC_BACKEND_WS_URL — filing the compliance application without a status callback. Approval will only be seen when polled.',
      );
    }
  }

  const form = new FormData();
  form.append('data', JSON.stringify(data));
  for (const [index, entry] of matched.entries()) {
    const blob = await readDocumentBlob(entry.document);
    form.append(`documents[${index}].file`, blob, entry.document.fileName);
  }
  return { form, data };
}

/**
 * File this workspace's compliance application with Plivo.
 *
 * Refuses when one is already in flight or already approved. Submitting twice
 * creates a SECOND application at Plivo against the same end customer: the
 * first is orphaned, both consume review capacity, and `carrierApplicationRef`
 * can only point at one of them — so the other becomes invisible to us while
 * still existing on our account.
 *
 * A REJECTED application is corrected in place via correctApplication(); this
 * function only starts a fresh one when there is no reference to correct.
 *
 * @returns {Promise<{ok: boolean, error?: string, warnings?: string[], complianceId?: string}>}
 */
export async function submitApplication(workspaceId) {
  const check = await preflight(workspaceId);
  const { record } = check;

  if (record.provider !== TELEPHONY_PROVIDER.PLIVO) {
    return { ok: false, error: `This workspace is provisioned on ${record.provider}, not Plivo.` };
  }

  const status = record.carrierApplicationStatus;
  if (status === CARRIER_APPLICATION_STATUS.APPROVED) {
    return { ok: false, error: 'This workspace already has an approved carrier application.' };
  }
  if (status === CARRIER_APPLICATION_STATUS.SUBMITTED) {
    return { ok: false, error: 'A carrier application is already under review. Check its status rather than filing a second one.' };
  }
  if (status === CARRIER_APPLICATION_STATUS.REJECTED && record.carrierApplicationRef) {
    return { ok: false, error: 'This application was rejected. Correct it rather than filing a new one.', canCorrect: true };
  }
  if (!check.ok) return { ok: false, error: check.errors[0], errors: check.errors, warnings: check.warnings };

  const numberType = numberTypeForUseCase(record.useCase);
  if (!numberType) return { ok: false, error: 'Declare your call type before filing for a number.' };

  const credentials = requireMain();
  const requirements = await getRequirements({ numberType });
  const { matched, unmatched } = matchRequirementsToDocuments(requirements, record.documents ?? []);

  if (unmatched.length || !matched.length) {
    // Deliberately loud. This is the failure mode where Plivo has changed its
    // requirement list under us, and the only safe response is to stop.
    logger.error(
      { workspaceId, unmatched, matchedKinds: matched.map((m) => m.kind) },
      'Could not map Plivo compliance requirements onto the uploaded documents',
    );
    return {
      ok: false,
      error: 'The carrier is asking for a document we do not recognise. This needs a platform operator — support has been notified.',
    };
  }

  const { form } = await buildComplianceForm({ record, matched, numberType });

  const created = await plivoRequest('/PhoneNumber/Compliance/', {
    method: 'POST',
    form,
    credentials,
    // A retried create files a second application against the same end
    // customer, which is exactly what the guards above exist to prevent.
    idempotent: false,
  });

  const complianceId = created?.compliance_id ?? created?.id ?? null;
  if (!complianceId) {
    throw new PlivoError('Plivo accepted the compliance application but returned no compliance_id.', {
      body: created,
    });
  }

  await prisma.workspaceCompliance.update({
    where: { id: record.id },
    data: {
      carrierApplicationRef: complianceId,
      carrierApplicationStatus: CARRIER_APPLICATION_STATUS.SUBMITTED,
      carrierApplicationAt: new Date(),
      carrierRejectionReason: null,
    },
  });

  logger.info({ workspaceId, complianceId }, 'Filed Plivo compliance application');
  return { ok: true, complianceId, warnings: check.warnings };
}

/**
 * Resubmit a rejected application with corrected documents.
 *
 * Plivo REPLACES the document set wholesale on a PATCH — it does not merge. So
 * every document goes back up, not just the one that was rejected, and a
 * client who re-uploaded only the bad file still gets a complete submission.
 */
export async function correctApplication(workspaceId) {
  const check = await preflight(workspaceId);
  const { record } = check;

  if (!record.carrierApplicationRef) {
    return { ok: false, error: 'There is no carrier application to correct.' };
  }
  if (record.carrierApplicationStatus !== CARRIER_APPLICATION_STATUS.REJECTED) {
    return { ok: false, error: 'Only a rejected application can be corrected.' };
  }
  if (!check.ok) return { ok: false, error: check.errors[0], errors: check.errors, warnings: check.warnings };

  const numberType = numberTypeForUseCase(record.useCase);
  const credentials = requireMain();
  const requirements = await getRequirements({ numberType });
  const { matched, unmatched } = matchRequirementsToDocuments(requirements, record.documents ?? []);

  if (unmatched.length || !matched.length) {
    logger.error({ workspaceId, unmatched }, 'Could not map Plivo compliance requirements on correction');
    return { ok: false, error: 'The carrier is asking for a document we do not recognise. This needs a platform operator.' };
  }

  const { form } = await buildComplianceForm({ record, matched, numberType });

  await plivoRequest(`/PhoneNumber/Compliance/${record.carrierApplicationRef}`, {
    method: 'PATCH',
    form,
    credentials,
    // Safe to retry: a PATCH replaces the same application's contents with the
    // same payload, unlike a create.
    idempotent: true,
  });

  await prisma.workspaceCompliance.update({
    where: { id: record.id },
    data: {
      carrierApplicationStatus: CARRIER_APPLICATION_STATUS.SUBMITTED,
      carrierApplicationAt: new Date(),
      carrierRejectionReason: null,
    },
  });

  logger.info({ workspaceId, complianceId: record.carrierApplicationRef }, 'Resubmitted Plivo compliance application');
  return { ok: true, complianceId: record.carrierApplicationRef, warnings: check.warnings };
}

// ── Status ingestion ────────────────────────────────────────────────────────

/**
 * Record a carrier decision.
 *
 * The single place a Plivo status becomes one of ours, shared by the webhook
 * and by polling, so the two can never drift.
 *
 * `suspended` and `expired` are the dangerous pair: they revoke an approval we
 * already had, which means numbers already linked to this application are live
 * and no longer covered. They suspend the workspace as well as failing the
 * application — a client dialling on a revoked application is the state that
 * gets our whole parent account actioned.
 */
export async function applyCarrierStatus(workspaceId, { plivoStatus, reason, complianceId } = {}) {
  const normalized = String(plivoStatus ?? '').toLowerCase();
  const mapped = PLIVO_COMPLIANCE_STATUS_MAP[normalized];
  if (!mapped) {
    logger.warn({ workspaceId, plivoStatus }, 'Unknown Plivo compliance status — ignoring');
    return { ok: false, error: `Unknown compliance status "${plivoStatus}".` };
  }

  const record = await getOrCreateCompliance(workspaceId);
  const revoking = PLIVO_REVOKING_STATUSES.includes(normalized);

  const data = {
    carrierApplicationStatus: mapped,
    carrierApplicationAt: new Date(),
    carrierRejectionReason: mapped === CARRIER_APPLICATION_STATUS.REJECTED
      ? (reason ?? (revoking ? `The carrier marked this application ${normalized}.` : null))
      : null,
    ...(complianceId ? { carrierApplicationRef: complianceId } : {}),
  };

  if (revoking && !record.suspended) {
    data.suspended = true;
    data.suspendedReason = `Carrier compliance application ${normalized}. Calling is stopped until it is refiled.`;
    data.suspendedAt = new Date();
  }

  await prisma.workspaceCompliance.update({ where: { id: record.id }, data });

  const log = revoking ? logger.error : logger.info;
  log.call(
    logger,
    { workspaceId, plivoStatus: normalized, mapped, suspended: Boolean(data.suspended) },
    'Applied Plivo compliance status',
  );

  // Tell the client. The verification screen says "we will email you the moment
  // it changes", and this is the only place that promise can be kept — the
  // review takes days, so nobody is watching the page when the answer lands.
  //
  // Only on a CHANGE: Plivo may re-send a callback, and refresh() polls, so
  // notifying unconditionally would email the same decision repeatedly.
  if (record.carrierApplicationStatus !== mapped) {
    await notifyCarrierDecision(workspaceId, mapped, data.carrierRejectionReason, revoking);
  }

  return { ok: true, status: mapped, suspended: Boolean(data.suspended) };
}

/** The customer-facing wording for each carrier outcome. */
async function notifyCarrierDecision(workspaceId, mapped, reason, revoking) {
  if (mapped === CARRIER_APPLICATION_STATUS.APPROVED) {
    return notifyWorkspace(workspaceId, {
      title: 'Your business verification was approved',
      message: 'The carrier accepted your documents. You can now be allocated a phone number.',
      // Deliberately repeated here: an approval is the moment a client assumes
      // they can start calling, and they cannot until their DLT header is
      // registered. Saying it once on the page is not enough.
      details: 'Before calls will connect, you still need to register the number as a header under your DLT Principal Entity on your operator\'s portal.',
      type: NOTIFY_TYPE.SUCCESS,
      actionText: 'Get a number',
      actionLink: '/number_verification',
      email: true,
    });
  }

  if (mapped === CARRIER_APPLICATION_STATUS.REJECTED) {
    return notifyWorkspace(workspaceId, {
      title: revoking ? 'Your business verification was withdrawn' : 'Your business verification needs correction',
      message: revoking
        ? 'The carrier has withdrawn your verification, and calling is stopped until it is refiled.'
        : 'The carrier could not accept your documents. Correct them and resubmit.',
      details: reason ?? null,
      type: NOTIFY_TYPE.ERROR,
      actionText: 'Review and resubmit',
      actionLink: '/number_verification',
      email: true,
    });
  }

  // SUBMITTED is the state the client just put it in themselves — the page
  // already said so, and an email confirming their own click is noise.
  return { notified: false, emailed: false };
}

/**
 * Ask Plivo where the application got to.
 *
 * The callback is the primary channel; this is the backstop for the cases that
 * lose it — a callback fired while we were deploying, a signature rejected
 * after a proxy change, an application filed before a webhook URL was set.
 */
export async function refreshApplication(workspaceId) {
  const record = await getOrCreateCompliance(workspaceId);
  if (!record.carrierApplicationRef) {
    return { ok: false, error: 'There is no carrier application to check.' };
  }

  const credentials = requireMain();
  const application = await plivoRequest(`/PhoneNumber/Compliance/${record.carrierApplicationRef}`, {
    method: 'GET',
    credentials,
  });

  const plivoStatus = application?.status ?? application?.compliance_status;
  const reason = application?.rejection_reason ?? application?.reason ?? null;
  return applyCarrierStatus(workspaceId, { plivoStatus, reason });
}

/**
 * Ingest a compliance status callback.
 *
 * Resolves the workspace from `carrierApplicationRef`, because the callback
 * carries Plivo's identifier and nothing of ours — the alias holds the
 * workspace id but is a display string we should not parse identity out of.
 *
 * An unresolvable callback is logged in full and swallowed: Plivo retries on a
 * non-2xx, and retrying a callback for an application we have no record of
 * would loop forever.
 */
export async function handleComplianceCallback(payload = {}) {
  const complianceId = payload.compliance_id ?? payload.id ?? payload.compliance_application_id ?? null;
  const plivoStatus = payload.status ?? payload.compliance_status ?? null;
  const reason = payload.rejection_reason ?? payload.reason ?? null;

  if (!complianceId) {
    logger.error({ payload }, 'Plivo compliance callback carried no compliance id');
    return { ok: false, error: 'no compliance id' };
  }

  const record = await prisma.workspaceCompliance.findFirst({
    where: { carrierApplicationRef: String(complianceId) },
    select: { workspaceId: true },
  });

  if (!record) {
    logger.error(
      { complianceId, plivoStatus, payload },
      'Plivo compliance callback for an application no workspace claims — check for an orphaned application in the Plivo console',
    );
    return { ok: false, error: 'unknown application' };
  }

  return applyCarrierStatus(record.workspaceId, { plivoStatus, reason, complianceId: String(complianceId) });
}

export { PLIVO_COMPLIANCE_STATUS };
