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
import { verifyAccessToken } from '../lib/jwt.js';
import { getAgentKbText } from '../services/agentRuntime.service.js';
import { createRealtimeSession } from '../services/voice/realtimeEngine.factory.js';

const AUTH_TIMEOUT_MS = 10_000;

const safeJson = (str, fallback) => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

export async function handleWebCallUpgrade(ws, { workspaceId, agentId }) {
  let authenticated = false;
  let session = null;
  let callLogId = null;
  const transcript = [];
  const startedAt = Date.now();

  const authTimer = setTimeout(() => {
    if (!authenticated) {
      ws.close(4001, 'Auth timeout');
    }
  }, AUTH_TIMEOUT_MS);

  const finalizeCallLog = async (status) => {
    if (!callLogId) return;
    await prisma.agentCallLog.update({
      where: { id: callLogId },
      data: {
        status,
        transcript: JSON.stringify(transcript.slice(-200)),
        durationSec: Math.round((Date.now() - startedAt) / 1000),
        endedAt: new Date(),
      },
    }).catch((e) => logger.warn(`Could not finalize realtime web call log: ${e.message}`));
  };

  const cleanup = (status = 'COMPLETED') => {
    clearTimeout(authTimer);
    session?.close();
    finalizeCallLog(status);
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

      const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
      if (!agent) {
        ws.close(4004, 'Agent not found in this workspace');
        return;
      }
      const settings = safeJson(agent.settings, {});
      if (settings.voiceEngine !== 'xai' && settings.voiceEngine !== 'elevenlabs') {
        ws.close(4003, 'Agent is not configured to use a bundled Conversational Agent');
        return;
      }

      authenticated = true;
      clearTimeout(authTimer);

      try {
        const { kbText } = await getAgentKbText(workspaceId, agentId);
        session = createRealtimeSession(settings.voiceEngine, { agent, kbText, audioFormat: 'pcm16' });

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

        const log = await prisma.agentCallLog.create({
          data: { workspaceId, agentId, type: 'WEB_CALL', status: 'IN_PROGRESS' },
        });
        callLogId = log.id;

        ws.send(JSON.stringify({ type: 'ready' }));
      } catch (err) {
        logger.error(`Failed to start realtime web call session: ${err.message}`);
        ws.close(1011, 'Failed to start conversational agent session');
      }
      return;
    }

    // Post-auth: binary frames are caller audio, JSON frames are control messages.
    if (isBinary) {
      session?.sendAudioChunk(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
    }
  });

  ws.on('close', () => cleanup('COMPLETED'));
  ws.on('error', (err) => {
    logger.warn(`Realtime web call socket error: ${err.message}`);
    cleanup('FAILED');
  });
}
