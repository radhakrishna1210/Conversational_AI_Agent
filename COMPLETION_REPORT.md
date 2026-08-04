# Admin Console — Completion Report

Only items with reproduced evidence appear here. "Should work" is not recorded.

Last updated: 2026-08-04 · **Phase 1 of 6 complete**

Verification harness: `backend/scripts/verify-admin-phase1.js`, run against the
live server on `localhost:4000` with a real Superadmin JWT, asserting on real
HTTP responses and real database rows.

```
node --env-file=.env scripts/verify-admin-phase1.js
```

---

## Phase 1 — Security, audit trail, and money-handling safety

**11/11 checks passed.**

| # | Item | Evidence | Status |
|---|---|---|---|
| 1 | Member refused on admin routes | `GET /admin/audit-logs` as Member → `403 {"error":"Superadmin access required"}` | PASS |
| 2 | Unauthenticated refused | `GET /admin/audit-logs` no token → `401 {"error":"Authentication required"}` | PASS |
| 3 | Audit log readable + paginated | `HTTP 200, total=0, page=1, limit=5` | PASS |
| 4 | Wallet credit moves balance | `HTTP 200, api balance=50000, DB Wallet.balanceCents=50000` | PASS |
| 5 | Wallet credit writes audit row | `AuditLog id=cmse7ln680180pvvzaf1u7fhi actor=verify-admin@local role=Superadmin before={"balanceCents":0} after={"balanceCents":50000} ip=::1` | PASS |
| 6 | **Replayed credit is idempotent** (fixes A-01) | `replay HTTP 200 duplicate=true; balance still 50000; WalletTransaction rows = 1 (expected 1)` | PASS |
| 7 | Ledger invariant intact | `balanced=true balanceCents=50000 ledgerSumCents=50000 discrepancies=[]` | PASS |
| 8 | Plan list from real catalogue (fixes A-02) | `API=["Free","Starter","Jump Starter","Early Deployers","Growth"]` matches DB; `"Pro"` gone | PASS |
| 9 | Unknown user → 404 not 500 | `PATCH /admin/users/nonexistent-user-id/plan → 404 {"error":"User not found"}` | PASS |
| 10 | Secrets redacted before storage | stored: `{"apiKey":"[redacted]","accessToken":"[redacted]","nested":{"secret":"[redacted]","keep":"visible"}}` | PASS |
| 11 | Audit filters applied server-side | `?category=billing` → 2 rows, `categories=["billing"]` | PASS |

## Phase 1b — Superadmin access (A-03)

Reported by the owner: `SUPER_ADMIN_EMAIL` was set, they logged in with that
address, and still got the customer dashboard. Root cause was that the role is
written once at signup and never re-evaluated.

**6/6 checks passed** — `backend/scripts/verify-superadmin-role.js`

| # | Item | Evidence | Status |
|---|---|---|---|
| 1 | Baseline reproduces the bug | account created with env unset → `WorkspaceMember.role = "Member"` | PASS |
| 2 | Promotion on next login | `DB role "Member" -> "Superadmin"` | PASS |
| 3 | Issued JWT carries the new role | `JWT payload role = "Superadmin"` | PASS |
| 4 | Other accounts unaffected | second user stays `"Member"` | PASS |
| 5 | Demotion when env re-pointed | `"Superadmin" -> "Member"` | PASS |
| 6 | Privilege changes audited | `2 rows: Member->Superadmin, Superadmin->Member` | PASS |

Harness note: an earlier run reported checks 5 and 6 as FAIL. That was the test
harness, not the product — `config/env.js` snapshots `process.env` at module
load, and re-importing `auth.service.js` with a cache-busting query string
still resolved the same cached `env.js`, so the second scenario kept the first
scenario's value. Each scenario now runs in its own process. Recorded here
because a false FAIL that gets "fixed" by weakening the test is how real
regressions get shipped.

## Phase 1c — The console becomes its own application

Reported by the owner: after gaining access, the admin panel was still just a
tab inside the customer sidebar. It is now a separate application at `/admin`
with its own shell, and a Superadmin never sees the tenant dashboard.

**Verified in a real browser** against both servers, signed in with a real
Superadmin JWT for the owner's account.

| # | Item | Evidence | Status |
|---|---|---|---|
| 1 | Superadmin redirected out of the customer app | navigated to `/dashboard`, browser landed on `/admin` | PASS |
| 2 | Console has its own shell, not the tenant sidebar | grouped nav: Overview / Customers / Billing / Telephony / Support / Security & System; no agent/whatsapp/billing tenant nav | PASS |
| 3 | Overview renders real platform data | 10 users, 16 workspaces, 32 agents — matches DB counts | PASS |
| 4 | Sections are addressable routes | `/admin/users`, `/admin/audit`, `/admin/plans` … deep-link and back-button work | PASS |
| 5 | Breadcrumb reflects location | `Customers / Users`, `Security & System / Audit Log` | PASS |
| 6 | **Audit Log page renders real entries** | captured the owner's own promotion: `before {"role":"Member"}` → `after {"role":"Superadmin"}`, metadata `reason: "reconciled against SUPER_ADMIN_EMAIL"` | PASS |
| 7 | Filters + pagination wired to the server | category/outcome selects, search, `1 entry · page 1 of 1` | PASS |
| 8 | Migrated pages still work | Users page lists all 10 accounts with plan/status/workspace/role | PASS |
| 9 | Build is clean | `vite build` ✓ 2582 modules; `tsc --noEmit` reports **0** errors in any changed file | PASS |

Note: the Users table shows roles `Viewer` and `Admin` for three accounts —
that is A-04 (role drift), visible now that the data is on screen. Not a
regression from this change.

### Files changed in Phase 1

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | New `AuditLog` model (no FK to User, by design) |
| `backend/prisma/migrations/20260804130000_admin_audit_log/` | Additive migration — one `CREATE TABLE` + 5 indexes |
| `backend/src/services/audit.service.js` | **New.** `writeAudit`, `listAuditLogs`, redaction, action constants |
| `backend/src/controllers/billing.controller.js` | `adminCreditWallet`: idempotency key + audit + 404 on unknown workspace |
| `backend/src/controllers/admin.controller.js` | Audit on ban/unban/delete/plan-change; session revocation on ban; last-Superadmin guard; `forceLogoutUser`; audit-log handlers |
| `backend/src/services/userManagement.service.js` | `listAssignablePlans()` reads the `Plan` table |
| `backend/src/routes/admin.routes.js` | `POST /users/:id/force-logout`, `GET /audit-logs`, `GET /audit-logs/options` |
| `backend/src/services/auth.service.js` | `reconcileSuperAdminRole()` — makes `SUPER_ADMIN_EMAIL` authoritative at login/refresh/Google login, with audit |
| `backend/scripts/verify-admin-phase1.js` | **New.** Verification harness |
| `backend/scripts/verify-superadmin-role.js` | **New.** A-03 regression guard |

### Migration safety

Applied with `prisma migrate deploy` (never `migrate dev` / `db:reset`) against
the live Supabase database. Purely additive — one new table, no existing table
altered, so no wallet/subscription/payment data was touched.

```
5 migrations found in prisma/migrations
Applying migration `20260804130000_admin_audit_log`
All migrations have been successfully applied.
```

### Regression check

The wallet / subscription / payment data is shared with the customer-facing
billing UI, so the pre-existing suite was re-run after the changes:

```
npm run test:billing        ->  # tests 93   # pass 93   # fail 0
node --test money.test.js   ->  # tests 29   # pass 29   # fail 0
```

Covers `wallet.integration`, `subscription.integration`, `settlement.integration`,
`razorpay`, and `money`. Nothing previously working regressed.

---

## Not yet built

Phases 2–6 below are **not started**. Nothing in Section 3 has been dropped;
this records honestly where the work stands.

| Phase | Area | State |
|---|---|---|
| 2 | Impersonation, login history, IP allowlist, 2FA enforcement | Schema fields for impersonation exist on `AuditLog`; no endpoints yet |
| 2 | Subscription/billing admin: refunds, failed payments, invoice download | Not started |
| 3 | User management UI drill-down, manual top-up UI, password reset | Backend partly done (force-logout, audit); no UI |
| 3 | Agent management, call logs + recordings, usage analytics, CSV export | Not started |
| 4 | Coupons, trial config, custom per-workspace plan | Needs new `Coupon` model |
| 4 | Provider & API key management, spend limits, failover | Needs new `ProviderApiKey` model |
| 5 | Support tickets, announcements, voice-clone approval queue | Needs new models |
| 5 | Integrations management, webhook retries, content/config, feature flags | Not started |
| 6 | System/DevOps: BullMQ queue depth, error log viewer, WS stats | See blocker below |
| — | **All frontend pages** | Not started — Phase 1 was backend-only |

## Blocked / needs input

| Item | Blocker | To unblock |
|---|---|---|
| ~~Anyone reaching `/admin`~~ | **RESOLVED** — see Phase 1b | Owner must log out and sign in again so a fresh JWT is minted with `role: Superadmin` |
| BullMQ queue depth, real WS connection stats | Redis unreachable (`ECONNREFUSED 127.0.0.1:6379`) | A running Redis, or accept the memory-fallback numbers as meaningless |
| Refunds, live payment capture | Razorpay keys present but never exercised; refunding real money is not something to test speculatively | A test-mode Razorpay account, or explicit go-ahead to refund a specific real payment |
| Access-token revocation on ban | Stateless JWT; revocation lands only at refresh (A-12) | Decide whether a Redis denylist is wanted, once Redis is available |
