# Open Issues — only what is genuinely unresolved or blocked

**Branch:** `release/readiness-audit` · fixed items are *not* listed here (see `REGRESSION_CROSSCHECK.md` §6 and `FINAL_REPORT.md`).
Severity: **P1** release-blocking risk to money, data or security · **P2** must fix before GA · **P3** should fix · **P4** cosmetic.

## A. Blockers on the environment (unblock these first — they gate most of the matrix)

| # | Item | Sev | Impact | Owner action to unblock |
|---|---|---|---|---|
| E-1 | **Only reachable database is production** (Supabase `ap-southeast-1`). No local Postgres, no Docker. | P1 | Every write test, workspace seeding (ADMIN/CLIENT-A/CLIENT-B/NEW/ZERO), the 57 billing integration tests, `verify-admin-phase1.js`, migration rehearsal, and all authenticated HTTP/browser regression are **BLOCKED**. | Provide `TEST_DATABASE_URL` for a disposable Postgres (Supabase branch, or `docker run -e POSTGRES_PASSWORD=x -p 5432:5432 postgres:16`). Because the repo cannot build a schema from migrations (D-10), seed it from a **dump of the schema only** (`pg_dump --schema-only`), not `migrate deploy`. |
| E-2 | **Placing calls needs approval**: web calls spend Deepgram/Gemini/TTS quota and write `AgentCallLog`/billing rows; phone calls spend carrier money and need a tester-owned number and a public host (the dev tunnel is disqualified by the repo's own measurements). | P1 | No fresh latency number exists; BUG-001/BUG-003 audible checks, barge-in, silence handling, Fast/Patient profiles, recordings, transcript attribution, post-call delivery all **BLOCKED**. | Approve: (a) ≥30 web turns per route on a named test agent, against the disposable DB from E-1 with my branch on a separate port; (b) N phone calls from a number you own, on the Mumbai VPS, budget stated. |
| E-3 | **Redis unreachable** (`localhost:6379` ECONNREFUSED). | P2 | BullMQ queue depth, rate-limit persistence, cross-instance concurrency, A-12 denylist, load tests at 5/10/25/45 all **BLOCKED**. | Start a Redis (or point `REDIS_URL` at one). |
| E-4 | **Razorpay test mode / webhook secret**: `RAZORPAY_WEBHOOK_SECRET` is empty; keys present are unexercised. | P2 | Top-up, webhook replay, duplicate-webhook, refund/cancel states, invoice generation **BLOCKED**. | Test-mode key pair + webhook secret; never a live refund. |
| E-5 | **Issue C text is absent** from the repository. | P2 | The payment-summary key rename cannot be verified or even named. Current producer/consumer names are consistent (cross-check §5). | Supply the Issue C specification (old name, new name, affected endpoints). |
| E-6 | **Literal microseconds?** Targets were read as milliseconds (`BASELINE_AUDIT.md` §2). | — | If literal µs were intended, both targets are physically infeasible. | Confirm the unit. |

## B. Data and money (owner decisions — nothing here was changed by this run)

| # | Item | Sev | Evidence | Decision / action needed |
|---|---|---|---|---|
| D-8 | **Production DB is contaminated with test fixtures**: 131/182 workspaces, 155/165 plans, 37/65 users, 105/137 wallets holding ₹29.99 lakh of the ₹33.08 lakh "float", 147 call logs, 40 subscriptions, 44 invoices. The billing integration suites were run with `DATABASE_URL` = production after 2026-08-04. | **P1** | `36_test_fixture_contamination.txt`, `33_subs_readonly.txt` | Approve running `npm run db:clean-test-data` (targets `__test__*` slugs and `TestPlan-*` plans; destructive; back up first). Then re-run every admin billing/overview claim. Add a guard so the integration suites refuse any `DATABASE_URL` that is not explicitly a test database (recommended follow-up). |
| D-9 | **Hourly subscription renewal sweep runs against legacy/test rows**: 4 `past_due` `__test__` subscriptions fail renewal every hour; 29 more `active` rows (all but one are fixtures) come due by 2026-09-29. The customer UI says "no plans, nothing renews"; `server.js:329` renews anyway. | **P1** | `33_subs_readonly.txt`, `BASELINE_AUDIT.md` §7.1 | Decide the legacy layer: disable the sweeps, or keep them for the one real `Growth` row and migrate it. Until decided, expect hourly `Subscription renewal failed` errors. |
| A-15 | **One payment → two invoices** (historical); now 47 subscription invoices without `paymentOrderId`, mostly fixtures. | P2 | `13_db_readonly_counts.txt` | Accounting decision on which document is authoritative; then a transactional idempotency fix + remediation. Read-only `suspectedDuplicate` flag kept. |
| A-13 | **COGS never recorded**: `actualCostMicroUsd` null on 646/646 calls. Margin is unreportable. | P2 | `13_` | Product decision to build per-call provider cost capture in the voice pipeline (real hot-path work). |
| A-3b | **3 Superadmin memberships** exist (report expected one). | P3 | `13_` | Confirm all three are intended. |
| B-2 | **Shared platform provider keys**, Gemini tier unverified (was free-tier 15 RPM on 2026-08-19). | P2 | root-cause doc §8 | Enable billing; plan per-workspace credentials + per-tenant token bucket. |

## C. Security (owner actions)

| # | Item | Sev | Action |
|---|---|---|---|
| A-8 | Google API key **still in git history** (`943672c` onward) and on GitHub; literal removed from the tree in `b27012c`. | **P1** | Rotate the key now; purge with `git filter-repo`, force-push with team coordination (not done here — rewriting a shared remote is your call). |
| A-12 | Live access tokens survive a ban until expiry (no denylist). | P3 | Needs Redis (E-3); then a `jti` denylist checked in `authenticate`. |
| S-1 | SSRF guard cannot stop **DNS rebinding** after the check. | P3 | Pin the resolved address with a custom undici dispatcher, or proxy tenant webhooks through an egress allow-list. |
| S-2 | `react-router` 6.x open-redirect CVE (moderate) — fix is a semver-major (7.x). | P3 | Schedule the upgrade; meanwhile audit any `navigate(userInput)`. |
| S-3 | `express`/`body-parser`/`qs` moderate DoS advisories — no non-breaking fix available at audit time. | P4 | Re-run `npm audit fix` after upstream releases. |
| S-4 | Refresh-token reuse is rejected but the token *family* is not revoked. | P4 | Optional hardening. |

## D. Repository / process

| # | Item | Sev | Action |
|---|---|---|---|
| D-10 | **Repo cannot create a database from scratch**: no baseline migration, `migration_lock.toml` missing, 12 applied migrations have no directory, 2 rolled-back retries, live drift (orphan `QueryCache`). `prisma migrate status` reports "up to date" regardless. | **P2** | Baseline: commit `23_missing_baseline_migration.sql` as `0000000000000_baseline`, then **on production only** `prisma migrate resolve --applied 0000000000000_baseline` *before* the next deploy (otherwise deploy tries to re-create every table). Add `migration_lock.toml`. Decide whether `QueryCache` is dropped. |
| D-2 | Client lint gate now runs and **fails**: 87 errors / 22 warnings (80 × `no-explicit-any`). Rules were not relaxed. | P3 | Fix or consciously baseline; do not `--max-warnings` it away. |
| A-9 | `listWorkspaces` fetches every workspace then paginates in memory. | P3 | Push `skip/take` into the query. |
| A-10, A-14 | phantom `req.user.id` read; recording duration shows `NaN` until remuxed. | P4 | cosmetic |
| P-1 | `backend/app.py` + `requirements.txt` (kokoro/whisper FastAPI) are dead and unreferenced. | P4 | Delete or document. |

## E. Latency — the release-gate items

| # | Item | Status |
|---|---|---|
| L-1 | Web actual 300–500 ms | **NOT PROVEN.** Server-side `waitMs` p50 2245 ms on the existing log; modular floor ≈ 2.2 s by the repo's own analysis. Fresh measurement BLOCKED (E-1, E-2). |
| L-2 | Phone actual 400–700 ms | **NOT PROVEN.** Zero phone turns ever recorded. BLOCKED (E-2). |
| L-3 | Architectural decision: modular vs bundled/realtime for sub-second | **UNDECIDED**, needs the A/B in `LATENCY_REPORT.md` §5. |
| L-4 | Concurrency 5/10/25/45 with event-loop lag | instrumented; BLOCKED (E-2, E-3). |
