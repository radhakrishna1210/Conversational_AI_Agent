// backend/src/ws/exotelMediaRealtime.handler.js
/**
 * Exotel AgentStream <-> bundled conversational engine (xAI or ElevenLabs)
 * bridge — the Exotel twin of twilioMediaRealtime.handler.js. Mounted at:
 *   /api/v1/exotel-media/:workspaceId/:agentId?sample-rate=24000&callLogId=…
 *
 * Exotel reaches it either from `StreamUrl` on the dial request (stream mode,
 * where the query string above is ours and complete) or from a Voicebot applet
 * in a dashboard flow (app mode, where the call log id can only arrive as
 * `CustomField` on the `start` event). Both are handled; stream mode is the one
 * whose routing we control end to end.
 *
 * ── What differs from the Twilio bridge, and why ─────────────────────────────
 *
 *   audio format   Exotel speaks 16-bit linear PCM, not µ-law. That costs
 *                  nothing: the engine is simply asked for 'pcm16' instead of
 *                  'g711_ulaw', the same way the browser Web Call already does.
 *                  At the default 24kHz it matches what the bundled engines
 *                  emit natively, so neither direction is resampled.
 *
 *   pacing         Twilio buffers whatever arrives whenever it arrives. Exotel
 *                  drops streams that are blasted, needs 320-byte-aligned
 *                  frames, and treats the media event's chunk / timestamp /
 *                  sequenceNumber as load bearing. All of that lives in
 *                  services/voice/pcmStreamPacer.js, which is therefore NOT
 *                  optional here the way the ambience pump is on Twilio.
 *
 *   ambience       Off. The mixer is µ-law-only (logarithmic, 160-byte frames);
 *                  mixing PCM16 is a different implementation, not a config
 *                  change. An agent with ambience selected still calls fine, it
 *                  just has no bed — said once in the log, not per frame.
 *
 *   the 10s rule   Exotel FAILS the session if the bot goes quiet for 10
 *                  seconds mid-turn, and caps calls at 60 minutes. A slow LLM
 *                  turn does not degrade this call, it drops it. Nothing here
 *                  can fix that; it is why the log line on `stop` records how
 *                  far into the call we were.
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { getAgentKbText } from '../services/agentRuntime.service.js';
import { createRealtimeSession } from '../services/voice/realtimeEngine.factory.js';
import { isModelAllowed } from '../services/platform/modelCatalog.js';
import { createPcmStreamPacer } from '../services/voice/pcmStreamPacer.js';
import { createCallFinalizer } from './callFinalizer.js';
import { openCallBudget } from '../services/billing/callBudget.js';

const safeJson = (str, fallback) => {
  try { return JSON.parse(str); } catch { return fallback; }
};

/**
 * Dig the call log id out of whatever Exotel sent.
 *
 * The URL is checked first and trusted: in stream mode we put it there
 * ourselves, and it arrives with the socket. CustomField is the app-mode
 * fallback and is doubly awkward — Exotel echoes it as a JSON string in some
 * paths and as an already-parsed object in others, and the sample bridges show
 * `start` fields appearing in both camelCase and snake_case.
 */
function resolveCallLogId(msg, fromQuery) {
  if (fromQuery) return fromQuery;
  const start = msg?.start || msg || {};
  const custom = start.customParameters || start.custom_parameters || {};
  const direct = custom.callLogId || custom.CallLogId;
  if (direct) return String(direct);

  const raw = custom.CustomField ?? custom.customField ?? start.CustomField ?? start.custom_field;
  if (!raw) return null;
  if (typeof raw === 'object') return raw.callLogId ? String(raw.callLogId) : null;
  const parsed = safeJson(String(raw), null);
  return parsed?.callLogId ? String(parsed.callLogId) : null;
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {{workspaceId: string, agentId: string, sampleRate: number,
 *          callLogId: string|null}} params  parsed from the upgrade URL
 */
export function handleExotelMediaUpgrade(ws, { workspaceId, agentId, sampleRate, callLogId: urlCallLogId }) {
  let session = null;
  let pacer = null;
  let streamSid = null;
  let callLogId = urlCallLogId || null;
  /** How much talk time the wallet paid for. Armed at `start`. */
  let budget = null;
  const transcript = [];
  const startedAt = Date.now();

  const finalizeCallLog = createCallFinalizer({ workspaceId, agentId, label: 'Exotel phone call' });

  const cleanup = (status) => {
    // First: a leaked interval would outlive the call permanently. stop() is
    // idempotent because cleanup() is reachable from both `stop` and `close`.
    pacer?.stop();
    pacer = null;
    budget?.stop();
    session?.close();
    if (status) finalizeCallLog(callLogId, status, { transcript, startedAt });
  };

  ws.on('message', async (raw) => {
    const msg = safeJson(raw.toString(), null);
    // Exotel's own reference bridge tolerates `Event` as well as `event`.
    const event = msg?.event || msg?.Event;
    if (!event) return;

    switch (event) {
      case 'connected':
        break;

      case 'start': {
        const start = msg.start || msg;
        streamSid = msg.streamSid || msg.stream_sid || start.streamSid || start.stream_sid || null;
        if (!streamSid) {
          // Every outbound frame carries streamSid, so without one we would sit
          // mute for the whole call. Exotel's own reference bridge invents an id
          // in this case rather than giving up, and so do we — a rejected frame
          // is diagnosable, silence is not.
          streamSid = `stream-${Date.now().toString(36)}`;
          logger.warn({ workspaceId, agentId, streamSid }, 'Exotel start event carried no streamSid; using a synthetic one');
        }
        callLogId = resolveCallLogId(msg, urlCallLogId);

        try {
          const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
          if (!agent) throw new Error('Agent not found in this workspace');
          const settings = safeJson(agent.settings, {});
          if (settings.voiceEngine !== 'xai' && settings.voiceEngine !== 'elevenlabs') {
            // The modular STT→LLM→TTS pipeline has no Exotel bridge yet: its
            // whole audio path is µ-law-native. Fail here rather than run half
            // a pipeline — outboundCall.service refuses these before dialling,
            // so reaching this line means an agent changed engine mid-flight.
            throw new Error('Agent is not configured to use a bundled Conversational Agent');
          }
          // Withdrawn by Super Admin after this agent was configured — refuse
          // before the upstream session (and its cost) is created.
          if (!(await isModelAllowed('conversational', settings.voiceEngine))) {
            throw new Error('This conversational engine is no longer available on this platform');
          }
          // Wallet gate + spend deadline, before the upstream session exists so
          // a refused call costs no provider spend. See callBudget.js.
          const gate = await openCallBudget({
            workspaceId,
            type: 'PHONE_CALL',
            label: 'Exotel phone call',
            onExpire: () => {
              cleanup('COMPLETED');
              try { ws.close(); } catch { /* already gone */ }
            },
          });
          budget = gate.budget;
          if (!gate.allowed) {
            logger.warn(
              { workspaceId, agentId, callLogId, code: gate.code },
              `Exotel phone call refused: ${gate.code}`,
            );
            cleanup('FAILED');
            ws.close();
            return;
          }

          if (settings.ambientSound && process.env.AMBIENCE_PHONE_ENABLED !== 'false') {
            logger.info(
              { workspaceId, agentId },
              'Ambience is not available on Exotel (the mixer is µ-law only); call proceeds without it',
            );
          }

          const { kbText } = await getAgentKbText(workspaceId, agentId);
          // PCM16, matching the socket. ElevenLabs is the caveat: its output
          // format is fixed on the dashboard agent rather than per session, so
          // an ElevenLabs agent used on Exotel must be configured for PCM at
          // this same rate — a mismatch is audible as speed/pitch, not silence.
          session = createRealtimeSession(settings.voiceEngine, {
            agent, kbText, audioFormat: 'pcm16',
          });

          pacer = createPcmStreamPacer({
            sampleRate,
            onError: (err) => logger.warn(`Exotel pacer: ${err.message}`),
            send: (frame, meta) => {
              if (ws.readyState !== ws.OPEN || !streamSid) return;
              ws.send(JSON.stringify({
                event: 'media',
                streamSid,
                media: {
                  payload: frame.toString('base64'),
                  // Exotel's reference bridge warns that omitting these makes
                  // Connect streams drop or end early. Strings, as it sends them.
                  chunk: String(meta.chunk),
                  timestamp: String(meta.timestampMs),
                  sequenceNumber: String(meta.sequenceNumber),
                },
              }));
            },
          });
          pacer.start();

          session.on('audio', (buf) => pacer?.push(buf));
          session.on('transcript', (t) => {
            if (t.done) transcript.push({ role: t.role, content: t.text });
          });
          // Barge-in: drop OUR queued frames first — Exotel's `clear` only
          // flushes what Exotel already holds, so anything still in the pacer
          // would be emitted afterwards and resurrect the interrupted sentence.
          session.on('clear', () => {
            pacer?.flush();
            if (ws.readyState === ws.OPEN && streamSid) {
              ws.send(JSON.stringify({ event: 'clear', streamSid }));
            }
          });
          session.on('error', (err) => logger.warn(`Exotel realtime session error: ${err.message}`));
          session.on('close', () => ws.close());

          await session.connect();

          if (callLogId) {
            await prisma.agentCallLog.update({
              where: { id: callLogId },
              data: { status: 'IN_PROGRESS' },
            }).catch(() => {});
          } else {
            // Not fatal — the call still runs — but the transcript, billing and
            // post-call delivery all hang off the log id, so this is the line
            // to look for when a call "worked" and left no trace.
            logger.warn(
              { workspaceId, agentId, streamSid },
              'Exotel stream carried no callLogId (neither on the URL nor in CustomField); '
              + 'this call will not be logged, billed or delivered',
            );
          }
        } catch (err) {
          logger.error(`Failed to start Exotel media session: ${err.message}`);
          cleanup(callLogId ? 'FAILED' : null);
          ws.close();
        }
        break;
      }

      case 'media':
        // Caller audio: PCM16 at `sampleRate`, which is exactly what the engine
        // was opened with. No transcoding in this direction either.
        if (session && msg.media?.payload) {
          session.sendAudioChunk(Buffer.from(msg.media.payload, 'base64'));
        }
        break;

      case 'mark':
        // Playback marker echo. Nothing here schedules by mark, so it is only
        // useful as evidence of how much of our audio Exotel actually played.
        break;

      case 'stop':
      case 'closed':
        logger.info(
          { workspaceId, agentId, streamSid, ...(pacer?.stats() || {}) },
          `Exotel stream ended after ${Math.round((Date.now() - startedAt) / 1000)}s`,
        );
        cleanup('COMPLETED');
        break;

      default:
        break;
    }
  });

  ws.on('close', () => cleanup(callLogId ? 'COMPLETED' : null));
  ws.on('error', (err) => {
    logger.warn(`Exotel media stream socket error: ${err.message}`);
    cleanup('FAILED');
  });
}
