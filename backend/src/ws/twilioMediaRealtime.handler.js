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
import { settleCall } from '../services/billing/settlement.service.js';
import { getAgentKbText } from '../services/agentRuntime.service.js';
import { createRealtimeSession } from '../services/voice/realtimeEngine.factory.js';
import { isModelAllowed } from '../services/platform/modelCatalog.js';
import { createAmbiencePump } from '../services/voice/ambiencePump.js';
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
  let pump = null;   // ambience/pacing pump; null when ambience is off
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
      // Fall through to settlement rather than returning. Failing to write the
      // status must not also abandon the bill: a call left PENDING is never
      // revisited by anything, so it shows as "pending" forever.
      logger.warn(`Could not finalize realtime phone call log: ${e.message}`);
    }

    // BUG-002: charge the wallet for telephony minutes. Billing only the web
    // path would have made phone minutes free — a revenue hole and an
    // inconsistency a customer would eventually dispute. Idempotent per call,
    // which matters here because Twilio's `stop` event and the socket `close`
    // both reach cleanup().
    await settleCall(callLogId);

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
    // First: a leaked 20ms interval would outlive the call permanently.
    // stop() is idempotent because cleanup() is reachable more than once.
    pump?.stop();
    pump = null;
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
          // Withdrawn by Super Admin after this agent was configured — refuse
          // before the upstream session (and its cost) is created.
          if (!(await isModelAllowed('conversational', settings.voiceEngine))) {
            throw new Error('This conversational engine is no longer available on this platform');
          }

          const { kbText } = await getAgentKbText(workspaceId, agentId);
          session = createRealtimeSession(settings.voiceEngine, { agent, kbText, audioFormat: 'g711_ulaw' });

          // Background ambience (BUG-003). Constructed ONLY when the agent has a
          // real preset selected, so an agent without ambience keeps the exact
          // zero-transcode passthrough below — no timer, no queue, no mixing,
          // and no added latency on the path this repo has spent the most
          // effort optimising.
          const sendFrame = (payload) => {
            if (ws.readyState === ws.OPEN && streamSid) {
              ws.send(JSON.stringify({
                event: 'media',
                streamSid,
                media: { payload: payload.toString('base64') },
              }));
            }
          };
          if (process.env.AMBIENCE_PHONE_ENABLED !== 'false') {
            pump = createAmbiencePump({
              presetName: settings.ambientSound,
              send: sendFrame,
              onError: (err) => logger.warn(`Ambience pump: ${err.message}`),
            });
          }

          // Branch ONCE here, never per frame.
          session.on('audio', pump
            ? (buf) => pump.push(buf)
            : (buf) => sendFrame(buf));
          session.on('transcript', (t) => {
            if (t.done) transcript.push({ role: t.role, content: t.text });
          });
          // Barge-in: the caller interrupted — flush Twilio's buffered playback
          // (the `clear` media-stream message) so the agent stops mid-sentence.
          session.on('clear', () => {
            // Drop OUR queued engine audio first. Twilio's `clear` only flushes
            // what Twilio holds; anything still queued here would be emitted
            // afterwards and resurrect the interrupted sentence.
            pump?.flush();
            if (ws.readyState === ws.OPEN && streamSid) {
              ws.send(JSON.stringify({ event: 'clear', streamSid }));
            }
          });
          session.on('error', (err) => logger.warn(`Realtime phone call session error: ${err.message}`));
          session.on('close', () => ws.close());

          await session.connect();
          // Start the bed as soon as the line is live — a real room has tone
          // from the moment the call is answered, not from the first word.
          pump?.start();

          if (callLogId) {
            await prisma.agentCallLog.update({
              where: { id: callLogId },
              data: { status: 'IN_PROGRESS' },
            }).catch(() => {});
          }
        } catch (err) {
          logger.error(`Failed to start realtime phone call session: ${err.message}`);
          // A pump built just before the throw must not depend on the close
          // handler firing to be torn down.
          pump?.stop();
          pump = null;
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
