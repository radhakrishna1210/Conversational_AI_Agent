// backend/src/ws/plivoMediaRealtime.handler.js
/**
 * Plivo AudioStream <-> bundled conversational engine (xAI or ElevenLabs)
 * bridge. Mounted at:
 *   /api/v1/plivo-media/:workspaceId/:agentId?callLogId=…
 *
 * Plivo connects here when the answer URL (controllers/plivo.controller.js)
 * returns `<Stream bidirectional="true" keepCallAlive="true">`.
 *
 * Same codec as the Twilio bridge — base64 mu-law 8 kHz, requested from the
 * engine as `g711_ulaw`, so audio passes through untranscoded in both
 * directions — but a DIFFERENT ENVELOPE around it. The four differences, all of
 * which are silent failures if got wrong:
 *
 *   Twilio                                  Plivo
 *   ──────────────────────────────────────  ────────────────────────────────────
 *   send {event:'media', streamSid,         send {event:'playAudio', media:{
 *         media:{payload}}                        contentType, sampleRate, payload}}
 *   flush {event:'clear', streamSid}        flush {event:'clearAudio', streamId}
 *   start.streamSid                         start.streamId
 *   start.customParameters.callLogId        (nothing — it rides on the socket URL)
 *   sends a `stop` event                    NEVER sends `stop`
 *
 * That last one is why `cleanup` here is driven entirely by socket close.
 * Copying the Twilio bridge's `case 'stop'` would produce a bridge that works
 * perfectly and never settles a single call.
 *
 * Protocol reference:
 * https://www.plivo.com/docs/voice-agents/audio-streaming/concepts/audio-streaming-reference
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { getAgentKbText } from '../services/agentRuntime.service.js';
import { createRealtimeSession } from '../services/voice/realtimeEngine.factory.js';
import { isModelAllowed } from '../services/platform/modelCatalog.js';
import { createAmbiencePump } from '../services/voice/ambiencePump.js';
import { createUlawPacer } from '../services/voice/ulawPacer.js';
import { createCallFinalizer } from './callFinalizer.js';
import { createRecordingTap } from './callRecordingTap.js';
import { openCallBudget } from '../services/billing/callBudget.js';
import { STREAM_CONTENT_TYPE, STREAM_SAMPLE_RATE } from '../services/telephony/plivo.provider.js';

const safeJson = (str, fallback) => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

export function handlePlivoMediaUpgrade(ws, { workspaceId, agentId, callLogId = null }) {
  let session = null;
  let pump = null;      // realtime outbound clock: ambience pump, else bare pacer
  let streamId = null;
  /** How much talk time the wallet paid for. Armed at `start`. */
  let budget = null;
  const transcript = [];
  const startedAt = Date.now();

  const finalizeCallLog = createCallFinalizer({
    workspaceId, agentId, label: 'Plivo phone call',
  });

  /** Both legs, mixed to one WAV at hangup. See callRecordingTap.js. */
  const recording = createRecordingTap({ label: 'Plivo phone call', startedAt });

  const cleanup = (status) => {
    // First: a leaked 20ms interval would outlive the call permanently.
    pump?.stop();
    pump = null;
    budget?.stop();
    session?.close();
    recording.save(callLogId);
    if (status) finalizeCallLog(callLogId, status, { transcript, startedAt });
  };

  /**
   * One outbound audio frame.
   *
   * contentType and sampleRate are sent on EVERY frame, not just the first —
   * that is Plivo's format, not redundancy on our part. They must also match
   * the `contentType` on the `<Stream>` element that opened this socket, which
   * is why both come from the provider module rather than being spelled out
   * again here.
   */
  const sendFrame = (payload) => {
    if (ws.readyState !== ws.OPEN) return;
    // Tapped here rather than on the engine's `audio` event, so the recording
    // matches what the caller heard: with ambience enabled the pump owns pacing
    // and mixes the bed in, and only what reaches this function is on the wire.
    recording.outbound(payload);
    ws.send(JSON.stringify({
      event: 'playAudio',
      media: {
        contentType: STREAM_CONTENT_TYPE,
        sampleRate: STREAM_SAMPLE_RATE,
        payload: payload.toString('base64'),
      },
    }));
  };

  ws.on('message', async (raw) => {
    const msg = safeJson(raw.toString(), null);
    if (!msg?.event) return;

    switch (msg.event) {
      case 'start': {
        streamId = msg.start?.streamId || msg.streamId || null;

        try {
          const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
          if (!agent) throw new Error('Agent not found in this workspace');
          const settings = safeJson(agent.settings, {});
          if (settings.voiceEngine !== 'xai' && settings.voiceEngine !== 'elevenlabs') {
            throw new Error('Agent is not configured to use a bundled Conversational Agent');
          }
          if (!(await isModelAllowed('conversational', settings.voiceEngine))) {
            throw new Error('This conversational engine is no longer available on this platform');
          }

          // Wallet gate + spend deadline, before the upstream session exists so
          // a refused call costs no provider spend. Note that Plivo's <Stream>
          // carries keepCallAlive, so closing this socket silences the agent
          // rather than dropping the line — the caller then hangs up, and no
          // further minutes are generated either way. See callBudget.js.
          const gate = await openCallBudget({
            workspaceId,
            type: 'PHONE_CALL',
            label: 'Plivo phone call',
            onExpire: () => {
              cleanup('COMPLETED');
              try { ws.close(); } catch { /* already gone */ }
            },
          });
          budget = gate.budget;
          if (!gate.allowed) {
            logger.warn(
              { workspaceId, agentId, callLogId, code: gate.code },
              `Plivo phone call refused: ${gate.code}`,
            );
            cleanup('FAILED');
            ws.close();
            return;
          }

          const { kbText } = await getAgentKbText(workspaceId, agentId);
          session = createRealtimeSession(settings.voiceEngine, {
            agent, kbText, audioFormat: 'g711_ulaw',
          });

          // There is ALWAYS a clock on this leg now. Ambience gives us one as a
          // side effect of mixing a bed, but it is built only when a real preset
          // is selected — so an agent without ambience used to hand the engine's
          // output straight to the socket, and a realtime engine emits a whole
          // sentence far faster than realtime. Plivo consumes at a fixed 20ms
          // cadence and answers a burst with growing playback latency rather
          // than an error, so that path was silently slow. The bare pacer is the
          // same clock without the mixing. Interfaces are identical by design.
          if (process.env.AMBIENCE_PHONE_ENABLED !== 'false') {
            pump = createAmbiencePump({
              presetName: settings.ambientSound,
              send: sendFrame,
              onError: (err) => logger.warn(`Ambience pump: ${err.message}`),
            });
          }
          pump ??= createUlawPacer({
            send: sendFrame,
            onError: (err) => logger.warn(`Plivo outbound pacer: ${err.message}`),
          });

          // Optional-chained: cleanup() nulls `pump`, and the engine can emit
          // one more frame after the socket has gone.
          session.on('audio', (buf) => pump?.push(buf));
          session.on('transcript', (t) => {
            if (t.done) transcript.push({ role: t.role, content: t.text });
          });
          // Barge-in. Drop OUR queued engine audio first: `clearAudio` only
          // flushes what Plivo holds, and anything still queued on this side
          // would be sent afterwards and resurrect the interrupted sentence.
          session.on('clear', () => {
            pump?.flush();
            recording.barge();
            if (ws.readyState === ws.OPEN && streamId) {
              ws.send(JSON.stringify({ event: 'clearAudio', streamId }));
            }
          });
          session.on('error', (err) => logger.warn(`Plivo call session error: ${err.message}`));
          session.on('close', () => ws.close());

          await session.connect();
          pump?.start();

          if (callLogId) {
            await prisma.agentCallLog.update({
              where: { id: callLogId },
              data: { status: 'IN_PROGRESS' },
            }).catch(() => {});
          }
        } catch (err) {
          logger.error(`Failed to start Plivo call session: ${err.message}`);
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

      // Acknowledgements. Logged at debug level only — they are useful when
      // chasing a barge-in that did not take, and noise otherwise.
      case 'clearedAudio':
      case 'playedStream':
        break;

      case 'dtmf':
        // No IVR on this path yet. Named explicitly so it does not fall into
        // `default` and look like an unknown event when someone reads the logs.
        break;

      default:
        break;
    }
  });

  // Plivo sends no `stop` event, so this is the ONLY place a call ends. The
  // status is COMPLETED rather than conditional because reaching here at all
  // means the socket was open, which means Plivo had connected the callee.
  ws.on('close', () => cleanup(callLogId ? 'COMPLETED' : null));
  ws.on('error', (err) => {
    logger.warn(`Plivo media stream socket error: ${err.message}`);
    cleanup('FAILED');
  });
}
