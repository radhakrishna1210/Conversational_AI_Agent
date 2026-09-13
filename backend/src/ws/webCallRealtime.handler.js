// backend/src/ws/webCallRealtime.handler.js
/**
 * Browser <-> bundled conversational engine (xAI or ElevenLabs) bridge for
 * Web Call, used when an agent's settings.voiceEngine is 'xai' or
 * 'elevenlabs'. Mounted at:
 *   /api/v1/workspaces/:workspaceId/agents/:agentId/xai-call
 * (path kept from the original xAI-only version — internal implementation
 * detail, not user-facing, so not worth a breaking rename)
 *
 * Auth: browsers cannot set custom headers on a WebSocket handshake, and this
 * codebase deliberately avoids putting bearer tokens in query strings (see
 * middleware/authenticate.js) since URLs leak through logs/proxies/history.
 * Instead the socket opens unauthenticated and the FIRST client message must
 * be `{ type: 'auth', token }`; the connection is closed if that fails or
 * doesn't arrive within AUTH_TIMEOUT_MS. All subsequent client frames are
 * raw binary PCM16 mono audio (24kHz) appended straight to the engine session.
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { openCallBudget } from '../services/billing/callBudget.js';
import { createCallFinalizer } from './callFinalizer.js';
import { startHeartbeat } from './socketHeartbeat.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { getAgentKbText, renderWelcome } from '../services/agentRuntime.service.js';
import { createRealtimeSession } from '../services/voice/realtimeEngine.factory.js';
import { isModelAllowed } from '../services/platform/modelCatalog.js';
import { isBundledEngine } from '../services/outboundCall.service.js';

const AUTH_TIMEOUT_MS = 10_000;

const safeJson = (str, fallback) => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

/**
 * `direction`: which greeting the in-page test call opens with — the editor
 * passes the tab being viewed, so both greetings can be heard before saving a
 * number against the agent. Null keeps the agent's configured side.
 */
export async function handleWebCallUpgrade(ws, { workspaceId, agentId, direction = null }) {
  let authenticated = false;
  let session = null;
  let callLogId = null;
  let budget = null;
  const transcript = [];
  const startedAt = Date.now();

  const authTimer = setTimeout(() => {
    if (!authenticated) {
      ws.close(4001, 'Auth timeout');
    }
  }, AUTH_TIMEOUT_MS);

  // A tab that crashes or drops off the network sends no close frame, so this
  // call would otherwise stay live — engine session open, log IN_PROGRESS,
  // never settled — until TCP eventually gave up, potentially hours later.
  const stopHeartbeat = startHeartbeat(ws, { label: 'bundled web call' });

  // The same end of call as every phone bridge: status write, settlement even
  // if that write failed, then extraction and Post-Call delivery — exactly once.
  // This handler used to stop at settlement, so an xAI/ElevenLabs agent tested
  // from the browser never produced its webhook, Sheets row or WhatsApp
  // confirmation, while the same agent did on a phone call and a modular agent
  // did on this very page. See ws/callFinalizer.js.
  const finalizer = createCallFinalizer({ workspaceId, agentId, label: 'bundled web call' });
  const finalizeCallLog = (status) => finalizer(callLogId, status, { transcript, startedAt });

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };
  /**
   * Refuse the call and say why. The browser shows the last error frame it saw
   * when the socket closes, so the frame goes first. Every await below used to
   * be unguarded: a database timeout rejected this async handler after
   * `authenticated` was set and the auth timer cleared, so nothing ever closed
   * the socket and the caller sat on a call that would never start.
   */
  const refuse = (closeCode, code, message) => {
    send({ type: 'error', code, message });
    if (ws.readyState === ws.OPEN) ws.close(closeCode, code);
  };

  /**
   * Teardown. Runs at most once — a socket 'error' is followed by 'close', so
   * both handlers reach here. Without the guard the second pass overwrote the
   * FAILED status with COMPLETED (hiding the real outcome) and raced the first
   * pass's settlement.
   *
   * Returns the finalize promise so callers can await settlement instead of
   * leaving it to a dropped microtask at process teardown.
   */
  let teardown = null;
  const cleanup = (status = 'COMPLETED') => {
    if (teardown) return teardown;
    clearTimeout(authTimer);
    stopHeartbeat();
    budget?.stop();
    session?.close();
    teardown = finalizeCallLog(status);
    return teardown;
  };

  ws.on('message', async (raw, isBinary) => {
    if (!authenticated) {
      if (isBinary) return; // ignore audio before auth
      const msg = safeJson(raw.toString(), null);
      if (msg?.type !== 'auth' || typeof msg.token !== 'string') {
        ws.close(4001, 'First message must be { type: "auth", token }');
        return;
      }
      try {
        const payload = verifyAccessToken(msg.token);
        if (payload.workspaceId && payload.workspaceId !== workspaceId) {
          throw new Error('Token workspace mismatch');
        }
      } catch (err) {
        logger.warn(`Realtime web call auth failed: ${err.message}`);
        ws.close(4001, 'Invalid or expired token');
        return;
      }

      clearTimeout(authTimer); // the client met its deadline; the rest is our work
      let agent;
      try {
        agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
      } catch (err) {
        logger.error({ err: err.message, workspaceId, agentId }, 'Bundled web call could not load the agent');
        refuse(4503, 'BACKEND_UNAVAILABLE', 'Could not reach the database to start this call. Please try again in a moment.');
        return;
      }
      if (teardown) return; // hung up meanwhile
      if (!agent) {
        ws.close(4004, 'Agent not found in this workspace');
        return;
      }
      const settings = safeJson(agent.settings, {});
      if (!isBundledEngine(settings.voiceEngine)) {
        ws.close(4003, 'Agent is not configured to use a bundled Conversational Agent');
        return;
      }
      // Super Admin can withdraw an engine after an agent was already pointed at
      // it. Checked here, before the upstream session exists, so a withdrawn
      // engine stops costing money immediately rather than at the next edit.
      let engineAllowed;
      try {
        engineAllowed = await isModelAllowed('conversational', settings.voiceEngine);
      } catch (err) {
        logger.error({ err: err.message, workspaceId, agentId }, 'Bundled web call could not read the model catalogue');
        refuse(4503, 'BACKEND_UNAVAILABLE', 'Could not check this agent\'s engine to start the call. Please try again in a moment.');
        return;
      }
      if (teardown) return;
      if (!engineAllowed) {
        logger.info({ workspaceId, agentId, engine: settings.voiceEngine }, 'Web call blocked: engine disabled by platform');
        ws.close(4003, 'This conversational engine is no longer available on this platform');
        return;
      }

      authenticated = true;

      // BUG-002: balance gate, and the spend deadline that goes with it. Runs
      // BEFORE the upstream realtime session is created -- connecting to the
      // provider first would incur real cost for a call we are about to refuse.
      // The close code carries the reason so the client can explain it instead
      // of showing a generic disconnect.
      //
      // The gate alone only ever bought the RIGHT TO START: without the deadline
      // the budget adds, a workspace with one minute of balance could hold this
      // socket open for half an hour and settle the lot against an empty wallet.
      // See callBudget.js.
      let gate;
      try {
        gate = await openCallBudget({
          workspaceId,
          type: 'WEB_CALL',
          label: 'bundled web call',
          onWarn: (secondsLeft) => send({
            type: 'error',
            code: 'BALANCE_LOW',
            message: `Your wallet balance runs out in about ${secondsLeft} seconds. Add funds to keep talking.`,
          }),
          onExpire: () => {
            send({
              type: 'error',
              code: 'INSUFFICIENT_BALANCE',
              message: 'Your wallet balance has run out. Add funds to place more calls.',
            });
            ws.close(4009, 'INSUFFICIENT_BALANCE');
          },
        });
      } catch (err) {
        // Could not READ the wallet — not the same as an empty one, so the caller
        // is told the service is unavailable, never that they are out of money.
        logger.error({ err: err.message, workspaceId, agentId }, 'Bundled web call could not verify the wallet balance');
        refuse(4503, 'BACKEND_UNAVAILABLE', 'Could not verify your balance to start this call. Please try again in a moment.');
        return;
      }
      budget = gate.budget;
      if (teardown) { budget?.stop(); return; }
      if (!gate.allowed) {
        logger.info({ workspaceId, agentId, code: gate.code }, `Web call blocked: ${gate.code}`);
        send({ type: 'error', code: gate.code, message: gate.message });
        ws.close(4009, gate.code);
        return;
      }

      try {
        const { kbText } = await getAgentKbText(workspaceId, agentId);
        // Hung up during the KB read: cleanup() has run, and a provider session
        // opened now would have nothing to close it.
        if (teardown) { budget?.stop(); return; }
        const { welcome } = renderWelcome(agent, { direction });
        session = createRealtimeSession(settings.voiceEngine, { agent, kbText, audioFormat: 'pcm16', welcome });

        session.on('audio', (buf) => {
          if (ws.readyState === ws.OPEN) ws.send(buf, { binary: true });
        });
        session.on('transcript', (t) => {
          if (t.done) transcript.push({ role: t.role, content: t.text });
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'transcript', ...t }));
          }
        });
        // Barge-in: the engine reports the caller interrupted — tell the client
        // to drop audio it has already queued so the agent stops speaking now.
        session.on('clear', () => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'clear' }));
        });
        session.on('error', (err) => {
          logger.warn(`Realtime web call session error: ${err.message}`);
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: err.message }));
          }
        });
        session.on('close', () => {
          if (ws.readyState === ws.OPEN) ws.close(1000, 'Session ended');
        });

        await session.connect();
        // Hung up while the provider session was connecting. cleanup() closed
        // it, but a connect that completes afterwards may have reopened it —
        // close again rather than hold a paid provider session for nobody.
        if (teardown) { session.close(); return; }

        const log = await prisma.agentCallLog.create({
          data: { workspaceId, agentId, type: 'WEB_CALL', status: 'IN_PROGRESS' },
        });
        callLogId = log.id;
        // Hung up during that insert: the teardown already ran with no row to
        // close, so close this one now or it sits IN_PROGRESS, unbilled.
        if (teardown) { await finalizeCallLog('COMPLETED'); return; }

        ws.send(JSON.stringify({ type: 'ready' }));
      } catch (err) {
        logger.error(`Failed to start realtime web call session: ${err.message}`);
        refuse(1011, 'SESSION_START_FAILED', 'The conversational agent session could not be started. Please try again.');
      }
      return;
    }

    // Post-auth: binary frames are caller audio, JSON frames are control messages.
    if (isBinary) {
      session?.sendAudioChunk(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
    }
  });

  // 'error' fires before 'close', so the FAILED status is the one that sticks —
  // cleanup() is single-shot and first status wins.
  ws.on('close', () => cleanup('COMPLETED'));
  ws.on('error', (err) => {
    logger.warn(`Realtime web call socket error: ${err.message}`);
    cleanup('FAILED');
  });
}
