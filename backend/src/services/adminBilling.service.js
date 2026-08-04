// backend/src/services/adminBilling.service.js
/**
 * Cross-tenant billing visibility for the admin console.
 *
 * STRICTLY READ-ONLY. Nothing here mutates a subscription, a payment, an
 * invoice or a balance. Money moves through wallet.service /
 * subscription.service / the Razorpay webhook and nowhere else — a reporting
 * layer that can also write is how a second, unaudited path into the ledger
 * gets created.
 *
 * Every list is paginated. WalletTransaction and PaymentOrder grow forever.
 */

import prisma from '../config/prisma.js';

const MAX_LIMIT = 100;
const clampTake = (limit, fallback = 25) =>
  Math.min(Math.max(parseInt(limit, 10) || fallback, 1), MAX_LIMIT);
const clampPage = (page) => Math.max(parseInt(page, 10) || 1, 1);

/** Batch-load workspace labels for rows that only carry a workspaceId. */
const withWorkspaces = async (rows, key = 'workspaceId') => {
  const ids = [...new Set(rows.map((r) => r[key]).filter(Boolean))];
  if (!ids.length) return rows.map((r) => ({ ...r, workspace: null }));
  const list = await prisma.workspace.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, slug: true, planName: true },
  });
  const byId = new Map(list.map((w) => [w.id, w]));
  // Null, not a placeholder name: a deleted workspace's payments still exist
  // and must stay visible rather than being silently attributed.
  return rows.map((r) => ({ ...r, workspace: byId.get(r[key]) ?? null }));
};

// ─── Overview ────────────────────────────────────────────────────────────────

/**
 * Platform billing headline figures.
 *
 * MRR is computed from ACTIVE subscriptions' plan prices, not from historical
 * payments — recurring revenue is what the subscriptions commit to, and
 * summing past payments would count one-off top-ups as recurring.
 */
export async function getBillingOverview() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [activeSubs, subsByStatus, paidToday, paidMonth, failedMonth, wallets, ordersByStatus] =
    await Promise.all([
      prisma.subscription.findMany({
        where: { status: 'active' },
        select: { planName: true, billingPeriod: true, plan: { select: { priceInr: true, priceUsd: true } } },
      }),
      prisma.subscription.groupBy({ by: ['status'], _count: true }),
      prisma.paymentOrder.aggregate({
        where: { status: 'paid', paidAt: { gte: startOfDay } }, _sum: { amountCents: true }, _count: true,
      }),
      prisma.paymentOrder.aggregate({
        where: { status: 'paid', paidAt: { gte: startOfMonth } }, _sum: { amountCents: true }, _count: true,
      }),
      prisma.paymentOrder.count({ where: { status: 'failed', createdAt: { gte: startOfMonth } } }),
      prisma.wallet.aggregate({ _sum: { balanceCents: true }, _count: true }),
      prisma.paymentOrder.groupBy({ by: ['status'], _count: true, _sum: { amountCents: true } }),
    ]);

  // priceInr is the price of record; fall back to USD x FX only when a plan
  // predates INR pricing (money.js does the same).
  const fx = Number(process.env.FX_USD_TO_INR) || 96;
  const mrrCents = activeSubs.reduce((acc, s) => {
    const inr = s.plan?.priceInr ?? (s.plan?.priceUsd ?? 0) * fx;
    const monthly = s.billingPeriod === 'yearly' ? inr / 12 : inr;
    return acc + Math.round(monthly * 100);
  }, 0);

  return {
    mrrCents,
    activeSubscriptions: activeSubs.length,
    subscriptionsByStatus: Object.fromEntries(subsByStatus.map((s) => [s.status, s._count])),
    revenueTodayCents: paidToday._sum.amountCents ?? 0,
    paymentsToday: paidToday._count ?? 0,
    revenueMonthCents: paidMonth._sum.amountCents ?? 0,
    paymentsMonth: paidMonth._count ?? 0,
    failedPaymentsMonth: failedMonth,
    walletCount: wallets._count ?? 0,
    walletFloatCents: wallets._sum.balanceCents ?? 0,
    ordersByStatus: Object.fromEntries(
      ordersByStatus.map((o) => [o.status, { count: o._count, amountCents: o._sum.amountCents ?? 0 }]),
    ),
  };
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export async function listSubscriptions({ page = 1, limit = 25, status = '', planName = '', autoRenew = '' } = {}) {
  const take = clampTake(limit);
  const currentPage = clampPage(page);

  const where = {};
  if (status) where.status = status;
  if (planName) where.planName = planName;
  if (autoRenew === 'true') where.autoRenew = true;
  if (autoRenew === 'false') where.autoRenew = false;

  const [rows, total] = await prisma.$transaction([
    prisma.subscription.findMany({
      where,
      orderBy: { currentPeriodEnd: 'asc' },
      skip: (currentPage - 1) * take,
      take,
      include: { plan: { select: { name: true, priceInr: true, priceUsd: true, includedMinutes: true } } },
    }),
    prisma.subscription.count({ where }),
  ]);

  const hydrated = await withWorkspaces(rows);

  return {
    subscriptions: hydrated.map((s) => ({
      id: s.id,
      workspaceId: s.workspaceId,
      workspace: s.workspace,
      planName: s.planName,
      status: s.status,
      billingPeriod: s.billingPeriod,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      autoRenew: s.autoRenew,
      minutesIncluded: s.minutesIncluded,
      minutesUsed: s.minutesUsed,
      // Surfaced so an operator can spot an account about to blow past its
      // allowance before the wallet starts absorbing the overage.
      minutesUsedPct: s.minutesIncluded > 0
        ? Number(((s.minutesUsed / s.minutesIncluded) * 100).toFixed(1))
        : null,
      razorpaySubscriptionId: s.razorpaySubscriptionId,
      plan: s.plan,
    })),
    total, page: currentPage, limit: take, pages: Math.ceil(total / take),
  };
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function listPayments({ page = 1, limit = 25, status = '', purpose = '', workspaceId = '' } = {}) {
  const take = clampTake(limit);
  const currentPage = clampPage(page);

  const where = {};
  if (status) where.status = status;
  if (purpose) where.purpose = purpose;
  if (workspaceId) where.workspaceId = workspaceId;

  const [rows, total] = await prisma.$transaction([
    prisma.paymentOrder.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (currentPage - 1) * take, take,
    }),
    prisma.paymentOrder.count({ where }),
  ]);

  const hydrated = await withWorkspaces(rows);

  return {
    payments: hydrated.map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      workspace: p.workspace,
      provider: p.provider,
      providerOrderId: p.providerOrderId,
      providerPaymentId: p.providerPaymentId,
      amountCents: p.amountCents,
      currency: p.currency,
      purpose: p.purpose,
      status: p.status,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
    })),
    total, page: currentPage, limit: take, pages: Math.ceil(total / take),
  };
}

// ─── Invoices ────────────────────────────────────────────────────────────────

/**
 * Invoice list, with duplicate detection.
 *
 * `generateInvoice` is idempotent on `paymentOrderId`, but the subscription
 * upgrade path issues a second invoice with a NULL paymentOrderId
 * (subscription.service.js:213) for the same payment the webhook already
 * invoiced. The unique index cannot catch that, so one payment can produce two
 * tax documents (see A-15).
 *
 * `suspectedDuplicate` flags an invoice that has no payment anchor while
 * another invoice for the same workspace, same type and a near-identical
 * amount exists within a day. It is a REPORTING aid, deliberately not an
 * automatic correction — deleting a tax document is not something a listing
 * endpoint should decide.
 */
export async function listInvoices({ page = 1, limit = 25, type = '', workspaceId = '', status = '' } = {}) {
  const take = clampTake(limit);
  const currentPage = clampPage(page);

  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (workspaceId) where.workspaceId = workspaceId;

  const [rows, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where, orderBy: { invoiceDate: 'desc' }, skip: (currentPage - 1) * take, take,
    }),
    prisma.invoice.count({ where }),
  ]);

  // Compare only against the same page's workspaces, bounded.
  const wsIds = [...new Set(rows.map((r) => r.workspaceId))];
  const neighbours = wsIds.length
    ? await prisma.invoice.findMany({
      where: { workspaceId: { in: wsIds } },
      select: { id: true, workspaceId: true, type: true, amountCents: true, invoiceDate: true, paymentOrderId: true },
      take: 500,
    })
    : [];

  const DAY = 86_400_000;
  const isDuplicate = (inv) => {
    if (inv.paymentOrderId) return false; // anchored to a real payment
    return neighbours.some((n) =>
      n.id !== inv.id
      && n.workspaceId === inv.workspaceId
      && n.type === inv.type
      && Boolean(n.paymentOrderId)
      // Proration rounding makes the pair differ by a few minor units.
      && Math.abs(n.amountCents - inv.amountCents) <= 100
      && Math.abs(new Date(n.invoiceDate) - new Date(inv.invoiceDate)) < DAY);
  };

  const hydrated = await withWorkspaces(rows);

  return {
    invoices: hydrated.map((i) => ({
      id: i.id,
      number: i.number,
      workspaceId: i.workspaceId,
      workspace: i.workspace,
      planName: i.planName,
      type: i.type,
      status: i.status,
      amountCents: i.amountCents,
      subtotalCents: i.subtotalCents,
      taxCents: i.taxCents,
      currency: i.currency,
      invoiceDate: i.invoiceDate,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      paymentOrderId: i.paymentOrderId,
      suspectedDuplicate: isDuplicate(i),
      // Legacy rows predating the numbering scheme; surfaced rather than hidden.
      missingNumber: !i.number,
    })),
    total, page: currentPage, limit: take, pages: Math.ceil(total / take),
  };
}

// ─── Wallets ─────────────────────────────────────────────────────────────────

export async function listWallets({ page = 1, limit = 25 } = {}) {
  const take = clampTake(limit);
  const currentPage = clampPage(page);

  const [rows, total] = await prisma.$transaction([
    prisma.wallet.findMany({ orderBy: { balanceCents: 'desc' }, skip: (currentPage - 1) * take, take }),
    prisma.wallet.count(),
  ]);

  const hydrated = await withWorkspaces(rows);

  return {
    wallets: hydrated.map((w) => ({
      id: w.id,
      workspaceId: w.workspaceId,
      workspace: w.workspace,
      balanceCents: w.balanceCents,
      currency: w.currency,
      overdraftLimitCents: w.overdraftLimitCents,
      updatedAt: w.updatedAt,
    })),
    total, page: currentPage, limit: take, pages: Math.ceil(total / take),
  };
}

/** Paginated ledger for one workspace. Replaces the previous unbounded read. */
export async function getWalletLedger({ workspaceId, page = 1, limit = 25, type = '' } = {}) {
  const take = clampTake(limit);
  const currentPage = clampPage(page);

  const wallet = await prisma.wallet.findUnique({ where: { workspaceId } });
  if (!wallet) return null;

  const where = { walletId: wallet.id };
  if (type) where.type = type;

  const [rows, total] = await prisma.$transaction([
    prisma.walletTransaction.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (currentPage - 1) * take, take,
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return {
    wallet: {
      workspaceId,
      balanceCents: wallet.balanceCents,
      currency: wallet.currency,
      overdraftLimitCents: wallet.overdraftLimitCents,
    },
    transactions: rows.map((t) => ({
      id: t.id,
      amountCents: t.amountCents,
      balanceAfterCents: t.balanceAfterCents,
      type: t.type,
      note: t.note,
      idempotencyKey: t.idempotencyKey,
      fxRateUsdToInr: t.fxRateUsdToInr,
      createdAt: t.createdAt,
      metadata: (() => { try { return JSON.parse(t.metadata); } catch { return {}; } })(),
    })),
    total, page: currentPage, limit: take, pages: Math.ceil(total / take),
  };
}
