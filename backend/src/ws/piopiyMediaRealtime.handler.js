// backend/src/ws/piopiyMediaRealtime.handler.js
/**
 * PIOPIY stream <-> bundled conversational engine (xAI or ElevenLabs) bridge.
 * Mounted at:
 *   /api/v1/piopiy-media/:workspaceId/:agentId?sample-rate=8000&callLogId=…
 *
 * PIOPIY reaches it from the `stream` action in the PCMO array we posted with
 * the dial request (services/telephony/piopiy.provider.js#buildConversationDoc),
 * so the query string above is ours and complete — there is no dashboard object
 * in the path and no second source for the call's identity.
 *
 * ── What differs from the µ-law carrier bridges, and why ────────────────────
 *
 *   audio format   PCM16, not µ-law, and PIOPIY accepts only 8000 or 16000 Hz.
 *                  The bundled engines emit PCM16 at 24kHz, so BOTH directions
 *                  are resampled here — engine 24k down to the socket rate, socket rate up to
 *                  24k for the engine. resamplePcm16 is linear interpolation
 *                  over an 8k telephone signal, which is inaudible against the
 *                  G.711 leg the audio is already travelling over.
 *
 *   the envelope   Outbound is exact and verified against the official SDK
 *                  (piopiy@1.2.0, lib/action/play_stream.js):
 *                      {"type":"streamAudio",
 *                       "data":{"audioDataType":"raw",
 *                               "sampleRate":8000,
 *                               "audioData":"<base64>"}}
 *                  and the control actions are bare {"action":"break"|"pause"
 *                  |"resume"|"stop"} (lib/action/stream_action.js).
 *
 *                  INBOUND IS NOT PUBLICLY DOCUMENTED. PIOPIY publishes the
 *                  send side and its CDR/live-event payloads, but nothing that
 *                  states what it pushes down this socket. Rather than guess one
 *                  shape and produce a call that connects and hears nothing,
 *                  readInboundAudio() accepts the plausible envelopes AND raw
 *                  binary, and the first frame of every call is logged with its
 *                  key names. One live test call turns that log line into a
 *                  certainty; see backend/docs/PIOPIY_INTEGRATION.md §6.
 *
 *   barge-in       `{"action":"break"}` is PIOPIY's interrupt. Our own pacer is
 *                  flushed FIRST, because break only drops what PIOPIY already
 *                  holds, so anything still queued
 *                  here would be emitted afterwards and resurrect the sentence
 *                  the customer just interrupted.
 *
 *   ambience       Off, because the mixer is µ-law-only. Said once in the log,
 *                  not per frame.
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { getAgentKbText } from '../services/agentRuntime.service.js';
import { createRealtimeSession } from '../services/voice/realtimeEngine.factory.js';
import { isModelAllowed } from '../services/platform/modelCatalog.js';
import { createPcmStreamPacer } from '../services/voice/pcmStreamPacer.js';
import { resamplePcm16, bufferToPcm16 } from '../services/voice/telephonyAudio.js';
import { createCallFinalizer } from './callFinalizer.js';
import { openCallBudget } from '../services/billing/callBudget.js';

/** What the bundled engines emit and accept. Not configurable — it is theirs. */
const ENGINE_SAMPLE_RATE = 24000;

const safeJson = (str, fallback) => {
  try { return JSON.parse(str); } catch { return fallback; }
};

/** Int16Array -> little-endian Buffer, without copying the payload. */
const pcm16ToBuffer = (samples) =>
  Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2);

/**
 * Pull caller audio out of whatever PIOPIY sent.
 *
 * The send side of this socket is pinned by the official SDK; the receive side
 * is not published anywhere. So this reads defensively rather than assuming:
 * every field name below is one PIOPIY uses in a payload it DOES document
 * (`audioData` in streamAudio, `data`/`payload`/`media` in its webhooks), plus
 * the raw-binary case, which several carriers use and which needs no envelope
 * at all.
 *
 * Returns a Buffer of PCM16 at the socket's sample rate, or null when the frame
 * carried no audio (a control or status message).
 *
 * @param {Buffer} raw          exactly what arrived on the socket
 * @param {boolean} isBinary    ws's own framing flag
 * @returns {{pcm: Buffer|null, envelope: object|null}}
 */
export function readInboundAudio(raw, isBinary) {
  // Binary frames are the simplest possible case: the payload IS the audio, at
  // the rate both ends agreed on the URL. No envelope to misread.
  if (isBinary) return { pcm: raw, envelope: null };

  const msg = safeJson(raw.toString(), null);
  if (!msg || typeof msg !== 'object') return { pcm: null, envelope: null };

  // Every place PIOPIY puts base64 audio in a documented payload, plus the
  // symmetric counterpart of the frame we send.
  const b64 =
    msg.data?.audioData
    ?? msg.audioData
    ?? msg.media?.payload
    ?? msg.media?.audioData
    ?? (typeof msg.payload === 'string' ? msg.payload : null)
    ?? (typeof msg.data === 'string' ? msg.data : null);

  if (typeof b64 !== 'string' || !b64) return { pcm: null, envelope: msg };
  return { pcm: Buffer.from(b64, 'base64'), envelope: msg };
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {{workspaceId: string, agentId: string, sampleRate: number,
 *          callLogId: string|null}} params  parsed from the upgrade URL
 */
export function handlePiopiyMediaUpgrade(ws, { workspaceId, agentId, sampleRate, callLogId }) {
  let session = null;
  let pacer = null;
  let started = false;
  /** How much talk time the wallet paid for. Armed once the session opens. */
  let budget = null;
  /** One log line per call, not per frame — see readInboundAudio. */
  let loggedFirstFrame = false;
  const transcript = [];
  const startedAt = Date.now();

  const finalizeCallLog = createCallFinalizer({ workspaceId, agentId, label: 'PIOPIY phone call' });

  const cleanup = (status) => {
    // First: a leaked interval would outlive the call permanently. stop() is
    // idempotent because cleanup() is reachable from both `close` and `error`.
    pacer?.stop();
    pacer = null;
    budget?.stop();
    session?.close();
    if (status) finalizeCallLog(callLogId, status, { transcript, startedAt });
  };

  /**
   * PIOPIY opens the socket and starts sending audio immediately — there is no
   * `start` event to hang setup off, the way Twilio and Plivo both have.
   * So the session is built on connection and the first audio frame simply
   * arrives into it.
   */
  const start = async () => {
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
    if (!agent) throw new Error('Agent not found in this workspace');

    const settings = safeJson(agent.settings, {});
    if (settings.voiceEngine !== 'xai' && settings.voiceEngine !== 'elevenlabs') {
      // The modular STT→LLM→TTS pipeline is µ-law-native and PIOPIY has no
      // µ-law option, so there is no bridge for it here. outboundCall.service
      // refuses these before dialling; reaching this line means an agent
      // changed engine between the dial and the pickup.
      throw new Error('Agent is not configured to use a bundled Conversational Agent');
    }
    // Withdrawn by Super Admin after this agent was configured — refuse before
    // the upstream session (and its cost) exists.
    if (!(await isModelAllowed('conversational', settings.voiceEngine))) {
      throw new Error('This conversational engine is no longer available on this platform');
    }

    // Wallet gate + spend deadline, before the upstream session exists so a
    // refused call costs no provider spend. See callBudget.js.
    const gate = await openCallBudget({
      workspaceId,
      type: 'PHONE_CALL',
      label: 'PIOPIY phone call',
      onExpire: () => {
        cleanup('COMPLETED');
        try { ws.close(); } catch { /* already gone */ }
      },
    });
    budget = gate.budget;
    if (!gate.allowed) {
      logger.warn(
        { workspaceId, agentId, callLogId, code: gate.code },
        `PIOPIY phone call refused: ${gate.code}`,
      );
      cleanup('FAILED');
      ws.close();
      return;
    }

    if (settings.ambientSound && process.env.AMBIENCE_PHONE_ENABLED !== 'false') {
      logger.info(
        { workspaceId, agentId },
        'Ambience is not available on PIOPIY (the mixer is µ-law only); call proceeds without it',
      );
    }

    const { kbText } = await getAgentKbText(workspaceId, agentId);
    // PCM16, resampled to the socket rate on the way out. ElevenLabs is the
    // caveat it always is: its output format is fixed on the dashboard agent
    // rather than per session, so an ElevenLabs agent used here must be
    // configured for PCM — a mismatch is audible as speed/pitch, not silence.
    session = createRealtimeSession(settings.voiceEngine, {
      agent, kbText, audioFormat: 'pcm16',
    });

    // The pacer is sized in the SOCKET's rate, because that is what it emits.
    pacer = createPcmStreamPacer({
      sampleRate,
      frameMs: Number(process.env.PIOPIY_FRAME_MS) || undefined,
      onError: (err) => logger.warn(`PIOPIY pacer: ${err.message}`),
      send: (frame) => {
        if (ws.readyState !== ws.OPEN) return;
        // Verbatim the shape the official SDK builds. `raw` is PCM16 at
        // `sampleRate`; the other accepted types (mp3/wav/ogg) are container
        // formats and would need a header per frame.
        ws.send(JSON.stringify({
          type: 'streamAudio',
          data: {
            audioDataType: 'raw',
            sampleRate,
            audioData: frame.toString('base64'),
          },
        }));
      },
    });
    pacer.start();

    // Engine speaks 24k; the socket wants `sampleRate`. Down-convert once here
    // rather than inside the pacer, so the pacer's frame arithmetic only ever
    // deals in the rate it was constructed with.
    session.on('audio', (buf) => {
      if (!pacer) return;
      const out = resamplePcm16(bufferToPcm16(buf), ENGINE_SAMPLE_RATE, sampleRate);
      pacer.push(pcm16ToBuffer(out));
    });

    session.on('transcript', (t) => {
      if (t.done) transcript.push({ role: t.role, content: t.text });
    });

    // Barge-in: drop OUR queued frames first. `break` only flushes what PIOPIY
    // already holds, so anything still in the pacer would be emitted after it
    // and resurrect the sentence the customer just interrupted.
    session.on('clear', () => {
      pacer?.flush();
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ action: 'break' }));
    });

    session.on('error', (err) => logger.warn(`PIOPIY realtime session error: ${err.message}`));
    session.on('close', () => ws.close());

    await session.connect();

    if (callLogId) {
      await prisma.agentCallLog.update({
        where: { id: callLogId },
        data: { status: 'IN_PROGRESS' },
      }).catch(() => {});
    } else {
      // Not fatal — the call still runs — but the transcript, billing and
      // post-call delivery all hang off the log id, so this is the line to look
      // for when a call "worked" and left no trace.
      logger.warn(
        { workspaceId, agentId },
        'PIOPIY stream carried no callLogId on its URL; this call will not be logged, '
        + 'billed or delivered',
      );
    }
  };

  // Kick setup off on connection rather than on a first event, because PIOPIY
  // sends no `start`. Frames that arrive while this is still running are
  // dropped by the `session` guard in the message handler — that is a fraction
  // of a second of the customer's opening word, not a broken call.
  started = true;
  start().catch((err) => {
    logger.error(`Failed to start PIOPIY media session: ${err.message}`);
    cleanup(callLogId ? 'FAILED' : null);
    try { ws.close(); } catch { /* already gone */ }
  });

  ws.on('message', (raw, isBinary) => {
    if (!started) return;

    const { pcm, envelope } = readInboundAudio(raw, isBinary);

    // The one line that turns the undocumented inbound shape into a known one.
    // Keys only — never the payload, which is somebody's phone call.
    if (!loggedFirstFrame) {
      loggedFirstFrame = true;
      logger.info(
        {
          workspaceId,
          agentId,
          callLogId,
          binary: Boolean(isBinary),
          keys: envelope ? Object.keys(envelope) : null,
          nested: envelope?.data && typeof envelope.data === 'object'
            ? Object.keys(envelope.data) : null,
          audioBytes: pcm?.length ?? 0,
        },
        'PIOPIY first inbound frame',
      );
      if (!pcm) {
        logger.warn(
          { workspaceId, agentId, callLogId },
          'PIOPIY sent a first frame carrying no audio this bridge recognises. If the agent '
          + 'cannot hear the caller, the key names logged above are what readInboundAudio '
          + 'needs to accept — see backend/docs/PIOPIY_INTEGRATION.md §6.',
        );
      }
    }

    if (!pcm || !session) return;

    // Socket rate up to the engine's 24k. The far leg is an 8k phone either
    // way, so this restores nothing — it only matches the rate the engine was
    // opened at, which is what keeps pitch and speed correct.
    const up = resamplePcm16(bufferToPcm16(pcm), sampleRate, ENGINE_SAMPLE_RATE);
    session.sendAudioChunk(pcm16ToBuffer(up));
  });

  ws.on('close', () => {
    logger.info(
      { workspaceId, agentId, callLogId, ...(pacer?.stats() || {}) },
      `PIOPIY stream ended after ${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
    // PIOPIY sends no `stop` event — the socket closing is the only end-of-call
    // signal there is, exactly as on Plivo.
    cleanup(callLogId ? 'COMPLETED' : null);
  });

  ws.on('error', (err) => {
    logger.warn(`PIOPIY media stream socket error: ${err.message}`);
    cleanup('FAILED');
  });
}
