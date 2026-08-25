# Client Number Purchase — Selling Plivo Numbers Through Our Platform

**Companion to `PLIVO_INTEGRATION.md`** (which covers the carrier plumbing) and
`DLT_COMPLIANCE.md` (which covers Indian law). This document answers one
question: *how does a client, from inside our console, end up owning a phone
number that dials their bulk campaigns — with us as the only vendor they ever
see?*

Researched against Plivo's live docs on 2026-08-24. Code state verified against
`feat/home-call-anatomy-ui`.

---

## 0. Verdict

The model you described is exactly what Plivo's subaccount + compliance API is
built for, and roughly half of it is already in this repo. One thing has to
change, and it is not a small one:

> **A client cannot click "Buy" and have an Indian number in 30 seconds.**

Plivo will not sell an Indian number against a compliance application that does
not already exist and is not already `accepted`. Its own reseller guidance is
explicit: *"during purchase you must select an approved compliance application
for the relevant end customer, and the compliance application must be approved
before purchasing — you cannot create one during the purchase flow."*

So the product is not a shopping cart. It is an **application pipeline with a
purchase at the end of it**. Everything below follows from that.

| Your assumption | Reality |
|---|---|
| Plivo supports subaccounts under our main account | ✅ Yes — and it is already coded (`services/plivo/subaccount.service.js`) |
| We can rent a number straight into a client's subaccount | ✅ Yes — one param, `subaccount`, on the buy call |
| Client's numbers show under their account in our UI | ✅ Yes — `VoiceNumber` is already that table |
| Client never touches Plivo | ✅ Yes — they have no Plivo login, no Plivo balance, no Plivo invoice |
| Client self-serve buys instantly | ❌ Not for +91. Per-client KYC first, and it is a human review with a real wait |
| Subaccount = separate billing for the client | ❌ No. All charges land on our parent account. We bill from their wallet |

---

## 1. What a Plivo subaccount actually is

`GET/POST/DELETE https://api.plivo.com/v1/Account/{MAIN_AUTH_ID}/Subaccount/`

A subaccount is a **credential and isolation boundary, not a billing one**.
Plivo's own words: subaccounts "don't need to be individually recharged —
credits are deducted directly from the main account, and only one invoice is
generated at the end of every month."

That is *good* for us. It matches the wallet-only pricing model exactly: Plivo
bills us once, we bill each client from their wallet at our rate, and the client
never sees carrier cost. It also means **we must never surface a Plivo balance
to a client** — there isn't one.

What we actually buy with a subaccount per workspace:

| Benefit | Why it matters here |
|---|---|
| **Reputation isolation** | Indian carriers score caller IDs on volume, pacing and complaint rate. Numbers grouped under one account get throttled together. One client's bad campaign must not poison another's numbers. This is the main reason. |
| **Usage attribution** | Plivo reports per-subaccount usage — carrier-side ground truth to reconcile against `AgentCallLog` settlement, which is the only way to catch billing drift. |
| **Blast radius / kill switch** | `enabled=false` stops one client's carrier traffic instantly, touching nobody else. Already wired to `WorkspaceCompliance.suspended`. |
| **Clean teardown** | `DELETE .../Subaccount/{id}/?cascade=true` releases their numbers instead of silently reassigning them to our parent account. |

What it explicitly does **not** buy:

- **Separate billing.** Covered above.
- **A caller display name.** A subaccount `name` is an internal label, never
  transmitted on a call. See `PLIVO_INTEGRATION.md` §1 and §6 — branded caller
  ID in India is Truecaller / carrier programmes / CNAP, on a different rail.
- **A client login to Plivo.** There is no subaccount console access we would
  want a client to have. Our UI is the whole product surface.

- **Capacity isolation.** This one is the operational landmine, see below.

**Limits:** Plivo publishes no cap on subaccount count. The list endpoint pages
at 20 records max, offset-based. Treat "unbounded" as unverified — confirm
before we plan for hundreds of tenants.

### The noisy-neighbour ceiling (answered by Plivo, 2026-08-16)

**Subaccounts share the parent account's concurrency pool.** There is no
customer-configurable per-subaccount cap and no per-subaccount live usage API.
Plivo's own advice was to build tenant throttling ourselves.

That is a direct hit on the premise of this feature. If we sell numbers to
clients so they can run bulk campaigns, then **one client's campaign can push a
different client's calls into error `5030 Concurrency Limit Breached`** —
instantly, with no queuing, since enforcement went hard on 2026-04-20.
Concurrency counts ringing and connecting calls, not just connected ones.

The arithmetic that bites: concurrency = dial rate × holding time. At 1 dial/sec
a 60-second conversational call settles at ~60 concurrent, a 3-minute call at
~180 — over a 50-slot ceiling without ever dialling too fast. **A single tenant
breaches before a second tenant exists.**

Partially mitigated already: `services/telephony/concurrency.js` (built
2026-08-16) is an in-process slot registry with a global ceiling and an optional
per-workspace cap, gating `PHONE_CALL` with code `CONCURRENCY_LIMIT`. What is
still missing, and what selling numbers makes urgent:

- **No Super Admin UI** for the two limit numbers — only `setConcurrencyLimits()`.
- **Inbound calls are not counted**, and a client's own rented number is
  precisely what makes inbound traffic appear.
- **It is in-process.** Redis is unreachable here, so a second dialer process
  silently doubles the effective ceiling. That is the tripwire.
- **Per-workspace fair share is optional and unset.** Selling capacity to
  multiple tenants means it has to become mandatory and sized from the plan.

**Do not onboard a second paying client onto number purchase until the
per-workspace cap is enforced by default.** See `DIALING_HYGIENE.md` and the
concurrency notes in `PLIVO_INTEGRATION.md`.

---

## 2. The blocking constraint — reseller compliance, per end customer

We intend to operate as a **Reseller**, not a Direct Brand. That distinction is
the entire cost structure of this feature:

> **Account resolved 2026-08-25: the integrated Plivo account is our own.**
> This supersedes the 2026-08-16 note about a friend's `free_trial` account.
> Confirm the live tier and entitlements with `npm run plivo:check` on the VPS
> before quoting capacity — the concurrency ceiling in §1 still applies and is
> still shared across every subaccount.

- **Direct Brand** files one compliance application for its own traffic.
- **Reseller** files **one application per end customer**, with *that customer's*
  documents.

So every client we onboard is a fresh KYC cycle: their Certificate of
Incorporation (or Udyam) and their GST certificate, uploaded by us, on their
behalf, reviewed by Plivo's compliance team. **This is a recurring per-tenant
onboarding cost, not one-time setup**, and it needs staffing, not just code.

Plivo's warning is worth quoting because it is an account-level risk, not a
per-client one: *"if compliance details are not correctly mapped to end
businesses, the reseller will be required to provide valid proof of opt-in, and
Plivo may take action on the entire account."* The response window on a
complaint is **5 days**. Mis-mapping one client's application to another
client's number can get **our whole parent account suspended**, taking every
tenant down with it.

### The India gates, all of them

| Gate | Rule |
|---|---|
| Entity nationality | Only India-registered businesses can rent Indian numbers. Both us and the client. |
| Documents | MCA Certificate of Incorporation **or** Udyam registration, **plus** GST (Form GST REG-06). Our `DOCUMENT_GROUPS` currently accepts *PAN or GST* for tax — **Plivo wants GST specifically**. A PAN-only client will be rejected downstream. |
| Name matching | Business name must be byte-identical across the registration certificate, the GST certificate, and the `business_name` data field. "Pvt Ltd" vs "Pvt. Ltd." is the single most common rejection cause. Validate before submitting. |
| Series ↔ use case | Landline (022/080…) = service/transactional only. 140-series = promotional only. 160-series = BFSI service/transactional only. Wrong series for the content is a violation regardless of consent. |
| Caller ID | Must be a Plivo-rented Indian number. No BYO caller ID — the Twilio "Verified Caller ID" flow in `callerNumber.controller.js` is inapplicable to +91. |
| Media anchoring | Both legs must originate and terminate in India, or the call fails with `violates_media_anchoring`. Our backend and its `wss://` endpoint must be India-hosted. |
| Cold calling | Prohibited. Explicit digital consent required before commercial calls. |

### Timelines

Plivo has automated the post-approval half: *"Once an India compliance
application is approved, all Indian phone numbers in your account are
automatically activated."* The **approval itself is still human review**, and
Plivo publishes no SLA. `PLIVO_INTEGRATION.md` §11 notes 140 and 160 series
carry a separate, slower SLA than the 15-minute 022/080 activation path.

**Product consequence:** the UI must show a pipeline with states and an honest
"typically N business days", not a spinner. Do not promise same-day.

---

## 3. The flow that actually works

```
┌─ CLIENT ──────────────────────────────────────────────────────────────┐
│  1. "Get a phone number"                                              │
│     └─ declare use case (promotional / transactional) → decides series│
│     └─ enter legal entity name, CIN, GST no., registered address      │
│     └─ upload COI-or-Udyam + GST certificate                          │
│     └─ see estimated cost: ₹X one-time + ₹Y/month from wallet         │
│     └─ SUBMIT                                                         │
└───────────────────────────────────────────────────────────────────────┘
                              │
┌─ PLATFORM (automatic) ──────▼─────────────────────────────────────────┐
│  2. name-match validation across the two docs + the typed name        │
│     (reject locally — a Plivo rejection costs days)                   │
│  3. ensure Plivo subaccount exists for the workspace  [ALREADY BUILT] │
│  4. GET  /PhoneNumber/Compliance/Requirements?country_iso=IN          │
│           &number_type=local&user_type=business                       │
│     → live document_type_ids. Never hardcode; Plivo revises these.    │
│  5. POST /PhoneNumber/Compliance/  (multipart, one call)              │
│     data={end_user{name,type:business,email,address,                  │
│                    registration_number},                              │
│           country_iso:IN, number_type,                                │
│           alias:"ws_<id> <entity>",                                   │
│           documents[{document_type_id,                                │
│                      data_fields{business_name}}],                    │
│           callback_url:<our webhook>}                                 │
│     documents[0].file=@coi.pdf  documents[1].file=@gst.pdf            │
│     → compliance_id → WorkspaceCompliance.carrierApplicationRef       │
│     status: draft → submitted                                         │
└───────────────────────────────────────────────────────────────────────┘
                              │  (days — human review at Plivo)
┌─ PLIVO WEBHOOK ─────────────▼─────────────────────────────────────────┐
│  6. POST /webhooks/plivo/compliance   (V3 signature — validate!)      │
│     accepted  → CARRIER_APPLICATION_STATUS.APPROVED                   │
│     rejected  → REJECTED + reason, surfaced to client for correction  │
│     suspended/expired → REJECTED + suspend the workspace              │
└───────────────────────────────────────────────────────────────────────┘
                              │
┌─ CLIENT ────────────────────▼─────────────────────────────────────────┐
│  7. "Your KYC is approved — pick your number"                         │
│     GET /PhoneNumber/?country_iso=IN&type=local&pattern=<series>      │
│     → live inventory, 20/page, with monthly_rental_rate               │
│     Client picks one.                                                 │
└───────────────────────────────────────────────────────────────────────┘
                              │
┌─ PLATFORM (atomic) ─────────▼─────────────────────────────────────────┐
│  8. wallet: debit setup fee + first month                             │
│  9. POST /v1/Account/{MAIN}/PhoneNumber/{number}/                     │
│       { subaccount: "<SA auth_id>",                                   │
│         compliance_application_id: "<accepted id>",                   │
│         app_id: "<PLIVO_VOICE_APP_ID>",                               │
│         alias: "ws_<workspaceId>" }                                   │
│     ⚠ MAIN-account credentials. Subaccount creds cannot buy numbers.  │
│ 10. assignNumber(workspaceId, {...}) → VoiceNumber row [ALREADY BUILT]│
│     on failure: refund the wallet in the same transaction             │
└───────────────────────────────────────────────────────────────────────┘
                              │
┌─ CLIENT ────────────────────▼─────────────────────────────────────────┐
│ 11. Number appears in their inventory — but NOT yet dialable.         │
│     They must register the CLI as a header under their PE ID on their │
│     DLT portal (no API exists; they report the outcome to us via      │
│     setHeaderStatus()). Only then does assertComplianceReady() pass.  │
└───────────────────────────────────────────────────────────────────────┘
```

Two details from the research that are easy to get wrong:

- **Linking is a separate endpoint too.** `POST /PhoneNumber/Compliance/Link/`
  with `{numbers:[{number, compliance_application_id}]}` bulk-links *already
  rented* numbers to an accepted application. Use it for backfill and
  re-mapping; use `compliance_application_id` on the buy call for new purchases.
- **Rejected applications are patched, not appended.** `PATCH
  /PhoneNumber/Compliance/{id}` **replaces documents wholesale** — resend every
  document, not just the corrected one. Our correction UI must re-collect both.

---

## 4. What the client sees (and never sees)

**Sees:** a Numbers page listing their numbers with series, use case, header
status, daily dial cap, monthly cost in ₹ from their wallet, and a "Get another
number" button. Plus a KYC page with pipeline state and rejection reasons in
plain language.

**Never sees:** the word Plivo, a subaccount auth_id, a Plivo balance, a Plivo
invoice, carrier cost, or any Plivo console URL. The subaccount is our
implementation detail. "Your numbers" is the whole abstraction.

**Honesty requirement.** Two claims the UI must not make:

1. *"Your business name will show on calls."* It will not. Branded caller ID is
   Truecaller / carrier enrolment (`PLIVO_INTEGRATION.md` §6), unbuilt.
2. *"Your number is ready to call."* It is not, until the client's DLT header
   registration lands — which we cannot do for them.

---

## 5. Money

Plivo's published India domestic number rental is **₹200/month** (voice / SIP
trunking, requires COI + GST). Verify against our first invoice — reseller
pricing may differ, and the 140/160 series are not on the public estimator.

This is a **new billing surface**. Today `WalletTransaction.type` covers
`topup | usage | admin_credit | refund | subscription | adjustment`; number
rental is none of those. Proposal:

- `type: 'number_setup'` — one-time provisioning fee, debited at purchase.
- `type: 'number_rental'` — recurring monthly, one row per number per month,
  with `idempotencyKey = "rental:<voiceNumberId>:<YYYY-MM>"` so a retried
  scheduler run cannot double-charge. `autoRenew.service.js` is the existing
  pattern to copy for the scheduler.
- `metadata` carries `voiceNumberId`, `phoneNumber`, `carrierCostCents`, so a
  line item can be explained back to the client and margin stays auditable.

**Insufficient balance on renewal — decided 2026-08-24: grace, then suspend,
never auto-release.** After `NUMBER_RENTAL_GRACE_DAYS` (default 7) the number
moves to `SUSPENDED_NONPAYMENT` and stops dialling, but **we keep paying Plivo
to hold it**. Releasing would destroy the client's DLT header registration,
which they cannot recover — a replacement number means a fresh header
application on their operator's portal. Carrying a dead number costs us
~₹200/month; releasing one costs the client days and us a support ticket.
Release stays a deliberate Super Admin action.

Reactivation needs no separate hook: `nextRenewalAt` is deliberately *not*
advanced on a failed charge, so the number stays in the due set and every sweep
retries it. The first sweep after a top-up charges it and flips it back to
ACTIVE.

**Do not auto-correct wallets from carrier reconciliation data** — flag drift
for review (`PLIVO_INTEGRATION.md` §10).

---

## 6. What is already built vs what is missing

### Already shipped

| Piece | Where |
|---|---|
| Plivo REST client, retries, V3 signature validation | `services/plivo/client.js` |
| Subaccount create / enable / disable / delete, encrypted token | `services/plivo/subaccount.service.js` + `PlivoSubaccount` model |
| Number registry & routing table | `VoiceNumber` model, `assignNumber()`, `releaseNumber()`, `setHeaderStatus()` |
| Compliance state machine, DLT checklist, dial gate | `services/compliance/compliance.service.js` |
| Client-facing compliance API routes | `routes/compliance.routes.js` |
| Provider abstraction, Plivo dialling, both media bridges | `services/telephony/`, `ws/plivoMedia*` |
| Wallet ledger with idempotency | `Wallet`, `WalletTransaction`, `services/billing/` |

### Missing — this is the build

| Gap | Detail |
|---|---|
| ~~`services/plivo/compliance.service.js`~~ | ✅ **Shipped 2026-08-24.** Requirements discovery → preflight → submit → status ingestion → PATCH correction. Unverified against live Plivo. |
| ~~`services/plivo/number.service.js`~~ | ✅ **Shipped 2026-08-24.** Search, rent-into-subaccount, release-at-carrier. Renting is SUPER_ADMIN-gated until phase D. Unverified against live Plivo. |
| ~~Compliance webhook~~ | ✅ **Shipped 2026-08-24** as `plivo.controller.js#compliance` on `POST /api/v1/plivo/compliance`, rather than a separate controller — it reuses the V3 signature machinery already in that file. Signed over `PLIVO_WEBHOOK_URL`, not the answer URL. |
| ~~No client KYC/compliance UI at all~~ | ✅ **Shipped 2026-08-24** as `pages/NumberVerification.tsx`, routed at `/number_verification`, in the sidebar under Phone Numbers and in the command menu. |
| Number purchase is SUPER_ADMIN-only | `POST /compliance/numbers` is `authorize(ROLES.SUPER_ADMIN)` and only *records* a number bought manually elsewhere — it makes no carrier call. This is the endpoint that has to grow a real purchase path plus a member-facing sibling. |
| `PhoneNumbers.tsx` is read-only | Lists from `/caller-numbers`. Still no inventory picker, no cost and no per-number status — but its "Buy a number" card no longer promises one "in a few seconds" and now routes to verification instead of `/contact`. |
| ~~`end_user.registration_number` (CIN)~~ | ✅ **Shipped 2026-08-24** as `WorkspaceCompliance.registrationNumber` / `registeredAddress` / `contactEmail`, migration `20260824120000_plivo_compliance_end_user`, written through `setEntityDetails()`. |
| ~~GST vs PAN~~ | ✅ **Shipped 2026-08-24.** `preflight()` requires GST specifically and says so by name when the client has uploaded a PAN instead. |
| ~~Name-match validation~~ | ⚠️ **Partial.** `businessNameWarnings()` flags the punctuation and whitespace shapes that cause most rejections, but it is advisory and cannot read the uploaded PDFs. A real cross-document check needs OCR and is not built. |
| ~~Recurring rental billing~~ | ✅ **Shipped 2026-08-24.** `services/billing/numberRate.js` + `numberBilling.service.js`, swept hourly from `server.js`. |
| Per-subaccount usage reconciliation | Phase 7. Not started. |

### Suggested schema deltas

```prisma
model WorkspaceCompliance {
  // ...existing
  registrationNumber String?   // CIN / Udyam — Plivo end_user.registration_number
  registeredAddress  String?   // JSON: street, city, region, postal_code, country
  contactEmail       String?
}

model VoiceNumber {
  // ...existing
  // What Plivo charges us, and what we charge the client. Both stored so
  // margin survives a rate-card change and an old invoice stays reproducible.
  carrierMonthlyCents Int?
  clientMonthlyCents  Int?
  nextRenewalAt       DateTime?
  // status gains SUSPENDED_NONPAYMENT alongside ACTIVE | RELEASED
}
```

---

## 7. Build order

| Phase | Work | Why this order |
|---|---|---|
| **0a** | ✅ **Resolved 2026-08-25 — the integrated account is ours.** Verify the tier with `npm run plivo:check`; if it is still trial, Console → Settings → Account → Verification (1–3 business days) then add a payment method. Upgrading does not disturb an existing number's compliance approval. | Commercial, not code. |
| **0b** | Enforce a default per-workspace concurrency cap; add the Super Admin UI for the two limits; count inbound. | Selling capacity to multiple tenants without this ships a cross-tenant outage. |
| **A** | ✅ **Code done 2026-08-24.** `plivo/compliance.service.js`, the `/plivo/compliance` webhook, schema deltas and the client-facing routes below. **Unverified against live Plivo** — see §9. | Nothing can be purchased until an application can be accepted. This is the long pole. |
| **B** | ✅ **Code done 2026-08-24.** `client/src/pages/NumberVerification.tsx` at `/number_verification` — use-case declaration, entity form, document upload, pipeline status, rejection correction. **Never opened in a browser against a live backend.** | The feature is unusable without it, and it is the largest single chunk of unbuilt work. |
| **C** | ✅ **Code done 2026-08-24.** `plivo/number.service.js` + three routes. Renting is **SUPER_ADMIN-only** until D. **Unverified against live Plivo.** | Small, once A exists. |
| **D** | ✅ **Code done 2026-08-24.** `number_setup` / `number_rental` ledger types, purchase debit with refund-on-failure, hourly renewal sweep, grace-then-suspend dunning, Super Admin rate card. **Unverified against a live wallet.** | Must land with C — never ship a purchase that spends our money without debiting theirs. |
| **E** | `PhoneNumbers.tsx` purchase flow + inventory picker | The visible feature. Trivial once A–D exist. |
| **F** | Per-subaccount usage reconciliation | Catches billing drift. Independent. |
| **G** | `BrandProfile` + Truecaller enrolment | Independent; this is what actually puts a name on the screen. |

**Do phase A once by hand, for one real client, through the Plivo console,
before writing the API code.** The exact document requirements, the wording of
rejection messages and the real approval latency are all things we are currently
guessing at — and every guess is a rejection cycle paid for in client-onboarding
days.

---

## 8. Open questions — confirm before building

1. **Is India number *purchase* API-enabled for resellers, or console-only?**
   The generic `POST /PhoneNumber/{number}/` endpoint documents
   `compliance_application_id` and `subaccount`, but Plivo's India rollout
   announcement is framed entirely around the **console**. If India purchase is
   console-only, phase C becomes a manual ops step behind an API-shaped wrapper
   and the whole client-facing "pick your number" UX changes. **Still the single
   biggest unknown — but now answerable without asking anyone: run
   `npm run plivo:check` on the VPS.** It is read-only (it never rents, releases
   or files anything) and reports whether search returns Indian inventory, plus
   the live response shapes every service here currently infers.
2. **Subaccount count limit.** Unpublished. One per workspace scales with our
   tenant count — confirm there is no cap and no per-subaccount fee.
3. **140-series allotment to a reseller's end customers.** Still open from
   `PLIVO_INTEGRATION.md` §11.5. Promotional bulk campaigns *require* 140. If
   Plivo cannot allot 140 to end customers, promotional bulk calling does not
   work on Plivo at all and that whole product tier is blocked.
4. **Approval SLA.** No published number. Needed for UI copy and for sales.
5. **Can one end customer hold multiple applications** (e.g. local + 140)? The
   docs say `alias` must be unique per end user, which hints at one active
   application per customer — but a client wanting both a transactional landline
   and a promotional 140 may need two. Confirm.
6. **CNAP and reseller-rented numbers.** Whose name resolves. Unresolved,
   non-blocking (`PLIVO_INTEGRATION.md` §11.2).

---

## 9. Phase A as built (2026-08-24)

### Surface

| Endpoint | Role | Notes |
|---|---|---|
| `PUT /workspaces/:id/compliance/entity-details` | MEMBER | Registration number, registered address, entity contact email. Address merges rather than replaces, so a half-finished form cannot erase what was already saved. |
| `GET /workspaces/:id/compliance/carrier-application` | any member | Preflight: `{ready, errors[], warnings[], status, reference, rejectionReason}`. Read-only and safe to poll while the form is filled in. |
| `POST /workspaces/:id/compliance/carrier-application` | MEMBER | Files it. 409 when one is already in flight, approved, or rejected-and-correctable. |
| `PATCH /workspaces/:id/compliance/carrier-application` | MEMBER | Correction after a rejection. Resends **every** document. |
| `POST /workspaces/:id/compliance/carrier-application/refresh` | MEMBER | Polls Plivo. Backstop for a lost callback. |
| `POST /api/v1/plivo/compliance` | public, V3-signed | Status callback. Signed over `PLIVO_WEBHOOK_URL`. |

### Decisions worth knowing before touching it

- **Requirement mapping is never guessed.** `matchRequirementsToDocuments()`
  identifies Plivo's document types by keyword, falling back to whether the type
  declares a `business_name` data field. Anything it cannot resolve is returned
  as `unmatched` and submission is refused with an operator-facing error, rather
  than sending the GST certificate as the registration certificate — which the
  API accepts and a human rejects a week later.
- **Double-filing is guarded in the service, not the router.** A second
  application against the same end customer orphans the first: both consume
  review capacity, and `carrierApplicationRef` can only point at one.
- **`suspended` and `expired` suspend the workspace.** They revoke an approval
  we already had, so numbers linked to that application are live and no longer
  covered. That is the state that gets a reseller's whole parent account
  actioned, so it stops calling rather than just failing a checklist item.
- **The subaccount is not created here.** It belongs to the purchase step — a
  client who files KYC and never buys should not leave one behind.
- **The webhook always returns 200, even when it cannot place the callback.**
  Plivo retries a non-2xx, and an application no workspace claims would retry
  forever. The error log is the actionable artefact. A genuine failure on our
  side (database down) still returns 5xx so it *is* retried.

### Unverified — this is what a live account settles

1. **`end_user` field names.** Flat `address_line1` / `state` / `postal_code` /
   `email` / `registration_number`, taken from Plivo's docs. The earlier draft
   in `PLIVO_INTEGRATION.md` §4 was wrong (`contact_email`, nested
   `street_address`), which is why the payload is built in exactly one function,
   `buildEndUser()`.
2. **The Requirements response shape.** `matchRequirementsToDocuments()` accepts
   the array under `document_types`, `documents`, `requirements`, or bare — a
   real response will collapse that to one.
3. **The create response's id field.** Read as `compliance_id`, falling back to
   `id`.
4. **The callback payload.** `compliance_id` / `status` / `rejection_reason`,
   with aliases. If it turns out to be nested, `handleComplianceCallback()` is
   the one place to change.
5. **PATCH path.** `/PhoneNumber/Compliance/{id}` with no trailing slash, unlike
   the collection endpoint. Plivo is inconsistent about this elsewhere.

Tests: `services/plivo/__tests__/compliance.test.js`, 29 assertions covering
requirement matching, multipart index alignment, the `end_user` shape, the
status map, and callback-URL precedence. They do **not** cover the network
round-trip or the Prisma writes — the first live submission is the real test.

---

## 10. Phase B as built (2026-08-24)

`client/src/pages/NumberVerification.tsx`, routed at `/number_verification`.

### Shape

A status rail pinned to the top, then four numbered steps that collapse once the
application is in flight. The rail is first because the multi-day wait is the
defining fact of this screen — a client who lands here mid-review needs "we are
waiting on the carrier", not a form.

| Step | Writes to |
|---|---|
| 1. Call type | `PUT /compliance/use-case` — two cards, each naming the series it buys |
| 2. Registered business | `PUT /compliance/use-case` (name, entity type) then `PUT /compliance/entity-details` (CIN, email, address) |
| 3. Documents | `POST /compliance/documents` — registration (COI **or** Udyam) and GST |
| 4. Submit | `POST` / `PATCH /compliance/carrier-application` |

`GET /compliance/carrier-application` drives step 4: its `errors[]` render as a
"still needed" list and its `warnings[]` as an advisory panel above the submit
button. The button is disabled until `ready`.

### The four honesty rules it follows

1. **No timeline promise beyond "a few business days."** Plivo publishes no SLA.
2. **Approved ≠ dialable.** The approved state leads with a warning that the
   client must still register the CLI as a header under their own DLT Principal
   Entity, which we have no API into. Without this the screen would sell an
   approval as permission to call.
3. **GST is named as GST.** The slot says a PAN will not be accepted, rather
   than letting one through to a rejection days later — our own `DOCUMENT_GROUPS`
   accepts either, the carrier does not.
4. **`PhoneNumbers.tsx` was corrected, not just linked.** Its card promised a
   number "in a few seconds" and pointed at `/contact`.

### Known limitations

- **Replacing a registration document keeps its kind.** The COI/Udyam toggle
  hides once a file is on record, so a client who uploaded a COI cannot switch
  to Udyam from the UI. Deliberate: `ComplianceDocument` is unique per
  `(compliance, kind)` and there is no delete endpoint, so allowing the switch
  would leave *both* on file — and `matchRequirementsToDocuments()` prefers COI,
  meaning the stale one would be filed. Fixing it properly needs a document
  delete route.
- **No name-match against the uploaded PDFs.** Only the advisory warnings from
  `businessNameWarnings()`. A real check needs OCR.
- **Never opened in a browser against a live backend.** Typecheck and production
  build pass; the request/response shapes are matched to the phase A routes by
  reading them, not by exercising them.

---

## 11. Phase C as built (2026-08-24)

`backend/src/services/plivo/number.service.js`.

| Endpoint | Role | Does |
|---|---|---|
| `GET /compliance/numbers/available?pattern=&city=&offset=` | any member | Live inventory, filtered to the series the workspace's use case permits |
| `POST /compliance/numbers/rent` `{phoneNumber}` | **SUPER_ADMIN** | Rents into the subaccount and records it |
| `DELETE /compliance/numbers/:numberId` | SUPER_ADMIN | Now releases **at the carrier** first, then records it |

### Why renting is SUPER_ADMIN-gated

This is the call that spends real money on our parent account, and §7 phase D
(the wallet debit) is not built. A member-facing rent route today would let a
client rent numbers we pay for and they do not. The gate is the whole reason it
is safe to ship C before D — **remove it only together with the debit.**

Searching stays member-facing because it costs nothing and reserves nothing.

### Decisions worth knowing

- **Series is derived, never accepted from the caller.** `classifyNumberSeries()`
  returns UNKNOWN for *every* Indian landline — the ranges overlap with mobile —
  so storing its answer verbatim would make each transactional number fail
  `seriesPermitsUseCase()` for its whole life. `seriesForRentedNumber()` lets the
  digits win where they decide (140, 1600), and otherwise resolves UNKNOWN to
  `TRANSACTIONAL_LANDLINE` under a transactional declaration. It then re-checks
  the result against the use case before returning it.
- **The promotional search pattern is forced, not defaulted.** A caller-supplied
  pattern cannot surface a landline to a workspace that may only dial from 140 —
  otherwise the client picks one, rents it, and dials illegally.
- **The subaccount is created here**, at rent time, not during KYC. A client who
  files compliance and never buys leaves none behind.
- **`subaccount` is passed on the buy call itself**, so there is no
  buy-then-transfer window with the number sitting on the parent account.
- **`PLIVO_VOICE_APP_ID` is required to rent.** Without it Plivo attaches
  `default_number_app` and the number never reaches our answer URL — inbound
  calls land nowhere, silently, on a number we are now paying for.
- **A rented number we cannot record is released again.** Same shape as the
  orphaned-subaccount cleanup: if `assignNumber()` fails after the buy
  succeeded, the number is unrented and the failure returned. If the cleanup
  also fails it is logged as `ORPHANED PLIVO NUMBER` for manual release.
- **Release calls the carrier first, and a carrier failure is fatal.** The old
  `deleteNumber` only flipped a status column — a number released our side but
  never unrented bills monthly forever, which is the quiet way a reseller's
  margin disappears. A 404 from Plivo is treated as success (it does not hold
  the number), anything else aborts without recording.

### Unverified

1. **Whether India numbers can be bought via API at all** — §8 question 1, still
   the biggest unknown. If purchase is console-only, `rentNumber()` becomes a
   wrapper around a manual step and only the recording half survives.
2. **The search response shape.** Read as `objects[]` with
   `number` / `city` / `region` / `type` / `monthly_rental_rate` /
   `voice_enabled`, and `meta.total_count`. Isolated in
   `normalizeSearchResult()`.
3. **`/PhoneNumber/{n}/` to buy vs `/Number/{n}/` to release.** Plivo documents
   these as two different resources; both paths are used exactly once here.
4. **Whether `city` filters usefully for Indian local numbers.** Passed through
   untested.

Tests: `services/plivo/__tests__/number.test.js`, 20 assertions on the pattern
and series rules and on result shaping. No network or Prisma coverage.

---

## 12. Phase D as built (2026-08-24)

`services/billing/numberRate.js` (the rate card) and
`services/billing/numberBilling.service.js` (the charges).

### Pricing

Two platform-wide figures, set in Super Admin at `GET`/`PUT /admin/number-rate`:
a **one-time setup fee** and a **monthly rental**. The setup fee pays for the
per-client compliance filing a reseller has to do (§2) and defaults to **₹0**, so
deploying this changes nobody's bill until someone sets it. Monthly seeds at
**₹500** against a carrier cost of about ₹200 — the margin has to absorb Plivo's
reseller price differing from list, GST, and the months a suspended number is
held unpaid.

Stored in a reserved `Plan` row `__number_rate__`, the same deliberate squat as
`__wallet_rate__` and `__broadcast_rate__`. The ugly part is stated once in that
module: `priceInr` holds the monthly rental and **`perMinuteInr` holds the
one-time setup fee**. It reads wrong because it is wrong; it is used because it
is an existing rupee-denominated numeric column, so the two figures cannot drift
into different currencies.

### Charging

| When | Ledger rows |
|---|---|
| Purchase | `number_setup` (if non-zero) + `number_rental` for the current month |
| Every month after | `number_rental`, swept hourly from `server.js` |
| Carrier failed after debit | `refund` credits reversing whichever debits landed |

Keys are `number_setup:<e164>` and `number_rental:<e164>:<YYYY-MM>` — keyed on
the **phone number, not the row id**, because the purchase debit happens before
the `VoiceNumber` row exists. It has to: billing after renting hands a number we
pay for to a client with an empty wallet. `phoneNumber` is globally unique and
`assignNumber()` refuses a second row for one even after release, so a number
can be charged setup exactly once in the platform's lifetime.

`clientMonthlyCents` is **frozen on the row at rent time**, so raising the
platform price never retroactively reprices an existing customer's next renewal.
`carrierMonthlyCents` is recorded alongside it for reconciliation only and is
never used to compute anything.

### Suspension actually bites

`assertComplianceReady()` now checks for `SUSPENDED_NONPAYMENT` **before** the
`DLT_COMPLIANCE_MODE` gate. That ordering is the point: the mode exists so the
regulatory checklist can roll out in `warn` without stopping traffic, and
letting it also wave through a number the client stopped paying for would make
the suspension decorative. It is the only reason a caller ID is refused in
`warn` mode. Unlike the DLT gate it fails **open** on a lookup error — a
database blip must not become an outage for paying customers, and the money is
recoverable where the calls are not.

Coverage note: this reaches campaigns and broadcasts (via
`assertRotationCompliant`), which is where bulk calling happens. Single test
calls do not run this gate today — pre-existing, not introduced here.

### Unverified

- **No live wallet has been charged.** Tests cover the date arithmetic, the
  idempotency keys and the policy constants; the Prisma writes and the
  `applyWalletTransaction` round-trip are not exercised.
- **The renewal sweep has never run.** It is an hourly `setInterval` in
  `server.js` alongside the subscription sweep, offset 60s at boot so the two do
  not contend for the same wallet rows.
- **`carrierRentalCents()` assumes Plivo returns `monthly_rental_rate` in the
  account's billing currency.** Nothing derives money from it, so a wrong
  assumption makes reconciliation noisy rather than mischarging anyone.

---

## Sources

- [Phone Number API — Plivo](https://www.plivo.com/docs/numbers/api/phone-number)
- [Subaccount API — Plivo](https://www.plivo.com/docs/account/api/subaccount)
- [Compliance — Plivo](https://www.plivo.com/docs/numbers/compliance)
- [Compliance Application — Plivo](https://www.plivo.com/docs/numbers/regulatory-compliance/compliance-application)
- [Regulatory Compliance Quickstart — Plivo](https://www.plivo.com/docs/numbers/regulatory-compliance/quickstart)
- [India Calling Regulations — Plivo](https://www.plivo.com/docs/voice/concepts/india-calling)
- [Rent India Domestic Numbers Directly on Plivo Console — changelog](https://www.plivo.com/changelog/announcements/rent-india-domestic-numbers-directly-on-plivo-console)
- [Automated Indian Phone Number Activation is now live — changelog](https://www.plivo.com/changelog/announcements/automated-indian-phone-number-activation-is-now-live)
- [What is a subaccount? — Plivo support](https://support.plivo.com/hc/en-us/articles/360041828131-What-is-a-subaccount)
- [Requirements for Sending SMS and Calls to India — Plivo support](https://support.plivo.com/hc/en-us/articles/45875255505305-Requirements-for-Sending-SMS-and-Calls-to-India)
- [India Phone Number Pricing — Plivo](https://www.plivo.com/phone-numbers/pricing/in/)

---

## 13. Follow-up pass (2026-08-25)

Twelve items were outstanding after phase D. This pass closed the ones that are
code; the rest are recorded honestly below.

### Closed

| # | Was | Now |
|---|---|---|
| 1 | Not our Plivo account | **Resolved** — the integrated account is ours. §2 updated. |
| 3 | Unknown whether India purchase is API-enabled | `npm run plivo:check` (`scripts/check-plivo-numbers.mjs`) answers it read-only against the live account, and pins the response shapes phases A–C infer. |
| 7 | UI promised emails nobody sent | `services/notify.service.js` — in-app notification + email, wired to carrier decisions (approved / rejected / withdrawn), first failed rental, suspension, and reactivation. Never throws: a notification must not roll back the charge that raised it. |
| 8 | Suspended numbers vanished silently | `dlt.js` reports them as REJECTED with the real reason and `ACTOR.CLIENT`; `/caller-numbers` returns them in a new `unavailable[]`; `PhoneNumbers.tsx` renders them with a Top-up link. They stay OUT of `owned` so nothing can dial from one. |
| 9 | Number charges produced no invoice | `invoiceNumberCharge()` issues one per charge, anchored on the wallet ledger key. `Invoice.type` gains `number`. |
| 10 | No Super Admin UI for number pricing | `NumberRateTab` on the (renamed) **Pricing** admin page, alongside the per-minute rate. Shows gross margin against ~₹200 carrier cost. |
| 11 | No document delete, so COI↔Udyam was one-way | `DELETE /compliance/documents/:documentId` + a Remove button. Refused once the application is SUBMITTED or APPROVED — those documents are the record of what was filed. |
| 12 | Suspension gate missed single test calls | Moved into `resolveNumberRouting()` in `outboundCall.service.js`, which the dial path already calls — so it now covers **every** outbound path at no extra query. Returns 402 `NUMBER_SUSPENDED_NONPAYMENT`. |

### Still open, deliberately

| # | Item | Why it is not code |
|---|---|---|
| 2 | Subaccounts share one concurrency pool | Needs a default per-workspace cap, inbound counting, and a Redis-backed registry. Real work, not a patch — see §1 and `DIALING_HYGIENE.md`. |
| 4 | Phase E — client number picker | Search returns `pricing` and inventory; nothing renders it. Blocked on #3's answer: if purchase is console-only the whole UX changes. |
| 5 | Phase F — usage reconciliation | Unstarted. |
| 6 | Phase G — BrandProfile / Truecaller | Unstarted, independent. |

### Two notes on the notification work

- **Email is best-effort and says so in the log.** With no SMTP configured the
  in-app notification still lands and a warning names the missing setting —
  because the verification page's "we will email you" is only true when a mailer
  exists.
- **Recipients are workspace members, not `contactEmail`.** That address belongs
  to the legal entity and is what the *carrier* writes to; the people who need to
  know their numbers stopped working are the ones who log in.
