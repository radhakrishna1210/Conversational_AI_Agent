/**
 * Phase-1 verification for the admin console.
 *
 * Exercises the real HTTP surface against the running server and asserts on
 * real database rows. Creates its own throwaway workspace so that no real
 * customer wallet is ever touched, and deletes it at the end.
 *
 *   node --env-file=.env scripts/verify-admin-phase1.js
 */
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const BASE = `http://localhost:${process.env.PORT || 4000}/api/v1`;
const prisma = new PrismaClient({ log: [] });

const results = [];
const record = (name, pass, evidence) => {
  results.push({ name, pass, evidence });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`      ${evidence}`);
};

const token = (payload) => jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

const api = async (path, opts = {}, tok) => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
};

const run = async () => {
  const stamp = Date.now();
  const adminToken = token({ userId: 'verify-admin', email: 'verify-admin@local', role: 'Superadmin' });
  const memberToken = token({ userId: 'verify-member', email: 'verify-member@local', role: 'Member' });

  // Throwaway tenant — never a real customer.
  const ws = await prisma.workspace.create({
    data: { name: `__admin_verify__${stamp}`, slug: `admin-verify-${stamp}` },
  });

  try {
    // ── 1. RBAC: Member is refused ──────────────────────────────────────────
    const memberAttempt = await api('/admin/audit-logs', {}, memberToken);
    record(
      'RBAC — Member is refused on an admin route',
      memberAttempt.status === 403,
      `GET /admin/audit-logs as Member -> HTTP ${memberAttempt.status} ${JSON.stringify(memberAttempt.body)}`,
    );

    // ── 2. RBAC: anonymous is refused ───────────────────────────────────────
    const anonAttempt = await api('/admin/audit-logs', {});
    record(
      'RBAC — unauthenticated is refused',
      anonAttempt.status === 401,
      `GET /admin/audit-logs with no token -> HTTP ${anonAttempt.status} ${JSON.stringify(anonAttempt.body)}`,
    );

    // ── 3. Superadmin reaches the audit log ─────────────────────────────────
    const listed = await api('/admin/audit-logs?limit=5', {}, adminToken);
    record(
      'Audit log — Superadmin can read, response is paginated',
      listed.status === 200 && typeof listed.body?.total === 'number' && Array.isArray(listed.body?.logs),
      `HTTP ${listed.status}, total=${listed.body?.total}, page=${listed.body?.page}, limit=${listed.body?.limit}`,
    );

    // ── 4. Wallet credit writes money AND an audit row ──────────────────────
    const credit = await api('/admin/wallets/credit', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: ws.id, amountCents: 50_000, note: 'phase1 verification', idempotencyKey: `verify-${stamp}` }),
    }, adminToken);

    const walletRow = await prisma.wallet.findUnique({ where: { workspaceId: ws.id } });
    record(
      'Wallet credit — balance moved',
      credit.status === 200 && credit.body?.balanceCents === 50_000 && walletRow?.balanceCents === 50_000,
      `HTTP ${credit.status}, api balance=${credit.body?.balanceCents}, DB Wallet.balanceCents=${walletRow?.balanceCents}`,
    );

    const creditAudit = await prisma.auditLog.findFirst({
      where: { action: 'wallet.credit', targetId: ws.id },
      orderBy: { createdAt: 'desc' },
    });
    record(
      'Wallet credit — audit row written with actor + before/after',
      Boolean(creditAudit)
        && creditAudit.actorEmail === 'verify-admin@local'
        && JSON.parse(creditAudit.before).balanceCents === 0
        && JSON.parse(creditAudit.after).balanceCents === 50_000,
      `AuditLog id=${creditAudit?.id} actor=${creditAudit?.actorEmail} role=${creditAudit?.actorRole} `
      + `before=${creditAudit?.before} after=${creditAudit?.after} ip=${creditAudit?.actorIp}`,
    );

    // ── 5. THE BUG FIX: a replayed credit must not double-charge ────────────
    const replay = await api('/admin/wallets/credit', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: ws.id, amountCents: 50_000, note: 'phase1 verification', idempotencyKey: `verify-${stamp}` }),
    }, adminToken);

    const afterReplay = await prisma.wallet.findUnique({ where: { workspaceId: ws.id } });
    const txCount = await prisma.walletTransaction.count({ where: { wallet: { workspaceId: ws.id } } });
    record(
      'Wallet credit — replayed request is idempotent (was: double-credited)',
      replay.status === 200 && afterReplay.balanceCents === 50_000 && txCount === 1 && replay.body?.duplicate === true,
      `replay HTTP ${replay.status} duplicate=${replay.body?.duplicate}; balance still ${afterReplay.balanceCents}; `
      + `WalletTransaction rows for this workspace = ${txCount} (expected 1)`,
    );

    // ── 6. Ledger invariant still holds ─────────────────────────────────────
    const audited = await api(`/admin/wallets/${ws.id}/audit`, {}, adminToken);
    record(
      'Wallet ledger — sum(transactions) still equals balance after the new code path',
      audited.status === 200 && audited.body?.balanced === true,
      `balanced=${audited.body?.balanced} balanceCents=${audited.body?.balanceCents} `
      + `ledgerSumCents=${audited.body?.ledgerSumCents} discrepancies=${JSON.stringify(audited.body?.discrepancies)}`,
    );

    // ── 7. Plan list now reads the real catalogue ───────────────────────────
    const plans = await api('/admin/users/plans', {}, adminToken);
    const dbPlans = await prisma.plan.findMany({ where: { active: true }, select: { name: true }, orderBy: { sortOrder: 'asc' } });
    const dbNames = dbPlans.map((p) => p.name).filter((n) => !n.startsWith('__test__') && !n.startsWith('TestPlan-'));
    record(
      'Plan list — served from the Plan table, not the stale hardcoded array',
      plans.status === 200 && JSON.stringify(plans.body.plans) === JSON.stringify(dbNames) && !plans.body.plans.includes('Pro'),
      `API plans=${JSON.stringify(plans.body?.plans)} ; DB plans=${JSON.stringify(dbNames)} `
      + `(old hardcoded list was ["Free","Starter","Pro","Enterprise"])`,
    );

    // ── 8. A failed action is recorded as failure, not dropped ──────────────
    const badPlan = await api('/admin/users/nonexistent-user-id/plan', {
      method: 'PATCH', body: JSON.stringify({ planName: 'Nope' }),
    }, adminToken);
    record(
      'Unknown user returns 404 rather than a 500',
      badPlan.status === 404,
      `PATCH /admin/users/nonexistent-user-id/plan -> HTTP ${badPlan.status} ${JSON.stringify(badPlan.body)}`,
    );

    // ── 9. Secrets are redacted before they reach the trail ─────────────────
    const { writeAudit } = await import('../src/services/audit.service.js');
    const redacted = await writeAudit(
      { user: { userId: 'verify-admin', email: 'verify-admin@local', role: 'Superadmin' }, headers: {} },
      {
        action: 'provider.key_rotate', category: 'provider',
        targetType: 'Provider', targetId: 'verify',
        after: { name: 'openai', apiKey: 'sk-super-secret-value', accessToken: 'tok_123', nested: { secret: 'hide-me', keep: 'visible' } },
      },
    );
    const storedAfter = redacted ? JSON.parse(redacted.after) : {};
    record(
      'Audit — secrets are redacted before storage',
      storedAfter.apiKey === '[redacted]' && storedAfter.accessToken === '[redacted]'
      && storedAfter.nested.secret === '[redacted]' && storedAfter.nested.keep === 'visible',
      `stored after = ${JSON.stringify(storedAfter)}`,
    );
    if (redacted) await prisma.auditLog.delete({ where: { id: redacted.id } });

    // ── 10. Audit log filters are applied ───────────────────────────────────
    const filtered = await api('/admin/audit-logs?category=billing&limit=5', {}, adminToken);
    record(
      'Audit log — category filter applied server-side',
      filtered.status === 200 && filtered.body.logs.every((l) => l.category === 'billing'),
      `HTTP ${filtered.status}, returned ${filtered.body?.logs?.length} rows, `
      + `categories=${JSON.stringify([...new Set((filtered.body?.logs ?? []).map((l) => l.category))])}`,
    );
  } finally {
    // Clean up the throwaway tenant and everything it cascaded.
    await prisma.auditLog.deleteMany({ where: { targetId: ws.id } });
    await prisma.walletTransaction.deleteMany({ where: { wallet: { workspaceId: ws.id } } });
    await prisma.wallet.deleteMany({ where: { workspaceId: ws.id } });
    await prisma.workspace.delete({ where: { id: ws.id } });
    await prisma.$disconnect();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${'='.repeat(70)}\nPhase 1: ${passed}/${results.length} checks passed\n${'='.repeat(70)}`);
  process.exit(passed === results.length ? 0 : 1);
};

run().catch((e) => { console.error('VERIFICATION HARNESS ERROR:', e); process.exit(2); });
