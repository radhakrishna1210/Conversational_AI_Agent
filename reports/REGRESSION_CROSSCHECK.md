# Regression Cross-check — historical claims vs this run

**Branch:** `release/readiness-audit` · **Baseline:** `ea9008a` · **Evidence:** `reports/evidence/2026-09-03_baseline/`

Every row below re-tests a claim made in `AUDIT_REPORT.md` (2026-08-04), `COMPLETION_REPORT.md` (2026-08-04), or `BUG_SHEET.md` (2026-07-29). Status vocabulary: **PASS** (fresh evidence this run), **PASS (code)** (behaviour verified by reading the current code and/or a unit test, not by exercising it live), **FAIL**, **BLOCKED** (needs a resource this run does not have — named), **OPEN** (still unfixed, as the historical report said), **N/A**.

The single most important context for this table: the historical reports describe a database of 10 users / 16 workspaces / 98 calls. The database today holds **65 / 182 / 646**, and read-only counts show **131 of 182 workspaces, 155 of 165 plans, 37 of 65 users, 105 of 137 wallets (₹29.99 lakh of the ₹33.08 lakh "float"), 147 calls, 40 subscriptions and 44 invoices are test fixtures** (`36_test_fixture_contamination.txt`) — the billing integration suites were run against the production `DATABASE_URL` after 2026-08-04 and left their data behind. Several historical PASSes are now wrong *in data* even where the code is unchanged.

---

## 1. AUDIT_REPORT items A-01 … A-15

| ID | Historical status | Claim | This run | Evidence |
|---|---|---|---|---|
| A-01 | FIXED | admin wallet credit is idempotent | **PASS (code) + PASS (data)**: `billing.controller.js:656` accepts `idempotencyKey`, derives one otherwise; **0 of 642** `WalletTransaction` rows have a null key. Replay-over-HTTP re-test needs a Superadmin token and a write → **BLOCKED (prod DB)** | `13_db_readonly_counts.txt` |
| A-02 | FIXED | plan dropdown reads the `Plan` table | **PASS (code) / FAIL (data)**: `userManagement.service.js:16 listAssignablePlans()` reads the table — which now holds **165 plans, 155 named `__test__*`/`TestPlan-*`**. The catalog-driven fix now surfaces test fixtures in the admin UI (`scripts/clean-test-data.js` header warns of exactly this). Cleanup is destructive → owner decision | `13_`, `36_` |
| A-03 | FIXED | `SUPER_ADMIN_EMAIL` reconciled at every login | **PASS (code)**: `reconcileSuperAdminRole()` called from 3 auth entry points. DB shows **3 Superadmin** memberships (report expected one) — verify they are intended. `verify-superadmin-role.js` creates users → **BLOCKED (prod DB)** | `13_` |
| A-04 | OPEN | `Admin`/`Viewer` rows the code does not define | **RESOLVED (data)**: roles today are `Superadmin 3 / Member 62` only; migration `20260813140000_retire_legacy_owner_role` covered `Owner` | `13_` |
| A-05 | FIXED | ban revokes refresh tokens | **PASS (code)**: `admin.controller.js:103,211` `refreshToken.updateMany({revokedAt})`. 387 live refresh tokens today. Live ban → **BLOCKED** | code |
| A-06 | FIXED (P1) | admin actions audited, secrets redacted | **PASS (code)**: `audit.service.js:118 redact()`; **no unit test existed** — one is added this run (see §4). 7 `AuditLog` rows in prod. | code, `13_` |
| A-07 | FIXED | migration history integrity (empty `20260804120000_admin_console` removed) | That specific fix holds (no `.err` dir). **But A-07 is re-OPENED with three new findings**: (a) **no migration in the repo creates the base schema** — the earliest is an `ALTER TABLE`; `migrate deploy` on an empty DB fails; `migration_lock.toml` is missing; (b) **12 migrations applied in prod have no directory here** (everything before `20260719`, plus `20260809120000_workspace_roles_and_invites`, `…130000_…owner_backfill`, `…140000_remove_whatsapp`); 2 rows are `rolled_back` retries; (c) **live drift**: prod has an orphan `QueryCache` table, and `VoiceNumber_nextRenewalAt_idx` differs (partial index in the migration vs full index in the schema — documented in the schema comment, so cosmetic). `prisma migrate status` says "up to date" regardless. Baseline SQL generated as evidence (1,271 lines, 48 tables). | `16_`, `17_`, `23_`, `24_` |
| A-08 | OPEN | live Google key committed | **FIXED in tree** (`b27012c`): literal replaced by `process.env.GEMINI_API_KEY`. Still in history since `943672c` and on GitHub → **rotate + purge = OWNER ACTION** | `git grep` clean |
| A-09 | OPEN | unbounded list queries | **PARTIAL**: `listWorkspaces` now paginates — in memory, after fetching every workspace (`admin.controller.js:48`, 182 rows today); `getWallet` still `take: 50`; the other named sites no longer exist (number pool / plans replaced). 8 `findMany` without `take` remain in controllers; all but `listWorkspaces` are tenant- or agent-bounded | static scan |
| A-10 | OPEN | `req.user?.id ?? req.user?.userId` phantom field | **OPEN** — 1 site left, `middleware/authorize.js:1`; harmless | `git grep` |
| A-11 | FIXED | last Superadmin cannot be deleted | **PASS (code)**: `admin.controller.js:147–166` → 409 + failure audit row. Live → BLOCKED | code |
| A-12 | OPEN (design) | live access token survives ban | **OPEN** — no denylist; Redis still unreachable (`ECONNREFUSED 6379`) | `00_` |
| A-13 | OPEN | COGS never recorded | **OPEN, worse**: `actualCostMicroUsd` set on **0 of 646** calls (was 0/98) | `13_` |
| A-14 | OPEN (cosmetic) | recording duration NaN | **OPEN** — still mitigated by showing `durationSec`; no remux | `git grep ffmpeg` |
| A-15 | OPEN (decision) | one payment → two invoices | **BLOCKED (accounting decision)** and now **contaminated**: 47 subscription invoices lack a `paymentOrderId` (was 3), 44 invoices sit in test workspaces. The `suspectedDuplicate` read-only flag is untouched. 2 legacy unnumbered invoices unchanged | `13_`, `36_` |

## 2. COMPLETION_REPORT rows

### Phase 1 — security, audit, money (11 rows)
| # | Claim | This run |
|---|---|---|
| 1 | Member → 403 on admin routes | **BLOCKED** (needs a Member token; no test account may be created on prod) — `authorize.js` still gates on `Superadmin` (code) |
| 2 | No token → 401 | **PASS**: `GET /api/v1/admin/{audit-logs,users,call-logs,billing/overview}` → `401 {"error":"Authentication required"}` on the running backend (`30_http_unauth_checks.txt`) |
| 3–7, 9, 11 | audit list, wallet credit, audit row, replay idempotent, ledger invariant, 404 unknown user, server-side filters | **BLOCKED** — all need a Superadmin token and/or a write to the production DB. Ledger invariant partially re-checked read-only: 0 null idempotency keys |
| 8 | plan list from real catalogue | see A-02 — **FAIL (data)** |
| 10 | secrets redacted | **PASS (code)** + new unit test |

### Phase 1b — superadmin (6 rows): **BLOCKED** (harness creates users). Code path verified (A-03).

### Phase 1c — admin console shell (9 rows)
| # | Claim | This run |
|---|---|---|
| 1–3, 5–8 | redirect, shell, real data, breadcrumb, audit page, filters, users page | **BLOCKED** (needs an authenticated browser session as Superadmin against prod) |
| 4 | sections are addressable routes | **PASS (code)**: `client/src/App.tsx:267–283` — `/admin/{users,appointments,billing,pricing,wallets,calls,issues,contact-requests,models,audit,health}`; `/admin/plans` → redirect to `/admin/pricing` |
| 9 | build clean | **PASS**: `tsc --noEmit` 0 errors, `vite build` ✓ (`27_`, `28_`) — with the note that **eslint had never been runnable**; first evaluable run: 87 errors / 22 warnings (`22_`) |

### Phase 2a — call logs & recordings (13 rows)
| # | Claim | This run |
|---|---|---|
| 1–5, 8, 11, 12 | paginated list, hydration, filters, detail, decode, stats, margin banner | **BLOCKED** (Superadmin token). Stats claim "98 calls" is stale: 646 today, 147 in test workspaces |
| 6–7 | recording streams, `Range` → 206 | **PASS (code)**: `adminCallLogs.controller.js:79–103` implements 206/416/`Accept-Ranges`; traversal impossible (`path.basename` on a server-generated name) |
| 9 | unknown id → 404 | code ✓; live BLOCKED |
| 10 | Member → 403 | BLOCKED (Member token) |
| 13 | recording fetched as blob, not `?token=` | **PASS**: `GET …/audit-logs?token=abc` → 401 on the running backend (query-string tokens refused); client uses authenticated fetch → object URL (code) |

### Phase 2b — billing visibility (12 rows)
| # | Claim | This run |
|---|---|---|
| 1–6, 9–12 | MRR, revenue, float, lists, ledger, 404, 403 | **BLOCKED** (Superadmin token). The read-only aggregates that back them are now dominated by fixtures: wallet float ₹33.08 lakh of which ₹29.99 lakh sits in test-named workspaces |
| 7 | duplicate-invoice detection | logic unchanged (code); the population it flags grew from 3 to 47 unanchored — most are fixtures (A-15) |
| 8 | legacy unnumbered invoices surfaced | **PASS (data)**: still exactly 2 rows with `number = null` |
| — | negative currency renders `-₹28,660.14` | **PASS (code)** in `AdminBilling.tsx:19` (sign-aware). A second formatter in `AdminCallLogs.tsx:59` is not sign-aware — latent only; the values it formats (`revenueCents`, `billedCents`) are never negative |

### Historical "Regression check" (`test:billing` 93/93, `money.test.js` 29/29)
| suite | this run |
|---|---|
| `money`, `razorpay`, `pricingBuckets`, `workspaceRate`, `callBudget`, `numberBilling` (pure) | **PASS** — inside `npm test` (971 tests, 0 fail) |
| `wallet.integration`, `subscription.integration`, `settlement.integration` | **BLOCKED** — 57 tests self-skip without `DATABASE_URL` (`34_skipped_db_bound_tests.txt`), and running them *with* it is how the production DB got its 131 test workspaces. They must run against a disposable database only |

## 3. BUG_SHEET

| ID | This run |
|---|---|
| BUG-001 phantom silence turns | **Mitigated in code, unverified live**: adaptive noise floor + SNR (`EditAgent.tsx:2190`), 3-tick voiced sustain, echo-rejecting barge bar, `isLikelySttHallucination` with the `audioHadSpeech` second signal (`agentRuntime.service.js:1407,1586`), `isEchoOfAgent`; unit tests `speechGate.test.js`, `speechGateDutyCycle.test.js` pass. The original reproduction (stay silent 5–15 s on a live web call) → **BLOCKED (approval to place calls)** |
| BUG-002 wallet/subscription not integrated | **Re-classified**: the sheet is stale — Razorpay order/webhook/verify (`billing.controller.js`), per-second settlement (`settlement.service.js`), balance gate (`callBudget.js`), invoices, renewal sweep all exist. The *spec* conflict (wallet-only vs subscriptions) is the live issue → `BASELINE_AUDIT.md` §7.1 |
| BUG-003 ambience | **Implemented**: `voice/ambience.js`, `ambiencePump.js`, `client/src/services/ambientSound.ts`, per-agent preset + intensity; `ambience.test.js`, `ambiencePump.test.js` pass. Audible/loop-seam/barge interaction → **BLOCKED (live call)** |

## 4. Latency-doc claims (P1–P5, B1, B2, step 0)
| item | this run |
|---|---|
| P1 engine on stream URL / cached lookup | code present (`server.js:177` upgrade reads `engine=`); live phone → BLOCKED |
| P2 greeting audio LRU | `voice/greetingAudio.js` + tests pass |
| P3 skip Finalize after commit | `deepgramStream.service.js` `_committed`; tests pass |
| P4 overlap harvest + AEC | `speechGate.js`, `echoCanceller.js` + tests pass; real-call numbers still absent |
| P5 structural PSTN | N/A (carrier) |
| B1 one process / 45 clocks | **instrumented this run** (`elLag*` on every record); unmeasured under load |
| B2 shared platform key / free tier | OPEN — no per-workspace credentials in schema; tier not re-verified (would spend quota) |
| step 0: verify VPS region | **DONE**: `62.72.12.185` → Mumbai (ipinfo, `32_network_rtt.txt`) |
| step 0: first phone row in `latency.log` | **still zero phone rows** |

## 5. Issue C — payment-summary key rename

**Source gap.** No text of "Issue C" exists in the repository, history, or reports; `git log --all --grep` and a tree-wide search for `paymentSummary|payment_summary|PaymentSummary` return nothing. The old and new names are unknown and are not invented here. **Status: BLOCKED pending the Issue C text.**

What was verified instead — **producer/consumer parity for every payment-total field the API emits today** (`git grep`, both trees):

| field | backend producers | client consumers | consumers with a producer |
|---|---:|---:|---|
| `amountCents` | 213 | 15 (`Billing.tsx`, `AdminBilling.tsx`, `AdminPanel.tsx`, `razorpayCheckout.ts`) | ✓ |
| `balanceCents` | 82 | 11 (`Billing.tsx`, `AdminBilling.tsx`, `AdminPanel.tsx`) | ✓ |
| `billedCents` | 24 | 7 (`AdminCallLogs.tsx`, `BroadcastDetail.tsx`, `broadcastApi.ts`) | ✓ |
| `revenueCents` | 2 (`adminCallLogs.service.js:208,226`) | 3 (`AdminCallLogs.tsx`) | ✓ |
| `spentCents` | 1 | 3 (`Broadcast.tsx`, `broadcastApi.ts`) | ✓ |
| `revenueTodayCents` / `revenueMonthCents` / `walletFloatCents` | 1 each (`adminBilling.service.js:80–86`) | 1 each (`AdminBilling.tsx`) | ✓ |
| `mrrCents` | 2 | 0 | (unused by client) |

No consumer reads a name the backend does not produce, so no rename is currently half-applied. Per-portal rendered-value reconciliation against the ledger (Dashboard, Billing, Analytics, Call Logs, Admin Overview/Billing/Wallets, webhook, invoice generation, exports; zero/non-zero/failed/pending/refunded/duplicate-webhook states) requires an authenticated session and test-mode payments → **BLOCKED (approval + isolated DB + Razorpay test mode)**.

## 6. New this run (not in any historical report)
| ID | finding | status |
|---|---|---|
| D-01 | `test:ws` cancelled 5 tests while printing "fail 0" | **FIXED** `9274fe3` (36/36) |
| D-02 | client `lint` script never runnable | **FIXED (evaluable)** `a278d60`; gate itself **FAILS**: 87 errors / 22 warnings |
| D-03 | committed key literal | **FIXED in tree** `b27012c`; rotation/purge owner |
| D-04 | 2+2 high dependency vulns | **FIXED** `a278d60` (0 high); 3+2 moderate remain (upstream / semver-major) |
| D-05 | any unknown `Origin` → HTTP 500 with policy text in body | **FIXED** `64cc048` + 8 tests |
| D-06 | `src/config/__tests__/csp.test.js` never in any script | **FIXED** `64cc048` (15 tests now run) |
| D-07 | no SSRF guard on tenant-supplied URLs (`endpointUrl`, post-call webhook `url`) | **FIXED** `92d10bc`: `lib/safeUrl.js` (16 tests) applied before both fetches + at save-time validation; DNS rebinding after the check remains a stated limit |
| D-08 | production DB contaminated with test fixtures (see header) | **OPEN — owner decision**; `npm run db:clean-test-data` exists and is destructive |
| D-09 | hourly renewal sweep is trying to renew 4 `past_due` `__test__` subscriptions and 29 more come due by 2026-09-29 | **OPEN — owner decision** (§7.1 of baseline) |
| D-10 | repo cannot build a database from scratch (A-07a) | **OPEN** |
| D-11 | no trace id / wall-clock durations / no audible measurement | **FIXED** `f04cafc` (instrumentation), measurement BLOCKED |

## 7. Phase 2 (2026-09-04) — what changed against the sections above

Every prior claim was re-verified by executing it; where execution disagreed with a document, execution wins and is stated.

| ID | claim / item | phase-2 executable result | status |
|---|---|---|---|
| §4 / brief §7 "the modular floor is ~2.2 s" | server-side `waitMs` | wire harness, 24 turns: **2,861 ms actual** with speculation off — the floor was *worse* than the server-side number because Deepgram's end-of-speech lag (~500 ms) was uncounted | corrected (`LATENCY_REPORT.md` §4) |
| owner claim 1 "STT sends everything to the LLM only at the end" | — | partly wrong as the brief said, and the real serialisation was not `finalizeTurn` either (that round trip is skipped on committed turns, `preLlmMs` ≈ 5): it was **no speculation** + Deepgram's ~950 ms end-of-speech | corrected; speculation built |
| owner claim 2 "Gemini takes about a second" | brief: p50 1.05 s | bake-off on this account: **p50 1.32 s, p90 5.3 s, max 9.3 s**; Groq p50 9.8 s (rate-limited) | confirmed, and the tail is the bigger problem |
| §4 "transfer exists" | — | confirmed prompt-only; **built** (`CALL_TRANSFER.md`), live carrier evidence BLOCKED | FIXED (code) / BLOCKED (live) |
| BUG-001 phantom turn | guards + unit tests | two **new** phantom/cut-off mechanisms found by the harness (empty `speech_final`, stale `UtteranceEnd`) and fixed; 0/72 in run 3 | FIXED (harness-verified), live BLOCKED |
| BUG-003 ambience audibility | unit only | pre-rendered chatter beds added and unit-verified; live audibility still BLOCKED | unchanged |
| AGT-13 Fast/Balanced/Patient differ live | unit only | not driven this phase (all arms Balanced) | UNVERIFIED |
| D-01 `test:ws` | 41/41 | **50/50** (9 transfer-callback tests added), 2 s; the "two files time out" report did not reproduce; bridge import 462 ms | PASS |
| D-02 client lint | 87 errors | **76 `no-explicit-any`** (−10 fixed properly in auth/audio files, 2 avoided), ratchet + baseline added; `npm run lint:ratchet` is the gate | FAIL → baselined honestly |
| D-08 fixtures | script "exists" | the script **did not match the `__test__` prefix** that carries 131 workspaces; extended + production guard; not run on production | OPEN (owner) |
| D-09 renewal sweep | open | `SUBSCRIPTION_RENEWAL_ENABLED=false` switch added; decision still owner's | OPEN (owner) |
| D-10 baseline migration | open | baselined + rehearsed on a clone shaped like production (`db/rehearsal_existing_db.txt`); production `migrate resolve` pending approval | FIXED (repo) / owner step |
| T-29 migration rehearsal | BLOCKED | executed | PASS |
| E-1 no isolated DB | BLOCKED | embedded Postgres + Redis stood up; 57 billing suites still read `DATABASE_URL` | PARTIAL |
| `QA_REGRESSION_TEST.md`, `MY_QA_STATUS.md`, `QA_FINAL_MATRIX.csv` | referenced by the brief | **do not exist** in the repo or its history; matrix has 109 (+18) rows, not 314 | source gap (E-8) |
| working tree at session start | — | reverted `139f797` and deleted two reports without a git record; restored, diff preserved (`00_pre_session_worktree.patch`) | noted (D-13) |
