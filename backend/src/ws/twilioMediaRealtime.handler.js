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
import { isModelAllowed } from '../services/platform/modelCatalog.js';
import { createAmbiencePump } from '../services/voice/ambiencePump.js';
import { createCallFinalizer } from './callFinalizer.js';
import { createRecordingTap } from './callRecordingTap.js';

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
  const transcript = [];
  const startedAt = Date.now();

  // Writes the status, charges the wallet (BUG-002 — billing only the web path
  // would have made phone minutes free) and runs post-call delivery, exactly
  // once. Twilio ends a call with a `stop` event followed by a socket `close`,
  // so cleanup() always runs more than once; the once-only guard lives in the
  // finalizer. Shared with the modular and Exotel bridges.
  const finalizeCallLog = createCallFinalizer({
    workspaceId, agentId, label: 'realtime phone call',
  });

  /** Both legs, mixed to one WAV at hangup. See callRecordingTap.js. */
  const recording = createRecordingTap({ label: 'realtime phone call', startedAt });

  const cleanup = (status) => {
    // First: a leaked 20ms interval would outlive the call permanently.
    // stop() is idempotent because cleanup() is reachable more than once.
    pump?.stop();
    pump = null;
    session?.close();
    recording.save(callLogId);
    if (status) finalizeCallLog(callLogId, status, { transcript, startedAt });
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
              // Tapped here rather than on the engine's `audio` event, so the
              // recording matches what the caller heard: with ambience enabled
              // the pump owns pacing and mixes the bed in, and only what
              // reaches this function goes on the wire.
              recording.outbound(payload);
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
            recording.barge();
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
        if (msg.media?.payload) {
          const frame = Buffer.from(msg.media.payload, 'base64');
          recording.inbound(frame);
          if (session) session.sendAudioChunk(frame);
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
