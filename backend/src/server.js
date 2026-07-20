import './config/env.js';
import { mkdirSync } from 'fs';
import http from 'http';
import { WebSocketServer } from 'ws';
import app from './app.js';
import { env } from './config/env.js';
import prisma from './config/prisma.js';
import logger from './lib/logger.js';
import { SSE_KEEPALIVE_INTERVAL_MS, SHUTDOWN_GRACE_PERIOD_MS } from './constants/limits.js';
import { createCampaignWorker } from './workers/campaign.worker.js';
import { startIntegrationScheduler } from './services/integrationScheduler.service.js';
import { startVoiceSyncScheduler } from './services/voice/voice.startup.js';
import { handleWebCallUpgrade } from './ws/webCallRealtime.handler.js';
import { handleTwilioMediaUpgrade } from './ws/twilioMediaRealtime.handler.js';

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

import('./controllers/platform.controller.js').then(m => m.ensurePlansSeeded().catch(e => logger.warn('Plan seed skipped: ' + e.message)));

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

// Plain http.Server wrapping the Express app — needed so WebSocket upgrade
// requests (xAI Conversational Agent: Web Call + Twilio Media Streams) can be
// routed alongside normal HTTP without a second listener/port.
const httpServer = http.createServer(app);

const webCallWss = new WebSocketServer({ noServer: true });
const twilioMediaWss = new WebSocketServer({ noServer: true });

// /api/v1/workspaces/:workspaceId/agents/:agentId/xai-call
const WEB_CALL_UPGRADE_PATH = /^\/api\/v1\/workspaces\/([^/]+)\/agents\/([^/]+)\/xai-call$/;
// /api/v1/twilio-media/:workspaceId/:agentId
const TWILIO_MEDIA_UPGRADE_PATH = /^\/api\/v1\/twilio-media\/([^/]+)\/([^/]+)$/;

httpServer.on('upgrade', (req, socket, head) => {
  let pathname;
  try {
    pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  } catch {
    socket.destroy();
    return;
  }

  const webCallMatch = pathname.match(WEB_CALL_UPGRADE_PATH);
  if (webCallMatch) {
    webCallWss.handleUpgrade(req, socket, head, (ws) => {
      handleWebCallUpgrade(ws, { workspaceId: webCallMatch[1], agentId: webCallMatch[2] });
    });
    return;
  }

  const twilioMatch = pathname.match(TWILIO_MEDIA_UPGRADE_PATH);
  if (twilioMatch) {
    twilioMediaWss.handleUpgrade(req, socket, head, (ws) => {
      handleTwilioMediaUpgrade(ws, { workspaceId: twilioMatch[1], agentId: twilioMatch[2] });
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

const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down`);
  server.close(async () => {
    if (integrationScheduler?.stop) integrationScheduler.stop();
    if (voiceSyncScheduler?.stop) voiceSyncScheduler.stop();
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
