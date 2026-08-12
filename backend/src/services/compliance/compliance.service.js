// Workspace DLT compliance state, and the gate that stops non-compliant dialling.
//
// The rules themselves live in ./dlt.js as pure functions. This module only
// loads state from Postgres, feeds it to them, and persists the mutations the
// onboarding flow makes.

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { env } from '../../config/env.js';
import {
  CARRIER_APPLICATION_STATUS,
  COMPLIANCE_MODE,
  DLT_OPERATORS,
  DOCUMENT_KIND,
  DOCUMENT_STATUS,
  HEADER_STATUS,
  PE_STATUS,
  TELEPHONY_PROVIDER,
  TEMPLATE_STATUS,
  TM_BINDING_STATUS,
  USE_CASE,
  VOICE_NUMBER_STATUS,
} from '../../constants/compliance.js';
import {
  classifyNumberSeries,
  evaluateCompliance,
  firstBlockingReason,
  isIndianNumber,
  parsePeId,
} from './dlt.js';

/** Current enforcement mode, validated. An unknown value falls back to `warn`. */
export function complianceMode() {
  const raw = String(env.DLT_COMPLIANCE_MODE ?? '').toLowerCase();
  const known = Object.values(COMPLIANCE_MODE);
  if (known.includes(raw)) return raw;
  logger.warn(`DLT_COMPLIANCE_MODE="${raw}" is not one of ${known.join('|')} — falling back to "warn".`);
  return COMPLIANCE_MODE.WARN;
}

/**
 * The compliance row for a workspace, created on first read.
 *
 * Created lazily rather than in the workspace-creation path: this has to work
 * for the workspaces that already exist, and a row of defaults is exactly the
 * "nothing done yet" state the checklist should report for them anyway.
 */
export async function getOrCreateCompliance(workspaceId) {
  const existing = await prisma.workspaceCompliance.findUnique({
    where: { workspaceId },
    include: { documents: true, templates: true },
  });
  if (existing) return existing;

  try {
    return await prisma.workspaceCompliance.create({
      data: { workspaceId },
      include: { documents: true, templates: true },
    });
  } catch (err) {
    // Unique violation: another request created it between our read and write.
    if (err?.code === 'P2002') {
      return prisma.workspaceCompliance.findUnique({
        where: { workspaceId },
        include: { documents: true, templates: true },
      });
    }
    throw err;
  }
}

/**
 * Full compliance state plus the evaluated checklist — everything the
 * onboarding screen renders.
 */
export async function getComplianceState(workspaceId) {
  const [record, numbers] = await Promise.all([
    getOrCreateCompliance(workspaceId),
    prisma.voiceNumber.findMany({
      where: { workspaceId },
      orderBy: { assignedAt: 'desc' },
    }),
  ]);

  const evaluation = evaluateCompliance({
    suspended: record.suspended,
    suspendedReason: record.suspendedReason,
    useCase: record.useCase,
    documents: record.documents,
    carrierApplicationStatus: record.carrierApplicationStatus,
    carrierRejectionReason: record.carrierRejectionReason,
    peId: record.peId,
    peStatus: record.peStatus,
    tmBindingStatus: record.tmBindingStatus,
    templates: record.templates,
    numbers,
  });

  return {
    mode: complianceMode(),
    // Shown in the checklist so the client can paste it into their DLT portal.
    platformTmId: env.PLATFORM_TM_ID || null,
    operators: DLT_OPERATORS,
    record: {
      useCase: record.useCase,
      entityName: record.entityName,
      legalEntityType: record.legalEntityType,
      provider: record.provider,
      carrierApplicationStatus: record.carrierApplicationStatus,
      carrierApplicationRef: record.carrierApplicationRef,
      carrierRejectionReason: record.carrierRejectionReason,
      peId: record.peId,
      peOperator: record.peOperator,
      peStatus: record.peStatus,
      tmId: record.tmId,
      tmBindingStatus: record.tmBindingStatus,
      suspended: record.suspended,
      suspendedReason: record.suspendedReason,
    },
    documents: record.documents.map((d) => ({
      id: d.id, kind: d.kind, fileName: d.fileName, status: d.status,
      reviewNote: d.reviewNote, createdAt: d.createdAt,
    })),
    templates: record.templates.map((t) => ({
      id: t.id, dltTemplateId: t.dltTemplateId, name: t.name, body: t.body,
      status: t.status, rejectionReason: t.rejectionReason, approvedAt: t.approvedAt,
    })),
    numbers: numbers.map((n) => ({
      id: n.id, phoneNumber: n.phoneNumber, provider: n.provider, series: n.series,
      headerStatus: n.headerStatus, status: n.status, dailyDialCap: n.dailyDialCap,
      assignedAt: n.assignedAt,
    })),
    ...evaluation,
  };
}

/**
 * Can this workspace place an outbound call from `fromNumber`?
 *
 * Same `{ allowed, code, message }` shape as assertCanStartCall() so the two
 * gates compose in the campaign runner without special-casing either.
 *
 * DLT is Indian law about Indian traffic: a non-Indian caller ID is out of
 * scope and passes untouched. That is what makes it safe to deploy this while
 * the existing Twilio numbers are still in service.
 */
export async function assertComplianceReady(workspaceId, { fromNumber } = {}) {
  const mode = complianceMode();
  if (mode === COMPLIANCE_MODE.OFF) return { allowed: true };
  if (!isIndianNumber(fromNumber)) return { allowed: true };

  let state;
  try {
    state = await getComplianceState(workspaceId);
  } catch (err) {
    // A compliance lookup that fails is not permission to dial. Fail closed in
    // `enforce`; in `warn` the deployment has explicitly accepted the risk.
    logger.error({ workspaceId, err: err.message }, 'Compliance state lookup failed');
    return mode === COMPLIANCE_MODE.ENFORCE
      ? { allowed: false, code: 'COMPLIANCE_UNKNOWN', message: 'Could not verify DLT compliance for this workspace. Calling is blocked until that check succeeds.' }
      : { allowed: true };
  }

  if (state.ready) return { allowed: true };

  const reason = firstBlockingReason(state) ?? 'DLT compliance is incomplete.';
  const code = state.suspended ? 'COMPLIANCE_SUSPENDED' : 'COMPLIANCE_INCOMPLETE';

  if (mode === COMPLIANCE_MODE.WARN) {
    logger.warn(
      { workspaceId, fromNumber, code, blocking: state.blocking.map((b) => b.key) },
      `DLT compliance would block this call (mode=warn): ${reason}`,
    );
    return { allowed: true };
  }

  return {
    allowed: false,
    code,
    message: `${reason} Complete DLT onboarding before calling Indian numbers.`,
  };
}

/**
 * Gate a whole caller-ID rotation at once.
 *
 * A campaign rotates several caller IDs, and one non-compliant number in the
 * list is enough to make the campaign non-compliant — the calls placed from it
 * are just as unregistered as if every number were. Refuse on the first
 * failure rather than dialling until the rotation happens to land on it.
 */
export async function assertRotationCompliant(workspaceId, rotation = []) {
  for (const fromNumber of rotation) {
    const gate = await assertComplianceReady(workspaceId, { fromNumber });
    if (!gate.allowed) return { ...gate, fromNumber };
  }
  return { allowed: true };
}

// ─── Onboarding mutations ────────────────────────────────────────────────────

/** Declare promotional vs service/transactional. Decides the number series. */
export async function setUseCase(workspaceId, { useCase, entityName, legalEntityType }) {
  if (useCase && !Object.values(USE_CASE).includes(useCase)) {
    return { ok: false, error: `useCase must be one of ${Object.values(USE_CASE).join(', ')}.` };
  }
  const record = await getOrCreateCompliance(workspaceId);

  // Changing the use case after a number is live is not a settings change: the
  // number's series no longer permits the traffic, and the number has to be
  // released and replaced. Refuse rather than silently invalidate it.
  if (useCase && record.useCase && useCase !== record.useCase) {
    const live = await prisma.voiceNumber.count({
      where: { workspaceId, status: VOICE_NUMBER_STATUS.ACTIVE },
    });
    if (live > 0) {
      return {
        ok: false,
        error: 'This workspace already has a live caller number provisioned for its current call type. Changing the call type requires releasing that number and provisioning one in the correct series — contact support.',
      };
    }
  }

  await prisma.workspaceCompliance.update({
    where: { id: record.id },
    data: {
      ...(useCase ? { useCase } : {}),
      ...(entityName !== undefined ? { entityName } : {}),
      ...(legalEntityType !== undefined ? { legalEntityType } : {}),
    },
  });
  return { ok: true };
}

/**
 * Record the client's DLT Principal Entity ID.
 *
 * Stored as SUBMITTED, not VERIFIED. We have no API into the DLT portals, so
 * claiming verification on the strength of a pasted number would make the gate
 * decorative. A human confirms it against the portal.
 */
export async function setPeId(workspaceId, { peId }) {
  const parsed = parsePeId(peId);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const record = await getOrCreateCompliance(workspaceId);
  await prisma.workspaceCompliance.update({
    where: { id: record.id },
    data: {
      peId: parsed.peId,
      peOperator: parsed.operator?.code ?? null,
      peStatus: PE_STATUS.SUBMITTED,
      peVerifiedAt: null,
    },
  });
  return {
    ok: true,
    peId: parsed.peId,
    operator: parsed.operator,
    warning: parsed.warning,
  };
}

/** The client says they have added our TM ID in their DLT portal. */
export async function requestTmBinding(workspaceId) {
  const record = await getOrCreateCompliance(workspaceId);
  if (!record.peId) {
    return { ok: false, error: 'Add your DLT Principal Entity ID before binding a telemarketer.' };
  }
  await prisma.workspaceCompliance.update({
    where: { id: record.id },
    data: {
      tmId: env.PLATFORM_TM_ID || null,
      tmBindingStatus: TM_BINDING_STATUS.REQUESTED,
    },
  });
  return { ok: true };
}

/** Register (or replace) an entity document. One live document per kind. */
export async function upsertDocument(workspaceId, { kind, fileName, storageKey, mimeType, sizeBytes }) {
  if (!Object.values(DOCUMENT_KIND).includes(kind)) {
    return { ok: false, error: `kind must be one of ${Object.values(DOCUMENT_KIND).join(', ')}.` };
  }
  const record = await getOrCreateCompliance(workspaceId);
  const doc = await prisma.complianceDocument.upsert({
    where: { complianceId_kind: { complianceId: record.id, kind } },
    create: {
      complianceId: record.id, kind, fileName, storageKey,
      mimeType: mimeType ?? null, sizeBytes: sizeBytes ?? null,
      status: DOCUMENT_STATUS.UPLOADED,
    },
    update: {
      fileName, storageKey,
      mimeType: mimeType ?? null, sizeBytes: sizeBytes ?? null,
      status: DOCUMENT_STATUS.UPLOADED,
      reviewNote: null, reviewedAt: null,
    },
  });
  return { ok: true, document: { id: doc.id, kind: doc.kind, status: doc.status } };
}

/** Record a DLT voice template. Approved status requires the portal's template ID. */
export async function saveTemplate(workspaceId, { id, name, body, dltTemplateId, status }) {
  const record = await getOrCreateCompliance(workspaceId);

  if (status && !Object.values(TEMPLATE_STATUS).includes(status)) {
    return { ok: false, error: `status must be one of ${Object.values(TEMPLATE_STATUS).join(', ')}.` };
  }
  if (status === TEMPLATE_STATUS.APPROVED && !dltTemplateId) {
    return { ok: false, error: 'An approved template needs the template ID issued by the DLT portal.' };
  }

  const data = {
    name, body,
    ...(dltTemplateId !== undefined ? { dltTemplateId } : {}),
    ...(status ? { status } : {}),
    ...(status === TEMPLATE_STATUS.APPROVED ? { approvedAt: new Date(), rejectionReason: null } : {}),
  };

  if (id) {
    const owned = await prisma.dltVoiceTemplate.findFirst({ where: { id, complianceId: record.id } });
    if (!owned) return { ok: false, error: 'Template not found in this workspace.' };
    const updated = await prisma.dltVoiceTemplate.update({ where: { id }, data });
    return { ok: true, template: updated };
  }

  const created = await prisma.dltVoiceTemplate.create({
    data: { complianceId: record.id, ...data, status: status ?? TEMPLATE_STATUS.DRAFT },
  });
  return { ok: true, template: created };
}

/**
 * Bind a provisioned number to this workspace.
 *
 * `series` is taken from what the carrier sold us rather than inferred, because
 * only 140 and 1600 are decidable from the digits. When the caller does not
 * supply it we fall back to classification and record UNKNOWN if unsure — an
 * honest UNKNOWN fails the checklist, which is the correct outcome.
 *
 * A number is never moved between workspaces. Released rows are kept so the
 * history of who burned a number survives its release.
 */
export async function assignNumber(workspaceId, {
  phoneNumber, provider, providerNumberId, subaccountId, series, dailyDialCap,
}) {
  if (!isIndianNumber(phoneNumber)) {
    return { ok: false, error: 'Provide the number in E.164 form, e.g. +911402345678.' };
  }
  if (provider && !Object.values(TELEPHONY_PROVIDER).includes(provider)) {
    return { ok: false, error: `provider must be one of ${Object.values(TELEPHONY_PROVIDER).join(', ')}.` };
  }

  const existing = await prisma.voiceNumber.findUnique({ where: { phoneNumber } });
  if (existing) {
    return {
      ok: false,
      error: existing.workspaceId === workspaceId
        ? 'This number is already assigned to this workspace.'
        : 'This number has already been assigned to another workspace. A caller ID is bound to one entity\'s DLT registration and must never be reassigned — provision a new number instead.',
    };
  }

  const number = await prisma.voiceNumber.create({
    data: {
      workspaceId,
      phoneNumber,
      provider: provider ?? TELEPHONY_PROVIDER.PLIVO,
      providerNumberId: providerNumberId ?? null,
      subaccountId: subaccountId ?? null,
      series: series ?? classifyNumberSeries(phoneNumber),
      ...(Number.isInteger(dailyDialCap) ? { dailyDialCap } : {}),
    },
  });
  return { ok: true, number };
}

/** The client says the CLI is now registered as a header under their PE ID. */
export async function setHeaderStatus(workspaceId, { numberId, status, rejectionReason }) {
  if (!Object.values(HEADER_STATUS).includes(status)) {
    return { ok: false, error: `status must be one of ${Object.values(HEADER_STATUS).join(', ')}.` };
  }
  const number = await prisma.voiceNumber.findFirst({ where: { id: numberId, workspaceId } });
  if (!number) return { ok: false, error: 'Number not found in this workspace.' };

  await prisma.voiceNumber.update({
    where: { id: numberId },
    data: {
      headerStatus: status,
      headerRejectionReason: status === HEADER_STATUS.REJECTED ? (rejectionReason ?? null) : null,
      headerRegisteredAt: status === HEADER_STATUS.REGISTERED ? new Date() : null,
    },
  });
  return { ok: true };
}

/** Release a number. Kept as a row; never handed to another workspace. */
export async function releaseNumber(workspaceId, { numberId }) {
  const number = await prisma.voiceNumber.findFirst({ where: { id: numberId, workspaceId } });
  if (!number) return { ok: false, error: 'Number not found in this workspace.' };

  await prisma.voiceNumber.update({
    where: { id: numberId },
    data: { status: VOICE_NUMBER_STATUS.RELEASED, releasedAt: new Date() },
  });
  return { ok: true };
}

// ─── Reviewer actions (platform side) ────────────────────────────────────────

/**
 * These are the steps only we can take: accepting a client's documents,
 * recording the carrier's decision, confirming a PE ID against the portal, and
 * suspending a workspace. Routed through Super Admin, never the client's own
 * console — a workspace that can mark its own PE ID verified has no gate.
 */
export async function review(workspaceId, patch = {}) {
  const record = await getOrCreateCompliance(workspaceId);
  const data = {};

  if (patch.documentId && patch.documentStatus) {
    if (!Object.values(DOCUMENT_STATUS).includes(patch.documentStatus)) {
      return { ok: false, error: 'Invalid document status.' };
    }
    const doc = await prisma.complianceDocument.findFirst({
      where: { id: patch.documentId, complianceId: record.id },
    });
    if (!doc) return { ok: false, error: 'Document not found in this workspace.' };
    await prisma.complianceDocument.update({
      where: { id: doc.id },
      data: {
        status: patch.documentStatus,
        reviewNote: patch.reviewNote ?? null,
        reviewedAt: new Date(),
      },
    });
  }

  if (patch.carrierApplicationStatus) {
    if (!Object.values(CARRIER_APPLICATION_STATUS).includes(patch.carrierApplicationStatus)) {
      return { ok: false, error: 'Invalid carrier application status.' };
    }
    data.carrierApplicationStatus = patch.carrierApplicationStatus;
    data.carrierApplicationAt = new Date();
    data.carrierRejectionReason = patch.carrierApplicationStatus === CARRIER_APPLICATION_STATUS.REJECTED
      ? (patch.carrierRejectionReason ?? null)
      : null;
    if (patch.carrierApplicationRef !== undefined) data.carrierApplicationRef = patch.carrierApplicationRef;
  }

  if (patch.peStatus) {
    if (!Object.values(PE_STATUS).includes(patch.peStatus)) {
      return { ok: false, error: 'Invalid PE status.' };
    }
    if (patch.peStatus === PE_STATUS.VERIFIED && !record.peId) {
      return { ok: false, error: 'Cannot verify a Principal Entity with no PE ID on file.' };
    }
    data.peStatus = patch.peStatus;
    data.peVerifiedAt = patch.peStatus === PE_STATUS.VERIFIED ? new Date() : null;
  }

  if (patch.tmBindingStatus) {
    if (!Object.values(TM_BINDING_STATUS).includes(patch.tmBindingStatus)) {
      return { ok: false, error: 'Invalid telemarketer binding status.' };
    }
    data.tmBindingStatus = patch.tmBindingStatus;
    data.tmBoundAt = patch.tmBindingStatus === TM_BINDING_STATUS.BOUND ? new Date() : null;
  }

  if (patch.suspended !== undefined) {
    data.suspended = Boolean(patch.suspended);
    data.suspendedReason = patch.suspended ? (patch.suspendedReason ?? null) : null;
    data.suspendedAt = patch.suspended ? new Date() : null;
  }

  if (Object.keys(data).length) {
    await prisma.workspaceCompliance.update({ where: { id: record.id }, data });
  }
  return { ok: true };
}
