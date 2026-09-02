# FINAL REPORT — HM-Voice-agent release-readiness run

## NOT DONE — OPEN OR BLOCKED ITEMS REMAIN

**Release recommendation: NO-GO.**

---

## 1. Exactly what was tested

| | |
|---|---|
| Branch | `release/readiness-audit` (from `origin/main` `ea9008a`) |
| Final commit | `92d10bc926d745eaf7de0ab90053e8bebdd8dc36` |
| Commits on branch | 6: `9274fe3` `b27012c` `a278d60` `f04cafc` `64cc048` `92d10bc` |
| Diff vs baseline | 27 files, +2,637 / −279 |
| Final verification session | 2026-09-02T20:49:18Z → 20:50:46Z (UTC), one sitting, `reports/evidence/2026-09-03_final/00_session.txt` |
| Environment | Windows 11 10.0.26200 · Node v24.19.0 · npm 11.17.0 · Prisma 5.22.0 · no Python · no Docker · no local Postgres · Redis unreachable |
| Config fingerprint | 45 env vars set in `backend/.env` (untracked, never committed); `DATABASE_URL` → `aws-1-ap-southeast-1.pooler.supabase.com` (**production**); `NODE_ENV=development`; `PUBLIC_BACKEND_WS_URL` → ngrok dev tunnel |
| Running processes not touched | owner's backend PID 18636 on `:4000` (old code, production DB) and Vite on `[::1]:5173` |

## 2. Latency — achieved numbers

**No fresh call was placed in this run** (approval + isolated DB required; see §6). The only numbers are the pre-existing `backend/logs/latency.log` (70 rows, 2026-08-28 → 09-02), which are **server-side `ttfaMs` — not audible latency** — and **actual, not perceived** (the ack clip is logged separately as `filler`).

| channel | measure | n | p50 | p90 | p95 | p99 | max | kind |
|---|---|---:|---:|---:|---:|---:|---:|---|
| web (all models) | `ttfaMs` end-of-speech → first TTS byte at server | 67 | 1774 | 8116 | 11354 | 32411 | 32411 | actual, server-side |
| web · gemini-3.5-flash-lite | `ttfaMs` | 61 | 1707 | 3062 | 6816 | 12918 | 12918 | actual, server-side |
| web · gemini-3.5-flash-lite | `waitMs` = endpoint + preLlm + ttfa (server end-to-end) | 52 | **2245** | 3581 | 6820 | 12596 | 12596 | actual, server-side |
| web · gemini-3.5-flash-lite | `endpointMs` (silence before the clock starts) | 24 | 706 | 713 | 714 | 717 | 717 | — |
| web | first *audible* audio in the browser | **0** | — | — | — | — | — | instrumented this run, never exercised |
| phone | anything | **0** | — | — | — | — | — | never recorded, ever |

Against the targets read as **300–500 ms web / 400–700 ms phone** (milliseconds; recorded assumption, `BASELINE_AUDIT.md` §2): web is **not met** by ~4.5× at p50 on server-side time alone; phone is **unmeasured**. The modular route's structural floor (~2.2 s) reproduces the repository's own analysis. Full detail: `reports/LATENCY_REPORT.md`.

## 3. Consolidated table (key items — all 109 rows in `QA_FINAL_MATRIX.md`)

| Item | Baseline evidence | Fix | Final evidence | Status |
|---|---|---|---|---|
| `test:ws` cancelled 5 tests, printed "fail 0" | B04 (exit 1, cancelled 5) | `9274fe3` stub env before import | F02: 41/41, cancelled 0 | **PASS** |
| Live Google API key in tree (A-08) | `git grep` hit `scratch/test_raw_api.js:4` | `b27012c` env read | F11: 0 hits | **PASS (tree)** / history purge → owner |
| 2+2 high dependency vulns | B08/B09 | `a278d60` `npm audit fix` | F08/F09: 0 high, 3+2 moderate | **PASS (high)** |
| Client lint never runnable | B06 `'eslint' is not recognized` | `a278d60` toolchain + config | F06: **87 errors / 22 warnings** | **FAIL** (gate honest) |
| No turn id / wall-clock durations / no audible measurement | B: `Date.now()` ×18/×10; no `turnId`; `latency.log` no client field | `f04cafc` | F01 (+3 tests), F05, F07; 0 new lint findings | **PASS (code)**, live measurement BLOCKED |
| Unknown `Origin` → HTTP 500 with policy text | B30 `HTTP 500 {"message":"CORS: origin … not allowed"}` | `64cc048` `config/cors.js` | F01 (8 tests); `csp.test.js` (15) now runs | **PASS (code)** |
| No SSRF guard on tenant URLs | code: `z.string().url()` only | `92d10bc` `lib/safeUrl.js`, both fetch sites + validator | F01 (16 tests) | **PASS (code)** |
| Audit redaction had no test (A-06) | HTTP-only historical claim | `92d10bc` 5 tests | F01 | **PASS** |
| Unauth → 401, `?token=` refused, 404 JSON, security headers | — | — | B30 on running backend | **PASS** |
| Wallet ledger idempotency keys (A-01 data) | — | — | B13: 0/642 null | **PASS (data)** |
| Roles drift (A-04) | — | — | B13: Superadmin 3 / Member 62 | **PASS (data)** |
| VPS region ("step 0") | unverified | — | B32: Mumbai | **PASS** |
| Repo cannot build DB from scratch; 12 orphan migrations; live drift (A-07) | B16/17/23/24 | none (needs prod `migrate resolve`) | — | **FAIL** |
| Production DB contaminated by test fixtures | B36: 131/182 ws, 155/165 plans, ₹29.99 L of ₹33.08 L float | none (destructive; owner) | — | **FAIL** |
| Hourly renewal sweep runs on fixture/legacy subscriptions | B33: 4 past_due, 29 due by 09-29 | none (spec decision) | — | **FAIL** |
| Plan catalogue shows fixtures (A-02 data) | B13/B36 | none | — | **FAIL (data)** |
| COGS never recorded (A-13) | B13: 0/646 | none | — | **OPEN** |
| Duplicate invoices (A-15) | B13: 47 unanchored | none (accounting decision) | — | **BLOCKED** |
| Issue C payment-key rename | no source text anywhere | — | parity of all 9 payment fields ✓ | **BLOCKED** (spec absent) |
| Billing integration suites (57 tests) | B34 self-skip | — | F01 skipped 57 | **BLOCKED** (prod-only DB) |
| Web actual ≤ 500 ms | B latency_baseline `waitMs` p50 2245 | none possible without measurement | — | **FAIL (baseline) / BLOCKED (fresh)** |
| Phone actual ≤ 700 ms | no data | — | — | **BLOCKED** |
| Concurrency 5/10/25/45 | — | lag instrumented | — | **BLOCKED** |
| Browser regression (Playwright), Safari/mobile, every route/state | — | — | — | **UNVERIFIED / BLOCKED** |
| Integrations in sandbox | — | — | — | **BLOCKED** |

## 4. Summary counts (from `QA_FINAL_MATRIX.md`, 109 rows)

| PASS (executed) | PASS (code/unit) | FAIL | BLOCKED | OPEN | UNVERIFIED | PARTIAL | N/A |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 20 | 33 | 10 | 31 | 6 | 8 | 1 | 0 |

Reconciled to: A-01…A-15 (15), COMPLETION_REPORT rows (51), BUG-001..003 (3), latency-doc items (8), found this run (11) — `REGRESSION_CROSSCHECK.md`.

## 5. Commands executed in the final session (exit code → evidence)

| command | exit | evidence |
|---|---|---|
| `npm test` (backend) — 992 tests, 935 pass, 0 fail, 57 skipped | 0 | `2026-09-03_final/01_backend_npm_test.log` |
| `npm run test:ws` — 41/41 | 0 | `02_backend_test_ws.log` |
| `npm run test:voice` — 313/313 | 0 | `03_backend_test_voice.log` |
| `npm run test:stt` — 110/110 | 0 | `04_backend_test_stt.log` |
| `npx tsc --noEmit` (client) | 0 | `05_client_tsc.log` |
| `npm run lint` (client) — 87 errors / 22 warnings | **1** | `06_client_lint.log` |
| `npm run build` (client) | 0 | `07_client_build.log` |
| `npm audit --omit=dev` (backend) — 3 moderate | 1 | `08_backend_audit.log` |
| `npm audit --omit=dev` (client) — 2 moderate | 1 | `09_client_audit.log` |
| `npx prisma migrate status` — "up to date" (misleading, see A-07) | 0 | `10_prisma_migrate_status.log` |
| secret scan (tracked tree) — 0 hits | 0 | `11_secret_scan.txt` |
| `node --check` on 19 changed backend files — 19 ok | 0 | `12_syntax.txt` |
| `node scripts/latency-report.mjs` over the existing log | 0 | `13_latency_report.md`, `latency/` |

Baseline-phase commands (39 evidence files) are listed in `BASELINE_AUDIT.md` §4 and `reports/evidence/2026-09-03_baseline/`. Read-only production queries were aggregate counts only (`13_`, `17_`, `33_`, `36_`); no row content and no writes.

**Not run, deliberately:** anything that writes to the only reachable database; anything that places a call or spends provider quota; `prisma migrate dev/deploy/reset`; `db:clean-test-data`; history rewriting; pushing the branch.

## 6. Open / blocking items and the precise action required

Full list with severities in `reports/OPEN_ISSUES.md`. The ones that gate a GO:

1. **Isolated database** — provide `TEST_DATABASE_URL` (disposable Postgres, seeded from a schema-only dump because the repo cannot build one from migrations). Unblocks 31 BLOCKED rows.
2. **Approval to place calls** — ≥30 web turns per route on a test agent (quota spend, rows written) and N phone calls from a tester-owned number on the Mumbai VPS. Unblocks every latency number, BUG-001/003 audible checks, barge-in, recordings.
3. **Rotate the Google key and purge history** (`git filter-repo`) — owner action; the literal is out of the tree.
4. **Decide the production data cleanup** — approve `npm run db:clean-test-data` (destructive) after a backup; 131 test workspaces, 155 test plans, ₹29.99 lakh of fixture wallet balance.
5. **Decide the legacy subscription layer** — disable or migrate the hourly renewal sweeps; the customer product is wallet-only.
6. **Baseline the migrations** — commit the generated baseline, `prisma migrate resolve --applied` on production before the next deploy, add `migration_lock.toml`.
7. **Supply the Issue C text**; **confirm the latency unit**.
8. **Redis** for queue/rate-limit/denylist/load tests.

## 7. Changed files, migrations, configuration, deployment, rollback

**Changed (27):** `backend/{package.json,package-lock.json}`, `backend/scratch/test_raw_api.js`, `backend/scripts/latency-report.mjs` (new), `backend/src/app.js`, `backend/src/config/cors.js` (new) + test, `backend/src/controllers/platform.controller.js`, `backend/src/lib/{eventLoopLag.js (new), latencyLog.js, safeUrl.js (new)}` + tests, `backend/src/services/{agentRuntime.service.js, integrations.service.js}`, `backend/src/services/__tests__/auditRedact.test.js` (new), `backend/src/validators/integrations.validator.js`, `backend/src/ws/{modularMediaBridge.js, webCallModularRealtime.handler.js, turnTiming.js (new)}` + tests, `client/{.eslintrc.cjs (new), package.json, package-lock.json}`, `client/src/pages/EditAgent.tsx`, `client/src/services/modularCallSocket.ts`. Plus `reports/` (this bundle).

**Migrations:** none added. No schema change. (A-07 baseline SQL is in evidence only, deliberately not in `prisma/migrations` — see §6.6.)

**Configuration:** no new or changed environment variables. `logs/latency.log` gains fields (`turnId`, `kind`, `elLag*`, new record kinds); the report script reads old rows unchanged.

**Protocol compatibility:** new `turn-timing` client→server frame is ignored by an old server (`default: break`); an old client never sends it; `audio-start`/`done` gain optional fields only.

**Deploy:** merge → `npm ci` in `backend/` and `client/` (lockfiles changed) → `npm run build` (client) → existing `deploy/vps/deploy.sh` → `pm2 startOrReload ecosystem.config.cjs --only convai-voice-api`. Nothing here should be deployed to production until §6 items 1–2 have produced a measured run; the security fixes (`b27012c`, `64cc048`, `92d10bc`, `a278d60`) are safe to cherry-pick ahead of that.

**Rollback:** `git revert 92d10bc 64cc048 f04cafc a278d60 b27012c 9274fe3` (no data migration to undo), `npm ci`, redeploy. The latency-log format change is additive; no rollback needed for the log.

## 8. What this run did not do, stated plainly

It did not place a single call, did not measure audible latency, did not run any write test, did not verify any page in a browser, did not touch production data, and did not prove either latency target. It fixed six defects with executed evidence, made three gates evaluable that were not, instrumented the one measurement the project has never had, and documented — with read-only evidence — why the historical reports' picture of the data no longer holds.
