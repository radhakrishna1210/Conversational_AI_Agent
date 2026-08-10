import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';

// ─── Platform-wide Analytics ──────────────────────────────────────────────────

/*
 * ── A note on the two defensive patterns in this file ──
 *
 * prisma/schema.prisma is a superset of what this deployment's database
 * actually has: it still carries the WhatsApp-era models (NumberPool, Contact,
 * Conversation, Message, Template, WhatsappNumber, KeywordTrigger,
 * AutomationFlow, WebhookConfig) and the Meta columns on Workspace and
 * Campaign. None of those tables or columns exist here.
 *
 * That drift used to take the whole admin dashboard down. The console loads its
 * overview with six parallel requests, so one query hitting a missing table
 * collapsed the entire Promise.all into a single "Internal server error" — with
 * no clue which of the six had failed, and no data on a page whose other four
 * queries were perfectly fine.
 *
 * So:
 *   1. Every query names its columns with an explicit `select`. A bare
 *      findMany() asks for every scalar Prisma believes exists, which is how a
 *      query that reads three fields died on `Workspace.metaWabaId`.
 *   2. Anything touching a WhatsApp-era table is wrapped so a missing table
 *      degrades that one figure to null instead of failing the request.
 *
 * `null` deliberately, not 0 — this deployment has no number pool at all, and
 * reporting "0 numbers" would state something false about the platform. The
 * console omits a tile whose value is null.
 *
 * Removing these guards is correct ONLY once the schema and the database
 * agree. Do not "clean this up" before then.
 */

/**
 * Run a query that may target a table this deployment does not have.
 * P2021 = table missing, P2022 = column missing.
 */
const optional = async (label, fn) => {
  try {
    return await fn();
  } catch (err) {
    if (err?.code === 'P2021' || err?.code === 'P2022') {
      logger.warn({ label, code: err.code }, 'admin analytics: skipping query, schema drift');
      return null;
    }
    throw err;
  }
};

/**
 * Top-level platform stats: users, agents, workspaces, numbers.
 */
export const getPlatformOverview = async () => {
  const [totalUsers, totalWorkspaces, totalAgents] = await prisma.$transaction([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.agent.count(),
  ]);

  // The number pool is a WhatsApp-era feature with no table here. Kept as one
  // guarded block so the three figures stay consistent with each other —
  // either all three are real, or all three are null.
  const pool = await optional('numberPool', async () => {
    const [total, available, assigned] = await prisma.$transaction([
      prisma.numberPool.count(),
      prisma.numberPool.count({ where: { status: 'AVAILABLE' } }),
      prisma.numberPool.count({ where: { status: 'ASSIGNED' } }),
    ]);
    return { total, available, assigned };
  });

  return {
    totalUsers,
    totalWorkspaces,
    totalAgents,
    totalNumbers: pool?.total ?? null,
    availableNumbers: pool?.available ?? null,
    assignedNumbers: pool?.assigned ?? null,
  };
};

/**
 * Count rows per day for the last N days, as one query.
 *
 * This replaces a loop that issued one COUNT per day and awaited each in turn.
 * Against a remote database that is N sequential round trips: measured on this
 * deployment, the three charts on the dashboard took 20s, 32s and 36s — about
 * a minute and a half of the dashboard's load, for three numbers each.
 *
 * date_trunc groups server-side in a single pass, and the gaps are filled here
 * so a day with no rows still appears as 0 rather than being absent from the
 * series (which would make the chart lie by compressing quiet days away).
 *
 * `table` is interpolated, never user input — the three callers below pass a
 * literal. It is quoted because the schema uses PascalCase identifiers.
 */
const countByDay = async (table, days, key) => {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const rows = await prisma.$queryRawUnsafe(
    `SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*)::int AS n
       FROM "public"."${table}"
      WHERE "createdAt" >= $1
      GROUP BY day
      ORDER BY day`,
    since,
  );

  const counts = new Map(
    rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), Number(r.n)]),
  );

  const result = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    result.push({ date: iso, [key]: counts.get(iso) ?? 0 });
  }
  return result;
};

/** New user signups grouped by day for the last N days. */
export const getUserSignupChart = (days = 30) => countByDay('User', days, 'signups');

/** New workspaces grouped by day for the last N days. */
export const getWorkspaceGrowthChart = (days = 30) => countByDay('Workspace', days, 'workspaces');

/** Agents created per day for the last N days. */
export const getAgentCreationChart = (days = 30) => countByDay('Agent', days, 'agents');

/**
 * Top workspaces by agent count.
 */
export const getTopWorkspacesByAgents = async (limit = 10) => {
  const workspaces = await prisma.workspace.findMany({
    // Explicit, because the default selection includes the Meta columns this
    // database does not have — which is what made this endpoint 500.
    select: {
      id: true,
      name: true,
      slug: true,
      planName: true,
      createdAt: true,
      _count: { select: { agents: true, members: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return workspaces
    .sort((a, b) => b._count.agents - a._count.agents)
    .slice(0, limit)
    .map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      planName: w.planName,
      agentCount: w._count.agents,
      memberCount: w._count.members,
      createdAt: w.createdAt,
    }));
};

/**
 * Recent user signups.
 */
export const getRecentUsers = async (limit = 20) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      memberships: {
        select: {
          role: true,
          workspace: { select: { name: true, planName: true } },
        },
        take: 1,
      },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
    workspace: u.memberships[0]?.workspace?.name ?? null,
    plan: u.memberships[0]?.workspace?.planName ?? null,
    role: u.memberships[0]?.role ?? null,
  }));
};

/**
 * Number pool summary with workspace assignment details.
 *
 * Returns [] where the table is absent, so the Number Pool page renders its
 * empty state instead of an error — there genuinely are no numbers to show.
 */
export const getNumberPoolDetails = async ({ status, country, search } = {}) => {
  const where = {};

  if (status) where.status = status.toUpperCase();

  if (country) {
    if (country === 'IN') where.phoneNumber = { startsWith: '+91' };
    else if (country === 'US') where.phoneNumber = { startsWith: '+1' };
  }

  if (search) {
    where.phoneNumber = { contains: search };
  }

  const entries = await optional('numberPool.findMany', () =>
    prisma.numberPool.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            agents: { select: { id: true, name: true }, take: 5 },
          },
        },
      },
    }),
  );

  // accessToken is a live credential and must never reach the client.
  return (entries ?? []).map(({ accessToken: _omit, ...safe }) => safe);
};
