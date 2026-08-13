// backend/src/ws/modularMediaBridge.js
/**
 * Carrier media stream <-> MODULAR (STT -> LLM -> TTS) agent bridge.
 * Mounted alongside the bundled bridge at:
 *   /api/v1/twilio-media/:workspaceId/:agentId
 *   /api/v1/plivo-media/:workspaceId/:agentId
 *
 * ── One body, one adapter per carrier ────────────────────────────────────────
 *
 * This was `twilioMediaModular.handler.js` until Plivo needed the same bridge.
 * Everything below is carrier-agnostic; the four things that genuinely differ
 * live in a `carrier` adapter passed in by the thin per-carrier handlers:
 *
 *   readStart    where the stream id and call log id come from on `start`
 *   sendAudio    the envelope around one 20ms mu-law frame
 *   clearAudio   the flush message that drops buffered playback on barge-in
 *   label        names the bridge in log lines and the call finalizer
 *
 * Extracted rather than copied for the same reason `callFinalizer.js` was: the
 * barge-in tuning below is hard-won from live PSTN calls, and a second copy of
 * it would drift silently until one carrier's calls started cutting out.
 *
 * ── Why this file has to exist at all ────────────────────────────────────────
 *
 * The bundled engines (xAI / ElevenLabs Conversational AI) hold the whole
 * conversation inside the provider's own realtime session, so
 * twilioMediaRealtime.handler.js is a pipe: carrier bytes in, engine bytes out.
 *
 * The modular pipeline has no such session. Its web-call handler is explicit
 * that "the CLIENT owns endpointing, the conversation history and barge-in" —
 * the browser's VAD decides when a turn ends and sends start-turn / end-turn /
 * barge control frames. A phone caller has no browser. Twilio just streams
 * 8kHz mu-law forever and says nothing about turns.
 *
 * So the job of this file is to BE the missing client:
 *
 *   1. turn detection      Deepgram's semantic endpointing (already used for
 *                          web calls) fires onEndOfTurn, replacing the
 *                          browser's analyser VAD.
 *   2. conversation state  history lives here for the life of the call, not in
 *                          a client that doesn't exist.
 *   3. barge-in            an energy gate on the inbound track replaces the
 *                          browser's barge message, and becomes the carrier's
 *                          `clear` so buffered agent audio is dropped.
 *   4. audio format        Deepgram is opened in mulaw/8000 so caller audio
 *                          passes through untranscoded, and TTS is asked for
 *                          the provider's telephony format so agent audio does
 *                          too. No MP3 decode anywhere on the live path.
 *
 * Everything else — prompt building, knowledge base, the LLM, sentence
 * splitting, fillers — is the SAME voiceTurnStream the browser calls. That is
 * deliberate: a phone call and a web call must not be able to diverge in
 * behaviour, because the web call is how people test what the phone will do.
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { voiceTurnStream, getRenderedWelcome } from '../services/agentRuntime.service.js';
import { resolveAgentVoice, streamSynthesizeVoice } from '../services/voice.service.js';
import {
  DeepgramStreamSession,
  isDeepgramConfigured,
  toDeepgramLanguage,
} from '../services/stt/deepgramStream.service.js';
import { createFillerBudget } from '../services/voice/disfluency.js';
import {
  decodeUlaw,
  createFrameSplitter,
  pcmToTelephonyUlaw,
  telephonyOutputFormat,
  PHONE_SAMPLE_RATE,
} from '../services/voice/telephonyAudio.js';
import { createCallFinalizer } from './callFinalizer.js';

const safeJson = (str, fallback) => {
  try { return JSON.parse(str); } catch { return fallback; }
};

/**
 * Barge-in detection, in mu-law RMS over one 20ms frame.
 *
 * Deliberately energy-based rather than transcript-based: waiting for Deepgram
 * to return a word costs 300-600ms, and a caller who has started talking over
 * the agent expects it to stop within a syllable.
 *
 * A FALSE POSITIVE IS NOT CHEAP, which an earlier version of this comment got
 * wrong. Barge-in does not pause the agent — it sets abortTurn (killing the
 * audio pump mid-utterance) and sends the carrier a `clear`, which discards
 * everything the carrier had buffered. The caller hears one word and then
 * silence, for the rest of the turn. On a live PSTN call that was the observed
 * behaviour: a greeting that reached "Hello" and stopped.
 *
 * The cause was an ABSOLUTE threshold. A phone line is never silent — comfort
 * noise, handset noise and room tone sit far above the old 900 floor, so the
 * detector fired on the caller's own line within the first 60ms, every call.
 * Three things fix it, and all three are needed:
 *
 *   1. measure the line. The noise floor is whatever THIS call's inbound audio
 *      does while the agent is not speaking; the threshold is a multiple of it,
 *      never a constant guessed in advance.
 *   2. an absolute minimum underneath, so an unnaturally quiet line cannot make
 *      the threshold so low that noise clears it anyway.
 *   3. a grace window after the agent starts speaking. Handsets and speakerphones
 *      echo our own audio back up the inbound leg, and its onset is the loudest
 *      part — without this the agent reliably barges itself.
 */
const BARGE_RMS_MIN = Number(process.env.PHONE_BARGE_RMS) || 2500;
/** Speech must exceed the measured noise floor by this factor. */
const BARGE_MARGIN = Number(process.env.PHONE_BARGE_MARGIN) || 3;
/** Consecutive loud frames before we believe it. 5 x 20ms = 100ms of speech. */
const BARGE_FRAMES = Number(process.env.PHONE_BARGE_FRAMES) || 5;
/** Ignore inbound energy for this long after the agent starts talking (echo). */
const BARGE_GRACE_MS = Number(process.env.PHONE_BARGE_GRACE_MS) || 500;
/** Weight of each new quiet frame in the running noise-floor estimate. */
const NOISE_EMA_ALPHA = 0.05;

/** RMS of a decoded mu-law frame. */
function frameRms(ulawBuf) {
  const pcm = decodeUlaw(ulawBuf);
  if (!pcm.length) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / pcm.length);
}

/**
 * @param {object} p
 * @param {string} p.workspaceId
 * @param {string} p.agentId
 * @param {string|null} [p.callLogId]  carriers that carry it on the socket URL
 *   (Plivo) pass it here; carriers that put it in the `start` event (Twilio)
 *   return it from `carrier.readStart` instead.
 * @param {object} p.carrier           see the header comment
 */
export function runModularMediaBridge(ws, { workspaceId, agentId, callLogId: initialCallLogId = null, carrier }) {
  let agent = null;
  let settings = {};
  let voice = null;
  let ttsFormat = null;

  let streamId = null;
  let callLogId = initialCallLogId;
  let closed = false;

  let dg = null;
  let dgTurnSeq = 0;
  let dgLanguage;

  /** Full conversation, owned here because there is no client to own it. */
  const history = [];
  const transcript = [];
  const fillerBudget = createFillerBudget();
  const startedAt = Date.now();

  // Turn state
  let speaking = false;       // agent audio is being sent right now
  let turnRunning = false;    // a turn is generating (LLM/TTS in flight)
  let bargeCount = 0;
  let abortTurn = false;
  /** When the current stretch of agent audio began — drives the echo grace. */
  let speakingSince = 0;
  /** This line's measured noise floor, learned while the agent is quiet. */
  let noiseFloor = 0;
  let noiseSamples = 0;

  /** Mark the agent as speaking, restarting the echo grace window. */
  const beginSpeaking = () => { speaking = true; speakingSince = Date.now(); };

  const sendFrame = (frame) => {
    if (ws.readyState === ws.OPEN && streamId) carrier.sendAudio(ws, streamId, frame);
  };

  /** Drop the carrier's buffered playback — the caller has interrupted. */
  const clearPlayback = () => {
    if (ws.readyState === ws.OPEN && streamId) carrier.clearAudio(ws, streamId);
  };

  /**
   * Push one synthesized audio stream to the carrier as 20ms mu-law frames.
   * `contentType` decides whether bytes are already mu-law (the native case) or
   * PCM that still needs converting.
   */
  const pumpAudio = async (stream, contentType, isUlaw) => {
    const splitter = createFrameSplitter();
    for await (const chunk of stream) {
      if (abortTurn || closed) break;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (!buf.length) continue;
      const ulaw = isUlaw
        ? buf
        : pcmToTelephonyUlaw(buf, ttsFormat?.rate || 24000);
      for (const frame of splitter.push(ulaw)) sendFrame(frame);
    }
    if (abortTurn || closed) { splitter.reset(); return; }
    const tail = splitter.flush();
    if (tail) sendFrame(tail);
  };

  /** Speak a fixed line (the welcome message) without running a full turn. */
  const speakLine = async (text) => {
    if (!text || !voice || closed) return;
    beginSpeaking();
    try {
      const { stream, contentType } = await streamSynthesizeVoice(voice, text, {
        fast: true,
        pace: Number(settings.speakingRate) || 1.05,
        ...(ttsFormat?.kind === 'native' ? { audioFormat: ttsFormat.format } : {}),
      });
      await pumpAudio(stream, contentType, ttsFormat?.kind === 'native');
      transcript.push({ role: 'assistant', content: text });
      history.push({ role: 'assistant', content: text });
    } catch (err) {
      logger.warn(`Phone greeting synthesis failed: ${err.message}`);
    } finally {
      speaking = false;
    }
  };

  /**
   * One caller turn: harvest the streamed transcript, run the shared runtime,
   * stream the reply back as mu-law.
   */
  const runTurn = async () => {
    if (turnRunning || closed) return;
    turnRunning = true;
    abortTurn = false;

    try {
      let userText = '';
      try {
        userText = await dg.finalizeTurn(1200, dgTurnSeq);
      } catch { /* nothing usable this turn */ }
      if (!dg?.isAlive) dg = null;

      // Silence gate. Without a client-side VAD to discard noise-only segments,
      // an empty transcript here is common (line noise, a cough, the caller
      // breathing). Running a turn on it makes the agent answer a phantom
      // sentence, which on a phone call sounds like it is talking to itself.
      if (!userText.trim()) return;

      transcript.push({ role: 'user', content: userText });
      history.push({ role: 'user', content: userText });

      let replyText = '';
      let pending = null;

      await voiceTurnStream(
        workspaceId,
        agentId,
        null,
        null,
        history.slice(0, -1),
        {
          userText,
          audioHadSpeech: true,
          fillerBudget,
          // Ask TTS for the carrier's own format when the provider can do it.
          ...(ttsFormat?.kind === 'native' ? { audioFormat: ttsFormat.format } : {}),
          shouldAbort: () => abortTurn || closed,
          onEvent: (ev) => {
            switch (ev.type) {
              case 'audio-start':
                beginSpeaking();
                pending = createFrameSplitter();
                break;
              case 'audio-chunk': {
                if (abortTurn || closed || !pending) break;
                const buf = Buffer.from(ev.data, 'base64');
                const ulaw = ttsFormat?.kind === 'native'
                  ? buf
                  : pcmToTelephonyUlaw(buf, ttsFormat?.rate || 24000);
                for (const frame of pending.push(ulaw)) sendFrame(frame);
                break;
              }
              case 'audio-end': {
                if (pending && !abortTurn && !closed) {
                  const tail = pending.flush();
                  if (tail) sendFrame(tail);
                }
                pending = null;
                break;
              }
              case 'done':
                if (ev.reply) replyText = ev.reply;
                break;
              default:
                break;
            }
          },
        },
      );

      if (replyText) {
        transcript.push({ role: 'assistant', content: replyText });
        history.push({ role: 'assistant', content: replyText });
      }
    } catch (err) {
      logger.warn(`Modular phone turn failed: ${err.message}`);
    } finally {
      speaking = false;
      turnRunning = false;
      // Arm the next turn only if the call is still up.
      //
      // The sequence number MUST come from beginTurn(), never from a counter
      // kept here. finalizeTurn() compares the seq it is given against the
      // session's own _turnSeq and returns '' when they differ (the cross-turn
      // bleed guard). Incrementing a local copy instead drifted permanently out
      // of step, so every finalizeTurn returned '' and the agent never once
      // answered the caller — the greeting played and the call went dead.
      if (dg && !closed) dgTurnSeq = dg.beginTurn();
    }
  };

  const openDeepgram = () => {
    dgLanguage = toDeepgramLanguage(settings.sttLanguage || agent?.transcription);
    dg = new DeepgramStreamSession({
      // The carrier's own wire format — no transcoding in either direction.
      encoding: 'mulaw',
      sampleRate: PHONE_SAMPLE_RATE,
      language: dgLanguage,
      endpointingMs: Number(process.env.DEEPGRAM_ENDPOINTING_MS) || 500,
      onEndOfTurn: () => { runTurn(); },
    });
    dg.connect();
    // Same rule as in runTurn's finally: the seq is whatever the session says
    // it is. The web-call bridge has always done this (`dgTurnSeq =
    // dgSession.beginTurn()`); the phone bridge dropped the return value, which
    // is the whole reason phone calls never got a reply while web calls did.
    dgTurnSeq = dg.beginTurn();
  };

  // Status write + wallet settlement + post-call delivery, exactly once. Shared
  // with the bundled and Exotel bridges — see ws/callFinalizer.js.
  const finalizeCallLog = createCallFinalizer({
    workspaceId, agentId, label: carrier.label,
  });

  const cleanup = (status) => {
    closed = true;
    abortTurn = true;
    try { dg?.close(); } catch { /* already gone */ }
    dg = null;
    if (status) finalizeCallLog(callLogId, status, { transcript, startedAt });
  };

  ws.on('message', async (raw) => {
    const msg = safeJson(raw.toString(), null);
    if (!msg?.event) return;

    switch (msg.event) {
      case 'connected':
        break;

      case 'start': {
        const started = carrier.readStart(msg) || {};
        streamId = started.streamId ?? null;
        // Only override when the carrier actually supplies one: Plivo has no
        // per-call parameters on `start`, so its id arrives on the socket URL
        // and must survive this.
        if (started.callLogId) callLogId = started.callLogId;

        try {
          agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
          if (!agent) throw new Error('Agent not found in this workspace');
          settings = safeJson(agent.settings, {});

          if (!isDeepgramConfigured()) {
            throw new Error('Deepgram is not configured; the modular phone bridge needs streaming STT');
          }

          voice = await resolveAgentVoice(agent.voice);
          if (!voice) throw new Error('Agent has no resolvable voice');

          ttsFormat = telephonyOutputFormat(voice.provider?.name || settings.ttsProvider);
          if (!ttsFormat) {
            throw new Error(
              `TTS provider ${voice.provider?.name} cannot emit a telephony audio format`,
            );
          }

          openDeepgram();

          if (callLogId) {
            await prisma.agentCallLog.update({
              where: { id: callLogId },
              data: { status: 'IN_PROGRESS' },
            }).catch(() => {});
          }

          // Greet immediately. A carrier connects the media stream the moment
          // the callee answers, and silence on answer is what makes people hang
          // up before the agent has said anything.
          //
          // The RENDERED welcome, not the raw field. getRenderedWelcome is what
          // the web call speaks (the client fetches /agents/:id/welcome), and it
          // is where the agent's configured language is applied — "a welcome
          // stored in English must be spoken in Hindi when Hindi is the selected
          // language". It also strips [placeholders], de-robotifies greetings
          // that call themselves an AI, and fixes an OUTBOUND agent that thanks
          // the caller "for calling". Reading agent.welcomeMessage directly here
          // meant the phone call opened in English while the web call opened in
          // Hindi, from the same Assistant Details — the phone is a transport
          // for this agent, not a different agent.
          //
          // Result is cached on the agent row by content hash, so this is not an
          // LLM round trip per call.
          let greeting = agent.welcomeMessage || `Hello, this is ${agent.name}.`;
          try {
            const rendered = await getRenderedWelcome(workspaceId, agentId);
            if (rendered?.welcome) greeting = rendered.welcome;
          } catch (e) {
            // Never block the call on it — an un-translated greeting is far
            // better than dead air on answer.
            logger.warn(`Welcome rendering failed, using the raw message: ${e.message}`);
          }
          await speakLine(greeting);
        } catch (err) {
          logger.error(`Failed to start ${carrier.label}: ${err.message}`);
          cleanup('FAILED');
          ws.close();
        }
        break;
      }

      case 'media': {
        if (!dg || !msg.media?.payload) break;
        const frame = Buffer.from(msg.media.payload, 'base64');

        // Always feed STT — including while the agent speaks, so the words a
        // caller says over the top are not lost when the barge lands.
        try { dg.send(frame); } catch { /* session died; next turn recreates */ }

        const rms = frameRms(frame);

        if (!speaking) {
          // Learn this line's floor while the agent is quiet. Anything at or
          // below the current estimate is treated as noise; a caller speaking
          // during their own turn is far above it and must not drag the floor
          // up, or the next barge would need to be shouted.
          if (noiseSamples < 5 || rms <= noiseFloor * BARGE_MARGIN) {
            noiseFloor = noiseSamples === 0
              ? rms
              : noiseFloor + NOISE_EMA_ALPHA * (rms - noiseFloor);
            noiseSamples += 1;
          }
          bargeCount = 0;
          break;
        }

        // Echo grace: a handset feeds our own audio back up the inbound leg,
        // and its onset is the loudest part of it.
        if (Date.now() - speakingSince < BARGE_GRACE_MS) {
          bargeCount = 0;
          break;
        }

        const threshold = Math.max(BARGE_RMS_MIN, noiseFloor * BARGE_MARGIN);
        if (rms >= threshold) {
          bargeCount += 1;
          if (bargeCount >= BARGE_FRAMES) {
            bargeCount = 0;
            abortTurn = true;
            speaking = false;
            clearPlayback();
            // Logged because a barge that should not have happened is otherwise
            // indistinguishable from the agent simply going quiet — which is
            // exactly how the false-positive bug hid.
            logger.info(
              { rms: Math.round(rms), threshold: Math.round(threshold), noiseFloor: Math.round(noiseFloor) },
              'Phone barge-in: caller interrupted',
            );
          }
        } else {
          bargeCount = 0;
        }
        break;
      }

      // Twilio ends a call with this; Plivo never sends it, which is why the
      // socket-close handler below is the real end-of-call path and this is
      // only an early-out. cleanup() is idempotent via callFinalizer's guard.
      case 'stop':
        cleanup('COMPLETED');
        break;

      default:
        break;
    }
  });

  ws.on('close', () => cleanup(callLogId ? 'COMPLETED' : null));
  ws.on('error', (err) => {
    logger.warn(`${carrier.label} media socket error: ${err.message}`);
    cleanup('FAILED');
  });
}
