import prisma from '../config/prisma.js';

// ─── Platform-wide Analytics ──────────────────────────────────────────────────

/**
 * Top-level platform stats: users, agents, workspaces, numbers
 */
export const getPlatformOverview = async () => {
  const [
    totalUsers,
    totalWorkspaces,
    totalAgents,
    totalNumbers,
    availableNumbers,
    assignedNumbers,
  ] = await prisma.$transaction([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.agent.count(),
    prisma.numberPool.count(),
    prisma.numberPool.count({ where: { status: 'AVAILABLE' } }),
    prisma.numberPool.count({ where: { status: 'ASSIGNED' } }),
  ]);

  return {
    totalUsers,
    totalWorkspaces,
    totalAgents,
    totalNumbers,
    availableNumbers,
    assignedNumbers,
  };
};

/**
 * New user signups grouped by day for the last N days
 */
export const getUserSignupChart = async (days = 30) => {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const start = new Date(date.setHours(0, 0, 0, 0));
    const end = new Date(new Date(start).setHours(23, 59, 59, 999));

    const count = await prisma.user.count({
      where: { createdAt: { gte: start, lte: end } },
    });

    result.push({ date: start.toISOString().slice(0, 10), signups: count });
  }
  return result;
};

/**
 * New workspace signups grouped by day for the last N days
 */
export const getWorkspaceGrowthChart = async (days = 30) => {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const start = new Date(date.setHours(0, 0, 0, 0));
    const end = new Date(new Date(start).setHours(23, 59, 59, 999));

    const count = await prisma.workspace.count({
      where: { createdAt: { gte: start, lte: end } },
    });

    result.push({ date: start.toISOString().slice(0, 10), workspaces: count });
  }
  return result;
};

/**
 * Top workspaces by agent count
 */
export const getTopWorkspacesByAgents = async (limit = 10) => {
  const workspaces = await prisma.workspace.findMany({
    include: {
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
 * Recent user signups
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
 * Agents created per day for the last N days
 */
export const getAgentCreationChart = async (days = 30) => {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const start = new Date(date.setHours(0, 0, 0, 0));
    const end = new Date(new Date(start).setHours(23, 59, 59, 999));

    const count = await prisma.agent.count({
      where: { createdAt: { gte: start, lte: end } },
    });

    result.push({ date: start.toISOString().slice(0, 10), agents: count });
  }
  return result;
};

/**
 * Number pool summary with workspace assignment details
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

  const entries = await prisma.numberPool.findMany({
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
  });

  return entries.map(({ accessToken: _omit, ...safe }) => safe);
};
