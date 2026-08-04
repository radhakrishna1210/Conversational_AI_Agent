/**
 * Verifies that SUPER_ADMIN_EMAIL is authoritative at LOGIN, not only at signup.
 *
 * Regression guard for A-03: the owner set SUPER_ADMIN_EMAIL, logged in with
 * that address, and still landed on the customer dashboard, because the role
 * was written once at signup and login only re-read the stored value.
 *
 * Uses throwaway users; never touches a real account.
 *
 *   node --env-file=.env scripts/verify-superadmin-role.js
 */
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';

const prisma = new PrismaClient({ log: [] });
const stamp = Date.now();
const OWNER = `verify-owner-${stamp}@local.test`;
const OTHER = `verify-other-${stamp}@local.test`;

const results = [];
const record = (name, pass, evidence) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${evidence}`);
};

/**
 * Run one Google login in a CHILD PROCESS with a chosen SUPER_ADMIN_EMAIL.
 *
 * It has to be a subprocess: `config/env.js` snapshots `process.env` at module
 * load, and re-importing `auth.service.js` with a cache-busting query string
 * still resolves the SAME cached `env.js`. So a second scenario in-process
 * would silently keep the first scenario's value — which is exactly how the
 * first version of this harness produced a false FAIL on demotion. A fresh
 * process gets a fresh module registry and a truthful answer.
 */
const loginWithSuperAdminEmail = (superAdminEmail, email, googleId) => {
  const script = `
    process.env.SUPER_ADMIN_EMAIL = ${JSON.stringify(superAdminEmail)};
    const auth = await import('./src/services/auth.service.js');
    const s = await auth.loginOrRegisterWithGoogle({
      googleId: ${JSON.stringify(googleId)},
      email: ${JSON.stringify(email)},
      name: 'Verify Owner', avatarUrl: null,
    });
    process.stdout.write('TOKEN:' + s.accessToken);
  `;
  const out = execFileSync(process.execPath, ['--env-file=.env', '--input-type=module', '-e', script], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  return out.split('TOKEN:')[1]?.trim();
};

const run = async () => {
  const created = [];
  try {
    // Two users that signed up BEFORE any SUPER_ADMIN_EMAIL was configured —
    // i.e. exactly the state every account in this database is in.
    for (const email of [OWNER, OTHER]) {
      const u = await prisma.user.create({
        data: {
          email, name: `Verify ${email}`,
          workspaces: undefined,
          memberships: {
            create: {
              role: 'Member',
              workspace: { create: { name: `WS ${email}`, slug: `ws-${email.split('@')[0]}` } },
            },
          },
        },
        include: { memberships: true },
      });
      created.push(u);
    }

    const before = await prisma.workspaceMember.findFirst({
      where: { user: { email: OWNER } }, select: { role: true },
    });
    record(
      'Baseline — account created while SUPER_ADMIN_EMAIL was unset is a Member',
      before.role === 'Member',
      `WorkspaceMember.role = "${before.role}"`,
    );

    // ── Promotion: env now names this user ──────────────────────────────────
    const accessToken = loginWithSuperAdminEmail(OWNER, OWNER, `verify-google-${stamp}`);

    const promoted = await prisma.workspaceMember.findFirst({
      where: { user: { email: OWNER } }, select: { role: true },
    });
    record(
      'Promotion — existing Member becomes Superadmin on next login',
      promoted.role === 'Superadmin',
      `DB role "${before.role}" -> "${promoted.role}"`,
    );

    // The JWT the client actually receives must carry the new role, or the UI
    // still renders the customer dashboard.
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
    record(
      'Promotion — issued access token carries role=Superadmin',
      payload.role === 'Superadmin',
      `JWT payload role = "${payload.role}", email = "${payload.email}"`,
    );

    // ── Non-target users are untouched ──────────────────────────────────────
    const other = await prisma.workspaceMember.findFirst({
      where: { user: { email: OTHER } }, select: { role: true },
    });
    record(
      'Isolation — a different account is not promoted',
      other.role === 'Member',
      `${OTHER} role = "${other.role}"`,
    );

    // ── Demotion: ownership transferred to a different address ──────────────
    loginWithSuperAdminEmail(OTHER, OWNER, `verify-google-${stamp}`);
    const demoted = await prisma.workspaceMember.findFirst({
      where: { user: { email: OWNER } }, select: { role: true },
    });
    record(
      'Demotion — stale Superadmin drops to Member when env points elsewhere',
      demoted.role === 'Member',
      `role after re-pointing SUPER_ADMIN_EMAIL: "${promoted.role}" -> "${demoted.role}"`,
    );

    // ── The privilege change is in the audit trail ──────────────────────────
    const trail = await prisma.auditLog.findMany({
      where: { action: 'user.role_change', targetLabel: OWNER },
      orderBy: { createdAt: 'asc' },
      select: { before: true, after: true, category: true, metadata: true },
    });
    record(
      'Audit — both privilege changes are recorded',
      trail.length === 2 && trail[0].category === 'security',
      `${trail.length} rows: ` + trail.map((t) => `${JSON.parse(t.before).role}->${JSON.parse(t.after).role}`).join(', '),
    );
  } finally {
    await prisma.auditLog.deleteMany({ where: { targetLabel: { in: [OWNER, OTHER] } } });
    for (const email of [OWNER, OTHER]) {
      const u = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
      if (!u) continue;
      const wsIds = u.memberships.map((m) => m.workspaceId);
      await prisma.refreshToken.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
      await prisma.workspace.deleteMany({ where: { id: { in: wsIds } } });
    }
    await prisma.$disconnect();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${'='.repeat(66)}\nSuperadmin role reconciliation: ${passed}/${results.length} passed\n${'='.repeat(66)}`);
  process.exit(passed === results.length ? 0 : 1);
};

run().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
