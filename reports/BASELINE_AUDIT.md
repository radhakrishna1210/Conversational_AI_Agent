# Baseline Audit — HM-Voice-agent

**Run started:** 2026-09-03 (local)  ·  **Branch:** `release/readiness-audit` (from `origin/main`)
**HEAD at start:** `ea9008a1c6a09935cd51b08ffbfaee9470b41eb3` — `fix(admin): name the default rate in the tier picker, and say what retiring does`
**Worktree at start:** clean (0 dirty paths)  ·  **Tags:** none  ·  **Commits:** 137 (2026-07-13 → 2026-08-29)
**Remotes:** `origin` = github.com/HerbsMagic/HM-Voice-agent · `conv` = github.com/radhakrishna1210/Conversational_AI_Agent (added this session for the Zoho/Notion cherry-pick; shares history to `68b383b`)

Evidence directory for this phase: `reports/evidence/2026-09-03_baseline/`

Every claim below cites a command, a file:line, or an evidence file. Historical reports (`AUDIT_REPORT.md`, `COMPLETION_REPORT.md`, `BUG_SHEET.md`, the two latency briefs) are treated as **claims to re-verify**, not as proof.

---

## 1. Environment

| Item | Value | Source |
|---|---|---|
| OS | Windows 11 Home 10.0.26200 (MSYS/Git-Bash shell) | `cmd /c ver`, `uname -a` |
| Node | v24.19.0 | `node -v` |
| npm | 11.17.0 | `npm -v` |
| Prisma / @prisma/client | 5.22.0 / 5.22.0 | `npx prisma -v` |
| Python | **not installed** (Store alias only) | `python --version`, `py -3` |
| Docker | **not installed** | `docker --version` |
| Local Postgres | **none** (`127.0.0.1:5432` ECONNREFUSED) | `00_infra_reachability.txt` |
| Redis | **unreachable** (`127.0.0.1:6379` ECONNREFUSED; app falls back to memory mode) | `00_infra_reachability.txt`, `04_backend_test_ws.log:39` |
| Backend already running | **yes** — PID 18636 `node --env-file=.env src/server.js`, listening `0.0.0.0:4000`, started 2026-09-03 00:52 (owner's dev server, not started by this audit) | `netstat -ano`, `Get-CimInstance Win32_Process` |
| Vite already running | **yes** — PID 13460, listening `[::1]:5173` (IPv6 only) | same |
| `GET /health` on :4000 | `HTTP 200` | `curl` |

### 1.1 Configuration fingerprint (secrets redacted — names only)

`backend/.env` is present and **untracked** (never committed: `git log --all --diff-filter=A -- '**/.env'` is empty).

- `DATABASE_URL` / `DIRECT_URL` → `aws-1-ap-southeast-1.pooler.supabase.com` (**live Supabase, Singapore region**)
- `NODE_ENV=development`
- `REDIS_URL` → `localhost:6379` (unreachable)
- `PUBLIC_BACKEND_WS_URL` → `wss://relearn-math-outflank.ngrok-free.dev` (**dev tunnel on the phone path** — see §6)
- `CLIENT_URL=http://localhost:5173`
- `CAMPAIGN_WORKER_CONCURRENCY=2`, `VOICE_TTS_OVERLAP=true`
- Provider keys **set**: Deepgram, Gemini, ElevenLabs, Sarvam, Groq, Cartesia, Fish, Twilio, PIOPIY, Razorpay (key+secret), Google OAuth, JWT secrets, `SUPER_ADMIN_EMAIL`
- Provider keys **empty**: `RAZORPAY_WEBHOOK_SECRET`, `GOOGLE_TTS_*`, `PIOPIY_FROM_NUMBER`

> **§3 consequence — stated up front.** The only database this environment can reach is the production Supabase instance. There is no local Postgres, no Docker, and no disposable clone. Therefore every test that **writes** (billing integration suites, `verify-admin-phase1.js`, workspace seeding ADMIN/CLIENT-A/CLIENT-B/NEW/ZERO, migration rehearsal) is **BLOCKED** in this run, not skipped-as-pass. Read-only aggregate queries (counts, no row content, no PII) are the most this audit will run against it. Minimum unblock: a `TEST_DATABASE_URL` pointing at a disposable Postgres (a Supabase branch, or `docker run postgres:16`).
>
> The owner's dev backend on `:4000` is wired to that same production database and to live provider keys. This audit does **not** kill, restart, or place calls through it.

---

## 2. Latency target — unit interpretation (recorded assumption)

The request states "300–500 microseconds" (web) and "400–700 microseconds" (phone). Literal end-to-end microseconds are physically impossible: a single loopback HTTP round trip on this machine measured **3 ms** (= 3,000 µs) in `PHONE_VS_WEB_LATENCY_ROOT_CAUSE.md` §6, and the dev tunnel alone is 213 ms median. Provider first-token/first-audio floors are hundreds of milliseconds.

**Targets used for this audit until the owner says otherwise:**

| Channel | Actual latency target (end-of-user-speech → first audible *meaningful* agent audio) |
|---|---|
| Web call | **300–500 ms** |
| Phone / PSTN | **400–700 ms** |

- *Perceived* latency (end-of-speech → first audible acknowledgement, e.g. the cached "Mm-hmm" ack at `VOICE_FILLER_DELAY_MS=400`) is measured **separately and does not count** toward the actual target.
- Internal in-process operations (µ-law decode, RMS loop, NLMS AEC at 0.153 ms/frame) may be reported in microseconds.
- If the owner confirms literal microseconds, the target is infeasible and this report will show the measured physical lower bounds and optimise toward lowest achievable milliseconds.

---

## 3. Architecture inventory

### 3.1 Processes and entry points
- **`backend/src/server.js`** — one Node process (PM2 `fork`, `instances: 1`, `ecosystem.config.cjs`) hosting: Express REST (`/api/v1`, **256 endpoints across 26 route files**), all WebSocket upgrades, the BullMQ campaign worker (in-process when Redis absent, `server.js:73`), KB stuck-job sweep (`:93`), scheduled-broadcast sweep (`:99`), **hourly subscription renewal sweep** (`:329–338`, `renewDueSubscriptions`), **hourly number-rental renewal sweep** (`:350–366`), SSE keepalive.
- **`backend/src/workers/`** — `campaign.worker.js`, `kbExtract.worker.js`, `workerBootstrap.js` (separate `npm run worker` entry; only meaningful with Redis).
- **`backend/app.py`** + `requirements.txt` (FastAPI, kokoro TTS, faster-whisper) — **unreferenced by any Node code** (`grep` for `app.py|kokoro|faster.whisper|:8000` in `backend/src` → 0 hits). Dead artefact; Python is not even installed. Classified **N/A (dead code)**.
- **`client/`** — React 18 + Vite 5 SPA. Routes in `client/src/App.tsx`: marketing (`/`, `/pricing`, `/docs`, verticals, use-cases), auth (`/login`, `/signup`, `/forgot-password`, `/auth/callback`), customer app under `ProtectedRoute → CustomerRoute → DashboardLayoutWrapper` (`/dashboard`, `/agent/:agentId`, `/call_logs`, `/billing`, `/contacts`, `/broadcast`, `/integrations`, `/phone_numbers`, `/analytics`, `/whatsapp`, …), admin under `AdminRoute → /admin/*` (users, billing, pricing, wallets, calls, issues, models, audit, health).

### 3.2 WebSocket / media paths (`backend/src/ws/`)
| Path | Handler | Engine |
|---|---|---|
| web call, bundled | `webCallRealtime.handler.js` | xAI / ElevenLabs ConvAI |
| web call, modular | `webCallModularRealtime.handler.js` (843 lines) | Deepgram → LLM → TTS |
| Twilio media | `twilioMediaModular.handler.js` / `twilioMediaRealtime.handler.js` | adapter → `modularMediaBridge.js` |
| Plivo media | `plivoMediaModular.handler.js` / `plivoMediaRealtime.handler.js` | adapter → `modularMediaBridge.js` |
| PIOPIY media | `piopiyMediaRealtime.handler.js` only | **bundled only — no modular bridge** |
| shared | `modularMediaBridge.js` (1,901 lines), `callFinalizer.js`, `callRecordingTap.js`, `socketHeartbeat.js` | |

Engine routing: `server.js:177` `upgrade` handler → reads `engine=` from the stream URL (P1 fix) → falls back to `loadAgent()`.

### 3.3 Voice hot path (`backend/src/services/`)
- **Brain:** `agentRuntime.service.js` (2,165 lines) — `voiceTurnStream()`, prompt/KB/RAG assembly, LLM selection (`VOICE_LLM_MODEL` default `gemini-3.5-flash-lite`), 1500 ms first-token hedge, model fallbacks, filler ack, latency record.
- **STT:** `stt/deepgramStream.service.js` (841), `stt/speechGate.js`, `stt/sttLanguage.js`.
- **LLM:** `llm/{openai,azure,custom,mock}.service.js` (+ Gemini inside runtime).
- **TTS:** `voice.service.js` → `voice/providers/{elevenlabs,sarvam,fishaudio,google,cartesia}.provider.js`; `voice/ttsStreamFactory.js` (token-streaming sessions).
- **Telephony audio:** `voice/telephonyAudio.js` (µ-law, resample, `TELEPHONY_TTS` table), `voice/ulawPacer.js` (20 ms clock, Plivo), `voice/pcmStreamPacer.js`, `voice/frameClock.js`, `voice/playoutWindow.js`, `voice/echoCanceller.js` (NLMS), `voice/greetingAudio.js` (LRU), `voice/ambience*.js`, `voice/noInputPrompt.js`, `voice/turnEndProfile.js`, `voice/bargeThreshold.js`, `voice/segmentOrder.js`, `voice/sentenceBuffer.js`, `voice/disfluency.js`.
- **Client:** `client/src/pages/EditAgent.tsx` (**5,822 lines** — hosts the web-call UI), `client/src/services/modularCallSocket.ts`, `audioPlayer.ts`, `ambientSound.ts`, `ttsSocket.ts`, `xaiCallSocket.ts`.

### 3.4 Data
- Prisma 5.22 → Postgres. **44 models** (`schema.prisma`), **17 migrations** (`20260719…` → `20260829140000_seed_pricing_bands`).
- Billing models: `Wallet`, `WalletTransaction` (idempotencyKey UNIQUE), `PricingBucket` (volume bands, `perMinuteInr`), `Workspace.rateOverrideInr`, `Workspace.pricingBucketId`, `Plan`, `Subscription`, `PaymentOrder`, `Invoice` (`paymentOrderId` UNIQUE nullable).
- Roles: `constants/roles.js` defines exactly `Superadmin` and `Member`. Migration `20260813140000_retire_legacy_owner_role` rewrote `Owner → Member`. AUDIT_REPORT A-04 reported `Admin (1)` / `Viewer (2)` rows — **not covered by that migration**; re-verification requires a read-only DB count (§7).

### 3.5 Existing latency instrumentation
- `lib/latencyLog.js` → `backend/logs/latency.log`, one JSON row per turn (fields: `ts, agentId, channel, sttProvider, llmProvider, model, prepMs, endpointMs, preLlmMs, sttMs, voiceWaitMs, ragMs, llmMs, llmTtftMs, ttsMs, ttsTtfaMs, ttfaMs, waitMs, totalMs, streamed, mode, delivery, filler, natural`).
- **No trace/turn ID** joins a turn across client → bridge → STT → LLM → TTS → playback. `callId` appears in 2 places in the runtime; nothing propagates a per-turn id.
- **Clocks:** runtime uses `performance.now()` (33 sites); both bridges use **`Date.now()` for durations** (`modularMediaBridge.js:287,639,788,1033–1094,1320…`; `webCallModularRealtime.handler.js` ×10). Wall-clock, not monotonic — a fix item for Phase 1.
- `wireMs` (first byte on the carrier socket) is logged to the server log only, not to `latency.log`. No event-loop-delay, CPU, GC, or socket-count instrumentation exists.
- No client-side (browser) playback-start timestamp is captured anywhere, so **"first audible audio" has never been measured on either channel**.

---

## 4. Baseline execution results (this run)

| # | Check | Command | Exit | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Backend unit suite | `npm test` (backend) | 0 | 953 tests · 896 pass · **0 fail** · 57 skipped · 138 suites | `01_backend_npm_test.log` |
| 2 | Voice suite | `npm run test:voice` | 0 | 313/313 pass | `02_backend_test_voice.log` |
| 3 | STT suite | `npm run test:stt` | 0 | 110/110 pass | `03_backend_test_stt.log` |
| 4 | WS suite | `npm run test:ws` | **1** | 36 tests · 31 pass · 0 fail · **5 cancelled** | `04_backend_test_ws.log:64–112` |
| 5 | Client typecheck | `npx tsc --noEmit` | 0 | 0 errors | `05_client_tsc.log` |
| 6 | Client lint | `npm run lint` | **1** | `'eslint' is not recognized` — **eslint is not a dependency and has no config**; the script is dead | `06_client_lint.log`, `client/package.json` devDependencies |
| 7 | Client prod build | `npm run build` | 0 | built in 41 s; chunk-size warning (>500 kB) | `07_client_build.log` |
| 8 | Backend dep audit | `npm audit --omit=dev` | 1 | **6 vulns: 2 high** (`brace-expansion` DoS, `nanoid`), 4 moderate (`body-parser`, `express`/`qs`, `protobufjs`, `qs`) — all `fixAvailable: true` | `08_backend_npm_audit.log` |
| 9 | Client dep audit | `npm audit --omit=dev` | 1 | **6 vulns: 2 high** (`nanoid`, `postcss` XSS), 3 moderate (`react-router*` open redirect ×2, `@remix-run/router`), 1 low — all `fixAvailable: true` | `09_client_npm_audit.log` |
| 10 | Backend lint / static analysis | — | — | **No eslint config exists for the backend at all** | `ls backend/.eslintrc* backend/eslint.config.*` → none |
| 11 | Secret scan (tracked tree) | `git grep -E 'AIza…|sk-…|rzp_…|xox[bp]-…|AKIA…|PRIVATE KEY'` | — | **1 real hit**: `backend/scratch/test_raw_api.js:4` — live Google API key literal (prefix `AIzaSyDAha…`). 1 false positive (Slack placeholder `xoxb-xxxx` in `Integrations.tsx:149`) | this file, §5 |
| 12 | Secret scan (history) | `git log --all -S'AIzaSyDAha' --name-only` | — | key present since **initial commit `943672c` (2026-07-13)** in `backend/scratch/test_raw_api.js`; a truncated prefix also appears in `AUDIT_REPORT.md` (`ff6a3ef`) | this file |
| 13 | `.env` in history | `git log --all --diff-filter=A -- '**/.env'` | — | never committed | this file |
| 14 | Health of running backend | `curl :4000/health` | — | `HTTP 200 {"status":"ok"}` | this file |

### 4.1 Defects found by the baseline itself

**D-01 · `test:ws` reports "0 fail" while 5 tests never ran.** `src/ws/__tests__/webCallAuthRefusal.test.js` dynamically imports `webCallModularRealtime.handler.js`, which imports `config/env.js`, which throws `Missing required env var: DATABASE_URL` at module load (`env.js:3,14`). Node's test runner marks the 5 children "did not finish before its parent and was cancelled" and exits 1, but the summary line says `fail 0`. The sibling `callRecordingTap.test.js:12–14` shows the intended pattern (`process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test'` before import). These tests are precisely the ones asserting that a bad token "never reaches the database" — they must run **without** a database. **Root cause: harness gap, not product.** Fix in Phase 3 (stub env before the dynamic import; keep every assertion).

**D-02 · Client `lint` script is dead.** `"lint": "eslint . --ext ts,tsx …"` but `eslint` and every plugin are absent from `devDependencies` and there is no config file. Historical reports never claimed lint passed; the gate cannot currently be evaluated.

**D-03 · Committed live Google API key** (A-08, still OPEN since 2026-08-04). `backend/scratch/test_raw_api.js:4`. In the tree and in history from the first commit. The `scratch/` directory is not imported by any runtime code (only mentioned in comments as the origin of measurements). Action: remove the literal (Phase 3), **owner must rotate the key and purge history** (`git filter-repo`), which this audit will not do to a shared remote.

**D-04 · 4 high-severity dependency vulnerabilities**, all with non-breaking fixes available (`npm audit fix`, no `--force`). Verified after fix in Phase 3.

---

## 5. Latency baseline from existing data (historical claim, not fresh)

`backend/logs/latency.log` on this machine: **70 rows**, 2026-08-28 12:11 → 2026-09-02 19:35, **67 `channel:"web"`, 0 `channel:"phone"`**, 3 rows with no channel. Models: `gemini-3.5-flash-lite` ×61, `openai/gpt-oss-20b` ×6. Mode: `split` ×66, `buffered` ×1.

| Stage (server-side, ms) | n | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| `preLlmMs` | 67 | 8 | 921 | 1162 | 1260 | 1260 |
| `llmTtftMs` | 67 | 1179 | 6618 | 7878 | 31323 | 31323 |
| `ttsTtfaMs` | 67 | 539 | 1208 | 1463 | 2068 | 2068 |
| **`ttfaMs`** (end-of-speech → first TTS byte at the server) | 67 | **1774** | **8116** | 11354 | 32411 | 32411 |
| `totalMs` | 67 | 3664 | 9540 | 12314 | 32980 | 32980 |

Caveats, all of which the two briefs also state: this is `ttfaMs` at the server, **not first audible audio**; it excludes endpointing (~700 ms of silence before the clock starts), WebSocket transit, browser decode and scheduling; the sample is 67 turns from an unknown mix of agents/prompts; and **phone latency has never been recorded end-to-end anywhere** (the brief's "418 turns, 0 phone" was on a previous machine — this machine has 70/0).

Against the §2 targets: web p50 is **~3.5× the upper bound before adding endpointing and playback**; p90 is ~16×. The briefs' own conclusion — that the modular route floor is ≈ 700 ms endpointing + ~1.0 s TTFT + ~0.5 s TTS ≈ **2.2 s** — stands as the hypothesis to re-measure in Phase 1.

---

## 6. Deployment / phone path facts relevant to latency

- Phone media streams to `PUBLIC_BACKEND_WS_URL = wss://…ngrok-free.dev` (dev tunnel, 213 ms median / 619 ms max measured in the root-cause doc). **No phone number taken from this machine is production evidence** — recorded as such.
- Production VPS: Hostinger `62.72.12.185` (`spandan.mannmate.com`), shared with 17 other PM2 processes, **region unverified** (root-cause doc §6 "verify it before anything else").
- Gemini key was free-tier as of 2026-08-19 (15 RPM/model). Re-verification requires an API call that spends quota — deferred to Phase 1 with approval.

---

## 7. Specification conflicts and source gaps

### 7.1 Billing model — contract map (read-only analysis, no data touched)

Three layers coexist in the code, and they contradict each other in the docs:

| Layer | Where it lives | Status in code | Customer-visible? |
|---|---|---|---|
| **Prepaid wallet** (paise, per-minute settlement) | `Wallet`, `WalletTransaction`, `billing/wallet.service.js`, `settlement.service.js`, `callBudget.js`, Razorpay top-ups (`razorpay.service.js`, webhook at `app.js:59`) | Active | **Yes** — `client/src/pages/Billing.tsx:12` "a prepaid balance, so there is no tier to choose"; `Pricing.tsx:124` "No plans, no seats, no monthly minimum, nothing that renews." |
| **Internal rate tiers / volume bands** | `PricingBucket` (bands with `minMinutes/maxMinutes/perMinuteInr`), `Workspace.pricingBucketId`, `Workspace.rateOverrideInr`, `billing/pricingBuckets.js`, `workspaceRate.js`, admin `/admin/pricing` (last 5 commits on `main`) | Active | **No** — admin-only |
| **Legacy subscriptions** | `Plan`, `Subscription`, `PaymentOrder.purpose='subscription'`, `subscription.service.js`, `autoRenew.service.js`, invoices typed `subscription`, **hourly `renewDueSubscriptions()` sweep still armed in `server.js:329–338`** | **Still executing** | Backend README §"Billing model" still documents Subscriptions/auto-renewal as current; customer UI says the opposite |

Consequences this audit will verify read-only and **not** change without an owner decision:
1. Whether any `Subscription` row is still `status='active'` / `autoRenew=true` — if so, the renewal sweep can still **charge a wallet or a saved card** for a product the customer UI says does not exist.
2. A-15 duplicate invoices (3 pairs, ₹37,000 over-documented per AUDIT_REPORT) — a document-issuance question; **BLOCKED pending an accounting decision**, with read-only visibility (`suspectedDuplicate` flag) kept intact.
3. A-02 "catalog-driven plan choices" — the `Plan` dropdown fix is now only relevant to the legacy layer; re-verified for non-regression, not treated as current product.

**Decision requested from owner (blocking for the legacy layer only):** (a) confirm the prepaid wallet is the sole customer product; (b) decide whether the renewal sweeps should be disabled, left running for grandfathered rows, or migrated; (c) decide which of each A-15 invoice pair is authoritative.

### 7.2 Issue C — payment-summary key rename: **source gap**

Searched: `git log --all --grep` for `issue c|payment.summary|rename`; `grep -rnE 'paymentSummary|payment_summary|PaymentSummary'` across `backend/src` and `client/src` → **0 references**; all `*.md` files for "Issue C" → **0 hits**. No issue tracker export is in the repository. The old and new field names are therefore **unknown and will not be invented**. Status: **BLOCKED — needs the Issue C text.** What *can* be done without it: build the producer/consumer matrix for every payment-total field the API currently emits (Dashboard, Billing, Analytics, Call Logs, Admin Overview/Billing/Wallets, webhook, invoice generation, exports) and prove they agree with the ledger — that matrix is delivered in `REGRESSION_CROSSCHECK.md` regardless.

### 7.3 Historical report inconsistencies noted
- `COMPLETION_REPORT.md` is dated 2026-08-04 ("Phase 1 of 6") while `main` has 60+ later commits touching billing, pricing, telephony and voice; every one of its 51 PASS rows is stale by construction and is re-run in Phase 3/§9.
- `BUG_SHEET.md` BUG-002 ("no payment gateway, no usage deduction") is contradicted by later code (Razorpay webhook, `settleCall`, `callBudget`) — re-classified against current code in the QA matrix rather than carried forward.
- `BUG_SHEET.md` BUG-003 (ambience) — `voice/ambience.js`, `ambiencePump.js` and `client/src/services/ambientSound.ts` now exist; re-classified.
- The latency brief's `latency.log` figures (418 turns) are from another machine; this machine has 70 rows (§5).

---

## 8. Checklist seeded from historical documents

Tracked in `QA_FINAL_MATRIX.md` (one row each, with baseline/fix/final evidence). Seed list:

**AUDIT_REPORT:** A-01 wallet-credit idempotency · A-02 catalog-driven plans · A-03 superadmin reconcile · A-04 role drift (Admin/Viewer) · A-05 ban revokes refresh tokens · A-06 audit rows + redaction · A-07 migration history integrity · A-08 committed API key · A-09 unbounded lists · A-10 `req.user.id` phantom field · A-11 last-superadmin guard · A-12 live access-token window · A-13 COGS never recorded · A-14 recording duration NaN · A-15 duplicate invoices.
**COMPLETION_REPORT:** Phase 1 (11 checks), 1b (6), 1c (9), 2a (13), 2b (12) — 51 historical PASS rows.
**BUG_SHEET:** BUG-001 phantom silence turns · BUG-002 billing integration · BUG-003 ambience.
**Latency docs:** P1–P5, B1, B2, "step 0" (VPS region, first phone row), appendix items (dead `welcomeCache` write, `agentCache.delete` after persist, no in-flight dedupe).
**Found this run:** D-01 cancelled ws tests · D-02 dead lint script · D-03 key literal · D-04 dependency vulns · no trace ID · wall-clock durations in bridges · no first-audible-audio measurement · dead `app.py`.

---

## 9. Baseline execution plan (what runs next, and what is blocked)

| Phase | Work | Runnable here? |
|---|---|---|
| 3 (early) | D-01 fix (ws test harness), D-03 (remove key literal), D-04 (`npm audit fix`, rerun suites+build), D-02 (add eslint config, report count) | **Yes** |
| 1 | Add per-turn `turnId`, switch bridge durations to monotonic clock, add event-loop-delay + client playback-start to the latency record, unit-test the record shape | **Yes** (code + unit tests) |
| 1 | Fresh web-call latency measurement (≥30 warm turns) | **Needs approval** — spends Deepgram/Gemini/TTS quota and writes `AgentCallLog` rows to the production DB via the owner's running backend; or a disposable DB |
| 1 | Phone-call latency measurement | **BLOCKED** — real number + carrier spend + public host; tunnel numbers are disallowed by the brief's own evidence |
| 1 | Concurrency 5/10/25/max | **BLOCKED** — Redis absent, provider quota, approval |
| 3 | Billing integration suites (`test:billing` = `wallet/subscription/settlement.integration`), `verify-admin-phase1.js`, seeded workspaces, migration rehearsal | **BLOCKED** — only reachable DB is production |
| 3 | Read-only DB aggregates (role counts for A-04, active-subscription count for §7.1, COGS coverage for A-13, invoice pairs for A-15) | **Yes**, counts only, no PII |
| 3 | Browser regression (Playwright) against owner's running dev stack | **Partly** — read-only pages yes; anything creating calls/payments needs approval |
| 9 | Historical cross-check of every COMPLETION_REPORT row | Mixed — HTTP checks against `:4000` are read-only for GETs; POST/PATCH rows blocked |

Approval requests are collected in `OPEN_ISSUES.md` rather than raised one at a time.
