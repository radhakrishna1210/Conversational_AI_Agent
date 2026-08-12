# Dialling Hygiene — Implementation Plan

**Status:** plan only. Three inert files and a parked migration exist; nothing is
wired, `schema.prisma` is untouched, and nothing applies itself. §4 carries the
data model verbatim so Phase 0 is paste-and-move. See §11 for the disk state.

**Companion to `DLT_COMPLIANCE.md`.** That document answers *"is this workspace
allowed to dial at all?"* — a per-workspace registration question. This one
answers the separate question it does not touch: *"may we dial **this** person,
from **this** number, **right now**?"* Both gates must pass. A fully
DLT-compliant workspace can still destroy its caller IDs in a week without the
controls below.

---

## 1. The constraint that governs everything

TCCCPR's enforcement threshold is **5 complaints in 10 days**.

At 20,000 calls/day that is 200,000 calls per window — a tolerance of **one
complaint per 40,000 calls, or 0.0025%**. Well-targeted, fully-consented
campaigns rarely beat 0.01%. Cold or bought lists run 0.1–1%.

Two consequences that shape the whole design:

1. **Consent quality is the only control that changes the outcome.** Everything
   else is damage limitation. This must be said plainly to clients, and the
   product should make bad lists hard to run rather than easy.
2. **Complaints attach to the entity, not the number.** Rotating caller IDs
   spreads carrier-level *filtering* risk. It does nothing about TCCCPR
   exposure. Anyone who believes rotation solves compliance will be surprised.

Volume arithmetic worth stating once:

```
20,000 calls/day ÷ 200 per number/day = 100 numbers
```

That is the real infrastructure requirement for a 20k/day tier, and its rental
cost is not currently in the cost model.

---

## 2. Scope — seventeen controls

Grouped by what they actually do. The "Phase" column maps to §9.

| # | Control | Kind | Phase |
|---|---|---|---|
| 1 | DND / NDNC scrubbing | Legal requirement | 3 |
| 2 | Platform-wide opt-out suppression | Legal + ethical | 2 |
| 3 | Per-contact consent proof | Audit | 6 |
| 4 | List hygiene (invalid-number rejection) | Quality | 2 |
| 5 | Number pool + rotation | Capacity | exists |
| 6 | Per-number daily dial cap **enforced** | Reputation | 2 |
| 7 | Warm-up ramp | Reputation | 2 |
| 8 | Per-workspace subaccount isolation | Blast radius | `PLIVO_INTEGRATION.md` |
| 9 | Call window 09:00–21:00 IST | Legal + complaints | 1 |
| 10 | Adaptive pacing | Reputation | 1 |
| 11 | Retry caps + backoff | Complaints | 1 |
| 12 | Number health scoring | Early warning | 4 |
| 13 | Auto-quarantine | Early warning | 4 |
| 14 | Carrier usage reconciliation | Billing + abuse | `PLIVO_INTEGRATION.md` |
| 15 | 140-series (label immunity) | Identity | provisioning |
| 16 | Truecaller Verified Business Caller ID | Answer rate | 6 |
| 17 | Runtime-enforced AI disclosure | Legal | 5 |

Items 8, 14, 15 are covered elsewhere and are out of scope for this plan except
where they interact.

---

## 3. Architecture

Follows the existing `services/compliance/` split exactly: **pure rules in one
file, database access in another.** The rules are total functions over plain
data with an injected `now`, so every threshold is testable without a database
or a clock.

```
constants/dialing.js              vocabulary + every tunable default

services/compliance/
  callWindow.js      PURE   window, pacing, warm-up cap, retry scheduling
  numberHealth.js    PURE   answer/short-hangup ratios, quarantine verdict
  disclosure.js      PURE   AI disclosure text, template-bound
  suppression.service.js  DB   opt-out / DND / complaint list
  dialGuard.service.js    DB   the composite per-dial gate + counters + quarantine
  numberHealth.job.js     DB   periodic rescoring, calls numberHealth.js
```

**Why a separate `dialGuard` rather than extending `compliance.service.js`:**
`assertComplianceReady()` is a per-workspace question answered once per batch.
The dial guard is a per-recipient question answered thousands of times per
campaign, with different caching characteristics and a different failure mode
(skip this recipient vs. stop the campaign). Merging them would force one of the
two into the wrong shape.

---

## 4. Data model

**Not in `schema.prisma`.** These were written into it and then reverted, so the
schema matches the live database again. The definitions below are the spec:
paste them back in Phase 0, alongside moving the parked migration. The SQL that
matches them is at
`docs/planned-migrations/20260811150000_dialing_hygiene/migration.sql`.

### New: `SuppressionEntry`

Numbers we must never dial. A null `workspaceId` is **platform-wide**.

```prisma
/// Numbers we must never dial: opt-outs, DND/NDNC imports, and complaint
/// sources. A null workspaceId is a PLATFORM-WIDE entry — "stop calling me"
/// said to one workspace's agent suppresses the number everywhere, because the
/// person did not consent to being passed between our tenants.
model SuppressionEntry {
  id          String    @id @default(cuid())
  workspaceId String?
  phoneNumber String
  // OPT_OUT | DND | COMPLAINT | MANUAL
  reason      String
  source      String?
  note        String?
  // DND imports go stale and must be re-scrubbed; an opt-out never expires,
  // so null means permanent.
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())

  workspace   Workspace? @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  // Postgres treats NULLs as distinct, so this does NOT dedupe platform-wide
  // rows. suppression.service.js guards those with an explicit read first.
  @@unique([workspaceId, phoneNumber, reason])
  @@index([phoneNumber])
  @@index([reason, expiresAt])
}
```

Also add to `model Workspace`:

```prisma
  suppressions        SuppressionEntry[]
```

> The NULL-distinctness caveat is a deliberate trade. The alternative is a
> partial unique index (`WHERE "workspaceId" IS NULL`), which Prisma cannot
> express in the schema and which would therefore read as drift on every
> subsequent diff.

### New: `NumberDialCounter`

```prisma
/// Per-number, per-IST-day dial count. The cap is a calendar-day limit in the
/// recipient's timezone rather than a rolling 24h window, because that is how
/// a carrier's abuse desk reads volume.
model NumberDialCounter {
  id          String   @id @default(cuid())
  phoneNumber String
  // IST calendar date, YYYY-MM-DD.
  dialDate    String
  dialled     Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([phoneNumber, dialDate])
  @@index([dialDate])
}
```

`dialDate` is an **IST calendar date string**, not a timestamp. A UTC day
boundary falls at 05:30 IST — mid-campaign — and would hand a number a fresh
allowance halfway through the morning. Storing the IST date as text keeps the
unique key correct regardless of the database session timezone.

### Extended: `VoiceNumber`

Replace the `status` comment and insert after `dailyDialCap`:

```prisma
  // ACTIVE | QUARANTINED | RELEASED
  status         String    @default("ACTIVE")

  // Warm-up ramp. A brand-new CLI jumping straight to its full cap is the
  // signature of a burner number; the effective cap climbs over WARMUP_DAYS
  // from this instant. Null means "already warm" — set it on provisioning.
  warmupStartedAt DateTime?

  // Health, recomputed by the scoring job from the call log. Persisted rather
  // than derived on read so the quarantine decision has a stable, auditable
  // input and the admin UI does not re-aggregate on every page load.
  lastHealthAt     DateTime?
  healthSample     Int       @default(0)
  healthAnswerRate Float?
  healthShortRate  Float?
  quarantinedAt    DateTime?
  quarantineReason String?
```

`VOICE_NUMBER_STATUS` in `constants/compliance.js` gains `QUARANTINED`.

### Extended: `Campaign`

```prisma
  // ── Dialling hygiene (per-campaign overrides of the platform defaults) ─────
  // Local call window in IST minutes-from-midnight. Null falls back to
  // CALL_WINDOW_START_MIN / CALL_WINDOW_END_MIN. Outside it the dispatcher
  // sleeps rather than failing recipients — a campaign launched at 10pm should
  // start at 9am, not burn its whole list.
  windowStartMin   Int?
  windowEndMin     Int?
  // Total dial attempts per recipient across the whole campaign. 1 = no retry,
  // which is the behaviour every existing campaign already has.
  maxAttempts      Int                 @default(1)
  // Minimum gap between two attempts on the same recipient, in minutes.
  retryBackoffMin  Int                 @default(240)
```

`maxAttempts` defaulting to 1 is load-bearing: it means applying this migration
changes the behaviour of exactly zero existing campaigns. Retry is opt-in and
never retroactive.

### Extended: `CampaignRecipient`

```prisma
  // pending | calling | sent | failed | skipped | retry_scheduled
  status        String    @default("pending")
  failureReason String?
  // Set when the recipient was refused before dialling (suppression, DND,
  // invalid number). Kept separate from failureReason so "we chose not to
  // call this person" is never confused with "the carrier rejected the call".
  skipReason    String?
  startedAt     DateTime?
  lastAttemptAt DateTime?
  // Retry spacing. A row is only re-dialled once now >= nextEligibleAt.
  nextEligibleAt DateTime?
```

Plus the index the widened batch query needs:

```prisma
  @@index([campaignId, status, nextEligibleAt])
```

`skipReason` is deliberately separate from `failureReason`: it is the audit
trail proving scrubbing happened, and it must survive as evidence distinct from
carrier failures.

---

## 5. The dial guard — decision order

`dialGuard.service.js` exposes one function the dispatcher calls per recipient.
**Order matters**, and it is ordered cheapest-and-most-final first:

```
evaluateDial({ workspaceId, campaign, recipient, rotation, now })
  → { action: 'DIAL' | 'SKIP' | 'HOLD', from?, skipReason?, holdReason?, resumeAt? }
```

| # | Check | Fails with | Why here |
|---|---|---|---|
| 1 | Number is parseable E.164 | `SKIP INVALID_NUMBER` | Free, terminal |
| 2 | Suppressed — opt-out / complaint / manual | `SKIP OPTED_OUT` | Terminal, and the one we most owe the recipient |
| 3 | Suppressed — DND, **only if use case is PROMOTIONAL** | `SKIP DND` | Service/transactional to a DND number is lawful |
| 4 | Attempts budget remaining | `SKIP ATTEMPTS_EXHAUSTED` | Terminal |
| 5 | `nextEligibleAt` reached | `HOLD` | Transient |
| 6 | Inside call window | `HOLD OUTSIDE_CALL_WINDOW` + `resumeAt` | Transient, campaign-wide |
| 7 | Pick a caller ID with cap headroom, not quarantined | `HOLD ALL_NUMBERS_CAPPED` / `ALL_NUMBERS_QUARANTINED` | Transient |
| 8 | Reserve one dial against that number's counter | — | Must be atomic |

**SKIP vs HOLD is the critical distinction.** SKIP is terminal and marks the
recipient. HOLD means *try again later* and must never consume an attempt or
mark the row — the dispatcher sleeps and re-evaluates. Getting this wrong
either burns lists against closed windows or spins the batch query forever.

### Counter atomicity

Step 8 must be an atomic upsert-and-increment that returns the new value, and
the guard must re-check the cap **after** incrementing:

```sql
INSERT INTO "NumberDialCounter" ("id","phoneNumber","dialDate","dialled","updatedAt")
VALUES ($1,$2,$3,1,now())
ON CONFLICT ("phoneNumber","dialDate")
DO UPDATE SET "dialled" = "NumberDialCounter"."dialled" + 1, "updatedAt" = now()
RETURNING "dialled";
```

Check-then-increment races: two dispatcher processes (BullMQ worker plus the
in-process fallback, which this deployment genuinely runs) can both read 199
against a cap of 200 and both dial. Increment-then-check overshoots by at most
the number of concurrent dispatchers, and the overshoot is *released* back if
the guard then refuses. Correct-by-construction beats a lock here.

---

## 6. Module specifications

### `constants/dialing.js` ✅ written
All tunables in one place: `SUPPRESSION_REASON`, `SKIP_REASON`, `HOLD_REASON`,
`QUARANTINE_REASON`, window defaults, `IST_OFFSET_MIN`, warm-up and health
thresholds. Every value overridable by env (§8).

### `callWindow.js` ✅ written
Pure. `istParts`, `istDateKey`, `resolveWindow`, `callWindowState`,
`minutesLeftInWindow`, `paceIntervalMs`, `effectiveDailyCap`, `scheduleRetry`.

India is UTC+5:30 year-round with **no DST**, so IST is a constant offset and
this file has zero dependencies — no timezone database, no `Intl` calls in a
hot loop.

`callWindowState` returns `resumeAt`, not a boolean, because the dispatcher's
correct response to "too early" is to sleep until 9am, not to fail the campaign.

### `numberHealth.js` ✅ written
Pure. `summarise`, `quarantineVerdict`, `healthScore`.

Two deliberate decisions:
- **"Answered" requires duration > 6s.** A call cut off at two seconds is a
  rejection, not an answer; counting it as one would mask exactly the
  degradation being looked for.
- **`shortRate` denominator is connected calls, not all dials.** Otherwise the
  ratio falls whenever answer rate falls, hiding the signal.
- **Below `HEALTH_MIN_SAMPLE` (40) the verdict is "unknown", not "healthy".**
  Callers must not read a null verdict as a clean bill of health.

### `suppression.service.js` ❌ to write

```js
isSuppressed(workspaceId, phoneNumber, { useCase })
  → { suppressed: boolean, reason: string|null, scope: string|null }
bulkCheck(workspaceId, phoneNumbers[], { useCase })   // one query per batch
suppress({ workspaceId|null, phoneNumber, reason, source, note, expiresAt })
unsuppress(id)
importDnd(entries[], { source, expiresAt })            // bulk CSV/API load
listSuppressions(workspaceId, { reason, page })
```

- `bulkCheck` exists because the dispatcher processes 50-row batches. Fifty
  round trips per batch is the difference between a working dispatcher and a
  database-bound one.
- DND entries are filtered out for non-promotional use cases at query time.
- Expired rows are ignored by the read path and swept by a periodic job — never
  deleted on read, because a read path that writes is a lock-contention source.

### `dialGuard.service.js` ❌ to write

```js
evaluateDial({ workspaceId, campaign, recipient, rotation, now })
prefetchGuardContext(workspaceId, campaign, rotation)   // per-batch cache
reserveDial(phoneNumber, dialDate)                      // atomic, §5
releaseDial(phoneNumber, dialDate)                      // on refusal after reserve
recordAttempt(recipientId, { outcome, nextEligibleAt })
```

`prefetchGuardContext` loads the workspace's use case, the `VoiceNumber` rows
for the rotation, and today's counters **once per batch**, so `evaluateDial` is
mostly in-memory. Only the suppression `bulkCheck` and the atomic reserve touch
the database per recipient.

### `numberHealth.job.js` ❌ to write

Periodic (every 15 min) rescore of every `ACTIVE` `VoiceNumber`:

1. Aggregate `AgentCallLog` for calls from that number in the last
   `HEALTH_WINDOW_HOURS` (72).
2. `summarise()` → persist `healthSample`, `healthAnswerRate`,
   `healthShortRate`, `lastHealthAt`.
3. `quarantineVerdict()` → if quarantine, set `status = QUARANTINED`,
   `quarantinedAt`, `quarantineReason`, and alert.

> **Blocker:** `AgentCallLog` has no `fromNumber` column. Health cannot be
> attributed per caller ID today. See §12.1 — this must be resolved before
> Phase 4.

Un-quarantine is **manual only**. An automatic release would put a filtered
number straight back into rotation and re-burn it; a human should look at why.

### `disclosure.js` ❌ to write

```js
buildDisclosure({ agent, workspace, template }) → string
```

Returns the fixed opening: company identity, plain statement that this is an AI
voice assistant, and consent to continue. Bound to the workspace's approved DLT
voice template body so delivered content cannot contradict the registered one.

---

## 7. Integration points

### `campaignRunner.service.js` — the main change

Current loop: read batch of `pending` → dial each → fixed 1s sleep.

Target loop:

1. **Batch query** widens to `status IN ('pending','retry_scheduled')
   AND (nextEligibleAt IS NULL OR nextEligibleAt <= now)`, using the new
   `(campaignId, status, nextEligibleAt)` index.
2. `prefetchGuardContext()` once per batch.
3. `bulkCheck()` suppression for the whole batch in one query.
4. Per recipient: `evaluateDial()` →
   - `SKIP` → mark `skipped` + `skipReason`, continue. **Never counts as an attempt.**
   - `HOLD` with `resumeAt` → `syncProgress()`, sleep to `resumeAt` (capped, re-reading campaign status so Pause/Cancel still work), then re-loop.
   - `DIAL` → dial from the returned `from`.
5. After a failed dial, `scheduleRetry()` → either `retry_scheduled` with
   `nextEligibleAt`, or terminal `failed`.
6. Replace the fixed `DIAL_SPACING_MS` with
   `paceIntervalMs(remaining, minutesLeftInWindow(...))`.

**Care required:** the existing loop returns early on Pause/Cancel in three
places. The window-sleep must preserve every one of those — a campaign that
cannot be paused because it is asleep until 9am is a worse bug than the one
being fixed. Sleep in short increments and re-read status each time.

### `outboundCall.service.js` — AI disclosure

Cleanest runtime enforcement, and it works for both call modes:

```xml
<Response>
  <Say voice="Polly.Aditi">{disclosure}</Say>
  <Connect><Stream url="...">…</Stream></Connect>
</Response>
```

Twilio (and Plivo) execute verbs in order, so the disclosure is spoken **before
the model is connected at all**. The model cannot skip it, argue around it, or
be prompt-injected out of it — which is precisely why this belongs in the markup
and not in a system prompt.

Must go through the existing `xmlSafe()` helper.

### Admin / API surface
- Super Admin: suppression list CRUD, DND import, quarantine view, manual
  quarantine/release, per-number health.
- Client console: read-only view of their own suppression list and number health.
- Public unsubscribe endpoint writing a platform-wide `OPT_OUT`.

---

## 8. Configuration

```bash
DIAL_HYGIENE_MODE=warn        # off | warn | enforce — mirrors DLT_COMPLIANCE_MODE
CALL_WINDOW_START_MIN=540     # 09:00 IST
CALL_WINDOW_END_MIN=1260      # 21:00 IST
DIAL_PACE_MIN_MS=1000
DIAL_PACE_MAX_MS=60000
WARMUP_DAYS=14
WARMUP_FLOOR_FRACTION=0.1
HEALTH_WINDOW_HOURS=72
HEALTH_MIN_SAMPLE=40
HEALTH_MIN_ANSWER_RATE=0.15
HEALTH_MAX_SHORT_RATE=0.7
MAX_ATTEMPTS_PER_DAY=3
DND_PROVIDER_URL=             # empty = imported-list-only scrubbing
DND_PROVIDER_KEY=
DND_FAIL_CLOSED=true          # no DND source + promotional + enforce → refuse
```

`DIAL_HYGIENE_MODE` deliberately mirrors `DLT_COMPLIANCE_MODE` and for the same
reason: shipping straight to `enforce` would stop live campaigns the moment a
threshold is mis-tuned. Ship `warn`, read the logs, tune, then flip.

**`DND_FAIL_CLOSED` is the one that needs a decision.** With no DND source
configured, a promotional campaign in `enforce` either refuses to run
(fail-closed, legally safe, breaks every existing campaign) or runs unscrubbed
(fail-open, convenient, unlawful). Default `true`, and it is why DND is Phase 3
rather than Phase 1.

---

## 9. Build order

Ordered by risk reduction per unit of work. Phases 1–2 remove most of the
mechanical risk in about a day.

| Phase | Work | Depends on | Notes |
|---|---|---|---|
| **0** | Re-apply §4 to `schema.prisma`, move the parked migration back into `prisma/migrations/` | — | Strictly additive; the two must land together |
| **1** | Call window + retry caps + pacing | 0 | Pure scheduling in the dispatcher. No new external dependency |
| **2** | Suppression list + dial-cap enforcement + warm-up | 0 | `suppression.service.js`, `dialGuard.service.js`, dispatcher wiring |
| **3** | DND scrubbing | 2 | **Start procurement now** — this has vendor lead time, not build time |
| **4** | Health scoring + auto-quarantine | 2, §12.1 | Needs `fromNumber` on the call log, then data accumulation |
| **5** | Runtime AI disclosure | — | Independent; small; legally required |
| **6** | Consent proof + Truecaller branding | 2 | Independent of the rest |

Phases 1, 2 and 5 are self-contained and could ship in one pass. Phase 3 is the
legally mandatory one and the one with an external dependency, so its
procurement starts on day one regardless of build order.

---

## 10. Testing

The reason the rules are pure functions. Existing suites run per-file — see the
`backend-test-suite-hangs` note; do not run the whole suite.

**Pure, exhaustive:**
- `callWindow` — inside/before/after window; midnight and 05:30 IST boundaries
  (the UTC-day trap); retry landing in a closed window; warm-up day 0 / 7 / 14 /
  past-end / null; pacing at 0 recipients, 0 minutes left, and both clamps.
- `numberHealth` — below min sample returns unknown; answer-rate and
  short-hangup triggers independently; all-unanswered; all-short; empty input.

**Integration:**
- Concurrent `reserveDial` on one number does not exceed the cap.
- A `HOLD` never increments `attempts` or marks the recipient.
- A campaign paused during a window sleep actually pauses.
- `skipReason` is set on every non-dialled recipient — this is the audit trail.

---

## 11. What exists on disk right now

**The working tree is clean of this work.** Nothing here is wired, and nothing
will apply itself. The three written files are inert — pure functions and
constants with no importers.

| Path | State |
|---|---|
| `prisma/schema.prisma` | ✅ **Reverted** — matches the live database; `prisma validate` passes |
| `docs/planned-migrations/20260811150000_dialing_hygiene/` | ⏸️ **Parked** outside `prisma/migrations/`, so it cannot auto-apply |
| `src/constants/dialing.js` | ✅ Written, unimported |
| `src/services/compliance/callWindow.js` | ✅ Written, unimported |
| `src/services/compliance/numberHealth.js` | ✅ Written, unimported |
| everything else in §3 and §6 | ❌ Not written |

**Why the migration is parked:** migrations auto-apply here — `predev` and
`prestart` run `migrate deploy` — against a **live Supabase database**. Left in
`prisma/migrations/`, it would have applied schema changes no code uses, on the
next backend start.

**Why the schema was reverted:** an edited `schema.prisma` whose migration has
not run puts the schema and the live database out of step, which is exactly the
drift condition `DLT_COMPLIANCE.md` warns about and the reason
`prisma migrate diff` emits destructive DDL in this repo. Keeping the definitions
in §4 instead loses nothing and leaves the tree safe.

**Phase 0 is therefore two steps, and they must happen together:** paste §4 back
into `schema.prisma`, and move the migration folder back. Either one alone
re-creates the drift.

---

## 12. Open decisions

### 12.1 `AgentCallLog` has no `fromNumber` — blocking for Phase 4
Health is per caller ID, and the call log does not record which caller ID placed
the call. Options:
- **(a) Add `fromNumber` to `AgentCallLog`.** Cleanest, one nullable column, but
  only scores calls made *after* it ships — Phase 4 then waits ~72h for data.
- (b) Derive it by joining `CampaignRecipient.callLogId` → campaign rotation.
  No migration, but wrong for test calls and for any campaign whose rotation
  changed mid-flight.

Recommend (a).

### 12.2 DND data source
No free public NDNC API exists. Choose: a commercial scrubbing vendor, a
carrier-provided list via Plivo/Exotel, or imported-list-only with
`DND_FAIL_CLOSED=true`. **This has procurement lead time and gates Phase 3** —
decide it early even though it builds late.

### 12.3 Cap and rotation sizing
`dailyDialCap` defaults to 200. Nothing validates that a campaign's rotation can
actually carry its list: 20,000 recipients across 5 numbers at 200/day is a
20-day campaign, and the UI will not say so. Add a launch-time projection —
"this campaign will take N days with your current numbers" — so the constraint
surfaces before launch rather than as apparent stalling.

### 12.4 Does the ₹/min rate cover 100 numbers of rental?
Not modelled. A 20k/day tier needs ~100 numbers; monthly rental on those is a
real line item absent from the cost model.

### 12.5 Retry semantics for greeting-only calls
A `greeting` call always "succeeds" — it plays and hangs up. Retry is meaningless
there and would double-bill. Retry should apply to `conversation` mode only, or
be gated on a real no-answer/busy disposition, which needs carrier status
callbacks the codebase does not yet consume.
