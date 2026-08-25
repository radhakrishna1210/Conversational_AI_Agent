import './config/env.js';
import { mkdirSync } from 'fs';
import http from 'http';
import { WebSocketServer } from 'ws';
import app from './app.js';
import { env } from './config/env.js';
import prisma from './config/prisma.js';
import logger from './lib/logger.js';
import { renewDueSubscriptions } from './services/billing/subscription.service.js';
import { renewDueNumbers } from './services/billing/numberBilling.service.js';
import { SSE_KEEPALIVE_INTERVAL_MS, SHUTDOWN_GRACE_PERIOD_MS } from './constants/limits.js';
import { createCampaignWorker } from './workers/campaign.worker.js';
import { startIntegrationScheduler } from './services/integrationScheduler.service.js';
import { startVoiceSyncScheduler } from './services/voice/voice.startup.js';
import { sweepDueBroadcasts } from './services/broadcast/broadcast.service.js';
import { handleWebCallUpgrade } from './ws/webCallRealtime.handler.js';
import { handleWebCallModularUpgrade } from './ws/webCallModularRealtime.handler.js';
import { handleTwilioMediaUpgrade } from './ws/twilioMediaRealtime.handler.js';
import { handleTwilioMediaModularUpgrade } from './ws/twilioMediaModular.handler.js';
import { handlePlivoMediaUpgrade } from './ws/plivoMediaRealtime.handler.js';
import { handlePiopiyMediaUpgrade } from './ws/piopiyMediaRealtime.handler.js';
import { handlePlivoMediaModularUpgrade } from './ws/plivoMediaModular.handler.js';
import { SAMPLE_RATES, DEFAULT_SAMPLE_RATE } from './services/telephony/piopiy.provider.js';
import { isBundledEngine } from './services/outboundCall.service.js';
import { loadAgent } from './services/agentRuntime.service.js';
import { resumeStuckKbJobs } from './services/kbChunking.service.js';
import { startRecordingRetention } from './services/recordingRetention.service.js';

mkdirSync(env.UPLOAD_DIR, { recursive: true });

// Test database connection on startup but don't fail
(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connected');
    process.env.DB_STATUS = 'available';
    // Connectivity OK — now verify the schema is actually migrated. A missing
    // table is the #1 cause of "every API returns 500" on fresh setups.
    try {
      await prisma.$queryRaw`SELECT 1 FROM "Agent" LIMIT 1`;
      await prisma.$queryRaw`SELECT 1 FROM "KbFile" LIMIT 1`;
      await prisma.$queryRaw`SELECT 1 FROM "Plan" LIMIT 1`;
      process.env.DB_MIGRATIONS = 'applied';
    } catch (schemaErr) {
      process.env.DB_MIGRATIONS = 'missing';
      logger.error('════════════════════════════════════════════════════════════');
      logger.error('DATABASE SCHEMA IS NOT MIGRATED — tables are missing.');
      logger.error('Every DB-backed endpoint (agents, files, voices, plans, notifications)');
      logger.error('will return 500 until you run, inside the backend/ folder:');
      logger.error('    npm run prestart');
      logger.error('(npm run dev / npm start now do this automatically via pre-hooks;');
      logger.error(' if you are seeing this, the pre-hook was skipped or failed.)');
      logger.error(`Detail: ${schemaErr.message?.split('\n')[0]}`);
      logger.error('════════════════════════════════════════════════════════════');
    }
  } catch (err) {
    logger.warn('Database connection failed on startup:', err.message);
    logger.error('DATABASE IS UNREACHABLE — all DB-backed features (agents, voices, notifications, files) WILL FAIL until this is fixed. Check DATABASE_URL in backend/.env.');
    process.env.DB_STATUS = 'unavailable';
  }
})();

logger.info(`Config sanity → DATABASE_URL protocol OK | JSON_BODY_LIMIT=${env.JSON_BODY_LIMIT} | SMTP=${env.SMTP_HOST ? 'configured' : 'NOT configured'} | GEMINI=${process.env.GEMINI_API_KEY ? 'set' : 'missing'}`);

const campaignWorker = createCampaignWorker();
if (campaignWorker) {
  campaignWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'Campaign job completed'));
  campaignWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Campaign job failed'));
  logger.info('✅ Campaign worker started');
} else {
  logger.warn('⚠️ Campaign worker skipped (Redis/Queue unavailable)');
}

const integrationScheduler = startIntegrationScheduler();
const voiceSyncScheduler = startVoiceSyncScheduler();

// Call recordings are the one upload with no natural ceiling — every call adds
// a file and, before this, only deleting the agent ever removed one.
const recordingRetention = startRecordingRetention();

// KB files chunk+embed in the background (kbChunking.service.js), not inside
// the upload request — so a process crash/deploy mid-job can leave a file
// stuck in 'pending'/'processing' forever with nothing to notice. One sweep
// on boot picks those back up.
resumeStuckKbJobs().catch((err) => logger.warn(`KB stuck-job sweep failed: ${err.message}`));

// Scheduled broadcasts are armed with in-process timers, so a deploy between
// "schedule for 9am" and 9am would silently drop the send. This re-arms the
// pending ones and starts anything that came due while the process was down —
// without it, "scheduled" quietly means "scheduled unless we ship tonight".
sweepDueBroadcasts()
  .then((n) => { if (n) logger.info({ scheduled: n }, 'Re-armed scheduled broadcasts'); })
  .catch((err) => logger.warn(`Scheduled-broadcast sweep failed: ${err.message}`));

// Plain http.Server wrapping the Express app — needed so WebSocket upgrade
// requests (xAI Conversational Agent: Web Call + Twilio Media Streams) can be
// routed alongside normal HTTP without a second listener/port.
const httpServer = http.createServer(app);

const webCallWss = new WebSocketServer({ noServer: true });
const modularWebCallWss = new WebSocketServer({ noServer: true });
const twilioMediaWss = new WebSocketServer({ noServer: true });
const plivoMediaWss = new WebSocketServer({ noServer: true });
const piopiyMediaWss = new WebSocketServer({ noServer: true });

// /api/v1/workspaces/:workspaceId/agents/:agentId/xai-call  (bundled engine)
const WEB_CALL_UPGRADE_PATH = /^\/api\/v1\/workspaces\/([^/]+)\/agents\/([^/]+)\/xai-call$/;
// /api/v1/workspaces/:workspaceId/agents/:agentId/web-call  (modular STT+LLM+TTS, B2)
const MODULAR_WEB_CALL_UPGRADE_PATH = /^\/api\/v1\/workspaces\/([^/]+)\/agents\/([^/]+)\/web-call$/;
// /api/v1/twilio-media/:workspaceId/:agentId
const TWILIO_MEDIA_UPGRADE_PATH = /^\/api\/v1\/twilio-media\/([^/]+)\/([^/]+)$/;
// /api/v1/plivo-media/:workspaceId/:agentId?callLogId=…
const PLIVO_MEDIA_UPGRADE_PATH = /^\/api\/v1\/plivo-media\/([^/]+)\/([^/]+)$/;
// /api/v1/piopiy-media/:workspaceId/:agentId?sample-rate=8000&callLogId=…
const PIOPIY_MEDIA_UPGRADE_PATH = /^\/api\/v1\/piopiy-media\/([^/]+)\/([^/]+)$/;

/**
 * Does this agent run on a bundled speech-to-speech engine?
 *
 * ── THIS RUNS BEFORE THE 101, SO IT IS DEAD AIR ON A LIVE LINE ──────────────
 *
 * A carrier opens the media socket the instant the callee says "hello?", and
 * the upgrade cannot complete until this resolves (see the note on the Twilio
 * branch below for why the lookup must not move INSIDE handleUpgrade). This
 * used to be a raw, uncached `prisma.agent.findFirst`, and one Supabase round
 * trip from this app server measures 490-1400ms — a bare `SELECT 1` costs the
 * same, so it is network distance, not query cost. That was half a second to a
 * second and a half of silence on EVERY phone call, paid again by every call in
 * a bulk campaign, and it sat one level above all the careful concurrency work
 * inside the bridge's own `start` handler. A web call pays none of it: its
 * upgrade path does no lookup at all.
 *
 * Two things fix it, and the fast one is tried first:
 *
 *   1. `engine` ON THE SOCKET URL. The dialler already resolved the engine
 *      (resolveCallMode) before it asked the carrier to dial, so it can simply
 *      say so — exactly as it already does for `direction` and `callLogId`.
 *      When present this costs nothing at all. Absent for inbound calls and for
 *      calls dialled before this shipped, which is what (2) is for.
 *   2. `loadAgent()` INSTEAD OF A RAW QUERY. Same row, but behind the 5-minute
 *      agent cache, so a campaign pays the round trip once per agent rather
 *      than once per call — and, just as importantly, it POPULATES that cache,
 *      so the `loadAgent()` the bridge runs moments later inside `start` is a
 *      hit instead of a second identical round trip.
 *
 * Never throws: an unreachable database must not take the call down. Falling
 * back to the bundled bridge is deliberate — it refuses a mismatched engine
 * loudly on the first frame, whereas guessing modular would run an entire call
 * through the wrong pipeline.
 */
async function resolveBundledEngine(workspaceId, agentId, declaredEngine = null) {
  // The dialler's own answer. Only ever 'bundled' or 'modular' — anything else
  // (including a stale or hand-edited URL) falls through to the lookup rather
  // than being trusted, so a bad query string degrades to slow, never to wrong.
  if (declaredEngine === 'bundled') return true;
  if (declaredEngine === 'modular') return false;

  try {
    const agent = await loadAgent(workspaceId, agentId);
    let engine = 'modular';
    try { engine = JSON.parse(agent?.settings || '{}').voiceEngine || 'modular'; } catch { /* default */ }
    return isBundledEngine(engine);
  } catch (e) {
    logger.warn(`Could not resolve voice engine for media stream: ${e.message}`);
    return true;
  }
}

httpServer.on('upgrade', (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
  } catch {
    socket.destroy();
    return;
  }
  // The query string is not decoration on the carrier paths: `callLogId` is how
  // a stream-mode call identifies itself, and `direction` is read below.
  const { pathname } = url;

  // Which way this call went, set by the dialler when it built the stream URL
  // (telephony providers' mediaStreamUrl). ABSENT MEANS UNKNOWN, not inbound:
  // an inbound webhook builds the same URL with no flag, and so does any older
  // in-flight call, and both must keep the agent's configured behaviour rather
  // than be told they are inbound. Only used to pick the greeting — see
  // getRenderedWelcome().
  const rawDirection = String(url.searchParams.get('direction') || '').toUpperCase();
  const callDirection = rawDirection === 'OUTBOUND' || rawDirection === 'INBOUND' ? rawDirection : null;

  // Which bridge this call is FOR, decided by the dialler at dial time and put
  // on the URL so the handshake needs no database round trip. Absent means
  // "unknown" — an inbound webhook builds the same URL without it — and
  // resolveBundledEngine() falls back to the (now cached) lookup. Normalised
  // here so an unexpected value can never be mistaken for a valid answer.
  const rawEngine = String(url.searchParams.get('engine') || '').toLowerCase();
  const declaredEngine = rawEngine === 'bundled' || rawEngine === 'modular' ? rawEngine : null;

  const webCallMatch = pathname.match(WEB_CALL_UPGRADE_PATH);
  if (webCallMatch) {
    webCallWss.handleUpgrade(req, socket, head, (ws) => {
      handleWebCallUpgrade(ws, { workspaceId: webCallMatch[1], agentId: webCallMatch[2] });
    });
    return;
  }

  const modularMatch = pathname.match(MODULAR_WEB_CALL_UPGRADE_PATH);
  if (modularMatch) {
    modularWebCallWss.handleUpgrade(req, socket, head, (ws) => {
      handleWebCallModularUpgrade(ws, { workspaceId: modularMatch[1], agentId: modularMatch[2] });
    });
    return;
  }

  const twilioMatch = pathname.match(TWILIO_MEDIA_UPGRADE_PATH);
  if (twilioMatch) {
    const [, workspaceId, agentId] = twilioMatch;

    // One carrier path, two bridges. Which one depends on the agent's engine:
    // a bundled engine owns its own realtime session (pipe), a modular agent
    // needs the server to run the conversation itself. Resolved per call rather
    // than per route so switching an agent's engine takes effect on the next
    // dial with no config change anywhere else.
    //
    // THE LOOKUP MUST FINISH BEFORE handleUpgrade, NOT INSIDE IT. A carrier
    // sends `connected` and `start` the instant it sees the 101 response, and
    // `ws` delivers a message only to listeners attached at the time it
    // arrives — anything landing before the bridge attaches its handler is
    // dropped on the floor. Awaiting a Supabase round trip inside the upgrade
    // callback opened exactly that window: the bridge never saw `start`, never
    // started a session, and the caller heard silence for the whole call while
    // the log sat at INITIATED. Resolving first means the handshake — and so
    // the carrier's first frame — cannot happen until we are ready to listen.
    resolveBundledEngine(workspaceId, agentId, declaredEngine).then((bundled) => {
      twilioMediaWss.handleUpgrade(req, socket, head, (ws) => {
        if (bundled) handleTwilioMediaUpgrade(ws, { workspaceId, agentId });
        else handleTwilioMediaModularUpgrade(ws, { workspaceId, agentId, direction: callDirection });
      });
    });
    return;
  }

  const plivoMatch = pathname.match(PLIVO_MEDIA_UPGRADE_PATH);
  if (plivoMatch) {
    const [, workspaceId, agentId] = plivoMatch;
    const callLogId = url.searchParams.get('callLogId');

    // Two bridges behind one path, chosen per call by the agent's engine —
    // exactly as the Twilio path does, and for the same reason: switching an
    // agent's engine then takes effect on the next dial with no config change.
    //
    // The lookup MUST finish before handleUpgrade, never inside it. See the
    // long comment on the Twilio branch above: a carrier sends `start` the
    // instant it sees the 101, and anything arriving before the bridge attaches
    // its listener is dropped, producing a silent call with the log stuck at
    // INITIATED.
    //
    // No sample-rate parameter here — Plivo's rate is fixed by
    // the `contentType` on the <Stream> element the answer URL emitted, so
    // reading it off the query string would be a second source of truth for a
    // value both ends already agreed on.
    resolveBundledEngine(workspaceId, agentId, declaredEngine).then((bundled) => {
      plivoMediaWss.handleUpgrade(req, socket, head, (ws) => {
        if (bundled) handlePlivoMediaUpgrade(ws, { workspaceId, agentId, callLogId });
        else handlePlivoMediaModularUpgrade(ws, { workspaceId, agentId, callLogId, direction: callDirection });
      });
    });
    return;
  }

  const piopiyMatch = pathname.match(PIOPIY_MEDIA_UPGRADE_PATH);
  if (piopiyMatch) {
    const [, workspaceId, agentId] = piopiyMatch;

    // No engine lookup here, unlike the Twilio and Plivo branches. PIOPIY is
    // bundled-only — piopiy.provider declares supportsModularEngine: false and
    // outboundCall.service refuses a modular agent before dialling — so there is
    // exactly one bridge this path can lead to, and reading the agent row would
    // only add a Supabase round trip to the handshake.
    //
    // The rate is OURS: we put it on this URL in piopiy.provider#mediaStreamUrl
    // and PIOPIY echoes it back. Anything outside the two rates PIOPIY accepts
    // is a URL we did not mint, so it falls back rather than being trusted.
    const requested = Number(url.searchParams.get('sample-rate'));
    const sampleRate = SAMPLE_RATES.has(requested) ? requested : DEFAULT_SAMPLE_RATE;

    piopiyMediaWss.handleUpgrade(req, socket, head, (ws) => {
      handlePiopiyMediaUpgrade(ws, {
        workspaceId,
        agentId,
        sampleRate,
        callLogId: url.searchParams.get('callLogId'),
      });
    });
    return;
  }

  socket.destroy();
});

const server = httpServer.listen(env.PORT, () => {
  logger.info(`Server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

// SSE keepalive heartbeat
setInterval(() => {}, SSE_KEEPALIVE_INTERVAL_MS);

// ── Subscription renewal (BUG-002) ───────────────────────────────────────────
// Without this nothing ever advances a billing period: subscriptions would sit
// past their currentPeriodEnd forever, never charging, never resetting the
// included-minute allowance, and never applying a scheduled downgrade or
// cancellation.
//
// renewDueSubscriptions() is idempotent per period (the ledger key includes the
// period boundary), so an interval tick that overlaps a previous one, or a
// restart mid-run, cannot double-charge. That is what makes a plain interval
// acceptable here instead of a distributed scheduler -- though on multiple
// instances the DB constraint, not the schedule, is what guarantees correctness.
const SUBSCRIPTION_RENEWAL_INTERVAL_MS = Number(process.env.SUBSCRIPTION_RENEWAL_INTERVAL_MS) || 3_600_000;
const runRenewals = async () => {
  try {
    const results = await renewDueSubscriptions();
    const renewed = results.filter((r) => r.renewed).length;
    if (results.length) {
      logger.info({ due: results.length, renewed }, 'Subscription renewal sweep complete');
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Subscription renewal sweep failed');
  }
};
const renewalTimer = setInterval(runRenewals, SUBSCRIPTION_RENEWAL_INTERVAL_MS);

// ── Phone-number rental renewal ──────────────────────────────────────────────
// A rented number costs us roughly ₹200/month for as long as we hold it, so
// without this sweep every number sold is billed once and carried forever.
//
// Rides the same interval as subscriptions, and is safe for the same reason:
// renewDueNumbers() keys each charge on the number plus the billing month, so
// an overlapping tick, a restart mid-run, or a second instance cannot double
// charge — the database constraint guarantees that, not the schedule.
const runNumberRenewals = async () => {
  try {
    const results = await renewDueNumbers();
    if (results.length) {
      logger.info(
        {
          due: results.length,
          charged: results.filter((r) => r.charged).length,
          suspended: results.filter((r) => r.suspended).length,
          reactivated: results.filter((r) => r.reactivated).length,
        },
        'Number rental sweep complete',
      );
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Number rental sweep failed');
  }
};
const numberRenewalTimer = setInterval(runNumberRenewals, SUBSCRIPTION_RENEWAL_INTERVAL_MS);
numberRenewalTimer.unref?.();
// Offset from the subscription sweep's catch-up so the two do not contend for
// the same wallet rows the moment a deployment comes back up.
setTimeout(runNumberRenewals, 60_000).unref?.();
// Don't hold the process open purely for the renewal timer.
renewalTimer.unref?.();
// One sweep shortly after boot so a deployment that was down over a period
// boundary catches up without waiting a full interval.
setTimeout(runRenewals, 30_000).unref?.();

const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down`);
  server.close(async () => {
    if (integrationScheduler?.stop) integrationScheduler.stop();
    if (voiceSyncScheduler?.stop) voiceSyncScheduler.stop();
    if (recordingRetention?.stop) recordingRetention.stop();
    clearInterval(renewalTimer);
    clearInterval(numberRenewalTimer);
    await prisma.$disconnect();
    logger.info('Shutdown complete');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_PERIOD_MS);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
// Watched reload triggered by .env fix
