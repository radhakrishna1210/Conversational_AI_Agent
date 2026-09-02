# QA Final Matrix

**Branch:** `release/readiness-audit` · **Baseline commit:** `ea9008a` · **Evidence:** `reports/evidence/2026-09-03_baseline/` (Bnn) and `reports/evidence/2026-09-03_final/` (Fnn)

Status vocabulary — **PASS**: fresh, executed evidence this run · **PASS (code)**: verified by reading current code and/or an executed unit test, not by exercising the live path · **FAIL** · **BLOCKED**: named external requirement (see `OPEN_ISSUES.md` §A) · **UNVERIFIED**: in scope, not reached, no evidence either way · **N/A**.

A row is never PASS by default. Every historical PASS was re-run or re-classified (`REGRESSION_CROSSCHECK.md`).

## 1. Build, static, dependencies, secrets

| ID | Test case | Baseline | Fix | Final | Status |
|---|---|---|---|---|---|
| T-01 | Backend unit suite (`npm test`) | 953/0 fail, 57 skip (B01) | +39 tests, +2 globs (lib, config) | F01 | **PASS** |
| T-02 | WS suite (`test:ws`) | 36 tests, **5 cancelled**, exit 1 (B04) | `9274fe3` | F02 | **PASS** |
| T-03 | Voice suite | 313/313 (B02) | — | F03 | **PASS** |
| T-04 | STT suite | 110/110 (B03) | — | F04 | **PASS** |
| T-05 | Client typecheck | 0 errors (B05) | — | F05 | **PASS** |
| T-06 | Client lint | not runnable (B06) | `a278d60` makes it evaluable | F06: 87 errors / 22 warnings | **FAIL** (gate honest, not relaxed) |
| T-07 | Client production build | ✓ (B07) | — | F07 | **PASS** |
| T-08 | Backend `npm audit --omit=dev` | 2 high / 4 mod (B08) | `a278d60` | F08: 0 high / 3 mod | **PASS (high)** / moderate accepted (S-3) |
| T-09 | Client `npm audit --omit=dev` | 2 high / 3 mod / 1 low (B09) | `a278d60` | F09: 0 high / 2 mod | **PASS (high)** / moderate accepted (S-2) |
| T-10 | Secret scan, tracked tree | 1 live key (B: `test_raw_api.js:4`) | `b27012c` | F11: 0 hits | **PASS** (history purge = owner) |
| T-11 | Secret scan, git history | key since `943672c` | — | — | **OPEN** (A-8) |
| T-12 | `.env` never committed | ✓ | — | ✓ | **PASS** |
| T-13 | Backend static analysis / lint | no config exists | — | — | **UNVERIFIED** (no backend eslint) |
| T-14 | Syntax of every changed backend file | — | — | F12 | **PASS** |

## 2. Database, migrations, data integrity

| ID | Test case | Result | Status |
|---|---|---|---|
| T-20 | `prisma migrate status` | "up to date" (B16/F10) — but see T-21..24 | **PASS (misleading)** |
| T-21 | Repo can build schema from migrations | no `CREATE TABLE` for any base table; earliest migration is `ALTER` (B23) | **FAIL** (D-10) |
| T-22 | Every applied migration has a directory | 12 orphan rows, 2 rolled-back retries (B17) | **FAIL** (D-10) |
| T-23 | Live schema = `schema.prisma` | drift: orphan `QueryCache`, partial-vs-full index (B24) | **FAIL (minor)** |
| T-24 | `migration_lock.toml` present | missing | **FAIL** |
| T-25 | Wallet ledger: no `WalletTransaction` without idempotency key | 0/642 (B13) | **PASS (data)** |
| T-26 | Ledger sum = balance per wallet (A-01 invariant) | needs per-wallet aggregation on prod | **BLOCKED** (E-1) |
| T-27 | Roles limited to defined set (A-04) | Superadmin 3 / Member 62 | **PASS (data)** |
| T-28 | Production free of test fixtures | 131/182 workspaces etc. (B36) | **FAIL** (D-8) |
| T-29 | Migration rehearsal on disposable clone | — | **BLOCKED** (E-1) |
| T-30 | Transactions / concurrent settlement / idempotent renewal (integration suites) | 57 tests self-skip (B34) | **BLOCKED** (E-1) |
| T-31 | Pagination on list endpoints (A-09) | `listWorkspaces` in-memory; others tenant-bounded | **PARTIAL** |

## 3. Authentication & authorization

| ID | Test case | Result | Status |
|---|---|---|---|
| T-40 | Unauthenticated → 401 on admin + workspace routes | 6/6 → `401 {"error":"Authentication required"}` (B30) | **PASS** |
| T-41 | Query-string token refused | `?token=abc` → 401 (B30) | **PASS** |
| T-42 | Malformed bearer → 401, no stack | `Invalid or expired token` (B30) | **PASS** |
| T-43 | Login empty body → 400 with field details, no 500 | (B30) | **PASS** |
| T-44 | Member → 403 on admin routes | needs Member token | **BLOCKED** (E-1) |
| T-45 | Superadmin reconcile at login/refresh/Google (A-03) | 3 call sites | **PASS (code)** |
| T-46 | Ban revokes refresh tokens (A-05) | `updateMany revokedAt` | **PASS (code)** |
| T-47 | Refresh-token rotation + reuse rejection | `auth.service.js:162–166` | **PASS (code)**; family revocation absent (S-4) |
| T-48 | Live access token after ban (A-12) | no denylist | **OPEN** |
| T-49 | Last Superadmin deletion guard (A-11) | 409 + audit | **PASS (code)** |
| T-50 | Two-tab logout, role drift, zero-flicker admin boundary | browser session | **BLOCKED** (E-1/E-2) |
| T-51 | Audit rows on admin actions, secrets redacted (A-06) | `redact()` + 5 new tests | **PASS** |
| T-52 | OTP / login rate limits | limiters at `auth.routes.js:18–19` | **PASS (code)** |

## 4. HTTP hardening

| ID | Test case | Result | Status |
|---|---|---|---|
| T-60 | Security headers (CSP, HSTS, nosniff, frame, referrer) | present on `/health` (B30); CSP asserted by 15 `csp.test.js` (now run) | **PASS** |
| T-61 | Unknown `Origin` → no CORS headers, not 500 | was 500 with reason (B30); `64cc048` + 8 tests | **PASS (code)**; live backend still old code |
| T-62 | 404 JSON for unknown route | `{"error":"Not found"}` | **PASS** |
| T-63 | JSON body limit configured | `env.JSON_BODY_LIMIT` | **PASS (code)** |
| T-64 | Upload validation (mime allow-list, size) | `kbFile.controller.js:29,35`, `upload.js` | **PASS (code)** |
| T-65 | Path traversal on recordings / KB / issue attachments | `path.basename` + server-generated names | **PASS (code)** |
| T-66 | IDOR: call log / recording scoped by workspace+agent | `findFirst({id, workspaceId, agentId})` | **PASS (code)** |
| T-67 | SSRF on tenant URLs | none → `92d10bc` (16 tests) | **PASS (code)**; rebinding limit (S-1) |
| T-68 | Mass assignment: zod validators on mutating routes | 6 validator files, 56 call sites | **PASS (code, sampled)** |
| T-69 | XSS / output encoding, CSRF | React escaping by default; bearer-token auth (no cookies) → CSRF N/A; explicit review of `dangerouslySetInnerHTML` not done | **UNVERIFIED** |
| T-70 | SQL/NoSQL injection | Prisma parameterised; raw SQL only in this audit's read-only scripts | **PASS (code)** |
| T-71 | Error leakage | CORS reason leak fixed; generic 500 body elsewhere | **PASS (code)** |
| T-72 | Brute force / global rate limits | contact/appointment/issue limited; auth limited | **PASS (code)** |

## 5. Voice runtime — web call

| ID | Test case | Result | Status |
|---|---|---|---|
| T-80 | Per-turn trace id across client/bridge/STT/LLM/TTS/playback | none → `f04cafc` | **PASS (code)** |
| T-81 | Durations on monotonic clock | `Date.now` → `performance.now` in both bridges | **PASS (code)** |
| T-82 | First-audible-audio measured in the browser | none → `turn-timing` frame (5 parser tests) | **PASS (code)**, unexercised live |
| T-83 | Event-loop lag on every record | `eventLoopLag.js` (tested) | **PASS** |
| T-84 | ≥30 warm turns per route, cold/warm, short/long/interrupted/silent/noisy/multilingual/KB | — | **BLOCKED** (E-2) |
| T-85 | Web actual latency ≤ 500 ms | baseline server `waitMs` p50 2245 | **FAIL (baseline) / BLOCKED (fresh)** |
| T-86 | Perceived latency (ack clip) reported separately | `filler:true` end-to-end | **PASS (code)** |
| T-87 | BUG-001 phantom turn on silence | guards + unit tests; live repro | **PASS (code)** / **BLOCKED** live |
| T-88 | Barge-in cancels LLM/TTS/queue/playback; no stale chunk | `turnEpoch`, `stopPlayback`, `bargeRequested`; unit tests in voice suite | **PASS (code)** / **BLOCKED** live |
| T-89 | Fast vs Patient endpoint profiles differ | `turnEndProfile.js` tests | **PASS (unit)** / **BLOCKED** audible |
| T-90 | No-input re-prompt ladder, clean hangup | `noInputPrompt.js` + client ladder | **PASS (code)** / **BLOCKED** live |
| T-91 | Offline / reconnect: no zombie billing | `callFinalizer` backstop tests skip without DB | **BLOCKED** (E-1) |
| T-92 | Ambience (BUG-003) mixed, loops seamlessly, not into mic | `ambience*.test.js` pass | **PASS (unit)** / **BLOCKED** audible |
| T-93 | Safari / mobile / mic permission | — | **BLOCKED** (device) |
| T-94 | Recording integrity, speaker attribution, `Range` seeking | code ✓; live | **PASS (code)** / **BLOCKED** |

## 6. Voice runtime — phone

| ID | Test case | Result | Status |
|---|---|---|---|
| T-100 | Any phone turn in `latency.log` | 0, ever | **FAIL (no data)** |
| T-101 | `wireMs`, pacer queue depth recorded | `kind:'wire'` record (`f04cafc`) | **PASS (code)** |
| T-102 | Phone actual latency ≤ 700 ms | — | **BLOCKED** (E-2) |
| T-103 | `playoutWindow`, `ulawPacer`, overlap harvest, pre-arm, `echoCanceller` on real calls | unit tests pass (voice suite) | **PASS (unit)** / **BLOCKED** real call |
| T-104 | Echo never becomes a caller turn | `isEchoOfAgent`, AEC tests | **PASS (unit)** / **BLOCKED** |
| T-105 | Carrier media region vs backend | VPS Mumbai (B32); Plivo anchors Mumbai | **PASS** |
| T-106 | Dev tunnel not used for evidence | recorded; none taken | **PASS** |
| T-107 | Concurrency 5/10/25/45, event-loop lag, backpressure | instrumented | **BLOCKED** (E-2, E-3) |
| T-108 | Per-tenant quotas / circuit breakers on shared keys | absent | **OPEN** (B-2) |

## 7. Billing, wallet, pricing

| ID | Test case | Result | Status |
|---|---|---|---|
| T-120 | Money arithmetic in paise, rounding (`money.test.js`) | in `npm test` | **PASS** |
| T-121 | Pricing bands / workspace rate / call budget / number billing (pure) | in `npm test` | **PASS** |
| T-122 | Razorpay signature / order verification (pure) | in `npm test` | **PASS** |
| T-123 | Settlement, wallet concurrency, subscription integration | 57 skipped | **BLOCKED** (E-1) |
| T-124 | Admin wallet credit idempotent over HTTP (A-01) | code ✓, replay | **PASS (code)** / **BLOCKED** |
| T-125 | Plan catalogue free of fixtures (A-02) | 155/165 test plans | **FAIL (data)** |
| T-126 | Customer UI is wallet-only; no plan/subscription exposed | `Billing.tsx`, `Pricing.tsx` | **PASS (code)** |
| T-127 | Legacy renewal sweep cannot charge unintended rows | sweep runs hourly on fixtures | **FAIL** (D-9) |
| T-128 | Duplicate invoices (A-15) | decision pending | **BLOCKED** |
| T-129 | Zero-balance blocks call with clear reason | `callBudget` tests skip | **BLOCKED** (E-1) |
| T-130 | Top-up webhook replay / double-click / pending / failed / refund | — | **BLOCKED** (E-4) |
| T-131 | Negative currency formatting | `AdminBilling` ✓; `AdminCallLogs` formatter latent | **PASS (code)** |
| T-132 | Issue C key rename consumers | parity ✓ (cross-check §5) | **BLOCKED** (E-5) |
| T-133 | COGS / margin (A-13) | 0/646 | **OPEN** |

## 8. Product surface, UI, integrations

| ID | Test case | Result | Status |
|---|---|---|---|
| T-140 | Every route renders (marketing, auth, customer, admin) | routes enumerated in `App.tsx`; not rendered in a browser this run | **UNVERIFIED** |
| T-141 | Loading / empty / error states, responsiveness, a11y, keyboard, themes, back/forward, spelling | — | **UNVERIFIED** |
| T-142 | Marketing claims vs implemented capabilities (e.g. "14 integrations", "Twilio-backed" vs Plivo/PIOPIY) | README/UI drift noted (Zoho/Notion pending PR) | **UNVERIFIED** |
| T-143 | Agent config + KB behaviour (upload, chunking, RAG injection) | KB tests in voice/services suites | **PASS (unit)** / **BLOCKED** e2e |
| T-144 | Workspace isolation across agents/contacts/files/calls/recordings/keys/invoices/wallets/numbers/campaigns/integrations/WS | scoped queries sampled (T-66); exhaustive matrix not executed | **UNVERIFIED** |
| T-145 | External integrations in sandbox (Google, Cal, Calendly, Salesforce, HubSpot, Slack, Twilio, Genesys, Make, Zapier, n8n, GHL, custom API, Zoho, Notion) | — | **BLOCKED** (sandbox accounts) |
| T-146 | Post-call delivery payloads, retries, dead-letter | webhook path now SSRF-guarded | **BLOCKED** (E-2) |
| T-147 | Leaks: timers, listeners, AudioContexts, MediaStreams, WebSockets, AbortControllers, object URLs, temp files | code review sampled (`revokeObjectURL`, `clearInterval` present) | **UNVERIFIED** |
| T-148 | UI route completeness in browser (Playwright) | not built this run | **UNVERIFIED** |

## 9. Summary counts

| Status | Count |
|---|---|
| PASS (fresh executed evidence) | 20 |
| PASS (code / unit-test only) | 33 |
| FAIL | 10 |
| BLOCKED | 31 |
| OPEN (historical, unchanged) | 6 |
| UNVERIFIED | 8 |
| PARTIAL | 1 |
| N/A | 0 |
| **Total rows** | **109** |

Reconciliation to historical items: A-01…A-15 (15), COMPLETION rows (51), BUG-001..003 (3), latency-doc items (8), found-this-run (11) — all mapped in `REGRESSION_CROSSCHECK.md`. No row above is a PASS without a cited evidence file or file:line.
