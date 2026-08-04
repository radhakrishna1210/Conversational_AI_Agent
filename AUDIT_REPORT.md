# Admin Console — Audit Report

Issues found while reading and extending the existing admin surface. Includes
defects in the **pre-existing** code, not only in what I added.

Status key: **FIXED** (fixed and verified) · **OPEN** (found, not yet fixed) ·
**BLOCKED** (needs something I do not have).

Last updated: 2026-08-04 · Phase 1

---

## Critical

### A-03 · No account could reach the admin panel — FIXED

> **Reproduced by the owner:** `SUPER_ADMIN_EMAIL` was set to
> `theteradhakrishna@gmail.com`, they logged in with that address, and still
> landed on `/dashboard` with no error explaining why. Confirmed in the
> database: that account's `WorkspaceMember.role` was `Member`, because it
> signed up on 2026-07-05 while the variable was still empty.

Role was assigned only by `resolveRole()` in
`backend/src/services/auth.service.js:7`:

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
2. `resolveRole` ran **only at signup / first Google login**. Every login and
   token refresh then re-read the *stored* role
   (`auth.service.js:105-113`), so setting `SUPER_ADMIN_EMAIL` afterwards was
   silently inert — the variable looked configured but changed nothing.

**Fix:** `reconcileSuperAdminRole()` in `auth.service.js`, called from all
three auth entry points (password login, token refresh, Google login). The env
var is now the single source of truth, evaluated on every login rather than
once at signup. It also **demotes** a stale Superadmin when the variable is
pointed at a different address, so ownership can be transferred instead of
accumulating admins.

Deliberately narrow: it only moves a role between `Superadmin` and `Member`,
leaving the legacy `Admin`/`Viewer` rows (A-04) untouched. Every promotion and
demotion writes a `user.role_change` audit row under the `security` category.

Evidence (`scripts/verify-superadmin-role.js`, 6/6):
```
PASS  Baseline — account created while SUPER_ADMIN_EMAIL was unset is a Member
PASS  Promotion — existing Member becomes Superadmin on next login
        DB role "Member" -> "Superadmin"
PASS  Promotion — issued access token carries role=Superadmin
PASS  Isolation — a different account is not promoted
PASS  Demotion — stale Superadmin drops to Member when env points elsewhere
PASS  Audit — both privilege changes are recorded
```

**Action required by the owner:** the fix is evaluated *at login*, so the
existing browser session still holds a JWT minted with `role: "Member"`. Log
out and sign in with Google again (after restarting the backend so it runs the
new code) and the role flips automatically. No manual database edit is needed,
and none was made.

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

### A-13 · Per-call margin is unreportable — no COGS is ever recorded — OPEN

The spec asks for "cost-per-call and per-workspace margin
(`actualCostMicroUsd` vs billed)". That cannot be computed: the column is
**null on all 98 calls**.

`settleCall()` accepts the cost as an option:

```js
export async function settleCall(callLogId, { actualCostMicroUsd = null } = {}) {
```

but all three call sites pass nothing:

| Call site | Call |
|---|---|
| `controllers/agentCallLog.controller.js:123` | `await settleCall(callId)` |
| `ws/twilioMediaRealtime.handler.js:70` | `await settleCall(callLogId)` |
| `ws/webCallRealtime.handler.js:63` | `await settleCall(callLogId)` |

Verified against the database:
```
calls with actualCostMicroUsd set: 0 / 98      (cogs.coveragePct: 0)
```

The schema comment says this is "what makes per-call margin reportable instead
of guessed" — the plumbing exists, nothing fills it. Fixing it means measuring
STT/TTS/LLM spend per call in the voice pipeline and passing it to
`settleCall`, which is real work in the call path, not an admin-panel change.

**The admin UI does not fake this.** The Call Logs page shows an explicit
"Margin is not reportable yet" banner and renders provider cost as
"not measured", rather than dividing by a zero COGS and displaying 100% margin.

### A-15 · One payment can produce two invoices — OPEN (needs your decision)

A plan upgrade paid by card issues **two** invoices for the same payment:

| Source | `paymentOrderId` | Description |
|---|---|---|
| `billing.controller.js:334` (webhook) | set | `Subscription` |
| `subscription.service.js:213` (upgrade) | **null** | `<Plan> (prorated upgrade)` |

`generateInvoice` is idempotent on `paymentOrderId` and that column carries a
UNIQUE index — but the second call passes `null`, so the constraint cannot
catch it. Postgres permits many NULLs under a unique index.

The file's own header states the stakes: *"Two invoices for one payment is a
bookkeeping and tax problem, not just a duplicate row."*

Observed in live data — 3 upgrades produced 6 invoices:

```
INV-2026-000009  subscription  2866014  no-order   <- pairs with 000008
INV-2026-000008  subscription  2866050  anchored
INV-2026-000007  subscription   490007  no-order   <- pairs with 000006
INV-2026-000006  subscription   490013  anchored
INV-2026-000005  subscription   343983  no-order   <- pairs with 000004
INV-2026-000004  subscription   343987  anchored
```

Pairs differ by only a few paise (proration rounding vs the order amount).
Over-documented total: **₹37,000**.

**The wallet ledger is NOT affected.** Verified: each upgrade is a matched
`topup` credit and `subscription` debit, and the audit reconciles
(`balanced: true`). Balances are correct — this is a document-issuance problem,
not a money problem.

**Not fixed, deliberately.** Which document is correct depends on how you
account: one invoice for the payment and one for the service may be intended,
or the proration invoice may be redundant. Deleting or suppressing tax
documents is your call, not a decision a reporting layer should make. The admin
Invoices tab flags them (`suspectedDuplicate`) and explains the cause.

Two further legacy invoices (`Pro Plan`, ₹3,499, Demo Workspace, 2026-03-01)
have **no invoice number at all** — they predate the numbering scheme.
`number` is nullable so this is tolerated; they are flagged `missingNumber`.
Note the duplicate heuristic does not flag *these two as a pair*, because it
requires one side to be payment-anchored and neither is.

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

### A-14 · Call recordings have no duration in the player — OPEN (cosmetic)

`MediaRecorder` writes WebM without a Duration element, because it is
recording a live stream and cannot know the length up front. The browser
therefore reports `duration: NaN` and the scrubber reads `0:00` no matter how
complete the file is.

Verified the audio itself is fine — the files carry valid EBML magic
(`1a45dfa3`) and the element reaches `readyState: 4` (HAVE_ENOUGH_DATA) with
data buffered, so playback works and only the timer is wrong.

Mitigated rather than fixed: the drawer shows the recorded length from
`AgentCallLog.durationSec` beside the player. A real fix means remuxing on
upload (e.g. ffmpeg) to write a proper duration header.

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
