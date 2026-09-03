# QA Final Matrix

**Branch:** `release/readiness-audit` · **Baseline commit:** `ea9008a` · **Evidence:** `reports/evidence/2026-09-03_baseline/` (Bnn), `reports/evidence/2026-09-03_final/` (Fnn, phase 1), `reports/evidence/2026-09-03_phase2/` (P: phase 2), `reports/evidence/2026-09-04_gates/` (G: final verification session). A machine-readable copy is `QA_FINAL_MATRIX.csv` (generated from this file by `reports/scripts/matrix_to_csv.mjs`).

Status vocabulary — **PASS**: fresh, executed evidence · **PASS (code)**: verified by reading current code and/or an executed unit test, not by exercising the live path · **FAIL** · **BLOCKED**: named external requirement (`OPEN_ISSUES.md` §A) · **UNVERIFIED**: in scope, not reached, no evidence either way · **OPEN** · **PARTIAL** · **N/A**.

A row is never PASS by default. Every historical PASS was re-run or re-classified (`REGRESSION_CROSSCHECK.md`). Columns: ID | Test case | Command / test | Evidence | Status | Blocker.

## 1. Build, static, dependencies, secrets

| ID | Test case | Command / test | Evidence | Status | Blocker |
|---|---|---|---|---|---|
| T-01 | Backend unit suite | `npm test` (1074 tests) | G/01: 1017 pass, 0 fail, 57 skipped | **PASS** | — |
| T-02 | WS suite | `npm run test:ws` | G/02: 50/50 | **PASS** | — |
| T-03 | Voice suite | `npm run test:voice` | G/03 | **PASS** | — |
| T-04 | STT suite | `npm run test:stt` | G/04 | **PASS** | — |
| T-05 | Client typecheck | `npx tsc --noEmit` | G/05: 0 errors | **PASS** | — |
| T-06 | Client lint | `npm run lint` / `npm run lint:ratchet` | G/14 full: 76 `no-explicit-any` remain; G/06 ratchet: pass at baseline 76 | **FAIL (rule)** / **PASS (ratchet)** | burn-down |
| T-07 | Client production build | `npm run build` | G/07 | **PASS** | — |
| T-08 | Backend `npm audit --omit=dev` | | G/08 | see log (moderate only expected) | — |
| T-09 | Client `npm audit --omit=dev` | | G/09 | see log (react-router moderate) | S-2 |
| T-10 | Secret scan, tracked tree | G/12 | 0 hits | **PASS** | — |
| T-11 | Secret scan, git history | — | keys since `943672c` | **OPEN** | owner rotate/purge |
| T-12 | `.env` never committed | `git ls-files` | ✓ | **PASS** | — |
| T-13 | Backend static analysis | none exists | — | **UNVERIFIED** | — |
| T-14 | Syntax of every backend file | G/11 `node --check` | all ok | **PASS** | — |
| T-15 | Prisma schema validates | G/10 `prisma validate` | ok | **PASS** | — |

## 2. Database, migrations, data integrity

| ID | Test case | Command / test | Evidence | Status | Blocker |
|---|---|---|---|---|---|
| T-20 | `prisma migrate status` on clone | P/db/rehearsal_existing_db.txt | "up to date", 2 migrations | **PASS** | — |
| T-21 | Repo can build schema from migrations | `0000000000000_baseline` (+seed, +call_transfer) | fresh-DB deploy not executable locally (no pgvector for `CREATE EXTENSION vector`); SQL identical to the rehearsed baseline | **PASS (code)** / fresh-DB **BLOCKED** | pgvector |
| T-22 | Every applied migration has a directory | 17 dirs archived, 12 orphan rows tolerated (rehearsed) | P/db | **PASS (design)** | production resolve pending |
| T-23 | Live schema = schema.prisma | `QueryCache` orphan; partial index | B24 | **FAIL (minor)** | D-11 decision |
| T-24 | `migration_lock.toml` present | file | ✓ | **PASS** | — |
| T-25 | Ledger idempotency keys | B13 | 0/642 null | **PASS (data)** | — |
| T-26 | Ledger sum = balance per wallet | needs prod aggregation | — | **BLOCKED** | E-1 |
| T-27 | Roles limited to defined set | B13 | | **PASS (data)** | — |
| T-28 | Production free of test fixtures | — | 131/182 (B36); cleanup script now covers `__test__`, not run | **FAIL** | D-8 owner |
| T-29 | Migration rehearsal on disposable clone | `resolve --applied` + `deploy` | P/db/rehearsal_existing_db.txt | **PASS** | — |
| T-30 | Billing integration suites (57) | `test:billing` | self-skip (read `DATABASE_URL`) | **BLOCKED** | E-1 wiring |
| T-31 | Pagination on list endpoints | code | in-memory `listWorkspaces` | **PARTIAL** | A-9 |
| T-32 | Test seeding refuses production URLs | `seed-test-db.mjs` guard | code + run | **PASS** | — |
| T-33 | Cleanup script refuses production without backup flag | `clean-test-data.js` | code | **PASS (code)** | — |

## 3. Authentication & authorization (unchanged from phase 1 unless noted)

| ID | Test case | Command / test | Evidence | Status | Blocker |
|---|---|---|---|---|---|
| T-40 | Unauthenticated → 401 | B30 | | **PASS** | — |
| T-41 | Query-string token refused | B30 | | **PASS** | — |
| T-42 | Malformed bearer → 401 | B30 | | **PASS** | — |
| T-43 | Login empty body → 400 | B30 | | **PASS** | — |
| T-44 | Member → 403 on admin routes | needs Member login | — | **BLOCKED** | E-1 (auth flow on test DB not scripted) |
| T-45 | Superadmin reconcile | code | | **PASS (code)** | — |
| T-46 | Ban revokes refresh tokens | code | | **PASS (code)** | — |
| T-47 | Refresh rotation + reuse rejection | code | | **PASS (code)** | S-4 |
| T-48 | Live access token after ban (A-12) | — | | **OPEN** | Redis denylist |
| T-49 | Last Superadmin guard | code | | **PASS (code)** | — |
| T-50 | Two-tab logout / AUT-16 browser | — | | **BLOCKED** | browser session |
| T-51 | Audit redaction | 5 tests | | **PASS** | — |
| T-52 | OTP / login rate limits | code | | **PASS (code)** | — |
| T-53 | AUT-11 reset-password enumeration (HTTP) | — | unit only | **BLOCKED** | browser/HTTP session |
| T-54 | PUB-07/09 consumer-domain e-mail, PUB-14 catch-all 404 (HTTP) | — | unit only | **BLOCKED** | HTTP session |

## 4. HTTP hardening (unchanged from phase 1)

| ID | Test case | Command / test | Evidence | Status | Blocker |
|---|---|---|---|---|---|
| T-60 | Security headers | B30 + csp tests | | **PASS** | — |
| T-61 | Unknown Origin → no CORS, not 500 | 8 tests | | **PASS (code)** | — |
| T-62 | 404 JSON | B30 | | **PASS** | — |
| T-63 | JSON body limit | code | | **PASS (code)** | — |
| T-64 | Upload validation | code | | **PASS (code)** | — |
| T-65 | Path traversal | code | | **PASS (code)** | — |
| T-66 | IDOR scoping | code | | **PASS (code)** | — |
| T-67 | SSRF guard | 16 tests | | **PASS (code)** | S-1 |
| T-68 | Mass assignment validators | code; **agent settings now validated** (`agentSettings.validator.js`, 4 tests) | P/05 | **PASS (code)** | — |
| T-69 | XSS / CSRF review | — | | **UNVERIFIED** | — |
| T-70 | SQL injection | Prisma | | **PASS (code)** | — |
| T-71 | Error leakage | | | **PASS (code)** | — |
| T-72 | Rate limits | | | **PASS (code)** | — |
| T-73 | Transfer callbacks reject forged tokens | `transferCallbacks.test.js` | P/06 | **PASS** | — |
| T-74 | Ambience asset route serves only whitelisted bed files | code (regex) | | **PASS (code)** | — |

## 5. Voice runtime — web call

| ID | Test case | Command / test | Evidence | Status | Blocker |
|---|---|---|---|---|---|
| T-80 | Per-turn trace id end to end | harness joins by `turnId` | P/latency/report_*/latency_rows.jsonl | **PASS** | — |
| T-81 | Monotonic clocks | code | | **PASS (code)** | — |
| T-82 | First-audible-audio in the browser | 1 row ever (owner's call) | | **UNVERIFIED** | browser session |
| T-83 | Event-loop lag on every record | 36–40 ms p99 | P/latency | **PASS** | — |
| T-84 | ≥30 warm turns per route | 24–30 turns × 8 arms, one route (modular / Gemini / Sarvam) | P/latency | **PARTIAL** | other routes, cold, KB, noisy, multilingual not driven |
| T-85 | Web actual ≤ 500 ms | harness | **p50 2,136 ms** (was 2,861) | **FAIL** | L-3, L-4 |
| T-86 | Perceived reported separately | harness `firstAudioAny` | | **PASS** | — |
| T-87 | BUG-001 phantom turn | two new mechanisms fixed; 0/72 cut-offs | P/latency run 3 | **PASS (harness)** | live BLOCKED |
| T-88 | Barge-in cancels everything | unit | | **PASS (code)** | live |
| T-89 | AGT-13 Fast/Patient differ audibly | not driven | | **UNVERIFIED** | — |
| T-90 | No-input ladder | unit | | **PASS (code)** | live |
| T-91 | Offline / reconnect no zombie billing | — | | **BLOCKED** | E-1 |
| T-92 | Ambience mixed (BUG-003) | 38 unit tests incl. new beds | P/05 | **PASS (unit)** | audible BLOCKED |
| T-93 | Safari / mobile | — | | **BLOCKED** | device |
| T-94 | Recording integrity | code | | **PASS (code)** | — |
| T-95 | Speculation never speaks before commit; buffered; discarded on mismatch | `speculativeTurn.test.js` (15) + harness hit/miss rows | P/05, P/latency | **PASS** | — |
| T-96 | Speculation aborts the provider request (AbortSignal) | unit (fake stream) | | **PASS (unit)** | provider-side confirmation UNVERIFIED |
| T-97 | Speculation cost accounted per turn | `specStarted/Wasted` in every record | P/latency reports | **PASS** | — |
| T-98 | Local VAD commit does not cut callers | measured: it does → default off | P/latency arms_run1 | **FAIL → mitigated (off)** | — |
| T-99 | Web transfer request is honest and recorded | prompt variant + `WEB_CALLBACK` row; harness turn "Can I speak to a real person" → "I can't connect you to someone directly on this call…" | P/latency harness_fix_off_console.txt | **PASS** | — |

## 6. Voice runtime — phone

| ID | Test case | Command / test | Evidence | Status | Blocker |
|---|---|---|---|---|---|
| T-100 | Any phone turn in `latency.log` | — | 0 | **FAIL (no data)** | E-2 |
| T-101 | `wireMs`, pacer depth | code | | **PASS (code)** | — |
| T-102 | Phone actual ≤ 700 ms | — | | **BLOCKED** | E-2 |
| T-103 | playout/pacer/AEC on real calls | unit | | **PASS (unit)** | E-2 |
| T-104 | Echo never a caller turn | unit + Deepgram fixes | | **PASS (unit)** | E-2 |
| T-105 | Region: VPS Mumbai | B32 | | **PASS** | — |
| T-106 | No dev-tunnel evidence | none taken | | **PASS** | — |
| T-107 | Concurrency 5/10/25/45 | — | | **BLOCKED** | E-2/E-3 |
| T-108 | Per-tenant quotas / breakers | absent | | **OPEN** | B-2 |
| T-109 | Transfer: intent detection EN/HI/Hinglish + negatives | 11 tests | P/05 | **PASS** | — |
| T-110 | Transfer: Twilio/Plivo documents + REST bodies | 17 tests | P/05 | **PASS (unit)** | — |
| T-111 | Transfer: every `<Dial>` outcome → hangup or honest resume | 9 HTTP tests | P/06 | **PASS** | — |
| T-112 | Transfer: happy path on a real carrier | — | | **BLOCKED** | E-2 + human on target |
| T-113 | Transfer: busy / no-answer / invalid / caller-hangs-up on a real carrier | — | | **BLOCKED** | E-2 |
| T-114 | Transfer: both legs billed once | controller finalises on completion; Plivo hangup path unchanged | code + tests | **PASS (code)** | live |
| T-115 | Transfer: PIOPIY honest unavailability | availability + prompt | unit | **PASS (unit)** | — |
| T-116 | Ambience: chatter beds level −48 dBFS, 24 s, seam-free, two variants | `ambience.test.js` | P/05 | **PASS** | — |
| T-117 | Ambience: Fish tag never spoken (probe) | 0/8 leaks on `s2.1-pro-free` | P/ambience/fish_tags | **PASS (probe)** | other models UNVERIFIED |
| T-118 | Ambience: native effect reliable/controllable | probe: inconsistent, −23 dBFS | P/ambience | **FAIL → not default** | — |
| T-119 | Ambience: bed never triggers barge/phantom/STT on a live call | — | | **BLOCKED** | E-2 |
| T-120b | Ambience: licence for cached beds | Fish free tier is non-commercial | E-7 | **BLOCKED (licence)** | owner plan |

## 7. Billing, wallet, pricing (unchanged from phase 1 unless noted)

| ID | Test case | Command / test | Evidence | Status | Blocker |
|---|---|---|---|---|---|
| T-120 | Money arithmetic | `npm test` | | **PASS** | — |
| T-121 | Pricing bands / rate / budget | `npm test` | | **PASS** | — |
| T-122 | Razorpay signature | `npm test` | | **PASS** | — |
| T-123 | Settlement integration (57) | | | **BLOCKED** | E-1 |
| T-124 | Admin wallet credit idempotent | code | | **PASS (code)** | — |
| T-125 | Plan catalogue free of fixtures | | | **FAIL (data)** | D-8 |
| T-126 | Customer UI wallet-only | code | | **PASS (code)** | — |
| T-127 | Legacy renewal sweep | switch added | | **FAIL** (still on) | D-9 |
| T-128 | Duplicate invoices | | | **BLOCKED** | A-15 |
| T-129 | Zero balance blocks call | | | **BLOCKED** | E-1 |
| T-130 | Top-up webhook paths | | | **BLOCKED** | E-4 |
| T-131 | Negative currency formatting | code | | **PASS (code)** | — |
| T-132 | Issue C rename | | | **BLOCKED** | E-5 |
| T-133 | COGS / margin | | | **OPEN** | — |

## 8. Product surface, UI, integrations (unchanged from phase 1)

| ID | Test case | Command / test | Evidence | Status | Blocker |
|---|---|---|---|---|---|
| T-140 | Every route renders | — | | **UNVERIFIED** | browser |
| T-141 | States / responsiveness / a11y | — | | **UNVERIFIED** | browser |
| T-142 | Marketing claims vs capabilities | — | | **UNVERIFIED** | — |
| T-143 | Agent config + KB / RAG | unit | | **PASS (unit)** | pgvector locally |
| T-144 | Workspace isolation matrix | sampled | | **UNVERIFIED** | — |
| T-145 | Integrations in sandbox | — | | **BLOCKED** | accounts |
| T-146 | Post-call delivery | — | | **BLOCKED** | E-2 |
| T-147 | Leaks | sampled | | **UNVERIFIED** | — |
| T-148 | Playwright route completeness | — | | **UNVERIFIED** | — |
| T-149 | Editor: transfer, speculation, ambience-mode controls persist and validate | tsc + validator tests; browser save not driven | P/05 | **PASS (code)** | browser |

## 9. Summary counts (124 rows)

| Status | Count |
|---|---:|
| PASS (fresh executed evidence) | 36 |
| PASS (code/unit/probe/design) | 40 |
| FAIL | 9 |
| BLOCKED | 21 |
| OPEN | 4 |
| UNVERIFIED | 10 |
| PARTIAL | 2 |
| N/A | 0 |
| OTHER | 2 |
| **Total rows** | **124** |

(Counts computed by `reports/scripts/matrix_to_csv.mjs`; the CSV is authoritative for the tally.) Reconciliation to historical items: A-01…A-15, COMPLETION rows, BUG-001..003, latency-doc items, phase-1 findings D-01..D-11 and phase-2 findings — `REGRESSION_CROSSCHECK.md` §1–7. The brief's 314-case sheet is not in the repository (E-8).
