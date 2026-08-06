// Plans (admin-manageable pricing), Wallet (workspace balance + ledger), and
// the Post-Call delivery executor. Grouped: each is compact and they share
// imports; split into separate files if they grow.
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { sendMail, isMailerConfigured } from '../lib/mailer.js';
import { appendCallRow } from '../services/googleSheets.service.js';
import { createEvent, resolveAppointmentStart } from '../services/googleCalendar.service.js';
import { getWalletRate, setWalletRate, WALLET_RATE_PLAN } from '../services/billing/walletRate.js';

// ─── PLANS ────────────────────────────────────────────────────────────────────
// Seeded from the previously hardcoded Billing.tsx values so behavior matches
// what users already saw — but now admin-editable in one place.
// priceInr / perMinuteInr are the PRICE OF RECORD (this deployment bills INR).
// Seeded at the documented rate (1 USD = 96, VOICE_AGENT_PRICE_PER_MINUTE.md)
// so the seeded economics exactly match what the USD figures used to produce.
// They are NOT rounded to marketing price points here — 3,456 rather than
// 3,499 — because choosing a price is a commercial decision, not something a
// seed should make on someone's behalf. Edit them in Admin Panel -> Plans.
// maxAgents / maxConcurrentCalls are what the pre-call gate enforces; the
// `features` strings are display copy only and gate nothing.
const DEFAULT_PLANS = [
  { name: 'Free',            priceUsd: 0,   priceInr: 0,     perMinuteUsd: 0.12,  perMinuteInr: 11.52, includedMinutes: 10,   kbStorageMb: 50,   maxAgents: 1,   maxConcurrentCalls: 1, sortOrder: 0, features: ['1 agent', 'Web test calls', 'Community support'] },
  { name: 'Starter',         priceUsd: 36,  priceInr: 3456,  perMinuteUsd: 0.085, perMinuteInr: 8.16,  includedMinutes: 471,  kbStorageMb: 200,  maxAgents: 3,   maxConcurrentCalls: 2, sortOrder: 1, features: ['3 agents', 'Voice cloning', 'Email support'] },
  { name: 'Jump Starter',    priceUsd: 89,  priceInr: 8544,  perMinuteUsd: 0.08,  perMinuteInr: 7.68,  includedMinutes: 1112, kbStorageMb: 500,  maxAgents: 10,  maxConcurrentCalls: 5, sortOrder: 2, features: ['10 agents', 'Integrations', 'Priority email support'] },
  { name: 'Early Deployers', priceUsd: 199, priceInr: 19104, perMinuteUsd: 0.075, perMinuteInr: 7.2,   includedMinutes: 2653, kbStorageMb: 1024, maxAgents: 100, maxConcurrentCalls: 20, sortOrder: 3, features: ['Unlimited agents', 'All integrations', 'Priority support'] },
  { name: 'Growth',          priceUsd: 399, priceInr: 38304, perMinuteUsd: 0.07,  perMinuteInr: 6.72,  includedMinutes: 5700, kbStorageMb: 2048, maxAgents: 100, maxConcurrentCalls: 50, sortOrder: 4, features: ['Everything in Early Deployers', 'Dedicated support', 'Custom voices'] },
];

export const ensurePlansSeeded = async () => {
  const count = await prisma.plan.count();
  if (count > 0) return;
  for (const p of DEFAULT_PLANS) {
    await prisma.plan.create({ data: { ...p, features: JSON.stringify(p.features) } });
  }
  logger.info('Seeded default pricing plans');
};

/**
 * Plans created by the integration suites, excluded from EVERY listing.
 *
 * The billing tests need real, ACTIVE plans — subscribe() correctly refuses an
 * inactive one, so they cannot simply be flagged inactive. That left live
 * fixtures like "__test__Growth-7446109f" rendering on the billing and pricing
 * pages while a test run was in flight, and permanently if a run was killed
 * before its cleanup.
 *
 * Filtering by the reserved prefix at the QUERY makes that structurally
 * impossible rather than relying on cleanup always succeeding. Cleanup is still
 * the primary mechanism (`npm run db:clean-test-data`); this is the guarantee.
 *
 * The real fix is a separate test database — see the note in
 * __tests__/README-ish comments — but this holds regardless.
 */
const TEST_PLAN_PREFIXES = ['__test__', 'TestPlan-'];
// The wallet-rate row is a settings squat on the plan table, not a plan — see
// services/billing/walletRate.js. It is filtered at the QUERY so it cannot leak
// into the admin catalogue or the public config endpoint.
const RESERVED_PLAN_NAMES = [WALLET_RATE_PLAN];
const EXCLUDE_TEST_PLANS = {
  AND: TEST_PLAN_PREFIXES.map((prefix) => ({ NOT: { name: { startsWith: prefix } } })),
};

const planDto = (p) => ({ ...p, features: safeJson(p.features, []) });
const safeJson = (v, fb) => { try { return JSON.parse(v); } catch { return fb; } };

// GET /config/plans (public — pricing page)
export const listPlansPublic = async (_req, res) => {
  try {
    await ensurePlansSeeded();
    const plans = await prisma.plan.findMany({ where: { active: true, ...EXCLUDE_TEST_PLANS }, orderBy: { sortOrder: 'asc' } });
    res.json({ plans: plans.map(planDto) });
  } catch (err) {
    logger.error('listPlansPublic failed', err);
    res.status(500).json({ error: 'Failed to load plans' });
  }
};

// Admin CRUD
export const adminListPlans = async (_req, res) => {
  await ensurePlansSeeded();
  const plans = await prisma.plan.findMany({ where: EXCLUDE_TEST_PLANS, orderBy: { sortOrder: 'asc' } });
  res.json({ plans: plans.map(planDto) });
};
export const adminUpsertPlan = async (req, res) => {
  const { id, name, priceUsd, perMinuteUsd, priceInr, perMinuteInr, includedMinutes,
    kbStorageMb, maxAgents, maxConcurrentCalls, features, active, sortOrder } = req.body ?? {};
  if (!name || priceUsd == null || perMinuteUsd == null || includedMinutes == null) {
    return res.status(400).json({ error: 'name, priceUsd, perMinuteUsd, includedMinutes are required' });
  }
  // The prefixes are reserved for test fixtures and filtered out of every
  // listing — a real plan named this way would be invisible to customers, which
  // is a confusing way to fail. Refuse it up front instead.
  if (RESERVED_PLAN_NAMES.includes(String(name))) {
    return res.status(400).json({ error: 'That name is reserved by the platform.' });
  }
  if (TEST_PLAN_PREFIXES.some((prefix) => String(name).startsWith(prefix))) {
    return res.status(400).json({
      error: `Plan names starting with ${TEST_PLAN_PREFIXES.join(' or ')} are reserved for automated tests.`,
    });
  }
  const numOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const data = {
    name, priceUsd: Number(priceUsd), perMinuteUsd: Number(perMinuteUsd),
    // Null (not 0) when omitted, so money.js falls back to USD x FX rather than
    // treating the plan as free.
    priceInr: numOrNull(priceInr), perMinuteInr: numOrNull(perMinuteInr),
    includedMinutes: parseInt(includedMinutes, 10), kbStorageMb: parseInt(kbStorageMb ?? 100, 10),
    maxAgents: parseInt(maxAgents ?? 1, 10), maxConcurrentCalls: parseInt(maxConcurrentCalls ?? 1, 10),
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

// ─── WALLET RATE (the only pricing this deployment has) ──────────────────────

/** GET /config/wallet-rate — public; the landing page quotes this. */
export const getWalletRatePublic = async (_req, res) => {
  try {
    const rate = await getWalletRate();
    res.json({ perMinuteInr: rate.perMinuteInr, currency: 'INR' });
  } catch (err) {
    logger.error('getWalletRatePublic failed', err);
    res.status(500).json({ error: 'Failed to load the rate' });
  }
};

/** GET /admin/wallet-rate */
export const adminGetWalletRate = async (_req, res) => {
  const rate = await getWalletRate();
  res.json({ perMinuteInr: rate.perMinuteInr });
};

/** PUT /admin/wallet-rate — the one number that sets what every call costs. */
export const adminSetWalletRate = async (req, res) => {
  try {
    const rate = await setWalletRate(req.body?.perMinuteInr);
    res.json({ perMinuteInr: rate.perMinuteInr });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to save the rate' });
  }
};

// ─── WALLET ───────────────────────────────────────────────────────────────────
// Moved to controllers/billing.controller.js + services/billing/ (BUG-002).
//
// The previous implementations lived here and mutated balances with a plain
// `prisma.$transaction([...])` array: no row lock, so concurrent settlements
// lost updates; no balanceAfterCents, so the ledger could not be reconciled;
// and no idempotency key, so a retried request charged twice. They are
// deliberately NOT kept as a fallback — a second way to move money is exactly
// how a money system drifts out of audit.

// ─── POST-CALL EXECUTOR ───────────────────────────────────────────────────────
/**
 * Execute an agent's postCallConfigs against a call/chat result.
 * Supported delivery methods: webhook (POST JSON), email (SMTP),
 * googlesheets (append row), googlecalendar (book event from extracted date).
 * Returns per-config delivery results — failures are reported, never hidden.
 *
 * NOTE: postCallConfigs is stored inside the agent's `settings` JSON column
 * (via splitAgentPayload in agent.controller.js), NOT as a direct column.
 */
export const executePostCall = async (agentId, workspaceId, payload) => {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
  if (!agent) return { executed: 0, results: [], error: 'Agent not found' };

  // postCallConfigs lives inside agent.settings, not as a top-level column
  let configs = [];
  try {
    const settings = safeJson(agent.settings, {});
    const raw = settings?.postCallConfigs ?? [];
    configs = Array.isArray(raw) ? raw : [];
  } catch { configs = []; }
  if (configs.length === 0) return { executed: 0, results: [] };

  // Variables extracted from this call, rendered for human-readable delivery.
  const variables = Array.isArray(payload.variables) ? payload.variables : [];
  const variableLines = variables.length
    ? variables.map((v) => `- ${v.key}: ${v.value ?? '(not provided)'}`).join('\n')
    : '(no variables extracted)';

  const results = [];
  for (const cfg of configs) {
    const method = (cfg.deliveryMethod || cfg.method || '').toLowerCase().replace(/[\s_]/g, '');
    // A config can restrict which call outcomes it fires on. Empty/absent means
    // "all outcomes" so existing configs keep working unchanged.
    const triggers = Array.isArray(cfg.triggerStatuses) ? cfg.triggerStatuses : [];
    if (triggers.length && payload.outcome && payload.outcome !== 'test') {
      const matches = triggers.some((t) => String(t).toLowerCase() === String(payload.outcome).toLowerCase());
      if (!matches) {
        results.push({ method: method || 'unknown', ok: true, skipped: true, reason: `Outcome "${payload.outcome}" is not in this config's triggers` });
        continue;
      }
    }
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
          text: `Agent: ${agent.name}\nOutcome: ${payload.outcome ?? 'n/a'}\n\nExtracted information:\n${variableLines}\n\nSummary:\n${payload.summary ?? '(none)'}\n\nTranscript:\n${payload.transcript ?? '(none)'}`,
        });
        results.push({ method: 'email', target: cfg.email, ok: true });
      } else if (method === 'googlesheets' && cfg.spreadsheetId) {
        const out = await appendCallRow(
          workspaceId,
          cfg.spreadsheetId,
          {
            metadata: {
              // 'Call ID' keys the row so re-delivery updates it in place
              // instead of appending a duplicate (see upsertColumn below).
              ...(payload.callId ? { 'Call ID': payload.callId } : {}),
              'Call time': payload.endedAt ?? new Date().toISOString(),
              'Agent': agent.name,
              'Call type': payload.callType ?? '',
              'Outcome': payload.outcome ?? '',
              'Duration (s)': payload.durationSec ?? '',
              'Phone number': payload.phoneNumber ?? '',
            },
            variables,
            upsertColumn: payload.callId ? 'Call ID' : undefined,
          },
          cfg.spreadsheetTab || undefined,
        );
        results.push({ method: 'googlesheets', target: cfg.spreadsheetName || cfg.spreadsheetId, ok: true, ...out });
      } else if (method === 'googlecalendar') {
        // Book an event from the appointment date/time that extraction pulled
        // from the conversation. `dateVariable` names which extracted variable
        // holds the start time; without it we can't know when to book.
        const findVar = (key) => variables.find((v) => String(v.key).toLowerCase() === String(key).toLowerCase())?.value;
        // Resolves the configured variable, a date+time PAIR (what onboarding
        // actually generates), or a plausible appointment variable — see
        // resolveAppointmentStart.
        const resolved = resolveAppointmentStart(variables, cfg);
        if (!resolved) {
          const available = variables.map((v) => v.key).join(', ') || '(none extracted)';
          throw new Error(
            'No appointment date/time to book: could not find an appointment date among the extracted variables. '
            + `Set this destination's date variable to one of: ${available}.`,
          );
        }
        const startValue = resolved.value;
        const out = await createEvent(workspaceId, {
          start: startValue,
          end: cfg.endVariable ? findVar(cfg.endVariable) : undefined,
          durationMin: cfg.durationMin,
          // Per-destination opt-out, for a resource that can take concurrent bookings.
          allowDoubleBooking: cfg.allowDoubleBooking === true,
          timeZone: cfg.timezone || cfg.timeZone,
          calendarId: cfg.calendarId,
          // Default title names the CALLER, not the agent. Every appointment
          // otherwise reads "Appointment — <agent>", so a day's calendar is a
          // column of identical titles that tells the clinic nothing.
          summary: cfg.eventTitle
            || (() => {
              const who = ['patient_name', 'customer_name', 'caller_name', 'name', 'full_name']
                .map((k) => findVar(k)).find((v) => v && String(v).trim());
              return who ? `Appointment — ${String(who).trim()}` : `Appointment — ${agent.name}`;
            })(),
          description: `Booked from call with ${agent.name}.\n\nExtracted information:\n${variableLines}\n\nSummary:\n${payload.summary ?? '(none)'}`,
          attendees: cfg.attendeeVariable ? [findVar(cfg.attendeeVariable)].filter(Boolean) : undefined,
        });
        results.push({ method: 'googlecalendar', target: out.htmlLink || out.id, ok: true, bookedFrom: resolved.from, ...out });
      } else {
        results.push({ method: method || 'unknown', ok: false, error: 'Unsupported or incomplete config' });
      }
    } catch (err) {
      results.push({ method, target: cfg.url || cfg.email || cfg.spreadsheetId, ok: false, error: err.message });
    }
  }
  logger.info({ agentId, results }, 'Post-call delivery executed');
  return { executed: results.length, results };
};

// POST /workspaces/:workspaceId/agents/:agentId/post-call/test
export const testPostCall = async (req, res) => {
  const { workspaceId, agentId } = req.params;
  // Sample values come from the agent's OWN configured variables, so the test
  // row/email matches the shape real calls will produce (and creates the
  // correct Google Sheet header on first run).
  let variables = [];
  try {
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
    const { collectExtractionDefinitions } = await import('../services/postCallExtraction.utils.js');
    variables = collectExtractionDefinitions(agent?.settings).map((d) => ({
      key: d.key,
      description: d.description,
      value: '(sample)',
    }));
  } catch { /* a test without variables is still a valid connectivity check */ }

  const out = await executePostCall(agentId, workspaceId, {
    outcome: 'test',
    callType: 'TEST',
    durationSec: 0,
    summary: req.body?.summary || 'This is a test post-call delivery from the platform.',
    transcript: req.body?.transcript || 'User: Hi\nAgent: Hello! This is a test transcript.',
    variables,
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
      fishaudio: Boolean(process.env.FISH_API_KEY),
      twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
    },
    jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? '2mb',
    nodeEnv: process.env.NODE_ENV,
    time: new Date().toISOString(),
  });
};
