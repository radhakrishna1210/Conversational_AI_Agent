// backend/src/ws/twilioMediaRealtime.handler.js
/**
 * Twilio Media Streams <-> bundled conversational engine (xAI or ElevenLabs)
 * bridge — what makes Phone Call a real two-way conversation for agents with
 * settings.voiceEngine === 'xai' | 'elevenlabs'. Mounted at:
 *   /api/v1/twilio-media/:workspaceId/:agentId
 *
 * Twilio connects here directly (server-to-server) when `testCall` in
 * agent.controller.js returns TwiML `<Connect><Stream url="wss://.../twilio-media/..."/></Connect>`.
 * Protocol: https://www.twilio.com/docs/voice/media-streams/websocket-messages
 * — start/media/stop JSON events, media payload is base64 mu-law @ 8kHz mono,
 * which is requested directly from the engine (audioFormat: 'g711_ulaw') so
 * audio is passed straight through in both directions with no transcoding.
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { getAgentKbText } from '../services/agentRuntime.service.js';
import { createRealtimeSession } from '../services/voice/realtimeEngine.factory.js';
import { extractAndStoreCallVariables } from '../services/postCallExtraction.service.js';
import { deliverPostCall } from '../controllers/agentCallLog.controller.js';

const safeJson = (str, fallback) => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

export function handleTwilioMediaUpgrade(ws, { workspaceId, agentId }) {
  let session = null;
  let streamSid = null;
  let callLogId = null;
  let finalized = false;
  const transcript = [];
  const startedAt = Date.now();

  const finalizeCallLog = async (status) => {
    // Twilio ends a call with a `stop` event followed by a socket `close`, so
    // cleanup() runs more than once. Guard against re-entry — otherwise
    // extraction and Post-Call delivery would fire twice and duplicate the
    // Google Sheets row / webhook / email for a single call.
    if (!callLogId || finalized) return;
    finalized = true;

    try {
      await prisma.agentCallLog.update({
        where: { id: callLogId },
        data: {
          status,
          transcript: JSON.stringify(transcript.slice(-200)),
          durationSec: Math.round((Date.now() - startedAt) / 1000),
          endedAt: new Date(),
        },
      });
    } catch (e) {
      logger.warn(`Could not finalize realtime phone call log: ${e.message}`);
      return;
    }

    // A phone call has no browser client to PATCH the REST call-log endpoint,
    // so extraction + Post-Call delivery (webhook / email / Google Sheets) must
    // be driven from here — mirroring updateCallLog in agentCallLog.controller.js.
    // Best-effort: a delivery failure must never crash the socket teardown.
    try {
      await extractAndStoreCallVariables(workspaceId, agentId, callLogId);
      const row = await prisma.agentCallLog.findFirst({
        where: { id: callLogId, workspaceId, agentId },
      });
      if (row) await deliverPostCall(workspaceId, agentId, row);
    } catch (e) {
      logger.warn(`Post-call extraction/delivery failed for phone call ${callLogId}: ${e.message}`);
    }
  };

  const cleanup = (status) => {
    session?.close();
    if (status) finalizeCallLog(status);
  };

  ws.on('message', async (raw) => {
    const msg = safeJson(raw.toString(), null);
    if (!msg?.event) return;

    switch (msg.event) {
      case 'connected':
        break;

      case 'start': {
        streamSid = msg.start?.streamSid || msg.streamSid;
        callLogId = msg.start?.customParameters?.callLogId || null;

        try {
          const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
          if (!agent) throw new Error('Agent not found in this workspace');
          const settings = safeJson(agent.settings, {});
          if (settings.voiceEngine !== 'xai' && settings.voiceEngine !== 'elevenlabs') {
            throw new Error('Agent is not configured to use a bundled Conversational Agent');
          }

          const { kbText } = await getAgentKbText(workspaceId, agentId);
          session = createRealtimeSession(settings.voiceEngine, { agent, kbText, audioFormat: 'g711_ulaw' });

          session.on('audio', (buf) => {
            if (ws.readyState === ws.OPEN && streamSid) {
              ws.send(JSON.stringify({
                event: 'media',
                streamSid,
                media: { payload: buf.toString('base64') },
              }));
            }
          });
          session.on('transcript', (t) => {
            if (t.done) transcript.push({ role: t.role, content: t.text });
          });
          // Barge-in: the caller interrupted — flush Twilio's buffered playback
          // (the `clear` media-stream message) so the agent stops mid-sentence.
          session.on('clear', () => {
            if (ws.readyState === ws.OPEN && streamSid) {
              ws.send(JSON.stringify({ event: 'clear', streamSid }));
            }
          });
          session.on('error', (err) => logger.warn(`Realtime phone call session error: ${err.message}`));
          session.on('close', () => ws.close());

          await session.connect();

          if (callLogId) {
            await prisma.agentCallLog.update({
              where: { id: callLogId },
              data: { status: 'IN_PROGRESS' },
            }).catch(() => {});
          }
        } catch (err) {
          logger.error(`Failed to start realtime phone call session: ${err.message}`);
          ws.close();
        }
        break;
      }

      case 'media':
        if (session && msg.media?.payload) {
          session.sendAudioChunk(Buffer.from(msg.media.payload, 'base64'));
        }
        break;

      case 'stop':
        cleanup('COMPLETED');
        break;

      default:
        break;
    }
  });

  ws.on('close', () => cleanup(callLogId ? 'COMPLETED' : null));
  ws.on('error', (err) => {
    logger.warn(`Twilio media stream socket error: ${err.message}`);
    cleanup('FAILED');
  });
}
