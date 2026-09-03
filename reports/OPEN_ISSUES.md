# Open Issues — only what is genuinely unresolved or blocked

**Branch:** `release/readiness-audit` · updated 2026-09-04 (phase 2). Fixed items are *not* listed here — see `REGRESSION_CROSSCHECK.md` §7 and `FINAL_REPORT.md`.
Severity: **P1** release-blocking risk to money, data, trust or security · **P2** must fix before GA · **P3** should fix · **P4** cosmetic.

## A. Blockers on the environment

| # | Item | Sev | Impact | Owner action to unblock |
|---|---|---|---|---|
| E-1 | **Only reachable hosted database is production** (Supabase `ap-southeast-1`). Phase 2 stood up a **disposable embedded Postgres 17 on `localhost:5499`** (`hm_test`, `hm_rehearsal`) and a portable Redis on `localhost:6390`; `pgvector` is not available in it, so the `KbChunk.embedding` column is `real[]` there and RAG queries cannot run locally. | P2 (was P1) | Web-call measurement, seeding, migration rehearsal and the unit/HTTP suites now run without touching production. Still blocked: the 57 billing integration suites (they read `DATABASE_URL`, not `TEST_DATABASE_URL`), RAG, Member→403 with a real login. | Point the billing suites at `TEST_DATABASE_URL` (one-line guard recommended: refuse any URL matching `supabase`); for RAG, a Postgres with pgvector (Supabase branch or Docker). |
| E-2 | **Placing phone calls needs approval + a number.** Web turns were measured (provider quota spent, no DB writes). | **P1** | Every phone number in this report is still absent: `wireMs`, greeting-from-cache, deaf tail, barge/echo/BUG-001 on a real line, the transfer happy path and every carrier failure path, ambience audibility (BUG-003). | Approve N calls from a number you own on the Mumbai VPS, with a human on the transfer target; state the budget. |
| E-3 | Redis: local portable instance on `:6390` used for the harness. Production Redis unchanged. | P3 | Load tests at 5/10/25/45 not run. | Approve a load run against the VPS, or a staging box. |
| E-4 | Razorpay test mode / webhook secret | P2 | Top-up/webhook/refund paths untested. | Test-mode key pair + webhook secret. |
| E-5 | **Issue C payment-summary key rename has no source text** anywhere in the repo. | P2 | Cannot be named, let alone verified. Producer/consumer key names are consistent today. | Supply the specification (old name, new name, endpoints). |
| E-6 | **Latency unit** read as milliseconds (stated once in `LATENCY_REPORT.md` §1). | — | If literal microseconds were meant, both targets are infeasible. | Confirm. |
| E-7 | **Fish Audio account is on the free tier**, whose Terms of Use limit use to "internal, personal, non-commercial". The Mode B chatter beds were rendered from it. | **P1 for the ambience feature** | The chatter presets must not be enabled in a commercial deployment until the account is paid (or the beds are regenerated from a source with commercial terms). Code is complete and tested. | Upgrade the Fish plan, or approve regenerating the beds elsewhere. |
| E-8 | `QA_REGRESSION_TEST.md`, `MY_QA_STATUS.md` and `QA_FINAL_MATRIX.csv` named in the brief **do not exist** in the repository or its history; the matrix has 109 rows, not 314. | — | The 314-case matrix cannot be reconciled to a document that is not here. | Provide the 314-case sheet if it exists; otherwise the 109-row matrix (+18 rows added this phase) is the matrix. |

## B. Latency (the release gate)

| # | Item | Status |
|---|---|---|
| L-1 | **Web actual 300–500 ms: NOT MET.** Measured at the socket boundary on 24 clean turns per arm: p50 **2,861 ms** with speculation off, **2,136 ms** with the new default, **2,113 ms** in the aggressive mode; p90 4–6 s because of LLM tail. Waterfall in `LATENCY_REPORT.md` §4. | **FAIL** |
| L-2 | **Phone actual 400–700 ms: UNMEASURED.** | **BLOCKED** (E-2) |
| L-3 | **Deepgram end-of-speech is the floor: ~950–1,085 ms p50 from the caller's last voiced frame to the server's commit**, of which the configurable part (endpointing + grace) is ~460 ms; the remainder is the recogniser's own latency from India to a US endpoint. `endpointing=100` and `nova-3` were tried (`LATENCY_REPORT.md` §5); the server-side local-VAD commit was tried and cut mid-sentence pauses (kept off). Sub-second on this route needs a different STT (closer region, or a local/streaming model with sub-300 ms finals) — a provider decision. | **OPEN** (P1 for the target) |
| L-4 | **LLM first token on this account: Gemini 3.5 flash-lite p50 ≈ 0.9–1.3 s with a 5–9 s tail; Groq gpt-oss-20b p50 9.8 s (rate-limited).** No credible fast model exists on this account today; `gemini-2.5-flash` returns an error. | **OPEN** — needs a paid tier / a different model account |
| L-5 | Bundled speech-to-speech route (xAI / ElevenLabs ConvAI) not benchmarked this phase; the harness only drives the modular WebSocket. | **UNVERIFIED** |
| L-6 | Concurrency 5/10/25/45 with event-loop lag | **BLOCKED** (E-2/E-3); single-call `elLagP99` ≈ 36–40 ms recorded |

## C. Data and money (owner decisions)

| # | Item | Sev | Decision / action needed |
|---|---|---|---|
| D-8 | **Production contaminated with test fixtures** (131/182 workspaces `__test__*`, 155/165 plans, ₹29.99 L fixture float). `npm run db:clean-test-data` **did not cover the `__test__` slug prefix at all** — it would have removed none of the 131. Phase 2 extended it (`__test__` + `CLEAN_TEST_WS_PREFIXES`), added fixture-user cleanup, a `--dry-run`, and a production guard that refuses a hosted URL unless `--i-have-a-fresh-backup-of-production` is passed. **Not run against production.** | **P1** | Take a backup; run `--dry-run` against a restored copy (a Supabase branch is the practical clone); review the list; then run for real with the flag. |
| D-9 | **Hourly renewal sweep fails on fixture subscriptions.** Phase 2 adds `SUBSCRIPTION_RENEWAL_ENABLED=false` as an operator switch (default unchanged). | **P1** | Decide: retire the legacy layer (set the flag, then migrate the one real `Growth` row to the wallet) or keep it and clean the fixtures first (D-8). |
| D-10 | **Migrations baselined** (`0000000000000_baseline` = full schema + `CREATE EXTENSION vector`, `0000000000001_seed_pricing_bands`, `20260904000000_call_transfer`; 17 old dirs moved to `prisma/migrations_archive/`; `migration_lock.toml` added). **Rehearsed on a clone shaped like production**: `migrate resolve --applied 0000000000000_baseline` then `migrate deploy` applied only the two new migrations (`db/rehearsal_existing_db.txt`). **Production step, once, before the next deploy:** `npx prisma migrate resolve --applied 0000000000000_baseline` then `npx prisma migrate deploy`. The 12 orphan `_prisma_migrations` rows remain as harmless history. | P2 | Approve the production resolve. |
| D-11 | `QueryCache` orphan table in production (not in the schema, no code reads it). Recommendation: **drop** — it is unreferenced; keep a `pg_dump -t QueryCache` first. The partial index on `VoiceNumber.nextRenewalAt` vs the schema's full index is harmless drift; leave it. | P3 | Approve the drop (add a migration `DROP TABLE IF EXISTS "QueryCache"`). |
| A-15 | One payment → two invoices (historical); 47 unanchored subscription invoices | P2 | Accounting decision before any code. |
| A-13 | COGS never recorded; the transfer human leg adds a second carrier leg with no cost capture either | P2 | Product decision. |
| A-3b | 3 Superadmin memberships | P3 | Confirm intended. |
| B-2 | Shared platform provider keys; Gemini and Groq both behave rate-limited (L-4) | P2 | Enable billing; per-workspace credentials. |
| X-1 | Transfer: human-leg recording/consent wording; attended (briefed) transfer; affect-based triggers | P3 | Product decisions (see `CALL_TRANSFER.md` §5). |

## D. Security (owner actions)

| # | Item | Sev | Action |
|---|---|---|---|
| A-8 | Google (and Groq) API keys **still in git history**; removed from the tree earlier. Not confirmed rotated. | **P1** | Rotate both; decide on `git filter-repo` (shared remote — your call); confirm every credential from the original `.env` archive was rotated. |
| S-2 | `react-router` 6.x open-redirect advisory ships to production; fix is 7.x (semver-major). Not upgraded this phase (a router major needs a browser regression pass that is itself BLOCKED). | P3 | Schedule; audit `navigate(userInput)` meanwhile. |
| S-3 | Backend moderate advisories: `npm audit --omit=dev` re-run in the final session (see `FINAL_REPORT.md`). | P4 | Re-run after upstream releases. |
| S-5 | Transfer callback endpoints are public and HMAC-gated; Plivo's own signature is not additionally verified on them (it is on `/plivo/*`). | P3 | Add `validateV3Signature` to `/telephony/transfer/plivo/*` when a Plivo test call is possible. |
| A-12, S-1, S-4 | unchanged from the previous run | P3/P4 | see previous `OPEN_ISSUES.md` (git history) |

## E. Repository / process

| # | Item | Sev | Action |
|---|---|---|---|
| D-2 | Client lint: **76 `no-explicit-any`** remain (was 86), baselined per file in `client/lint-baseline.json` with a ratchet (`npm run lint:ratchet` fails on growth, auto-lowers on progress). The rule is not relaxed; `npm run lint` still reports them. | P3 | Burn down `EditAgent.tsx` (36) and `Analytics.tsx` (13). |
| D-12 | **5.3 WS timeouts did not reproduce**: `test:ws` 50/50 in ~2 s; `modularMediaBridge.js` imports in 462 ms on this machine (`13_import_time_bridge`). | — | If it recurs on the other machine, capture `node --cpu-prof` of the import. |
| D-13 | The working tree at session start **reverted commit `139f797`** (finished-grace tier) and deleted two reports, with no reflog entry; a stash "pre-hard-reset backup" exists. The pre-session diff is saved as `evidence/2026-09-03_phase2/00_pre_session_worktree.patch`; the committed version was restored. A prior session's speculative-execution work was lost the same way (its fields appear in `latency.log` rows from 14:56 UTC but in no commit). | — | Say whether the revert was deliberate. |
| P-1 | `backend/app.py` + `requirements.txt` dead | P4 | delete or document |
