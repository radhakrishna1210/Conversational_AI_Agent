import prisma from '../config/prisma.js';

/**
 * Legacy hardcoded plan list, kept ONLY as a fallback for a database with an
 * empty Plan table.
 *
 * It had drifted badly from the real catalogue: the seeded plans are
 * Free / Starter / Jump Starter / Early Deployers / Growth, so this list
 * offered two plans that do not exist (Pro, Enterprise) while `changeUserPlan`
 * rejected three that do. Plans are admin-editable at runtime, so the valid set
 * has to be read from the table — a constant can only ever go stale again.
 */
const FALLBACK_PLANS = ['Free', 'Starter', 'Pro', 'Enterprise'];

/** Plan names assignable right now, newest catalogue state. */
export const listAssignablePlans = async () => {
  const plans = await prisma.plan.findMany({
    where: { active: true, AND: [{ NOT: { name: { startsWith: '__test__' } } }, { NOT: { name: { startsWith: 'TestPlan-' } } }] },
    select: { name: true },
    orderBy: { sortOrder: 'asc' },
  });
  return plans.length ? plans.map((p) => p.name) : FALLBACK_PLANS;
};

// ─── List users with search + filter ─────────────────────────────────────────
export const listUsers = async ({ search = '', status = '', plan = '', page = 1, limit = 20 } = {}) => {
  const where = {};

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
    ];
  }

  if (status === 'banned') where.banned = true;
  else if (status === 'active') where.banned = false;

  if (plan) where.planName = plan;

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        planName: true,
        banned: true,
        bannedAt: true,
        bannedReason: true,
        createdAt: true,
        avatarUrl: true,
        memberships: {
          select: {
            role: true,
            workspace: { select: { id: true, name: true, slug: true } },
          },
          take: 1,
        },
        _count: { select: { memberships: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((u) => ({
      ...u,
      workspace: u.memberships[0]?.workspace ?? null,
      role: u.memberships[0]?.role ?? null,
      workspaceCount: u._count.memberships,
      memberships: undefined,
      _count: undefined,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
};

// ─── Get single user detail ───────────────────────────────────────────────────
export const getUserDetail = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: {
          workspace: {
            include: {
              agents: { select: { id: true, name: true, aiModel: true, createdAt: true } },
              numberPool: { select: { id: true, phoneNumber: true, status: true } },
              _count: { select: { agents: true, campaigns: true, contacts: true } },
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  const { passwordHash: _omit, ...safe } = user;
  return safe;
};

// ─── Ban / Unban ──────────────────────────────────────────────────────────────
export const banUser = async (userId, reason = '') => {
  return prisma.user.update({
    where: { id: userId },
    data: { banned: true, bannedAt: new Date(), bannedReason: reason || null },
    select: { id: true, email: true, banned: true, bannedAt: true, bannedReason: true },
  });
};

export const unbanUser = async (userId) => {
  return prisma.user.update({
    where: { id: userId },
    data: { banned: false, bannedAt: null, bannedReason: null },
    select: { id: true, email: true, banned: true },
  });
};

// ─── Delete user ──────────────────────────────────────────────────────────────
export const deleteUser = async (userId) => {
  // Cascade deletes handle memberships, tokens etc via schema relations
  return prisma.user.delete({ where: { id: userId } });
};

// ─── Change plan ──────────────────────────────────────────────────────────────
export const changeUserPlan = async (userId, planName) => {
  const valid = await listAssignablePlans();
  if (!valid.includes(planName)) {
    throw Object.assign(new Error(`Invalid plan. Must be one of: ${valid.join(', ')}`), { statusCode: 400 });
  }
  return prisma.user.update({
    where: { id: userId },
    data: { planName },
    select: { id: true, email: true, planName: true },
  });
};

export { FALLBACK_PLANS as PLANS };
