# DLT-Verified Number Integration — Implementation Plan

**Status:** plan only. Nothing built.

**Problem in one line:** a client can complete the entire 10–14 day DLT
onboarding, have their number recorded and header-approved, and still not be
able to dial from it — because **nothing outside `services/compliance/` reads
`VoiceNumber`**.

`DLT_COMPLIANCE.md` describes the workflow and `services/compliance/` implements
its bookkeeping. This plan connects that bookkeeping to the code that actually
places calls.

---

## 1. Current state

Verified by grep: `VoiceNumber` is read by `compliance.service.js` and nothing
else. The compliance subsystem is a complete, correct record that the calling
path never consults.

| | Reads from | Should read from |
|---|---|---|
| `callerNumber.controller.js` → `listCallerNumbers` | Twilio `IncomingPhoneNumbers` + `OutgoingCallerIds` | `VoiceNumber` first |
| `campaignRunner.service.js` → `callerRotation()` | `campaign.fromNumbers` → `campaign.fromNumber` → `TWILIO_FROM_NUMBER` | `VoiceNumber` for Indian traffic |
| `compliance.service.js` → `assertComplianceReady()` | workspace state only | workspace state **and** the specific CLI |

### The four gaps

| # | Gap | Severity |
|---|---|---|
| **G1** | `review()` is implemented but has **no route** — `peStatus` can never reach `VERIFIED`, so `state.ready` is never true, so `enforce` blocks every workspace | **Blocking** |
| **G2** | DLT-registered numbers are never offered in the caller-ID picker | High |
| **G3** | The dispatcher's rotation never uses them | High |
| **G4** | `assertComplianceReady()` validates the **workspace**, not the **caller ID** | **Compliance hole** |

### G4 in detail

```js
export async function assertComplianceReady(workspaceId, { fromNumber } = {}) {
  const mode = complianceMode();
  if (mode === COMPLIANCE_MODE.OFF) return { allowed: true };
  if (!isIndianNumber(fromNumber)) return { allowed: true };
  // ... loads state ...
  if (state.ready) return { allowed: true };   // ← fromNumber never checked again
```

`fromNumber` is used only to decide whether DLT applies at all. It is never
matched against the workspace's registered numbers. **A workspace that completed
onboarding for number A can dial from any Indian number B — including an
unregistered mobile — and the gate passes.** The number series check
(`seriesPermitsUseCase`) runs during checklist evaluation against the numbers on
file, not against the number actually being dialled.

This is the gap that matters most: everything else is a missing feature, this is
a control that reports success while not being enforced.

---

## 2. Preconditions

A number is integrable only when all eight hold. Seven are already modelled.

| # | Requirement | Field | Actor |
|---|---|---|---|
| 1 | Call type declared | `useCase` | Client |
| 2 | Entity docs accepted — (COI ∨ Udyam) ∧ (PAN ∨ GST) | `ComplianceDocument.status=ACCEPTED` | Client → platform review |
| 3 | Carrier compliance application approved | `carrierApplicationStatus=APPROVED` | Platform files, carrier decides |
| 4 | PE ID verified against the portal | `peStatus=VERIFIED` | Client registers, **platform verifies** (G1) |
| 5 | PE-TM binding with `PLATFORM_TM_ID` | `tmBindingStatus=BOUND` | Client |
| 6 | ≥1 approved voice template | `DltVoiceTemplate.status=APPROVED` | Client |
| 7 | Number of the correct series | `VoiceNumber.series` + `seriesPermitsUseCase()` | Platform provisions |
| 8 | Header registered under the client's PE | `headerStatus=REGISTERED` | Client reports |

Series rule: `PROMOTIONAL` → 140 only. `TRANSACTIONAL` → landline or 1600/1601.
Changing the use case after a number is live requires releasing the number —
`setUseCase()` already refuses it.

Infrastructure precondition, separate and easy to forget: **India media
anchoring.** Both legs must stay inside India or the call fails with
`violates_media_anchoring`. That constrains where `PUBLIC_BACKEND_WS_URL`
resolves and is tracked in `PLIVO_INTEGRATION.md` §11.

---

## 3. Implementation

### G1 — Super Admin review route

`review()` exists in `compliance.service.js` and is correct. It needs exposing.
It is **not** a client-facing route: a workspace that can mark its own PE ID
verified has no gate at all.

Add to `admin.routes.js`, following the existing `authenticate, isAdmin` pattern:

```
GET   /admin/compliance                      list workspaces by checklist state
GET   /admin/compliance/:workspaceId         full state (reuses getComplianceState)
PATCH /admin/compliance/:workspaceId         → review(workspaceId, patch)
GET   /admin/compliance/:workspaceId/documents/:documentId   signed download
```

`PATCH` body mirrors the `review()` patch shape exactly — `documentId` +
`documentStatus` + `reviewNote`, `carrierApplicationStatus` +
`carrierApplicationRef` + `carrierRejectionReason`, `peStatus`,
`tmBindingStatus`, `suspended` + `suspendedReason`. Add a zod schema to
`compliance.validator.js`; `review()` already validates enum membership, so the
schema is a shape guard, not a duplicate of the rules.

Every call writes an `AdminAuditLog` entry. Marking a PE ID verified is an
assertion that a human checked the DLT portal — it must be attributable.

### G2 — Serve DLT numbers in the caller-ID picker

Extend `listCallerNumbers` to return a third group, queried from `VoiceNumber`:

```js
{
  dlt: [{ phoneNumber, series, seriesLabel, headerStatus, status, source: 'dlt' }],
  owned:    [...],   // Twilio IncomingPhoneNumbers — unchanged
  verified: [...],   // Twilio OutgoingCallerIds    — unchanged
}
```

Two requirements on the response, both about honesty rather than data:

- `dlt` entries are the **only** ones valid for Indian outbound. `owned` and
  `verified` must carry an explicit flag (`validForIndia: false`) so the UI can
  disable rather than silently offer them.
- A `VoiceNumber` with `headerStatus !== 'REGISTERED'` is returned but marked
  unusable with its reason. Hiding it makes a client who is 90% through
  onboarding think nothing happened.

This controller currently talks to Twilio directly. It should not grow a second
carrier — route the owned/verified lookups through the telephony provider
abstraction when that lands (`PLIVO_INTEGRATION.md` Phase 1). Until then, keep
the Twilio calls where they are and simply add the `VoiceNumber` query
alongside; do not refactor the two together.

### G3 — Rotation prefers registered numbers

`callerRotation()` becomes async and workspace-aware:

```js
export async function callerRotation(campaign, workspaceId) {
  const configured = [...campaign.fromNumbers ?? [], campaign.fromNumber].filter(Boolean);

  const registered = await prisma.voiceNumber.findMany({
    where: { workspaceId, status: 'ACTIVE', headerStatus: 'REGISTERED' },
    select: { phoneNumber: true },
  });
  const registeredSet = new Set(registered.map(n => n.phoneNumber));

  // Explicit choice wins, but an Indian CLI that is not registered is dropped
  // rather than dialled — the gate would refuse it per-call anyway, and
  // failing 10,000 recipients one at a time is not a useful way to say
  // "this number is not registered".
  const usable = configured.filter(n => !isIndianNumber(n) || registeredSet.has(n));
  if (usable.length) return usable;

  if (registeredSet.size) return [...registeredSet];
  const fallback = process.env.TWILIO_FROM_NUMBER;
  return fallback ? [fallback] : [];
}
```

The dropped-number case must surface as a campaign-level error before dialling
starts, not as silent filtering. If `configured` had Indian numbers and `usable`
is empty, fail the campaign with a message naming the unregistered CLI.

Callers to update: `runCampaign()` (two call sites — initial and the per-batch
recheck) and anywhere else resolving a caller ID.

### G4 — Gate the caller ID, not just the workspace

In `assertComplianceReady()`, after `state.ready`:

```js
if (state.ready) {
  const cli = state.numbers.find(n => n.phoneNumber === fromNumber);
  const ok = cli
    && cli.status === VOICE_NUMBER_STATUS.ACTIVE
    && cli.headerStatus === HEADER_STATUS.REGISTERED
    && seriesPermitsUseCase(cli.series, state.record.useCase);

  if (!ok) {
    const reason = !cli
      ? `${fromNumber} is not a caller ID registered to this workspace.`
      : cli.headerStatus !== HEADER_STATUS.REGISTERED
        ? `${fromNumber} has no approved DLT header registration.`
        : `${fromNumber} is a ${describeSeries(cli.series)}, which does not permit ${state.record.useCase} calls.`;

    if (mode === COMPLIANCE_MODE.WARN) {
      logger.warn({ workspaceId, fromNumber }, `CLI not registered (mode=warn): ${reason}`);
      return { allowed: true };
    }
    return { allowed: false, code: 'CLI_NOT_REGISTERED', message: reason };
  }
  return { allowed: true };
}
```

**Must respect the existing mode semantics.** In `warn` it logs and allows —
otherwise shipping this stops every live Twilio-based Indian campaign the moment
it deploys, which is exactly the failure `warn` exists to prevent.

Note this makes `assertRotationCompliant()` meaningfully stricter for free: it
already walks the whole rotation, so one unregistered CLI in a rotation of ten
now fails the campaign before the first dial rather than on the tenth.

---

## 4. Build order

| Phase | Work | Depends on | Effort |
|---|---|---|---|
| **1** | G1 — admin review routes + validator + audit log | — | ~2h |
| **2** | G4 — CLI check in the gate, `warn`-safe | 1 (to test) | ~1h |
| **3** | G2 — `VoiceNumber` in the caller-ID picker | — | ~2h |
| **4** | G3 — rotation prefers registered numbers | 3 | ~2h |
| **5** | Client onboarding UI rendering the checklist | 1 | ~1d |

G1 first because nothing downstream is testable in `enforce` until a PE ID can
be marked verified. G4 second because it is a live compliance hole and is safe
to ship in `warn`.

Phases 1–4 are roughly a day. Phase 5 is the real remaining work, and the
checklist from `GET /compliance` is designed to render directly — every item
carries `status`, `actor` and `detail`, so a "your move / our move / waiting on
DLT" view is mostly presentation.

---

## 5. Rollout

1. Ship phases 1–4 with `DLT_COMPLIANCE_MODE=warn`. Nothing blocks.
2. Watch for `CLI not registered (mode=warn)` in the logs. Every occurrence is a
   campaign that would break under `enforce` — this is the backfill worklist.
3. Onboard existing workspaces: verify PE IDs, register headers, provision
   numbers of the right series.
4. When the warn log is quiet, flip to `enforce` — per workspace if a
   workspace-level override is added, otherwise globally.

Do not flip before step 2 is quiet. `enforce` with an unbackfilled estate stops
every Indian campaign at once.

---

## 6. Testing

- `assertComplianceReady` — registered CLI passes; unregistered Indian CLI
  refused in `enforce`, allowed-and-logged in `warn`; non-Indian CLI untouched
  in every mode; wrong-series CLI refused with the series named.
- `callerRotation` — explicit non-Indian choice preserved; unregistered Indian
  number dropped and surfaced; empty result fails the campaign rather than
  falling through to `TWILIO_FROM_NUMBER` for Indian traffic.
- `review()` routes — non-admin refused; `peStatus=VERIFIED` with no `peId` on
  file refused (already guarded in the service); audit row written.
- End-to-end: workspace with every precondition met can launch a campaign; the
  same workspace with `headerStatus` flipped to `SUBMITTED` cannot.

Run test files individually — the suite hangs on open handles.

---

## 7. Open items

1. **Provider abstraction.** `listCallerNumbers` and `placeOutboundCall` both
   talk to Twilio via raw `fetch`. G2/G3 add `VoiceNumber` awareness but do not
   fix that; the Plivo migration does. Keep the two changes separate — do not
   refactor carriers and add DLT awareness in one pass.
2. **Per-workspace enforcement mode.** `DLT_COMPLIANCE_MODE` is global today. A
   per-workspace override would allow onboarded workspaces onto `enforce` while
   the rest stay in `warn`, removing the flag-day. Small addition to
   `WorkspaceCompliance`, worth doing before the estate grows.
3. **`dailyDialCap` is recorded and unenforced** — covered by
   `DIALING_HYGIENE_PLAN.md`, not this plan. G3 makes rotation correct; it does
   not make it rate-limited.
4. **Document storage.** KYC documents land in `UPLOAD_DIR` on local disk. They
   are personal data under the DPDP Act and belong in private object storage
   with signed, expiring reads. The G1 download route should not be built
   against local disk if that move is imminent.
