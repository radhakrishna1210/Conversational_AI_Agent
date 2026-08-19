# TRAI / DLT Compliance — Outbound Calling in India

**Why this exists:** India does not let a platform buy phone numbers in bulk and hand
them to clients. A carrier will only rent a number against an approved
per-customer compliance application, and the caller ID must then be registered
as a header under *that customer's* DLT Principal Entity ID. Provisioning comes
**after** verification, not before. This document is the workflow that follows
from that, and `src/services/compliance/` is its implementation.

## Why not Twilio for India

Twilio's own India voice guidelines state outbound calls to India *"can only be
made from international (non-Indian) numbers."* There is no +91 caller ID to
reputation-manage. Worse, since October 2024 DoT requires carriers to stamp
**"International Call"** on every inbound international call, and telcos block
carriers that repeatedly present spoofed Indian CLI. An international leg with a
foreign caller ID is not a spam-score problem — it is the signature of the fraud
pattern the government is actively suppressing.

India traffic must originate domestically: Plivo, PIOPIY/TeleCMI, Ozonetel,
Knowlarity, or a direct Airtel IQ / Tata trunk.

## The two verifications

| | What | Frequency | Who does it |
|---|---|---|---|
| **Entity** | Client registers as Principal Entity (PE) on an access provider's DLT portal → 19-digit PE ID | Once per client | **The client.** Not us. |
| **Number** | That caller ID registered as a voice CLI/header under the PE ID | Once per number | The client, on their portal |

We cannot perform the PE registration on a client's behalf. It asserts a
customer-consent relationship that belongs to them, and TRAI audits exactly
that. Registering a client's brand under our entity would be document fraud.

## The delivery chain

```
Principal Entity  →  Telemarketer (Aggregator)  →  Telemarketer (Delivery)  →  Operator
   the client              us (TM-AF)                  Plivo
```

The client performs **PE-TM chain binding** in their DLT portal ("PE-TM Chain" /
"Manage Telemarketer") declaring our TM ID — `PLATFORM_TM_ID`. Without that
binding their PE ID and our infrastructure are unlinked, and the traffic counts
as unregistered however valid the PE registration is.

> **Open question:** whether we need our own TM-AF registration or ride on the
> carrier's. Our reading is that we need our own — we aggregate voice traffic
> from multiple sources, which is the stated definition — and it is likely also
> what unlocks 140-series allotment. Confirm in writing with Plivo
> before building client-facing copy around either answer.

## DLT portals

A client registers on one of these. **Each operator issues its own PE ID**, and
the portal should match the operator whose route terminates our calls — ask the
carrier which. The first three digits of a PE ID identify the issuing portal,
which `parsePeId()` uses to validate input.

| Operator | Portal | PE ID prefix |
|---|---|---|
| Airtel | `dltconnect.airtel.in` | 100 |
| Vodafone Idea | `vilpower.in` | 110 |
| Jio | `trueconnect.jio.com` | 120 |
| PingConnect | `pingconnect.in` | 130 |
| BSNL | `ucc-bsnl.co.in` | 140 |
| Tata (TTSL) | `telemarketer.tatateleservices.com` | 160 |
| SmartPing | `smartping.live` | 170 |

Registration costs ~₹5,900 (₹5,000 + GST) and takes 3–7 working days.
Non-refundable, including on rejection.

## Number series decides what may be said

Enforced by TRAI, not by the carrier's API. `seriesPermitsUseCase()` is this
table:

| Series | Permitted content | Availability |
|---|---|---|
| **140-xxx** | Promotional only; voice templates must be DLT-approved | Registered telemarketers |
| **Landline** (022, 080, …) | Service + transactional only — promotional prohibited | Any KYC'd Indian business |
| **1600-xx** | Service + transactional | **BFSI and government only** |
| Mobile 10-digit | Never valid for commercial outbound | — |

Only 140 and 1600 are decidable from the digits. Landline and mobile ranges
genuinely overlap — Bengaluru landlines are `80xxxxxxxx` and mobile numbers also
start with 8 — so `classifyNumberSeries()` returns `UNKNOWN` rather than
guessing. The authoritative series is recorded at provisioning, from what the
carrier sold us.

One upside worth knowing: TRAI ruled in July 2026 that apps cannot tag, filter
or block 140 and 1600 series calls except via DND. A compliant 140 number is
structurally immune to Truecaller-style spam labelling.

## Conversational AI is in scope

Being two-way is not an exemption. TRAI defines a *Robo Call* as an **AI or
pre-recorded voice call without a human caller** — the trigger is the absence of
a human, not the absence of interactivity.

- **Voice templates are required.** The agent's opening is a registered
  artifact. `Agent.dltTemplateId` pins an agent to an approved template.
- **AI disclosure is mandatory** — identify the company, state plainly that this
  is an AI voice assistant, ask consent to continue. This must be enforced in
  the runtime, not requested in a system prompt: a model can be argued out of a
  prompt instruction, and concealing AI identity can qualify as a deceptive
  trade practice under consumer law independently of TRAI.
- **Cold calling is prohibited.** Explicit prior digital consent is required;
  without it the call is UCC and the exposure is account termination.
- **"Transactional" is narrow** — only calls triggered within 30 minutes of a
  customer action qualify. Most calls a client wants to label transactional are
  not, and fall back to promotional (140-series + consent + DND).
- **How far an AI may deviate from a registered template is unresolved.** TRAI
  has issued no guidance. The defensible posture is to register the
  conversation *framework* (opening, qualification, closing) with broad variable
  placeholders, keep the model inside those guardrails, and never let delivered
  content contradict the registered body.

Also in scope: the DPDP Act (informed consent, purpose limitation, erasure;
penalties to ₹250 crore), RBI FPC (human escalation for BFSI), IRDAI for
insurance, and the 2026 IT Rules amendment on labelling synthetic voice and
prohibiting impersonation of real individuals.

## Onboarding workflow

Phases 2A and 2B run in **parallel** — which is why the implementation is a set
of independent requirement records, not a linear state machine.

| # | Step | Actor | Typical duration |
|---|---|---|---|
| 0 | Carrier account (India data region — **cannot be changed later**), our reseller KYC, our TM-AF registration, India-hosted media endpoint | Platform | one time |
| 1 | Workspace created with outbound **disabled**; checklist shown immediately | Platform | — |
| 2 | Declare call type — promotional or service/transactional | Client | minutes |
| 2A | Upload entity docs → we file the per-customer carrier compliance application | Client → Platform | 15 min – 1 business day |
| 2B | Register as Principal Entity on a DLT portal | Client | **3–7 working days** |
| 3 | PE-TM chain binding declaring our TM ID | Client | 1–2 days |
| 4 | Register consent + voice templates | Client | 1–3 days |
| 5 | We rent the number against the approved application, into a per-workspace subaccount | Platform | 24–48h |
| 6 | Register the number as a voice CLI/header under the PE ID | Client | 1–3 days |
| 7 | Gate passes → outbound enabled | Platform | — |

**Realistic signup-to-first-dial: 10–14 days**, mostly the client's paperwork.
Instant self-serve number purchase is not available for India at any price.
Start step 2B on day one; it is the long pole and needs nothing from us.

Entity documents required: COI (MCA) **or** Udyam (MSME); PAN **or** GST;
plus trade licence, address proof, authorisation letter and signatory ID for the
DLT portal itself.

## Enforcement

`assertComplianceReady(workspaceId, { fromNumber })` returns the same
`{ allowed, code, message }` shape as `assertCanStartCall()`. The campaign
runner checks the whole caller-ID rotation before the first dial and again once
per batch, so a mid-flight suspension pauses the campaign.

`DLT_COMPLIANCE_MODE` controls how hard it bites:

- `off` — no evaluation.
- `warn` (**default**) — evaluates and logs the refusal reason, but allows the
  call. Deploy in this mode: `enforce` would refuse every Indian outbound call
  from every existing workspace, none of which has a PE ID on file yet.
- `enforce` — blocks.

Non-Indian caller IDs pass untouched in every mode. DLT is Indian law about
Indian traffic, which is what makes this safe to ship while the existing Twilio
numbers are still in service.

## Still to build

- **Runtime-enforced AI disclosure** — a fixed opening utterance played before
  the model takes the turn, matching the registered template body.
- **DND / NDNC scrubbing** per campaign, and a platform-wide opt-out suppression
  list. `Contact.optedOut` exists but voice campaign recipients come from CSV
  with no `Contact` row.
- **Per-contact consent proof**, bound to the campaign and retained for audit.
  `VoiceNumber.dailyDialCap` is recorded but not yet enforced.
- **Number health scoring** — answer rate, average duration, sub-6s hangup
  ratio per number, with automatic quarantine.
- **Call window** (9am–9pm) and retry caps — neither is enforced today.
- **Document storage** — KYC documents currently land in `UPLOAD_DIR`. They are
  personal data under the DPDP Act and belong in private object storage with
  signed, expiring reads.
