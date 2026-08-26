// Plans (admin-manageable pricing), Wallet (workspace balance + ledger), and
// the Post-Call delivery executor. Grouped: each is compact and they share
// imports; split into separate files if they grow.
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { sendMail, isMailerConfigured } from '../lib/mailer.js';
import { appendCallRow } from '../services/googleSheets.service.js';
import { createEvent, resolveAppointmentStart } from '../services/googleCalendar.service.js';
import { getWalletRate, setWalletRate, WALLET_RATE_PLAN } from '../services/billing/walletRate.js';
import { listBuckets, updateBucket } from '../services/billing/pricingBuckets.js';
import { resolveWorkspaceRate, assignBucket, setRateOverride } from '../services/billing/workspaceRate.js';
import { getBroadcastRate, setBroadcastRate } from '../services/billing/broadcastRate.js';

/*
 * The plan catalogue used to live here: a DEFAULT_PLANS seed, ensurePlansSeeded,
 * a public GET /config/plans and admin CRUD.
 *
 * It is gone. This deployment sells one thing — talk-minutes debited from a
 * prepaid wallet at a single platform rate — so there is no catalogue to
 * publish, nothing to subscribe to, and no per-tier limits. The rate lives in
 * services/billing/walletRate.js and is edited in Super Admin → Wallet Rate.
 *
 * The Plan and Subscription tables still exist in the schema (dropping them
 * needs a migration against the live database) and still hold historical rows.
 * Nothing reads them for pricing or enforcement any more; the one row still in
 * use is the reserved __wallet_rate__ settings row.
 */

const safeJson = (v, fb) => { try { return JSON.parse(v); } catch { return fb; } };

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

// ─── PRICING BUCKETS ─────────────────────────────────────────────────────────
// Volume tiers a Super Admin assigns to a workspace, plus the bespoke per-
// workspace override. ADMIN-ONLY on purpose: there is deliberately no public
// counterpart to getWalletRatePublic here, because this deployment is
// contact-led and quotes no tiered pricing on the site. If a customer-facing
// route for these is ever wanted, that is a product decision to take
// explicitly — not something to add because the data happened to be there.

/** GET /admin/pricing/buckets — the tiers, plus what each one charges. */
export const adminListBuckets = async (_req, res) => {
  try {
    res.json({ buckets: await listBuckets() });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to load pricing buckets' });
  }
};

/** PATCH /admin/pricing/buckets/:id — reprice or relabel one tier. */
export const adminUpdateBucket = async (req, res) => {
  try {
    const bucket = await updateBucket(req.params.id, req.body ?? {});
    res.json({ bucket });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to update the bucket' });
  }
};

/**
 * GET /admin/pricing/workspaces/:workspaceId — the effective rate and WHY.
 *
 * `source` is what makes this worth an endpoint rather than reading the two
 * columns: an admin looking at an account needs to know whether ₹10 came from
 * a tier or from a bespoke deal, because those are undone differently.
 */
export const adminGetWorkspaceRate = async (req, res) => {
  try {
    res.json(await resolveWorkspaceRate(req.params.workspaceId));
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to resolve the rate' });
  }
};

/** PUT /admin/pricing/workspaces/:workspaceId/bucket — assign, or clear with null. */
export const adminAssignBucket = async (req, res) => {
  try {
    res.json(await assignBucket(req.params.workspaceId, req.body?.bucketId ?? null));
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to assign the bucket' });
  }
};

/** PUT /admin/pricing/workspaces/:workspaceId/override — set, or clear with null. */
export const adminSetRateOverride = async (req, res) => {
  try {
    res.json(await setRateOverride(req.params.workspaceId, req.body?.perMinuteInr ?? null));
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to set the override' });
  }
};

// ─── BROADCAST RATE ──────────────────────────────────────────────────────────
// The second (and only other) price this platform sets. A one-way broadcast
// costs us a carrier minute and nothing else — no STT, no LLM, no per-call TTS —
// so charging it at the conversational rate prices it out of a market that is
// bought on price. See services/billing/broadcastRate.js.

/** GET /admin/broadcast-rate */
export const adminGetBroadcastRate = async (_req, res) => {
  const rate = await getBroadcastRate();
  res.json({ perMinuteInr: rate.perMinuteInr });
};

/** PUT /admin/broadcast-rate */
export const adminSetBroadcastRate = async (req, res) => {
  try {
    const rate = await setBroadcastRate(req.body?.perMinuteInr);
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
