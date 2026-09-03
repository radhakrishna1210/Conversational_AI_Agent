#!/usr/bin/env node
/**
 * Remove data left behind by the billing integration tests.
 *
 * The suites clean up in an after() hook, but a run killed mid-flight (timeout,
 * Ctrl-C, CI cancellation) leaves orphans — and an orphaned Plan is not
 * cosmetic: listPlansPublic serves active plans to the PUBLIC pricing page, so
 * "__test__Growth-a1b2c3d4" would be shown to real customers.
 *
 * Matches only the deliberately unmistakable fixture names, so it can never
 * touch a real plan or workspace:
 *   plans      __test__* and TestPlan-<hex8>
 *   workspaces billing-test-*, settle-*, sub-*, dbg-*
 *
 * NEVER run this against a production database.
 *
 *   node --env-file=.env scripts/clean-test-data.js [--dry-run]
 */

import { PrismaClient } from '@prisma/client';

// ── Production guard ─────────────────────────────────────────────────────────
// The live database was contaminated because the integration suites ran with
// DATABASE_URL pointing at it. This script is destructive by design, so it
// refuses a URL that looks like a hosted/production database unless the
// operator says, on the command line, that they have a fresh backup:
//   --i-have-a-fresh-backup-of-production
// and --dry-run always works and only prints what would go.
const url = process.env.DATABASE_URL || '';
const looksProduction = /supabase\.co|supabase\.com|pooler|amazonaws|render\.com|neon\.tech|prod/i.test(url);
const backupFlag = process.argv.includes('--i-have-a-fresh-backup-of-production');
const dryRun = process.argv.includes('--dry-run');
if (looksProduction && !dryRun && !backupFlag) {
  console.error(`Refusing to delete from "${url.replace(/:[^:@/]+@/, ':***@')}": it looks like a production database.\n`
    + 'Run with --dry-run to see what would go, take a fresh backup, then re-run with --i-have-a-fresh-backup-of-production.');
  process.exit(3);
}

const prisma = new PrismaClient();

// Workspace slug prefixes that are unmistakably fixtures. `__test__` is the
// prefix the 2026-09-03 audit found on 131 of 182 live workspaces; it was NOT
// covered before, so this script would have removed none of them. Extend with
// CLEAN_TEST_WS_PREFIXES=a-,b- (comma separated) without editing the file.
const WS_PREFIXES = [
  'billing-test-', 'settle-', 'sub-', 'dbg-', '__test__',
  ...String(process.env.CLEAN_TEST_WS_PREFIXES || '').split(',').map((s) => s.trim()).filter(Boolean),
];
const isTestPlan = (name) => name.startsWith('__test__') || /^TestPlan-[0-9a-f]{8}$/.test(name);

async function main() {
  const workspaces = await prisma.workspace.findMany({
    where: { OR: WS_PREFIXES.map((slug) => ({ slug: { startsWith: slug } })) },
    select: { id: true, slug: true },
  });
  const plans = (await prisma.plan.findMany({ select: { id: true, name: true } })).filter((p) => isTestPlan(p.name));

  console.log(`Found ${workspaces.length} test workspace(s), ${plans.length} test plan(s).`);
  if (dryRun) {
    workspaces.forEach((w) => console.log('  ws   ', w.slug));
    plans.forEach((p) => console.log('  plan ', p.name));
    console.log('\n--dry-run: nothing deleted.');
    return;
  }

  for (const ws of workspaces) {
    await prisma.subscription.deleteMany({ where: { workspaceId: ws.id } });
    await prisma.invoice.deleteMany({ where: { workspaceId: ws.id } });
    await prisma.paymentOrder.deleteMany({ where: { workspaceId: ws.id } });
    // Wallet has no FK to Workspace, so it and its ledger need explicit removal.
    const wallet = await prisma.wallet.findUnique({ where: { workspaceId: ws.id } });
    if (wallet) {
      await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
    }
    await prisma.agentCallLog.deleteMany({ where: { workspaceId: ws.id } });
    await prisma.callTransfer.deleteMany({ where: { workspaceId: ws.id } }).catch(() => {});
    await prisma.agent.deleteMany({ where: { workspaceId: ws.id } });
    // Memberships cascade with the workspace; a fixture USER that belongs to
    // no other workspace is removed too, so the audit's "37/65 users" stops
    // being true after one run rather than after two.
    const members = await prisma.workspaceMember.findMany({ where: { workspaceId: ws.id }, select: { userId: true } });
    await prisma.workspace.delete({ where: { id: ws.id } }).catch(() => {});
    for (const { userId } of members) {
      const others = await prisma.workspaceMember.count({ where: { userId } });
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!others && user && /__test__|@test\.local$|@example\.com$/i.test(user.email)) {
        await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      }
    }
  }

  let removed = 0;
  for (const plan of plans) {
    // A plan still referenced by a surviving subscription is left alone rather
    // than force-deleted; the FK is RESTRICT for a reason.
    try { await prisma.plan.delete({ where: { id: plan.id } }); removed++; }
    catch (e) { console.warn(`  kept ${plan.name} (${e.code ?? e.message})`); }
  }

  console.log(`Removed ${workspaces.length} workspace(s), ${removed} plan(s).`);
  const survivors = await prisma.plan.findMany({ select: { name: true }, orderBy: { sortOrder: 'asc' } });
  console.log('Remaining plans:', survivors.map((p) => p.name).join(', '));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
