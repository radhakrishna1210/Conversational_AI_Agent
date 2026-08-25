// DLT compliance onboarding — the screen a new Indian workspace has to clear
// before it can dial.
//
// Everything here is client-facing. The steps only WE can take — accepting
// documents, recording the carrier's decision, confirming a PE ID against the
// portal, suspending a workspace — are deliberately not routed here; they live
// under /admin. A workspace that can mark its own PE ID verified has no gate.

import logger from '../lib/logger.js';
import * as compliance from '../services/compliance/compliance.service.js';
import * as carrier from '../services/plivo/compliance.service.js';
import * as carrierNumbers from '../services/plivo/number.service.js';
import { PlivoError } from '../services/plivo/client.js';

const wsId = (req) => req.params.workspaceId;

const fail = (res, result, status = 400) => res.status(status).json({ error: result.error });

/**
 * Carrier calls fail in ways the client can act on ("re-upload that document")
 * and ways they cannot ("Plivo is down"). PlivoError already carries the right
 * status for the first kind; anything else is ours and is a 502, because a
 * 500 here would read as "the client sent something bad".
 */
const failCarrier = (res, err, action) => {
  if (err instanceof PlivoError) {
    logger.warn({ err: err.message, status: err.status }, `${action} rejected by Plivo`);
    return res.status(err.status && err.status < 500 ? err.status : 502).json({ error: err.message });
  }
  logger.error({ err: err.message }, `${action} failed`);
  return res.status(502).json({ error: `Could not reach the carrier to ${action}. Try again shortly.` });
};

// GET /workspaces/:workspaceId/compliance
// The whole onboarding state: record, documents, templates, numbers, and the
// evaluated checklist the UI renders directly.
export const getCompliance = async (req, res) => {
  try {
    res.json(await compliance.getComplianceState(wsId(req)));
  } catch (err) {
    logger.error({ err: err.message }, 'getCompliance failed');
    res.status(500).json({ error: 'Could not load compliance status.' });
  }
};

// PUT /workspaces/:workspaceId/compliance/use-case
export const putUseCase = async (req, res) => {
  const result = await compliance.setUseCase(wsId(req), req.body);
  if (!result.ok) return fail(res, result);
  res.json(await compliance.getComplianceState(wsId(req)));
};

// PUT /workspaces/:workspaceId/compliance/entity-details
// Registration number, registered address and entity contact email — what the
// carrier's end_user record needs beyond the DLT checklist.
export const putEntityDetails = async (req, res) => {
  const result = await compliance.setEntityDetails(wsId(req), req.body);
  if (!result.ok) return fail(res, result);
  res.json(await compliance.getComplianceState(wsId(req)));
};

// GET /workspaces/:workspaceId/compliance/carrier-application
// Whether this workspace could file today, and everything still missing. Read
// only — safe to poll while the client fills the form in.
export const getCarrierApplication = async (req, res) => {
  try {
    const check = await carrier.preflight(wsId(req));
    res.json({
      ready: check.ok,
      errors: check.errors,
      warnings: check.warnings,
      status: check.record.carrierApplicationStatus,
      reference: check.record.carrierApplicationRef,
      rejectionReason: check.record.carrierRejectionReason,
      submittedAt: check.record.carrierApplicationAt,
    });
  } catch (err) {
    logger.error({ err: err.message }, 'getCarrierApplication failed');
    res.status(500).json({ error: 'Could not check the carrier application.' });
  }
};

// POST /workspaces/:workspaceId/compliance/carrier-application
// File the KYC application with the carrier. Days of review follow; the result
// arrives on the /plivo/compliance webhook.
export const postCarrierApplication = async (req, res) => {
  try {
    const result = await carrier.submitApplication(wsId(req));
    if (!result.ok) return res.status(409).json({ error: result.error, errors: result.errors, canCorrect: result.canCorrect });
    res.status(201).json({
      complianceId: result.complianceId,
      warnings: result.warnings,
      ...(await compliance.getComplianceState(wsId(req))),
    });
  } catch (err) {
    return failCarrier(res, err, 'file your compliance application');
  }
};

// PATCH /workspaces/:workspaceId/compliance/carrier-application
// Resubmit after a rejection. Every document goes back up — Plivo replaces the
// set wholesale rather than merging.
export const patchCarrierApplication = async (req, res) => {
  try {
    const result = await carrier.correctApplication(wsId(req));
    if (!result.ok) return res.status(409).json({ error: result.error, errors: result.errors });
    res.json({
      complianceId: result.complianceId,
      warnings: result.warnings,
      ...(await compliance.getComplianceState(wsId(req))),
    });
  } catch (err) {
    return failCarrier(res, err, 'resubmit your compliance application');
  }
};

// POST /workspaces/:workspaceId/compliance/carrier-application/refresh
// Backstop for a lost webhook: ask the carrier where the application got to.
export const refreshCarrierApplication = async (req, res) => {
  try {
    const result = await carrier.refreshApplication(wsId(req));
    if (!result.ok) return fail(res, result, 409);
    res.json(await compliance.getComplianceState(wsId(req)));
  } catch (err) {
    return failCarrier(res, err, 'check your compliance application');
  }
};

// PUT /workspaces/:workspaceId/compliance/pe-id
// Recorded as SUBMITTED, never VERIFIED — we have no API into the DLT portals,
// so a pasted number is a claim, not a verification.
export const putPeId = async (req, res) => {
  const result = await compliance.setPeId(wsId(req), req.body);
  if (!result.ok) return fail(res, result);
  res.json({
    operator: result.operator,
    warning: result.warning ?? null,
    ...(await compliance.getComplianceState(wsId(req))),
  });
};

// POST /workspaces/:workspaceId/compliance/tm-binding
export const postTmBinding = async (req, res) => {
  const result = await compliance.requestTmBinding(wsId(req));
  if (!result.ok) return fail(res, result);
  res.json(await compliance.getComplianceState(wsId(req)));
};

// POST /workspaces/:workspaceId/compliance/documents  (multipart: file + kind)
export const postDocument = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach the document as `file`.' });
  const result = await compliance.upsertDocument(wsId(req), {
    kind: req.body.kind,
    fileName: req.file.originalname,
    storageKey: req.file.filename,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
  });
  if (!result.ok) return fail(res, result);
  res.status(201).json(await compliance.getComplianceState(wsId(req)));
};

// DELETE /workspaces/:workspaceId/compliance/documents/:documentId
// Needed so a client can switch between the two acceptable forms of business
// registration (Certificate of Incorporation vs Udyam) — re-uploading only ever
// replaces the same kind.
export const deleteDocument = async (req, res) => {
  const result = await compliance.deleteDocument(wsId(req), { documentId: req.params.documentId });
  if (!result.ok) return fail(res, result, 409);
  res.json(await compliance.getComplianceState(wsId(req)));
};

// POST /workspaces/:workspaceId/compliance/templates
export const postTemplate = async (req, res) => {
  const result = await compliance.saveTemplate(wsId(req), req.body);
  if (!result.ok) return fail(res, result);
  res.status(req.body.id ? 200 : 201).json(await compliance.getComplianceState(wsId(req)));
};

// POST /workspaces/:workspaceId/compliance/numbers
// Provisioning is a platform action in production — this endpoint records the
// binding once a number has actually been rented from the carrier against this
// customer's approved compliance application.
export const postNumber = async (req, res) => {
  const result = await compliance.assignNumber(wsId(req), req.body);
  if (!result.ok) return fail(res, result, 409);
  res.status(201).json(await compliance.getComplianceState(wsId(req)));
};

// PUT /workspaces/:workspaceId/compliance/numbers/:numberId/header
export const putHeaderStatus = async (req, res) => {
  const result = await compliance.setHeaderStatus(wsId(req), {
    numberId: req.params.numberId,
    ...req.body,
  });
  if (!result.ok) return fail(res, result);
  res.json(await compliance.getComplianceState(wsId(req)));
};

// GET /workspaces/:workspaceId/compliance/numbers/available?pattern=&city=&offset=
// Live carrier inventory, filtered to the series this workspace's declared use
// case permits. Free, and reserves nothing — Plivo has no hold mechanism.
export const getAvailableNumbers = async (req, res) => {
  try {
    const result = await carrierNumbers.searchNumbers(wsId(req), {
      pattern: req.query.pattern,
      city: req.query.city,
      offset: Number(req.query.offset) || 0,
    });
    if (!result.ok) return fail(res, result, 409);
    res.json(result);
  } catch (err) {
    return failCarrier(res, err, 'search for available numbers');
  }
};

// POST /workspaces/:workspaceId/compliance/numbers/rent  { phoneNumber }
//
// SUPER_ADMIN only, and deliberately so until phase D lands. This is the call
// that spends real money against our parent account, and there is no wallet
// debit behind it yet — a member-facing route here would let a client rent
// numbers we pay for and they do not. See NUMBER_PURCHASE_MARKETPLACE.md §D.
export const postRentNumber = async (req, res) => {
  try {
    const result = await carrierNumbers.rentNumber(wsId(req), { phoneNumber: req.body?.phoneNumber });
    if (!result.ok) return fail(res, result, 409);
    res.status(201).json({
      number: result.number,
      ...(await compliance.getComplianceState(wsId(req))),
    });
  } catch (err) {
    return failCarrier(res, err, 'rent that number');
  }
};

// DELETE /workspaces/:workspaceId/compliance/numbers/:numberId
// Releases the number AT THE CARRIER and then records it. The row survives: a
// caller ID is bound to one entity's DLT registration and its carrier
// reputation follows the number, so knowing who last held it matters after it
// is gone.
export const deleteNumber = async (req, res) => {
  try {
    const result = await carrierNumbers.releaseRentedNumber(wsId(req), { numberId: req.params.numberId });
    if (!result.ok) return fail(res, result, 404);
    res.json(await compliance.getComplianceState(wsId(req)));
  } catch (err) {
    // The carrier call failed, so nothing was recorded either. That is the
    // intended outcome: a row marked released while Plivo still bills us for
    // the number is the drift this whole path exists to prevent.
    return failCarrier(res, err, 'release that number');
  }
};
