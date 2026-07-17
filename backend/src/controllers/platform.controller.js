// Plans (admin-manageable pricing), Wallet (workspace balance + ledger), and
// the Post-Call delivery executor. Grouped: each is compact and they share
// imports; split into separate files if they grow.
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { sendMail, isMailerConfigured } from '../lib/mailer.js';

// ─── PLANS ────────────────────────────────────────────────────────────────────
// Seeded from the previously hardcoded Billing.tsx values so behavior matches
// what users already saw — but now admin-editable in one place.
const DEFAULT_PLANS = [
  { name: 'Free',            priceUsd: 0,   perMinuteUsd: 0.12,  includedMinutes: 10,   kbStorageMb: 50,   sortOrder: 0, features: ['1 agent', 'Web test calls', 'Community support'] },
  { name: 'Starter',         priceUsd: 36,  perMinuteUsd: 0.085, includedMinutes: 471,  kbStorageMb: 200,  sortOrder: 1, features: ['3 agents', 'Voice cloning', 'Email support'] },
  { name: 'Jump Starter',    priceUsd: 89,  perMinuteUsd: 0.08,  includedMinutes: 1112, kbStorageMb: 500,  sortOrder: 2, features: ['10 agents', 'Integrations', 'Priority email support'] },
  { name: 'Early Deployers', priceUsd: 199, perMinuteUsd: 0.075, includedMinutes: 2653, kbStorageMb: 1024, sortOrder: 3, features: ['Unlimited agents', 'All integrations', 'Priority support'] },
  { name: 'Growth',          priceUsd: 399, perMinuteUsd: 0.07,  includedMinutes: 5700, kbStorageMb: 2048, sortOrder: 4, features: ['Everything in Early Deployers', 'Dedicated support', 'Custom voices'] },
];

export const ensurePlansSeeded = async () => {
  const count = await prisma.plan.count();
  if (count > 0) return;
  for (const p of DEFAULT_PLANS) {
    await prisma.plan.create({ data: { ...p, features: JSON.stringify(p.features) } });
  }
  logger.info('Seeded default pricing plans');
};

const planDto = (p) => ({ ...p, features: safeJson(p.features, []) });
const safeJson = (v, fb) => { try { return JSON.parse(v); } catch { return fb; } };

// GET /config/plans (public — pricing page)
export const listPlansPublic = async (_req, res) => {
  try {
    await ensurePlansSeeded();
    const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    res.json({ plans: plans.map(planDto) });
  } catch (err) {
    logger.error('listPlansPublic failed', err);
    res.status(500).json({ error: 'Failed to load plans' });
  }
};

// Admin CRUD
export const adminListPlans = async (_req, res) => {
  await ensurePlansSeeded();
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json({ plans: plans.map(planDto) });
};
export const adminUpsertPlan = async (req, res) => {
  const { id, name, priceUsd, perMinuteUsd, includedMinutes, kbStorageMb, features, active, sortOrder } = req.body ?? {};
  if (!name || priceUsd == null || perMinuteUsd == null || includedMinutes == null) {
    return res.status(400).json({ error: 'name, priceUsd, perMinuteUsd, includedMinutes are required' });
  }
  const data = {
    name, priceUsd: Number(priceUsd), perMinuteUsd: Number(perMinuteUsd),
    includedMinutes: parseInt(includedMinutes, 10), kbStorageMb: parseInt(kbStorageMb ?? 100, 10),
    features: JSON.stringify(Array.isArray(features) ? features : []),
    active: active !== false, sortOrder: parseInt(sortOrder ?? 0, 10),
  };
  const plan = id
    ? await prisma.plan.update({ where: { id }, data })
    : await prisma.plan.create({ data });
  res.status(id ? 200 : 201).json({ plan: planDto(plan) });
};
export const adminDeletePlan = async (req, res) => {
  const del = await prisma.plan.deleteMany({ where: { id: req.params.id } });
  if (del.count === 0) return res.status(404).json({ error: 'Plan not found' });
  res.json({ success: true });
};

// ─── WALLET ───────────────────────────────────────────────────────────────────
const getOrCreateWallet = async (workspaceId) =>
  prisma.wallet.upsert({ where: { workspaceId }, update: {}, create: { workspaceId } });

// GET /workspaces/:workspaceId/wallet
export const getWallet = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.params.workspaceId);
    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 50,
    });
    res.json({
      balanceCents: wallet.balanceCents, currency: wallet.currency,
      transactions,
      // Honest capability flag: no payment gateway is integrated yet, so the
      // client shows "top-up unavailable" instead of a dead button.
      topUpAvailable: false,
      topUpUnavailableReason: 'Online payments (UPI/Stripe/Razorpay) are not configured yet. An admin can credit your wallet manually.',
    });
  } catch (err) {
    logger.error('getWallet failed', err);
    res.status(500).json({ error: 'Failed to load wallet' });
  }
};

// POST /admin/wallets/credit  { workspaceId, amountCents, note }
export const adminCreditWallet = async (req, res) => {
  const { workspaceId, amountCents, note } = req.body ?? {};
  const amount = parseInt(amountCents, 10);
  if (!workspaceId || !Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ error: 'workspaceId and a non-zero integer amountCents are required' });
  }
  try {
    const wallet = await getOrCreateWallet(workspaceId);
    const [updated] = await prisma.$transaction([
      prisma.wallet.update({ where: { id: wallet.id }, data: { balanceCents: { increment: amount } } }),
      prisma.walletTransaction.create({
        data: { walletId: wallet.id, amountCents: amount, type: 'admin_credit', note: note || null, createdById: req.user?.userId ?? null },
      }),
    ]);
    res.json({ balanceCents: updated.balanceCents });
  } catch (err) {
    logger.error('adminCreditWallet failed', err);
    res.status(500).json({ error: 'Failed to credit wallet' });
  }
};

// ─── POST-CALL EXECUTOR ───────────────────────────────────────────────────────
/**
 * Execute an agent's postCallConfigs against a call/chat result.
 * Supported delivery methods: webhook (POST JSON), email (SMTP).
 * Returns per-config delivery results — failures are reported, never hidden.
 */
export const executePostCall = async (agentId, workspaceId, payload) => {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
  if (!agent) return { executed: 0, results: [], error: 'Agent not found' };

  let configs = [];
  try {
    const parsed = JSON.parse(agent.postCallConfigs ?? '[]');
    configs = Array.isArray(parsed) ? parsed : [];
  } catch { configs = []; }
  if (configs.length === 0) return { executed: 0, results: [] };

  const results = [];
  for (const cfg of configs) {
    const method = (cfg.deliveryMethod || cfg.method || '').toLowerCase();
    try {
      if (method === 'webhook' && cfg.url) {
        const r = await fetch(cfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, agentName: agent.name, ...payload }),
          signal: AbortSignal.timeout(10_000),
        });
        results.push({ method: 'webhook', target: cfg.url, ok: r.ok, status: r.status });
      } else if (method === 'email' && cfg.email) {
        if (!isMailerConfigured()) throw new Error('SMTP not configured');
        await sendMail({
          to: cfg.email,
          subject: `Post-call summary — ${agent.name}`,
          text: `Agent: ${agent.name}\nOutcome: ${payload.outcome ?? 'n/a'}\n\nSummary:\n${payload.summary ?? '(none)'}\n\nTranscript:\n${payload.transcript ?? '(none)'}`,
        });
        results.push({ method: 'email', target: cfg.email, ok: true });
      } else {
        results.push({ method: method || 'unknown', ok: false, error: 'Unsupported or incomplete config' });
      }
    } catch (err) {
      results.push({ method, target: cfg.url || cfg.email, ok: false, error: err.message });
    }
  }
  logger.info({ agentId, results }, 'Post-call delivery executed');
  return { executed: results.length, results };
};

// POST /workspaces/:workspaceId/agents/:agentId/post-call/test
export const testPostCall = async (req, res) => {
  const { workspaceId, agentId } = req.params;
  const out = await executePostCall(agentId, workspaceId, {
    outcome: 'test',
    summary: req.body?.summary || 'This is a test post-call delivery from the platform.',
    transcript: req.body?.transcript || 'User: Hi\nAgent: Hello! This is a test transcript.',
    endedAt: new Date().toISOString(),
  });
  if (out.error) return res.status(404).json({ error: out.error });
  const failures = out.results.filter((r) => !r.ok);
  res.status(failures.length && failures.length === out.results.length ? 502 : 200).json(out);
};

// ─── ADMIN SYSTEM HEALTH (#18) ───────────────────────────────────────────────
export const adminHealth = async (_req, res) => {
  let db = 'unknown';
  try { await prisma.$queryRaw`SELECT 1`; db = 'connected'; } catch { db = 'unreachable'; }
  res.json({
    db,
    migrations: process.env.DB_MIGRATIONS ?? 'unknown',
    redis: process.env.REDIS_URL ? (globalThis.__REDIS_STATUS__ ?? 'configured') : 'not configured (memory fallback)',
    providers: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      sarvam: Boolean(process.env.SARVAM_API_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
    },
    jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? '2mb',
    nodeEnv: process.env.NODE_ENV,
    time: new Date().toISOString(),
  });
};
