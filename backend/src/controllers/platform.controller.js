// Plans (admin-manageable pricing), Wallet (workspace balance + ledger), and
// the Post-Call delivery executor. Grouped: each is compact and they share
// imports; split into separate files if they grow.
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { sendMail, isMailerConfigured } from '../lib/mailer.js';
import { assertPublicHttpUrl } from '../lib/safeUrl.js';
import { appendCallRow } from '../services/googleSheets.service.js';
import { createEvent, deleteEvent, resolveAppointmentStart } from '../services/googleCalendar.service.js';
import { addLog } from '../services/integrations.service.js';
import { getBinding } from '../services/whatsappTemplates.service.js';
import { sendWhatsAppConfirmation, buildPositionalVariables } from '../services/whatsappPostCall.service.js';
import { enqueueWhatsAppSend } from '../queues/whatsappPostCall.queue.js';
import { getWalletRate, setWalletRate, WALLET_RATE_PLAN } from '../services/billing/walletRate.js';
import { listBuckets, createBucket, updateBucket, deleteBucket } from '../services/billing/pricingBuckets.js';
import { resolveWorkspaceRate, assignBucket, setRateOverride } from '../services/billing/workspaceRate.js';
import { getNumberRate, setNumberRate } from '../services/billing/numberRate.js';
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

/**
 * POST /admin/pricing/buckets — add a tier.
 *
 * Creating a tier assigns it to nobody, so unlike a reprice this cannot change
 * what any existing client pays. 409 means a tier already quotes those minutes.
 */
export const adminCreateBucket = async (req, res) => {
  try {
    res.status(201).json({ bucket: await createBucket(req.body ?? {}) });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to create the bucket' });
  }
};

/** PATCH /admin/pricing/buckets/:id — reprice, relabel, resize or retire one tier. */
export const adminUpdateBucket = async (req, res) => {
  try {
    const bucket = await updateBucket(req.params.id, req.body ?? {});
    res.json({ bucket });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to update the bucket' });
  }
};

/**
 * DELETE /admin/pricing/buckets/:id — remove a tier for good.
 *
 * 409 means the tier still has clients on it. That is not a lock to force
 * past: the FK nulls assignments on delete, so removing an occupied tier
 * silently reprices real customers to the default. Reassign, or retire it.
 */
export const adminDeleteBucket = async (req, res) => {
  try {
    res.json({ deleted: await deleteBucket(req.params.id) });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to delete the bucket' });
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

// ─── PHONE-NUMBER RATE ───────────────────────────────────────────────────────
// The only price here that is not per-minute. A rented number costs us a fixed
// sum every month for as long as we hold it, so it is billed on its own clock:
// a one-time setup fee covering the per-client compliance filing a reseller has
// to do, then a monthly rental. See services/billing/numberRate.js.

/**
 * GET /admin/number-rate
 *
 * Not exposed publicly, unlike the ₹/min wallet rate. The landing page quotes
 * per-minute pricing; numbers are contact-led and priced in conversation.
 */
export const adminGetNumberRate = async (_req, res) => {
  const rate = await getNumberRate();
  res.json({ monthlyInr: rate.monthlyInr, setupInr: rate.setupInr });
};

/** PUT /admin/number-rate  { monthlyInr?, setupInr? } */
export const adminSetNumberRate = async (req, res) => {
  try {
    const rate = await setNumberRate({
      monthlyInr: req.body?.monthlyInr,
      setupInr: req.body?.setupInr,
    });
    res.json({ monthlyInr: rate.monthlyInr, setupInr: rate.setupInr });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to save the rate' });
  }
};

// ─── BROADCAST RATE ──────────────────────────────────────────────────────────
// A one-way broadcast costs us a carrier minute and nothing else — no STT, no
// LLM, no per-call TTS — so charging it at the conversational rate prices it
// out of a market that is bought on price. See services/billing/broadcastRate.js.

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
        // SSRF guard. Inside the try on purpose: a refused URL is recorded as
        // this config's failure below, and the other deliveries still run.
        await assertPublicHttpUrl(cfg.url);
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
        // A Test press always resolves to the SAME synthetic slot (see
        // samplePostCallValue below) — repeat presses would otherwise trip
        // the double-booking guard against the previous test's own leftover
        // event and fail with a false-negative "slot already booked", which
        // is exactly what turned into the 502 this fix addresses. A test
        // booking has no real caller to protect from a double-booked slot,
        // so it never needs the guard regardless of the destination's own
        // allowDoubleBooking setting.
        const isTest = payload.callType === 'TEST';
        const out = await createEvent(workspaceId, {
          start: startValue,
          end: cfg.endVariable ? findVar(cfg.endVariable) : undefined,
          durationMin: cfg.durationMin,
          // Per-destination opt-out, for a resource that can take concurrent bookings.
          allowDoubleBooking: isTest || cfg.allowDoubleBooking === true,
          timeZone: cfg.timezone || cfg.timeZone,
          calendarId: cfg.calendarId,
          // Default title names the CALLER, not the agent. Every appointment
          // otherwise reads "Appointment — <agent>", so a day's calendar is a
          // column of identical titles that tells the clinic nothing.
          summary: (isTest ? '[Test] ' : '') + (cfg.eventTitle
            || (() => {
              const who = ['patient_name', 'customer_name', 'caller_name', 'name', 'full_name']
                .map((k) => findVar(k)).find((v) => v && String(v).trim());
              return who ? `Appointment — ${String(who).trim()}` : `Appointment — ${agent.name}`;
            })()),
          description: `Booked from call with ${agent.name}.\n\nExtracted information:\n${variableLines}\n\nSummary:\n${payload.summary ?? '(none)'}`,
          attendees: cfg.attendeeVariable ? [findVar(cfg.attendeeVariable)].filter(Boolean) : undefined,
        });
        results.push({ method: 'googlecalendar', target: out.htmlLink || out.id, ok: true, bookedFrom: resolved.from, ...out });
        // Visible on the Integrations page, unlike the pino log line below —
        // mirrors zoho.service.js's pushCallAsLead, which logs the same way on
        // both success and failure. Without this, a booking success or
        // failure had NO trace anywhere a user would look.
        await addLog({
          workspaceId, provider: 'google_calendar', event: 'event_created',
          message: `Calendar event created (${out.id})`,
          metadata: { callId: payload.callId, eventId: out.id, bookedFrom: resolved.from, meetLink: out.meetLink ?? null },
        }).catch(() => {}); // logging must never break a delivery that already succeeded
        // A Test press's job is proving the destination works, not leaving a
        // permanent fake appointment on the user's real calendar — clean up
        // immediately rather than accumulating one junk event per click.
        if (isTest) {
          await deleteEvent(workspaceId, out.id, { calendarId: cfg.calendarId }).catch((err) => {
            logger.warn({ workspaceId, eventId: out.id, err: err.message }, 'Could not clean up test calendar event');
          });
        }
      } else if (method === 'whatsapp') {
        // A WhatsApp confirmation through the workspace's own ChatFlow account.
        //
        // The trigger is NOT the call outcome. There is no "appointment booked"
        // status in this system — `outcome` only ever carries Completed or Failed
        // — so what fires this is the PRESENCE of a named extracted variable, the
        // same way the calendar branch above infers a booking from having found a
        // date. If the caller booked nothing, the variable is empty and no message
        // goes out, which is the whole point: a confirmation for a booking that
        // never happened is what earns Meta quality complaints.
        const findVar = (key) => variables.find((v) => String(v.key).toLowerCase() === String(key ?? '').toLowerCase());

        const triggerKey = String(cfg.triggerVariable ?? '').trim();
        if (!triggerKey) {
          results.push({ method: 'whatsapp', ok: false, error: 'No trigger variable is set, so this message would fire on every call. Choose the variable that means the booking happened.' });
          continue;
        }
        const triggerValue = findVar(triggerKey)?.value;
        if (triggerValue == null || String(triggerValue).trim() === '') {
          results.push({ method: 'whatsapp', ok: true, skipped: true, reason: `Nothing was captured for "${triggerKey}" on this call` });
          continue;
        }

        const binding = await getBinding(workspaceId, cfg.whatsappBindingId);
        if (!binding) {
          results.push({ method: 'whatsapp', ok: false, error: 'No WhatsApp template is linked to this destination' });
          continue;
        }
        // ChatFlow's public send path does not check approval before forwarding to
        // Meta (its API-playground path does), so an unapproved template would come
        // back as an opaque Graph API error. Check it here, and treat it as
        // permanent-for-now: a Meta review runs for days, so retrying is pointless.
        if (binding.status !== 'APPROVED') {
          results.push({
            method: 'whatsapp',
            ok: false,
            permanent: true,
            error: binding.status === 'REJECTED'
              ? `Meta rejected this template${binding.rejectedReason ? `: ${binding.rejectedReason}` : ''}`
              : 'Template is still awaiting Meta approval, so nothing was sent',
          });
          continue;
        }

        const built = buildPositionalVariables(cfg.variableMapping, findVar);
        if (!built.ok) {
          results.push({ method: 'whatsapp', ok: false, error: `Nothing was captured for ${built.missing.join(', ')}` });
          continue;
        }

        // A phone call carries the caller's number; a web call has none, which is
        // what recipientVariable is for — the agent can collect one on the web.
        const recipient = cfg.recipientVariable ? findVar(cfg.recipientVariable)?.value : payload.phoneNumber;
        const sendArgs = {
          to: recipient,
          templateName: binding.chatflowName,
          language: binding.language,
          variables: built.values,
          // "Test delivery" runs this branch with no callId (see testPostCall).
          // A synthetic, unique one lets the test actually send — which is the
          // point of the button, since nobody wants to discover a broken template
          // mapping on a real customer — while keeping each press its own
          // idempotency key rather than deduping against the previous test.
          callLogId: payload.callId || `test-${cfg.id}-${Date.now()}`,
          postCallConfigId: cfg.id,
        };

        // Queue it so a ChatFlow restart mid-deploy retries instead of losing a
        // customer's confirmation. Redis is optional here, and enqueue returns
        // null without it — send inline in that case rather than reporting a
        // message queued that nothing will ever pick up.
        const job = await enqueueWhatsAppSend({ workspaceId, ...sendArgs });
        if (job) {
          results.push({ method: 'whatsapp', target: String(recipient ?? ''), ok: true, queued: true });
        } else {
          const sent = await sendWhatsAppConfirmation(workspaceId, sendArgs);
          results.push({
            method: 'whatsapp',
            target: sent.duplicate ? 'already sent' : String(recipient ?? ''),
            ok: true,
            duplicate: sent.duplicate === true,
            messageId: sent.messageId ?? null,
          });
        }
      } else {
        results.push({ method: method || 'unknown', ok: false, error: 'Unsupported or incomplete config' });
      }
    } catch (err) {
      if (method === 'googlecalendar') {
        // Same reasoning as the success-path addLog above: without this, a
        // failed booking (bad date variable, double-booking conflict,
        // disconnected token) left no trace anywhere but a pino log line.
        await addLog({
          workspaceId, provider: 'google_calendar', level: 'error', event: 'event_create_failed',
          message: `Calendar event creation failed: ${err.message}`,
          metadata: { callId: payload.callId },
        }).catch(() => {}); // never let logging itself break delivery
      }
      results.push({ method, target: cfg.url || cfg.email || cfg.spreadsheetId, ok: false, error: err.message });
    }
  }
  logger.info({ agentId, results }, 'Post-call delivery executed');
  return { executed: results.length, results };
};

/**
 * Sample value for one extraction variable's Test-Post-Call run.
 *
 * A flat '(sample)' string used to be sent for every variable regardless of
 * shape. That's harmless for webhook/email/sheets destinations (they just
 * echo the string back), but Google Calendar/Meet destinations feed the
 * date-shaped variable straight into parseAppointmentDate(), which correctly
 * rejects '(sample)' as unparseable — so a Test press on a Calendar/Meet
 * destination ALWAYS failed, reporting a false-negative 502 on an otherwise
 * correctly configured destination (this is exactly what produced the
 * "Calendar event creation failed" IntegrationLog entry from testing this
 * session). Same date-ish-key heuristic resolveAppointmentStart() uses
 * (googleCalendar.service.js) is applied here so a real, bookable sample
 * value is generated for the variables that actually need one.
 */
function samplePostCallValue(key) {
  const isDateish = /(date|time|when|slot)/i.test(key) && !/(birth|dob|age)/i.test(key);
  if (!isDateish) return '(sample)';
  // A bare "*_time" key (paired with a separate "*_date" key) needs just a
  // clock time — combineDateAndTime() expects that shape, not a full ISO
  // string, from the time half of a date+time pair.
  if (/time/i.test(key) && !/date/i.test(key)) return '10:00 AM';
  // Everything else (a combined datetime, or a bare "*_date" paired with the
  // synthetic time above) gets a real near-future ISO datetime — tomorrow,
  // not "today", so a test run can never itself land inside an already-
  // elapsed slot.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setUTCHours(10, 0, 0, 0);
  return tomorrow.toISOString().slice(0, 19);
}

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
      value: samplePostCallValue(d.key),
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
