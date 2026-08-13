# Plivo Integration — Subaccounts, Number Provisioning, and Branded Caller ID

**Companion to `DLT_COMPLIANCE.md`.** That document says *what Indian law requires*.
This one says *which Plivo API calls implement it*, and where the proposed
workflow has to change because Plivo cannot do what it was assumed to do.

---

## 1. Verdict on the proposed workflow

> A business buys a number from the platform → we create a Plivo subaccount under
> our account → we assign the business display name to that subaccount → when the
> business runs a bulk campaign, the callee sees that display name.

| # | Step | Verdict |
|---|---|---|
| 1 | Create a subaccount per business, via API | ✅ **Correct.** Supported, and the right isolation boundary. |
| 2 | Buy/assign the number into that subaccount, via API | ✅ **Correct.** One parameter on the purchase or update call. |
| 3 | Assign a display name to the subaccount so callees see it | ❌ **Does not work.** See below. |

### Why step 3 fails

A Plivo subaccount's `name` is an **internal label**. It appears in your console
and in API responses. It is never transmitted on a call, is not visible to the
called party, and has no relationship to caller ID display of any kind. Naming a
subaccount "Acme Dental" changes nothing about what Acme Dental's calls look like.

The number-level `cnam` parameter *is* a real caller-name field — but CNAM is a
North American telephone system. It resolves against the US LIDB database, which
**does not exist in India**. Plivo's own support position is that CNAM can only
be set for US numbers. Setting `cnam` on an Indian number is a no-op.

So there is no Plivo API — at the account, subaccount, or number level — that
makes an Indian recipient's phone display a business name. **Caller-name display
in India is not a carrier-API feature. It is a separate commercial registration,
on a different rail, with a different vendor.** Section 6 covers the three real
channels.

### The corrected workflow

```
Business signs up
   └─ DLT onboarding (client's paperwork — see DLT_COMPLIANCE.md)
   └─ Plivo subaccount created                      ← isolation + attribution
   └─ Plivo compliance application filed (per end customer)
   └─ Number rented INTO the subaccount, linked to that application
   └─ Client registers the CLI as a header under their PE ID
   └─ ─── separate, parallel, optional ───
      Branded Caller ID enrolment (Truecaller / carrier programme / CNAP)
      ← THIS is what puts the business name on the screen
```

Two independent tracks. A number can be fully provisioned, DLT-compliant and
dialling legally while showing no name at all. Branding is an upsell layered on
top, not a property of the subaccount.

---

## 2. What a subaccount actually buys us

Given step 3 is gone, is step 1 still worth building? Yes — for three reasons
that have nothing to do with display names.

**Reputation isolation.** This is the main one. Indian carriers score caller IDs
on volume, pacing, and complaint rate. Numbers grouped under one account can be
throttled together when one tenant behaves badly. A subaccount per workspace
keeps one client's bad campaign from poisoning another client's numbers. This is
already the stated rationale on `VoiceNumber.subaccountId` in `schema.prisma`.

**Usage attribution.** Plivo reports usage per subaccount. That gives a carrier-
side ground truth to reconcile against our own `AgentCallLog` settlement, which
is the only way to catch billing drift.

**Blast radius.** Disabling a subaccount (`enabled=false`) instantly stops all of
that tenant's carrier traffic without touching anyone else — a one-call kill
switch for the `suspended` state in `WorkspaceCompliance`.

**What it does not buy us:** separate billing. Charges from all subaccounts
aggregate to the parent account. **We** pay Plivo; the client pays us from their
wallet. Subaccounts are an isolation and reporting primitive, not a billing one.
That is consistent with the wallet-only pricing model — do not expose Plivo
subaccount balances to clients.

---

## 3. India gating (read before writing any code)

Plivo's India rules constrain the whole design:

- **India-registered businesses only.** A business registered outside India cannot
  rent Indian numbers. Our platform entity must be Indian, and so must the client's.
- **Voice KYC on our account first**, before any number can be rented at all.
- **Media anchoring.** Both legs must originate and terminate inside India. A call
  whose media leaves the country fails with hangup cause `violates_media_anchoring`.
  **This directly affects the realtime voice bridge:** `PUBLIC_BACKEND_WS_URL`
  must resolve to India-hosted media for Indian traffic. Today's bridge in
  `ws/twilioMediaRealtime.handler.js` streams to wherever the backend is
  deployed. If that is not in India, Indian calls will fail — not degrade, fail.
- **Caller ID must be a Plivo-rented Indian number.** No BYO caller ID, which
  makes the entire Twilio "Verified Caller ID" flow in
  `controllers/callerNumber.controller.js` inapplicable to the India path.
- **Account data region is chosen at signup and cannot be changed.** Get this
  right the first time.
- **Payment to Plivo's India entity, in INR.**

Plivo's Compliance API is currently **India-only**, which is convenient: it exists
precisely for this workflow.

---

## 4. Provisioning pipeline — the exact API calls

All calls use HTTP Basic auth, `Authorization: Basic base64(auth_id:auth_token)`,
against `https://api.plivo.com`. Steps 1, 2, 3 and 5 require **main-account**
credentials. Subaccount credentials cannot assign numbers or file compliance.

### Step 1 — Create the subaccount

```
POST /v1/Account/{MAIN_AUTH_ID}/Subaccount/
{ "name": "ws_<workspaceId> <entityName>", "enabled": true }

→ 201 { "auth_id": "SA...", "auth_token": "...", "message": "created" }
```

> **`auth_token` is returned exactly once, in this 201.** It is never retrievable
> again from the API. Persist it encrypted in the same write, or the subaccount is
> orphaned and must be recreated.

`enabled` defaults to `false` — pass it explicitly.

### Step 2 — Discover what documents India needs

```
GET /v1/Account/{MAIN_AUTH_ID}/PhoneNumber/Compliance/Requirements
      ?country_iso=IN&number_type=local&user_type=business
```

Returns document types with their UUIDs and required data fields. **Call this at
runtime rather than hardcoding the list** — Plivo revises it as DoT rules change,
and a stale hardcoded list produces rejections that look like client errors.

For India / local / business it currently returns two required documents:

| Document | Accepted evidence | Data fields |
|---|---|---|
| Registration certificate | MCA Certificate of Incorporation **or** Udyam registration | `business_name` |
| GST registration certificate | Form GST REG-06 | — |

This maps cleanly onto our existing `DOCUMENT_KIND`: `COI`/`UDYAM` → registration
certificate, `GST` → GST certificate. Note Plivo wants **GST specifically**, not
PAN — our `tax_registration` group accepts either, so the UI must require GST when
the provider is Plivo, or the application will be rejected downstream.

> **Exact-match rule:** the business name must be byte-identical across the
> registration certificate, the GST certificate, and the `business_name` data
> field. Mismatched punctuation ("Pvt Ltd" vs "Pvt. Ltd.") is the single most
> common rejection cause. Validate before submitting, not after.

### Step 3 — File the compliance application

One call creates the end user, uploads the documents, and submits.

```
POST /v1/Account/{MAIN_AUTH_ID}/PhoneNumber/Compliance/
Content-Type: multipart/form-data

data = {
  "end_user": {
    "name": "<entityName>",
    "type": "business",
    "contact_email": "...",
    "street_address": { ... }
  },
  "country_iso": "IN",
  "number_type": "local",
  "documents": [
    { "document_type_id": "<uuid from step 2>",
      "data_fields": { "business_name": "<entityName>" } },
    { "document_type_id": "<uuid from step 2>" }
  ],
  "callback_url": "https://<backend>/api/v1/webhooks/plivo/compliance",
  "callback_method": "POST"
}
documents[0].file = @registration.pdf
documents[1].file = @gst.pdf
```

Status lifecycle: `draft → submitted → accepted | rejected | suspended | expired`.

Only `rejected` applications can be corrected, via
`PATCH /v1/Account/{auth_id}/PhoneNumber/Compliance/{compliance_id}`. **Documents
are replaced wholesale, not patched** — resend every document, not just the
rejected one.

Plivo signs the callback with a v3 signature; validate it before trusting the
payload. Map the status onto `CARRIER_APPLICATION_STATUS`:

| Plivo | Ours |
|---|---|
| `draft`, `submitted` | `SUBMITTED` |
| `accepted` | `APPROVED` |
| `rejected` | `REJECTED` (+ `carrierRejectionReason`) |
| `suspended`, `expired` | `REJECTED` — and suspend the workspace |

Store the Plivo `compliance_id` in the existing `carrierApplicationRef` field.

### Step 4 — Search for a number in the right series

```
GET /v1/Account/{MAIN_AUTH_ID}/PhoneNumber/?country_iso=IN&type=local&pattern=140
```

The series must match the declared `useCase` — `PROMOTIONAL` → 140-series,
`TRANSACTIONAL` → landline. `setUseCase()` already refuses to change this once a
number is live; the search is where that decision becomes physical.

### Step 5 — Rent the number directly into the subaccount

```
POST /v1/Account/{MAIN_AUTH_ID}/Number/{number}/
{ "subaccount": "<SA auth_id>",
  "compliance_application_id": "<accepted compliance_id>",
  "app_id": "<voice app id>",
  "alias": "ws_<workspaceId>" }
```

Passing `subaccount` at purchase avoids a two-step buy-then-transfer. The same
endpoint moves an already-rented number later. For bulk linking of numbers to an
accepted application there is also
`POST /v1/Account/{auth_id}/PhoneNumber/Compliance/Link/`.

Then record it with the existing service function:

```js
await assignNumber(workspaceId, {
  phoneNumber, provider: 'PLIVO',
  providerNumberId, subaccountId,
  series, dailyDialCap,
});
```

### Step 6 — Client registers the CLI as a DLT header

Outside Plivo entirely. Client-side, on their DLT portal, recorded through the
existing `setHeaderStatus()`. Not automatable — there is no DLT portal API.

### Deprovisioning

`DELETE /v1/Account/{auth_id}/Subaccount/{sub_auth_id}/` takes a `cascade` flag.
`cascade=false` (default) **reassigns the subaccount's numbers to the parent
account** rather than releasing them. Given `releaseNumber()` deliberately never
reassigns a number to another workspace, default to `cascade=true` on teardown —
otherwise released Indian numbers silently accumulate on the parent account, still
billing, still carrying the previous tenant's reputation.

---

## 5. Placing calls from a subaccount

Two options. Choose deliberately.

**A. Main credentials, subaccount's number as `From`.** Simplest; one credential
set. But usage attributes to the parent account and we lose the per-subaccount
reporting that was half the reason for subaccounts.

**B. Subaccount credentials (recommended).** Look up the workspace's subaccount
`auth_id`/`auth_token`, authenticate as the subaccount, dial. Usage attributes
correctly and the `enabled=false` kill switch actually bites.

Either way, `placeOutboundCall()` in `services/outboundCall.service.js` currently
reads `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` from `process.env` directly and
builds TwiML inline. **A provider abstraction is a prerequisite**, not a nice-to-
have — this is the blocker already recorded against the Plivo migration.

Plivo differences that the abstraction must absorb:

| | Twilio | Plivo |
|---|---|---|
| Markup | TwiML | Plivo XML |
| Media stream verb | `<Connect><Stream>` | `<Stream>` (bidirectional, `keepCallAlive`) |
| Audio format | µ-law 8 kHz base64 | µ-law 8 kHz base64 (frame envelope differs) |
| Call create | `POST /Calls.json`, form-encoded | `POST /v1/Account/{id}/Call/`, JSON |
| Call identifier | `CallSid` | `call_uuid` |
| XML delivery | inline `Twiml` param | `answer_url` (fetched) |

That last row matters: Plivo generally fetches XML from an `answer_url` rather
than accepting it inline, so the greeting-only path needs a real HTTP endpoint
rather than a string. The media-stream handler needs a Plivo sibling —
`ws/plivoMediaRealtime.handler.js` — because the frame envelope differs even
though the codec does not.

---

## 6. Branded Caller ID — how the business name actually gets on screen

Three channels. None is a Plivo API. They are not mutually exclusive, and none
covers 100% of recipients.

### A. Truecaller Verified Business Caller ID — the practical option today

The only channel that works **now**, at scale, across all Indian operators, with
programmatic control. Displays brand name, logo, category, call reason, and a
green verified badge to Truecaller's user base (~500M+ in India, but *only*
Truecaller users — a recipient without the app sees nothing).

- Commercial contract with Truecaller Business or an authorised reseller.
  Not self-serve, not free, priced per verified number or per volume.
- Supports **dynamic per-call reason via API** — the closest thing to the
  original goal, and better than a static name.
- Because it is per-brand, **this is where the per-workspace display name lives.**

### B. Carrier programmes — Airtel Verified Calling / Business Name Display

Name, logo and verified badge at the network level, so no app is required — but
**only for recipients on that carrier**. Requires an Airtel IQ enterprise
relationship alongside the DLT registration. See `AIRTEL_VERIFIED_CALLING_GUIDE.md`.
Per-carrier enrolment; covering India means repeating it with each operator.

### C. TRAI CNAP — coming, but not a product we control

TRAI approved CNAP in October 2025 with a DoT deadline of March 2026 for pan-India
rollout; operator deployment has been staged through 2026. It is the eventual
universal answer — every handset, no app.

**But the name is not ours to choose.** CNAP resolves against the originating
operator's KYC/CAF records — the name on the connection's registration documents.
Bulk connection holders may use a verified trademark or trade name, subject to
government-approved procedure. Two consequences:

1. The displayed name is whatever the **number's registered subscriber** is. For a
   number we rent from Plivo, that chain runs through Plivo's Indian carrier
   partner, not through our client. Whether an end customer's trade name can be
   attached to a reseller-rented number is **unresolved and must be confirmed in
   writing with Plivo.**
2. There is no API. It is a registration procedure, not a feature toggle.

Treat CNAP as a roadmap item. Ship on Truecaller.

### Design consequence for the platform

Model branding as its own per-workspace record with per-channel status — the same
shape as the DLT checklist, because it has the same character: an external
approval we track but do not control.

```
BrandProfile (per workspace)
  displayName        the business's chosen name
  logoStorageKey
  category
  truecallerStatus   NOT_ENROLLED | SUBMITTED | APPROVED | REJECTED
  carrierStatus      NOT_ENROLLED | SUBMITTED | APPROVED | REJECTED
  cnapStatus         NOT_AVAILABLE (reserved)
```

**Say what is true in the UI.** "Your name shows to Truecaller users on Android
and iOS" is honest. "Your business name shows on outgoing calls" is not, and it is
the promise the original workflow would have shipped.

---

## 7. Data model changes

`VoiceNumber.subaccountId` and `WorkspaceCompliance.carrierApplicationRef` already
exist and need no migration. What is missing:

```prisma
model PlivoSubaccount {
  id             String    @id @default(cuid())
  workspaceId    String    @unique
  authId         String    @unique
  // Returned exactly once at creation and never again. Encrypted at rest —
  // it authenticates real spend against our parent account.
  authTokenEnc   String
  name           String
  enabled        Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  workspace      Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model BrandProfile {
  id                 String    @id @default(cuid())
  workspaceId        String    @unique
  displayName        String
  logoStorageKey     String?
  category           String?
  truecallerStatus   String    @default("NOT_ENROLLED")
  truecallerRef      String?
  carrierStatus      String    @default("NOT_ENROLLED")
  carrierRef         String?
  rejectionReason    String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  workspace          Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}
```

Add to `TELEPHONY_PROVIDER`-adjacent constants: `SUBACCOUNT_STATUS`,
`BRAND_STATUS`, and a `PLIVO_COMPLIANCE_STATUS` → `CARRIER_APPLICATION_STATUS`
mapping table.

`authTokenEnc` must be encrypted with a key that is **not** in the same store as
the database. A leaked subaccount token is direct spend on our parent account.

---

## 8. Code to write

```
backend/src/services/telephony/     ← ✅ SHIPPED (phase 1)
  provider.interface.js      contract + shared xmlSafe
  twilio.provider.js         extracted from outboundCall.service.js as-is
  plivo.provider.js          ✅ answer_url delivery, JSON call create, Stream XML
  index.js                   resolveProvider(); registry, falls back not throws

backend/src/services/plivo/     ← ✅ SHIPPED (phase 2, partial)
  client.js                  ✅ auth, retries, v3 signature validation
  subaccount.service.js      ✅ create / enable / disable / delete
  compliance.service.js      requirements → application → status   (phase 3)
  number.service.js          search / rent / assign / release      (phase 4)

backend/src/services/branding/
  brand.service.js           BrandProfile CRUD + enrolment status
  truecaller.provider.js     behind the chosen reseller's API

backend/src/controllers/plivoWebhook.controller.js
                             compliance status callbacks (signature-validated)
                                                                       (phase 3)
backend/src/controllers/plivo.controller.js   ← ✅ SHIPPED (phase 5)
                             answer_url (the call document) + hangup callback
backend/src/ws/plivoMediaRealtime.handler.js  ← ✅ SHIPPED (phase 5)
                             Plivo sibling of the Twilio media bridge
```

### Phase 5 — what the wire protocol actually turned out to be

Verified against Plivo's protocol reference, not inferred from the Twilio
bridge. Five differences, every one of them a silent failure if copied wrong:

| | Twilio | Plivo |
|---|---|---|
| Play audio | `{event:'media', streamSid, media:{payload}}` | `{event:'playAudio', media:{contentType, sampleRate, payload}}` |
| Barge-in flush | `{event:'clear', streamSid}` | `{event:'clearAudio', streamId}` |
| Stream id field | `start.streamSid` | `start.streamId` |
| Per-call data | `start.customParameters` | **none** — rides on the socket URL |
| End of call | sends a `stop` event | **never sends `stop`** |

The last row is the dangerous one. A bridge modelled on the Twilio handler's
`case 'stop'` works perfectly and never settles a single call — every log stays
`IN_PROGRESS` and every `billingStatus` stays `PENDING`. Here the socket closing
is the only end-of-call signal, and for greeting-only calls (no socket at all)
it is the `hangup_url` callback.

`contentType` and `sampleRate` go on **every** outbound frame, not just the
first, and must match the `contentType` on the `<Stream>` element that opened
the socket — which is why both constants live in `plivo.provider.js` and are
imported by the handler rather than written out twice.

`assignNumber()`, `setHeaderStatus()`, `releaseNumber()` and
`assertComplianceReady()` are reused unchanged. The Plivo services **call** the
compliance service; they do not duplicate its gate.

### Signature validation — do not rewrite from the prose docs

`client.js#signingString` is a faithful reimplementation of plivo-node's
`v3Security.js`, not a reading of the written docs, because the docs are
ambiguous about separator placement and the reference implementation has two
quirks a reasonable reading would miss:

1. A POST carrying form params but **no** query string still gets a bare
   trailing `?` before the params are appended (`https://x.io/hook?A1B2`).
2. A POST with **both** a query string and form params gets a `.` between them
   (`https://x.io/hook?q=1.A1`).

Both are pinned by tests. The implementation was verified byte-for-byte against
the real SDK across 16 request shapes plus negative controls. Get this wrong and
every genuine webhook is rejected — or, implemented permissively, forged ones
are accepted.

Consequence for configuration: `PLIVO_WEBHOOK_URL` must match what is registered
with Plivo **exactly**, down to the trailing slash, because the URL is part of
the signed string.

### What phase 1 actually landed

`outboundCall.service.js` no longer names a carrier. It owns policy — call mode,
log pre-creation, billing-state closeout — and delegates protocol to the provider:
`status()`, `defaultFrom()`, `mediaStreamUrl()`, `buildConversationDoc()`,
`buildGreetingDoc()`, `placeCall()`. Public exports and their shapes are
unchanged, including the `callSid` field name (Plivo's `call_uuid` normalizes
into it), so `agent.controller.js` and `campaignRunner.service.js` were untouched.

Two deliberate gaps for a later phase:

- **`plivo.provider.js` must set `deliverDocument: 'answer_url'`.** Twilio takes
  the XML inline; Plivo fetches it. The interface declares the difference but
  nothing consumes it yet, because with only Twilio registered there is nothing
  to branch on. The answer-url endpoint is phase 5 work.
- **Caller-ID fallback still reads `process.env.TWILIO_FROM_NUMBER` directly** in
  `agent.controller.js:417` and `campaignRunner.service.js:52`. Those belong to
  number resolution, which `VoiceNumber` takes over in phase 4 — routing per
  number is what makes the migration per-tenant and reversible.

---

## 9. Environment

```bash
PLIVO_AUTH_ID=                    # main account
PLIVO_AUTH_TOKEN=
PLIVO_VOICE_APP_ID=               # default app for rented numbers
PLIVO_ANSWER_URL=                 # https://<backend>/api/v1/plivo/answer
PLIVO_WEBHOOK_URL=                # compliance status callbacks
PLIVO_SUBACCOUNT_TOKEN_KEY=       # encryption key for authTokenEnc
TELEPHONY_PROVIDER_DEFAULT=TWILIO # flip to PLIVO per-workspace first
TRUECALLER_API_KEY=               # or reseller equivalent
TRUECALLER_PARTNER_ID=
```

`config/env.js` currently declares no Plivo keys at all — this integration is
greenfield. Keep `TELEPHONY_PROVIDER_DEFAULT` at `TWILIO` and route individual
workspaces to Plivo by `VoiceNumber.provider`, so the migration is per-tenant and
reversible rather than a flag day.

---

## 10. Reconciliation

Pull per-subaccount usage on a schedule and diff it against
`AgentCallLog` settlement. Two failure modes this catches, both of which cost real
money and neither of which is visible from our side alone:

- Calls Plivo billed that we never logged — bridge crashes after dispatch.
- Calls we billed the client's wallet for that Plivo has no record of.

Alert on any drift beyond rounding. Do not auto-correct wallets from carrier data;
flag for review.

---

## 11. Unresolved — confirm with Plivo in writing before building

**Both blocking items resolved 2026-08-11 from Plivo's own docs.** Treat as
strongly indicated, not contractual; a test call after KYC settles each one.

1. ~~**Can a subaccount hold India numbers under a per-end-customer compliance
   application?**~~ **Answered by the Direct Brand / Reseller split.** Plivo's
   India KYC flow distinguishes *Direct Brand* (one application, for your own
   traffic) from *Reseller* (a separate application **per end customer**). We are
   a reseller, so applications are per-client by design — they do not travel, and
   step 5's `compliance_application_id` is always the client's own. **This is a
   recurring per-tenant onboarding cost, not one-time setup**, and the onboarding
   flow has to model it as such.
2. **CNAP and reseller-rented numbers.** Whose name resolves for a number rented
   through Plivo — Plivo's carrier partner's, or can an end customer's trade name
   be attached? This decides whether channel C is ever available to us. *Still
   open. Not blocking — channel C is roadmap either way.*
3. ~~**India media anchoring vs our realtime bridge.**~~ **Answered: yes, this
   works.** Plivo runs regional infrastructure specifically to satisfy India's
   in-country media rule and keeps both legs domestic when the account and
   compute sit in the India region. AudioStream is bidirectional
   (`<Stream bidirectional="true" keepCallAlive="true">`) and **µ-law 8 kHz is
   Plivo's recommended format** — the exact codec `ws/twilioMediaRealtime.handler.js`
   already speaks, so the transcode risk is nil. **The conversational product is
   not greeting-only in India.** The binding constraint is now purely ours: the
   backend and its `wss://` endpoint must be hosted in India.
4. **Our TM-AF registration**, still open from `DLT_COMPLIANCE.md` §"Open question".
5. **140-series allotment** — whether Plivo can allot 140 numbers to a reseller's
   end customers, and what that requires. 140 and 160 series carry a separate,
   slower SLA than the 15-minute 022/080 path.

### Cost correction (2026-08-11)

Earlier notes recorded that **AudioStream is included free**. That is wrong.
Streaming is billed separately — Plivo advertises SIP + Audio Streaming from
**$0.0028/min** (~₹0.24), with third-party sources quoting ~₹0.34/min for India.
India all-in is therefore roughly **₹0.85–0.95/min**, not ₹0.60.

This does not change the decision — Twilio cannot legally carry Indian domestic
traffic at any price — but it does move the margin math against the ₹6.72–11.52
rate card. Confirm the exact India streaming rate on the first invoice.

---

## 12. Build order

| Phase | Work | Blocked by |
|---|---|---|
| 0 | ✅ **Done.** Items 1 and 3 answered; India-region org KYC-verified as a **reseller** (2026-08-13) | — |
| 1 | ✅ **Done.** Provider abstraction; Twilio extracted behind it, unchanged | — |
| 2 | ✅ **Code done.** `plivo/client.js`, subaccount CRUD + model + migration. **Unverified against live Plivo** — no account yet | Phase 1 |
| 3 | Compliance API wiring + webhook, mapped onto existing statuses | Phase 2 |
| 4 | Number search/rent/assign into subaccount | Phase 3 |
| 5 | ✅ **Code done.** `plivo.provider.js`, answer/hangup endpoints, `plivoMediaRealtime.handler.js`. **Unverified against a live call** | — |
| 6 | `BrandProfile` + Truecaller enrolment | independent |
| 7 | Usage reconciliation | Phase 4 |

Phase 6 is independent of everything else and is the phase that delivers the
feature actually being asked for. If the display name is the priority, build it
against the **existing Twilio numbers** first and migrate the carrier later —
Truecaller verification attaches to a phone number, not to a carrier account.

---

## Sources

- [Create a Subaccount — Plivo API Reference](https://www.plivo.com/docs/account/api/subaccount/create-a-subaccount)
- [Subaccount API — Plivo](https://www.plivo.com/docs/account/api/subaccount)
- [Update an Account Phone Number — Plivo](https://www.plivo.com/docs/numbers/api/account-phone-number/update-a-number)
- [Compliance — Plivo](https://www.plivo.com/docs/numbers/compliance)
- [India Calling Regulations — Plivo](https://www.plivo.com/docs/voice/concepts/india-calling)
- [What is a subaccount? — Plivo support](https://support.plivo.com/hc/en-us/articles/360041828131-What-is-a-subaccount)
- [Can I set up a CNAM for all my Plivo phone numbers? — Plivo support](https://support.plivo.com/hc/en-us/articles/360041450052-Can-I-set-up-a-CNAM-for-all-my-Plivo-phone-numbers)
- [CNAM Lookup — Plivo](https://www.plivo.com/docs/numbers/cnam-lookup)
- [Renting a local number in India — Plivo support](https://support.plivo.com/hc/en-us/articles/36749835402905-What-is-the-process-for-renting-a-local-number-in-India)
- [DoT sets March 2026 deadline for pan-India CNAP rollout — Business Standard](https://www.business-standard.com/industry/news/cnap-service-nationwide-rollout-by-march-2026-dot-trai-telecom-125102901190_1.html)
- [TRAI Recommendations on CNAP](https://trai.gov.in/node/257)
- [India Rolls Out CNAP in 2026 — Mondaq](https://www.mondaq.com/india/telecoms-mobile-cable-communications/1715710/india-rolls-out-cnap-in-2026-official-caller-name-display-to-fight-spam-powered-by-kyc-databases-and-privacy-opt-out)
- [Truecaller Verified Business Caller ID](https://business.truecaller.com)
