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
import { voiceTurnStream, getRenderedWelcome, warmVoiceTurn } from '../services/agentRuntime.service.js';
import { resolveAgentVoice, streamSynthesizeVoice } from '../services/voice.service.js';
import {
  DeepgramStreamSession,
  isDeepgramConfigured,
  toDeepgramLanguage,
  defaultEndpointingMs,
} from '../services/stt/deepgramStream.service.js';
import { analyzeSpeech, classifyCallerAffect } from '../services/stt/speechGate.js';
import { createFillerBudget } from '../services/voice/disfluency.js';
import {
  decodeUlaw,
  createFrameSplitter,
  pcmToTelephonyUlaw,
  telephonyOutputFormat,
  playableWithFormat,
  PHONE_SAMPLE_RATE,
} from '../services/voice/telephonyAudio.js';
import { createPlayoutWindow } from '../services/voice/playoutWindow.js';
import { encodeWav } from '../services/voice/callRecorder.js';
import { createRecordingTap } from './callRecordingTap.js';
import { createCallFinalizer } from './callFinalizer.js';
import { openCallBudget } from '../services/billing/callBudget.js';

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
 *
 * ── The detector is only armed while the caller can actually hear us ─────────
 *
 * All three are downstream of one question — IS THE CALLER HEARING US RIGHT NOW
 * — which a browser answers for itself and a phone bridge has to infer. Getting
 * it wrong disabled phone barge-in ENTIRELY while web calls kept interrupting
 * fine, in two ways: a flag that meant "TTS is running" (audio is shipped ~5x
 * faster than it plays, so it was false for most of every reply), and an echo
 * grace re-armed by each of voiceTurnStream's per-SENTENCE audio-start events.
 * Both now live in services/voice/playoutWindow.js, which carries the detail.
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

/**
 * Longest stretch of caller audio kept for the affect analysis below, matching
 * the web client's own MAX_SEGMENT_MS. At 8kHz/16-bit that is 320KB per call in
 * the worst case, and only for a call where the caller talks for 20s straight
 * without Deepgram ever calling the turn.
 */
const MAX_TURN_AUDIO_MS = 20_000;
const MAX_TURN_AUDIO_SAMPLES = (MAX_TURN_AUDIO_MS / 1000) * PHONE_SAMPLE_RATE;

/** Shortest segment that could contain a word — below this there is no turn to
 *  run, and no point paying a batch-STT round trip to discover that. Same
 *  threshold the web bridge uses. */
const MIN_TURN_AUDIO_MS = 400;

/** RMS of one already-decoded frame. */
function pcmRms(pcm) {
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
  /** How much talk time the wallet paid for. Armed at `start`, once gated. */
  let budget = null;
  // Cooldown between reconnect attempts in the 'media' handler, so a session that
  // fails to connect at all (bad key, Deepgram outage) does not retry once per
  // inbound frame (~50/s) — see the 'media' case below.
  let lastDgReconnectAt = 0;

  /** Full conversation, owned here because there is no client to own it. */
  const history = [];
  const transcript = [];
  const fillerBudget = createFillerBudget();
  const startedAt = Date.now();

  // Turn state
  let turnRunning = false;    // a turn is generating (LLM/TTS in flight)
  let bargeCount = 0;
  let abortTurn = false;
  /** This line's measured noise floor, learned while the agent is quiet. */
  let noiseFloor = 0;
  let noiseSamples = 0;

  /**
   * The caller's own audio for the turn now being captured, decoded to PCM16 —
   * the phone's equivalent of the browser's `frames` buffer.
   *
   * Two consumers, both of which the web bridge has always had and this one
   * had neither of:
   *
   *  1. analyzeSpeech() + classifyCallerAffect(). `affect` is not cosmetic — it
   *     appends a "Caller state" block to the system prompt, shifts the
   *     speaking rate, and suppresses the hesitation ack for a rushed or
   *     agitated caller. Omitting it meant the SAME agent ran on a different
   *     prompt depending on whether it was reached by phone or by browser.
   *  2. the batch-STT fallback, for the turns where the stream produced nothing.
   *
   * Kept as Int16Array frames rather than Buffers because that is what
   * decodeUlaw() already returns and what encodeWav() already consumes, so
   * neither consumer needs a per-frame conversion.
   *
   * Only filled while the caller can actually be the one talking — never during
   * the agent's playout (that would analyse our own echo) and never mid-turn.
   * Bounded, and drained by every runTurn(), so a call cannot accumulate audio.
   */
  let turnPcmChunks = [];
  let turnPcmSamples = 0;

  const captureTurnAudio = (pcm) => {
    turnPcmChunks.push(pcm);
    turnPcmSamples += pcm.length;
    // Drop from the front rather than refusing new audio: on an over-long
    // segment the words that decide the turn are the RECENT ones.
    while (turnPcmSamples > MAX_TURN_AUDIO_SAMPLES && turnPcmChunks.length > 1) {
      turnPcmSamples -= turnPcmChunks.shift().length;
    }
  };

  /** Snapshot + reset, so an early return still clears the buffer for the next turn. */
  const takeTurnAudio = () => {
    if (!turnPcmChunks.length) return null;
    const out = new Int16Array(turnPcmSamples);
    let offset = 0;
    for (const chunk of turnPcmChunks) { out.set(chunk, offset); offset += chunk.length; }
    turnPcmChunks = [];
    turnPcmSamples = 0;
    return out;
  };

  /**
   * Whether the CALLER is hearing us, and for how long — the arming condition
   * for the whole barge detector, and deliberately not the same thing as "TTS
   * is running". See the header, and playoutWindow.js for the full reasoning.
   */
  const playout = createPlayoutWindow();

  /** Both legs of the call, mixed to one WAV at hangup. See callRecordingTap.js. */
  const recording = createRecordingTap({ label: carrier.label, startedAt });

  const sendFrame = (frame) => {
    if (ws.readyState !== ws.OPEN || !streamId) return;
    carrier.sendAudio(ws, streamId, frame);
    playout.noteFrame();
    recording.outbound(frame);
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
    playout.beginGenerating();
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
      // Generation is over; the playout window keeps the barge detector armed
      // for as long as the carrier is still playing the greeting out.
      playout.endGenerating();
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
    // Marks "the caller is judged done speaking" — i.e. Deepgram's endpointing+grace
    // commit already fired to get here. Everything from here to the voiceTurnStream()
    // call (STT harvest) is otherwise invisible in logs/latency.log, which only times
    // from inside voiceTurnStream onward. See preLlmMs below.
    const turnEndDetectedAt = Date.now();
    // Drained here, not after the silence gate below: every path out of this
    // function must leave an empty buffer, or a discarded turn's audio would be
    // analysed as part of the next one.
    const turnPcm = takeTurnAudio();

    try {
      // Was Deepgram listening to THIS turn with an open socket the whole time?
      // Read before finalizeTurn, which can mark the session dead. This is the
      // difference between "the stream heard silence" and "there was no stream",
      // and the entire fallback below turns on it.
      const dgListened = Boolean(dg?.isConnected);
      let userText = '';
      try {
        userText = await dg.finalizeTurn(1200, dgTurnSeq);
      } catch { /* nothing usable this turn */ }
      if (!dg?.isAlive) dg = null;

      // Same shared implementation the web bridge calls, so the two channels
      // cannot drift apart in how they read a caller. With no captured audio (a
      // barged turn, or a reply that landed before any frame was buffered)
      // analyzeSpeech returns hasSpeech:false and classifyCallerAffect returns
      // null — i.e. exactly the behaviour this bridge had before, not a guess.
      const speech = analyzeSpeech(
        turnPcm ? Buffer.from(turnPcm.buffer, turnPcm.byteOffset, turnPcm.byteLength) : null,
        PHONE_SAMPLE_RATE,
      );
      const audioMs = turnPcm ? (turnPcm.length / PHONE_SAMPLE_RATE) * 1000 : 0;

      // ── Silence gate, and the batch-STT fallback behind it ────────────────
      //
      // An empty transcript here has two completely different causes, and this
      // bridge used to treat them the same — `return` — which is why a phone
      // caller sometimes got no answer at all while the same words on a web
      // call were answered fine.
      //
      //   THE CALLER SAID NOTHING. Line noise, a cough, breathing. Discarding
      //   is right: answering it makes the agent talk to itself. Three
      //   independent ways to know, any one sufficient — Deepgram had an open
      //   socket for the whole segment and returned no words (it heard the
      //   audio live; if it found no speech there was none), the segment is too
      //   short to contain a word, or acoustic analysis of the PCM finds no
      //   voiced speech.
      //
      //   THE STREAM WAS NOT LISTENING. No session, one that died mid-call, or
      //   a TLS handshake still in flight — the exact failures the 'media'
      //   handler's reconnect exists to paper over. The caller DID speak and
      //   nothing transcribed it, so the agent simply went quiet and the caller
      //   repeated themselves. The web bridge has always covered this by
      //   handing its buffered WAV to voiceTurnStream and letting batch STT
      //   run; the phone passed `null` audio and had nothing to fall back to.
      //
      // The distinguishing signal is `dgListened`. Note that it is FALSE on
      // exactly the path that needs the fallback, which is why the acoustic
      // check has to be able to stand on its own here.
      let batchWav = null;
      if (!userText.trim()) {
        if (dgListened || audioMs < MIN_TURN_AUDIO_MS || !speech.hasSpeech) {
          logger.info(
            `${carrier.label}: discarding silent ${Math.round(audioMs)}ms turn `
            + `(dgListened=${dgListened} voicedMs=${speech.voicedMs} `
            + `contrast=${speech.contrast.toFixed(2)} peak=${speech.peakRms.toFixed(4)})`,
          );
          return;
        }
        // Real speech, no stream to transcribe it. Costs a round trip (both
        // batch providers cap at 4.5s) — spent only on turns that would
        // otherwise have been answered with silence.
        batchWav = encodeWav(turnPcm, PHONE_SAMPLE_RATE);
        logger.warn(
          `${carrier.label}: no streaming transcript for a ${(audioMs / 1000).toFixed(1)}s turn `
          + `with voiced speech (lang=${dgLanguage ?? 'default'}) — falling back to batch STT`,
        );
      }

      // Known only on the streaming path; on the batch path the transcript does
      // not exist until the runtime has run STT, so the caller's turn joins the
      // history from the 'transcript' event below instead.
      if (userText) {
        transcript.push({ role: 'user', content: userText });
        history.push({ role: 'user', content: userText });
      }

      // Empty on the batch path (the classifier needs words), which is exactly
      // how the web bridge behaves when its own stream came back empty.
      const affect = classifyCallerAffect(speech, userText);

      let replyText = '';
      let pending = null;
      let skippedSegment = false;

      await voiceTurnStream(
        workspaceId,
        agentId,
        batchWav,
        batchWav ? 'audio/wav' : null,
        // A COPY, in both cases. voiceTurnStream reads this array again after
        // it emits 'transcript' (to build its message list), and the batch path
        // pushes the caller's turn into `history` from inside that very event —
        // handing it the live array would make the user turn appear twice.
        userText ? history.slice(0, -1) : history.slice(),
        {
          userText,
          audioHadSpeech: speech.hasSpeech,
          affect,
          fillerBudget,
          channel: 'phone',
          preLlmMs: Date.now() - turnEndDetectedAt,
          // Ask TTS for the carrier's own format when the provider can do it.
          ...(ttsFormat?.kind === 'native' ? { audioFormat: ttsFormat.format } : {}),
          shouldAbort: () => abortTurn || closed,
          onEvent: (ev) => {
            switch (ev.type) {
              case 'transcript':
                // Batch path only. The runtime applies its own gates to a batch
                // transcript (echo trimming, the STT-hallucination filter) and
                // emits '' when it rejects one, so anything arriving here is
                // already something the caller actually said.
                if (!userText && ev.userText) {
                  userText = ev.userText;
                  transcript.push({ role: 'user', content: userText });
                  history.push({ role: 'user', content: userText });
                  logger.info(`${carrier.label}: batch STT recovered "${userText}"`);
                }
                break;
              case 'audio-start':
                // A segment is only playable here if it was synthesized in the
                // format this carrier speaks. `ev.format` is what the runtime
                // ASKED TTS for, not a sniffed or provider-reported label, so
                // this is a statement about our own request rather than a guess.
                //
                // It is not hypothetical. The pre-synthesized acknowledgment
                // clip ("Mm-hmm") was cached without a format and emitted as an
                // ordinary segment, so an MP3 was handed to the carrier as if it
                // were G.711 — a burst of static in front of every reply, with
                // the real audio queued behind it in the carrier's jitter
                // buffer. Fixed at the source (see fillerKey), and refused here
                // too: on a live PSTN call, silence for one segment is a far
                // cheaper failure than noise, and noise is what the caller got
                // for as long as this went unchecked.
                if (!playableWithFormat(ev.format, ttsFormat)) {
                  if (!skippedSegment) {
                    skippedSegment = true;
                    logger.warn(
                      `${carrier.label}: dropped an audio segment in ${ev.format || ev.contentType || 'an unknown format'} `
                      + `— this bridge can only play ${ttsFormat?.format}`,
                    );
                  }
                  pending = null;
                  break;
                }
                playout.beginGenerating();
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
      playout.endGenerating();
      turnRunning = false;
      // Arm the next turn only if the call is still up.
      //
      // The sequence number MUST come from beginTurn(), never from a counter
      // kept here. finalizeTurn() compares the seq it is given against the
      // session's own _turnSeq and returns '' when they differ (the cross-turn
      // bleed guard). Incrementing a local copy instead drifted permanently out
      // of step, so every finalizeTurn returned '' and the agent never once
      // answered the caller — the greeting played and the call went dead.
      //
      // dg.isAlive, not just truthiness: a session that died DURING this turn
      // (LLM/TTS phase) is still a non-null reference here, and beginTurn() on a
      // dead session silently arms a turn nothing will ever harvest. Recreate it
      // instead — the 'media' handler's own reconnect is the other half of this
      // (it covers a session dying while idle, which is the more common case;
      // this covers one dying mid-turn).
      if (!closed) {
        if (dg && dg.isAlive) dgTurnSeq = dg.beginTurn();
        else openDeepgram();
      }
      // Listening has resumed, so this is the phone's `start-turn`: re-warm now,
      // while the caller is speaking, rather than serially after they stop. The
      // agent and KB caches are on a 5-minute TTL, which any real conversation
      // outlives — without this, one turn somewhere in the middle of every long
      // call silently pays the cold cost again.
      if (!closed) {
        warmVoiceTurn(workspaceId, agentId, ttsFormat?.kind === 'native' ? ttsFormat.format : null);
      }
    }
  };

  /**
   * Which language to tell Deepgram the caller speaks — resolved exactly as the
   * web bridge resolves it (webCallModularRealtime.handler.js): the agent's
   * explicit STT language, else the first language configured on the agent.
   *
   * This used to read `agent.transcription` as the fallback, and that column
   * does not hold a language. It holds an STT PROVIDER name, defaulting to
   * "Azure" (see the same field's use as `preferredProvider` in
   * agentRuntime.service.js), so toDeepgramLanguage() had nothing to match and
   * returned undefined on every call that had not set sttLanguage explicitly.
   * Deepgram then defaulted to English.
   *
   * The effect was not a slightly worse transcript, it was a different
   * conversation: a Hindi agent's callers were transcribed as English on the
   * phone — garbled or empty — while the SAME agent transcribed them correctly
   * on a web call, so the LLM was answering a question the caller never asked.
   */
  const resolveDgLanguage = () => {
    let langs = [];
    try { langs = JSON.parse(agent?.languages || '[]'); } catch { /* not JSON; no configured list */ }
    return toDeepgramLanguage(settings.sttLanguage) || toDeepgramLanguage(langs[0]);
  };

  const openDeepgram = () => {
    dgLanguage = resolveDgLanguage();
    dg = new DeepgramStreamSession({
      // The carrier's own wire format — no transcoding in either direction.
      encoding: 'mulaw',
      sampleRate: PHONE_SAMPLE_RATE,
      language: dgLanguage,
      // Shared with the web handler — the phone path had its own 500ms default,
      // so end-of-turn committed at a different point per transport.
      endpointingMs: defaultEndpointingMs(),
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
    turnPcmChunks = [];
    turnPcmSamples = 0;
    budget?.stop();
    playout.stop();
    try { dg?.close(); } catch { /* already gone */ }
    dg = null;
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

          // ── Wallet gate ───────────────────────────────────────────────────
          //
          // Outbound calls are gated before dialling (agent.controller testCall,
          // campaignRunner), but nothing gated an INBOUND one: a caller ringing
          // a workspace's number got a full conversation whatever the balance
          // said, and settlement — which cannot refuse minutes already served —
          // booked it against an empty wallet.
          //
          // Checked before Deepgram, the voice lookup and the greeting, so a
          // refused call spends nothing with any provider. The dial-time gate on
          // the outbound paths is not redundant with this one: it stops us
          // PLACING a call we cannot pay for, which is a cost this check is
          // already too late to avoid.
          //
          // The budget also hangs the call up when the balance is spent, since
          // passing a gate at pickup says nothing about a call's length.
          // Closing the media socket is the only lever this bridge has: Twilio's
          // <Connect><Stream> ends the call with it, while Plivo's stream
          // carries keepCallAlive, so there the line goes quiet and the caller
          // hangs up. Either way the agent stops costing money.
          const gate = await openCallBudget({
            workspaceId,
            type: 'PHONE_CALL',
            label: carrier.label,
            onExpire: () => {
              cleanup('COMPLETED');
              try { ws.close(); } catch { /* already gone */ }
            },
          });
          budget = gate.budget;
          if (!gate.allowed) {
            logger.warn(
              { workspaceId, agentId, callLogId, code: gate.code },
              `${carrier.label} refused: ${gate.code}`,
            );
            // FAILED, not COMPLETED: nothing was served. Duration is ~0, so
            // settlement skips it as a zero-duration call and the caller is not
            // charged for a call that never happened.
            cleanup('FAILED');
            ws.close();
            return;
          }

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

          // Warm what the first turn will need, in this call's audio format,
          // while the greeting is still playing.
          //
          // The web handler has always done this on every `start-turn`; the
          // phone bridge never did, so a phone call paid the KB read, the voice
          // resolution and the ack synthesis SERIALLY on its first turn — the
          // one where the caller is deciding whether the thing is responsive.
          // Same agent, same pipeline, measurably slower than the web call it
          // was tested against.
          warmVoiceTurn(workspaceId, agentId, ttsFormat.kind === 'native' ? ttsFormat.format : null);

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
        if (!msg.media?.payload) break;

        // A dead/missing session used to mean silence for the rest of the call —
        // openDeepgram() was only ever called once, from 'start'. This is the path
        // that recovers the common case (the socket dies while just LISTENING, no
        // turn in flight, so nothing else would ever notice). Cooldown guards
        // against a reconnect attempt on every single frame (~50/s) when Deepgram
        // itself is unreachable or the key is bad.
        if (!closed && (!dg || !dg.isAlive)) {
          const now = Date.now();
          if (now - lastDgReconnectAt > 1000) {
            lastDgReconnectAt = now;
            logger.warn(`${carrier.label}: Deepgram session missing or dead mid-call — reconnecting`);
            openDeepgram();
          }
        }
        if (!dg) break;
        const frame = Buffer.from(msg.media.payload, 'base64');

        recording.inbound(frame);

        // Always feed STT — including while the agent speaks, so the words a
        // caller says over the top are not lost when the barge lands.
        try { dg.send(frame); } catch { /* session died; next attempt recreates */ }

        // Decoded once and used twice — the barge detector's energy reading and
        // the turn buffer feeding analyzeSpeech() want the same samples.
        const pcm = decodeUlaw(frame);
        const rms = pcmRms(pcm);

        // Capture only while the caller is the one who could be talking: not
        // during our own playout (that is echo, not the caller) and not while a
        // turn is already generating.
        if (!turnRunning && !playout.isSpeaking()) captureTurnAudio(pcm);

        if (!playout.isSpeaking()) {
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
        if (playout.speakingForMs() < BARGE_GRACE_MS) {
          bargeCount = 0;
          break;
        }

        const threshold = Math.max(BARGE_RMS_MIN, noiseFloor * BARGE_MARGIN);
        if (rms >= threshold) {
          bargeCount += 1;
          if (bargeCount >= BARGE_FRAMES) {
            bargeCount = 0;
            abortTurn = true;
            // How much buffered speech the caller just cut off. Read before
            // stop() zeroes it: a barge that lands with ~0ms left is the
            // detector catching the caller's ANSWER at the tail of the reply
            // rather than a real interruption, and the two are indistinguishable
            // in the log without this.
            const cutMs = playout.remainingMs();
            playout.stop();
            clearPlayback();
            recording.barge();
            // Logged because a barge that should not have happened is otherwise
            // indistinguishable from the agent simply going quiet — which is
            // exactly how the false-positive bug hid.
            logger.info(
              {
                rms: Math.round(rms),
                threshold: Math.round(threshold),
                noiseFloor: Math.round(noiseFloor),
                cutMs: Math.round(cutMs),
              },
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
