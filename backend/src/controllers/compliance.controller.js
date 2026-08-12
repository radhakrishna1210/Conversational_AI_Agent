// DLT compliance onboarding — the screen a new Indian workspace has to clear
// before it can dial.
//
// Everything here is client-facing. The steps only WE can take — accepting
// documents, recording the carrier's decision, confirming a PE ID against the
// portal, suspending a workspace — are deliberately not routed here; they live
// under /admin. A workspace that can mark its own PE ID verified has no gate.

import logger from '../lib/logger.js';
import * as compliance from '../services/compliance/compliance.service.js';

const wsId = (req) => req.params.workspaceId;

const fail = (res, result, status = 400) => res.status(status).json({ error: result.error });

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

// DELETE /workspaces/:workspaceId/compliance/numbers/:numberId
// Releases the number. The row survives: a caller ID is bound to one entity's
// DLT registration and its carrier reputation follows the number, so knowing
// who last held it matters after it is gone.
export const deleteNumber = async (req, res) => {
  const result = await compliance.releaseNumber(wsId(req), { numberId: req.params.numberId });
  if (!result.ok) return fail(res, result, 404);
  res.json(await compliance.getComplianceState(wsId(req)));
};
