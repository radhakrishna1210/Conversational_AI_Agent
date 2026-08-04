# Admin Console — Audit Report

Issues found while reading and extending the existing admin surface. Includes
defects in the **pre-existing** code, not only in what I added.

Status key: **FIXED** (fixed and verified) · **OPEN** (found, not yet fixed) ·
**BLOCKED** (needs something I do not have).

Last updated: 2026-08-04 · Phase 1

---

## Critical

### A-03 · No account can currently reach the admin panel — OPEN (config)

`backend/.env` has `SUPER_ADMIN_EMAIL=` (empty). Role is assigned only by
`resolveRole()` in `backend/src/services/auth.service.js:7`:

```js
const resolveRole = (email) =>
  (env.SUPER_ADMIN_EMAIL && email === env.SUPER_ADMIN_EMAIL ? 'Superadmin' : 'Member');
```

Evidence — no `Superadmin` row exists in the database:

```
prisma.workspaceMember.groupBy({ by: ['role'] })
-> [{ role: 'Admin', _count: 1 }, { role: 'Viewer', _count: 2 }, { role: 'Member', _count: 7 }]
```

Two distinct problems:

1. With the variable empty, every signup resolves to `Member`, so `isAdmin`
   refuses everyone and the whole `/admin` panel is unreachable in this
   deployment.
2. `resolveRole` runs **only at signup / first Google login**. Setting
   `SUPER_ADMIN_EMAIL` now would *not* promote any of the 10 existing users —
   their `WorkspaceMember.role` was written at signup and is never
   re-evaluated.

**To unblock:** confirm which email should own the platform. Then it needs both
the env var set *and* a one-off promotion of that user's existing membership
row. I have not written to any real user's role without that confirmation.

---

## High

### A-01 · Admin wallet credit could double-charge — FIXED

`adminCreditWallet` called `applyWalletTransaction` with **no
`idempotencyKey`**, while every other money path in the codebase supplies one.
A double-clicked button, a retried request, or a refreshed hung POST credited
the wallet a second time, and the duplicate was indistinguishable from a
deliberate second credit.

This sat directly against the design note in `wallet.service.js`, which calls
the idempotency key "THE double-charge guard".

Fix: `backend/src/controllers/billing.controller.js` — accepts a client
`idempotencyKey`, falling back to a minute-bucketed derived key so accidental
repeats collapse while a genuine later credit still succeeds.

Evidence (`scripts/verify-admin-phase1.js`, check 5):
```
replay HTTP 200 duplicate=true; balance still 50000;
WalletTransaction rows for this workspace = 1 (expected 1)
```

### A-02 · Plan dropdown offered plans that do not exist — FIXED

`backend/src/services/userManagement.service.js:3` hardcoded:
```js
const PLANS = ['Free', 'Starter', 'Pro', 'Enterprise'];
```
The real seeded catalogue is `Free, Starter, Jump Starter, Early Deployers,
Growth`. So `changeUserPlan` **rejected three plans that actually exist** and
offered two that never have. Plans are admin-editable at runtime, so a constant
could only ever drift again.

Fix: reads the `Plan` table (`listAssignablePlans()`), with the old array kept
only as an empty-table fallback.

Evidence (check 7):
```
API plans=["Free","Starter","Jump Starter","Early Deployers","Growth"]
DB  plans=["Free","Starter","Jump Starter","Early Deployers","Growth"]
```

### A-05 · Banning a user left their session working — FIXED

`banUser` set `banned = true` but did not touch `RefreshToken`. The access token
stays cryptographically valid until expiry, and the refresh token kept minting
new ones, so a banned user continued working. There are 284 live `RefreshToken`
rows in this database.

Fix: ban now revokes all un-revoked refresh tokens and reports the count. Also
added a dedicated `POST /admin/users/:id/force-logout`.

Note: this closes renewal, not the *current* access token, which remains valid
until it expires. True instant revocation needs a token denylist — see A-12.

### A-08 · Live Google API key committed to the repo — OPEN

`backend/scratch/test_raw_api.js:4` contains a hardcoded key
(`AIzaSyDAhaG…`). Pre-existing, committed before this work, and the repo is on
GitHub. Treat the key as compromised: rotate it, then remove the literal.
Purging it from history needs `git filter-repo`.

---

## Medium

### A-06 · No admin action was audited at all — FIXED (Phase 1 scope)

Before this work, ban / unban / delete / plan-change / wallet-credit wrote only
a `logger.info` line. There was no queryable record of who did what, and log
lines are not retained as an audit trail.

Fix: new `AuditLog` model + `services/audit.service.js`; wired into wallet
credit/debit, ban, unban, delete, plan change, force-logout. Deliberately has
**no foreign key to User**, so the trail survives deletion of actor or target.

Remaining mutations still unaudited (later phases): number-pool transitions,
plan CRUD, Meta/Twilio sync.

### A-09 · Unbounded list queries — OPEN

Your spec requires pagination on every list endpoint. These still do
`findMany` with no `take`:

| Location | Query |
|---|---|
| `admin.controller.js` `getNumberPool` | all `NumberPool` rows |
| `admin.controller.js` `listWorkspaces` | all `Workspace` rows (16 today) |
| `platform.controller.js` `adminListPlans` | all `Plan` rows (small, low risk) |
| `adminAnalytics.service.js` `getNumberPoolDetails` | unbounded |
| `billing.controller.js` `getWallet` | `take: 50` — bounded but not paginated |

Low impact at current volume; a real problem on `AgentCallLog` (98 rows today,
unbounded growth). Scheduled for the Call Logs phase.

### A-04 · Roles in the database that the code does not define — OPEN

`ROLES` defines only `Superadmin` and `Member`, but `WorkspaceMember.role`
contains `Admin` (1) and `Viewer` (2). `authorize('Member')` refuses both,
since neither is in the allowed list and neither is `Superadmin`. Those 3 users
may be silently failing member-gated routes. Needs a decision: migrate them to
`Member`, or formally define the roles.

### A-07 · Broken empty migration — FIXED

`backend/prisma/migrations/20260804120000_admin_console/` contained a 0-byte
`migration.sql` plus a `.err` file — an aborted `prisma migrate` attempt. It
would have made `migrate deploy` a no-op for that entry and confused history.
Removed.

### A-12 · Ban/force-logout cannot revoke a live access token — OPEN (design)

Consequence of stateless JWTs: revocation only takes effect at refresh. The
window is `JWT_ACCESS_EXPIRES_IN`. Closing it properly needs a Redis-backed
denylist checked in `authenticate` — but Redis is currently **not reachable** in
this environment (`ECONNREFUSED 127.0.0.1:6379`, falling back to memory), so a
denylist would not survive a restart or work across instances. Flagging rather
than half-building it.

---

## Low

### A-10 · Actor id read from a field that never exists — OPEN (cosmetic)

`admin.controller.js` repeatedly uses `req.user?.id ?? req.user?.userId`. The
JWT payload only ever contains `userId` (`auth.service.js:70`), so the first
operand is always `undefined`. Harmless because of the fallback, but it implies
a shape that does not exist.

### A-11 · Deleting the last Superadmin was possible — FIXED

`deleteUser` had no guard. Deleting the only Superadmin locks every human out
of the panel with no in-product recovery. Now returns 409 and records a
`status: 'failure'` audit row.

---

## Environment notes (not defects)

- **The database is live Supabase with real data** (10 users, 16 workspaces, 32
  agents, 98 call logs, 940 voices). I have deliberately **not** run
  `prisma migrate dev` or `db:reset` against it; the new migration was applied
  with `migrate deploy` and is purely additive (one `CREATE TABLE`).
- **Redis is unreachable**, so rate limiting and queues run in memory-only
  fallback. BullMQ queue-depth reporting in the System/DevOps page will need a
  reachable Redis to show anything real.
- **Razorpay** keys are present in `.env`, but I have not exercised live payment
  capture or refunds. Refund verification will need a test-mode account.
