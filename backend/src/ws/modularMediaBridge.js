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
import { voiceTurnStream, getRenderedWelcome, warmVoiceTurn, loadAgent } from '../services/agentRuntime.service.js';
import { resolveAgentVoice, streamSynthesizeVoice } from '../services/voice.service.js';
import {
  DeepgramStreamSession,
  isDeepgramConfigured,
  toDeepgramLanguage,
} from '../services/stt/deepgramStream.service.js';
import {
  analyzeSpeech,
  classifyCallerAffect,
  isEchoOfAgent,
  stripOverlapEcho,
} from '../services/stt/speechGate.js';
import { bargeThresholds, BARGE_MARGIN } from '../services/voice/bargeThreshold.js';
import { noInputPromptFor, noInputDelayMs, maxNoInputAttempts } from '../services/voice/noInputPrompt.js';
import { createFillerBudget } from '../services/voice/disfluency.js';
import {
  decodeUlaw,
  encodeUlaw,
  createFrameSplitter,
  pcmToTelephonyUlaw,
  createPcmUlawConverter,
  playableWithFormat,
  PHONE_SAMPLE_RATE,
} from '../services/voice/telephonyAudio.js';
import {
  telephonyFormatForVoice,
  synthesisProviderForVoice,
} from '../services/voice/telephonyVoice.js';
import {
  getGreetingAudio,
  rememberGreetingAudio,
  greetingSynthesisOpts,
} from '../services/voice/greetingAudio.js';
import { turnEndProfileFor } from '../services/voice/turnEndProfile.js';
import { createPlayoutWindow } from '../services/voice/playoutWindow.js';
import { createEchoCanceller } from '../services/voice/echoCanceller.js';
import { createUlawPacer } from '../services/voice/ulawPacer.js';
import { createAmbiencePump } from '../services/voice/ambiencePump.js';
import { encodeWav } from '../services/voice/callRecorder.js';
import { createRecordingTap } from './callRecordingTap.js';
import { createCallFinalizer } from './callFinalizer.js';
import { openCallBudget } from '../services/billing/callBudget.js';
import { randomUUID } from 'node:crypto';
import { logTurnLatency } from '../lib/latencyLog.js';

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
/**
 * The level policy — both absolute floors and the noise-floor margin — lives in
 * services/voice/bargeThreshold.js, which carries the measured levels it has to
 * sit among and the account of why the shipped floor made the adaptive design
 * above dead code. It is a separate file because those numbers are the only
 * part of barge-in checkable against a published standard rather than against a
 * live call.
 */
/** Consecutive loud frames before we believe it. 5 x 20ms = 100ms of speech. */
const BARGE_FRAMES = Number(process.env.PHONE_BARGE_FRAMES) || 5;
/** Ignore inbound energy for this long after the agent starts talking (echo). */
const BARGE_GRACE_MS = Number(process.env.PHONE_BARGE_GRACE_MS) || 500;
/** Weight of each new quiet frame in the running noise-floor estimate. */
const NOISE_EMA_ALPHA = 0.05;
/**
 * Quiet frames needed before barge-in is allowed to cut the agent off.
 *
 * 25 x 20ms = half a second of having heard this line with nobody speaking.
 * Until then there is no measured floor, so "louder than this line's own noise"
 * is not a question that can be answered and the detector has no business
 * acting. See `lineMeasured` at the point of use.
 */
const NOISE_MIN_SAMPLES = Number(process.env.PHONE_NOISE_MIN_FRAMES) || 25;

/**
 * ── Recovering a caller who answered while the agent was still talking ──────
 *
 * The bridge cannot listen and speak at once: `armNextTurn` holds the next turn
 * closed until playout drains, because a phone line has no echo cancellation
 * and our own reply comes straight back up the inbound leg. Correct, and it
 * costs real words — people answer before the agent finishes ("yes", "correct",
 * a phone number), and everything they said in that window was cleared by
 * `beginTurn()`. The caller then repeats themselves, which reads as latency and
 * appears nowhere in logs/latency.log.
 *
 * Barge-in does not cover it. That needs BARGE_FRAMES consecutive loud frames
 * (100ms) to stop the agent mid-word — deliberately conservative, because a
 * false barge cuts the reply off. A one-word answer never clears that bar.
 *
 * So overlap recovery is a SEPARATE, weaker test with a much cheaper failure:
 * it does not interrupt anything, it only decides whether words already
 * transcribed are worth keeping. See harvestOverlap().
 */
/** Loud frames (not necessarily consecutive) before overlapping speech is believed. */
const OVERLAP_MIN_LOUD_FRAMES = Number(process.env.PHONE_OVERLAP_FRAMES) || 3;
/**
 * How long the line must stay quiet before we answer what was said over us.
 *
 * One ordinary endpointing window: the caller may be mid-sentence ("yes, and
 * also…"), and answering the "yes" alone would cut them off. Any new speech
 * cancels this and the normal end-of-turn path takes over, with the carried
 * text prepended — so the wait is only ever paid by a caller who has genuinely
 * stopped, for whom no end-of-turn would otherwise ever fire.
 */
const OVERLAP_SETTLE_MS = Number(process.env.PHONE_OVERLAP_SETTLE_MS) || 700;

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

/**
 * How often to re-check whether the carrier has finished playing our reply,
 * while deciding when to start listening again. One frame — anything coarser
 * would hand the caller's opening syllable to the turn we just discarded.
 */
const ARM_POLL_MS = 20;

/**
 * Hard ceiling on that wait. playout.isSpeaking() is driven by noteFrame(), so
 * a pacer that somehow never drains would leave the caller permanently unheard.
 * Longer than any single reply, short enough that the call recovers rather than
 * dying silently.
 */
const MAX_ARM_WAIT_MS = 20_000;

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
export function runModularMediaBridge(ws, {
  workspaceId,
  agentId,
  callLogId: initialCallLogId = null,
  // 'OUTBOUND' | 'INBOUND' | null. Read off the socket URL by server.js and set
  // only by the dialler; null means the direction of this leg is unknown here
  // and the agent's own configured direction decides the greeting.
  direction = null,
  carrier,
}) {
  let agent = null;
  let settings = {};
  let voice = null;
  let ttsFormat = null;

  let streamId = null;
  let callLogId = initialCallLogId;
  let closed = false;

  /**
   * Realtime clock on the outbound leg, for carriers that penalise a burst.
   * Null for carriers that absorb one (Twilio), so their hot path is unchanged.
   */
  let pacer = null;

  let dg = null;
  let dgTurnSeq = 0;
  let dgLanguage;
  /** Pending "start listening once the line is quiet" check. See armNextTurn. */
  let armTimer = null;
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
  /**
   * Inbound frames above the barge threshold since the agent started speaking —
   * NOT required to be consecutive, unlike bargeCount. This is the energy half
   * of "did the caller talk over us?"; see harvestOverlap().
   */
  let overlapLoudFrames = 0;
  /**
   * What the caller said DURING our reply, recovered by harvestOverlap() and
   * waiting to be spoken for. Prepended to the next turn's transcript.
   */
  let carriedUserText = '';
  /**
   * Did Deepgram declare the caller's OVERLAP utterance finished while we were
   * still speaking? See onEndOfTurn, which drops that signal, and armNextTurn,
   * which is the only thing that should care about it.
   */
  let overlapTurnEnded = false;

  /** Pending "answer the carried text if the line stays quiet". See armNextTurn. */
  let settleTimer = null;

  /**
   * ── Call configuration, which the phone never used to honour ─────────────
   *
   * `maxDuration`, `maxSilenceBeforeHangup` and `interruptibleEnabled` are set
   * on the Call configuration tab and were read by the BROWSER client only —
   * EditAgent.tsx enforces all three for a web call. Nothing on the server did,
   * so the same agent obeyed its own configuration in the tester and ignored it
   * on a real phone call. An operator who set "hang up after 15s of silence"
   * got a web call that hung up and a phone call that sat open until the wallet
   * ran out, on every number in the campaign.
   */
  let maxCallTimer = null;
  let silenceTimer = null;
  /** Last time the CALLER was heard — speech energy or a committed transcript. */
  let lastCallerSpeechAt = Date.now();

  /**
   * ── "Sorry, I didn't catch that" — the phone never had it ────────────────
   *
   * services/voice/noInputPrompt.js was written for exactly the symptom
   * reported here, in seven languages, with an escalating three-attempt script.
   * It was wired into webCallModularRealtime.handler.js ONLY, and even there
   * the server just ships the strings to the browser: "the client owns the
   * listening segment on this transport, so it owns the timer too".
   *
   * A phone call has no client. Nothing on this bridge imported the module, so
   * on the transport where a caller has NO visual cue that anyone is still
   * there — no waveform, no "listening" state, just a line — the feature was
   * absent. A caller whose words did not make it through got silence, decided
   * nobody was there, and hung up.
   *
   * So the bridge owns the timer here, which it can: it knows when it armed
   * listening (armNextTurn) and when the caller was last audible.
   */
  let noInputTimer = null;
  /** How many re-prompts this quiet stretch has already produced. */
  let noInputAttempt = 0;
  /** agent.languages, parsed — picks the prompt language. */
  let agentLanguages = [];
  /** Whether the caller may cut the agent off. From `interruptibleEnabled`. */
  let interruptible = true;
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

  /**
   * Subtracts our own voice from the inbound leg.
   *
   * The browser gets this free from getUserMedia; a phone line does not, and
   * every compromise in this file — going deaf for the tail of a reply, the
   * text heuristic in harvestOverlap(), the high barge threshold — exists only
   * because the echo could not be removed. See services/voice/echoCanceller.js.
   */
  const aec = createEchoCanceller();

  /** Both legs of the call, mixed to one WAV at hangup. See callRecordingTap.js. */
  const recording = createRecordingTap({ label: carrier.label, startedAt });

  /**
   * One frame onto the wire, right now.
   *
   * playout.noteFrame() and the recording tap both live here rather than at the
   * queueing end, so that with a pacer in front they still describe what the
   * caller actually heard and when — the barge detector's arming window is
   * derived from this, and it would be wrong by the whole queue depth otherwise.
   */
  /**
   * When the FIRST frame of this turn's reply reached the carrier socket.
   *
   * Not the same thing as latency.log's `ttfaMs`, and the difference is the
   * whole reason phone calls can feel slow while every server-side number looks
   * healthy. `ttfaMs` stops the clock when TTS hands us a byte; this stops it
   * when a byte is written to the carrier. Between those two points sit the
   * frame splitter and — on a paced carrier — the outbound queue, which holds
   * audio back to real time on purpose. If the queue is still draining the
   * previous utterance, the new turn's first frame waits behind it, and nothing
   * measured inside voiceTurnStream can see that.
   *
   * Reset per turn by runTurn(), so it always answers "this turn", never "this
   * call".
   */
  let turnFirstFrameAt = null;
  /** `<call>:<turn>` — joins this bridge's wire record to the pipeline record
   *  voiceTurnStream writes for the same turn. See lib/latencyLog.js. */
  const callTag = randomUUID().slice(0, 8);
  let turnSeq = 0;
  let turnId = null;

  /** When the carrier opened the media stream, i.e. when the callee answered.
   *  The zero point for "how long did they hear nothing before the greeting". */
  let connectedAtMs = Date.now();

  /**
   * @param {Buffer} frame
   * @param {{speech?: boolean}} [meta] `speech: false` marks a frame that
   *   carries no agent audio — a bed-only slot from the ambience pump. Defaults
   *   to true because every other producer (the plain pacer, a direct send)
   *   only ever emits a frame when it HAS speech to emit.
   */
  const sendFrameNow = (frame, { speech = true } = {}) => {
    if (ws.readyState !== ws.OPEN || !streamId) return;
    carrier.sendAudio(ws, streamId, frame);

    // Only real speech counts as playout. The ambience pump runs a 20ms clock
    // for the whole call, so counting its bed-only frames here pinned
    // playout.isSpeaking() true from the first frame to the last — and that
    // flag is what gates end-of-turn, caller-audio capture and the noise floor.
    // The result was an agent that greeted the caller and then never heard
    // another word, on any agent with an ambience preset selected. See the note
    // in services/voice/ambiencePump.js.
    if (speech) {
      if (turnFirstFrameAt == null) turnFirstFrameAt = performance.now();
      playout.noteFrame();
    }

    // The canceller needs EXACTLY what went on the wire, bed included: the bed
    // is echoed back up the line like anything else we play, so a reference
    // without it would leave that part of the echo uncancelled.
    aec.reference(decodeUlaw(frame));

    // Recorded either way: the bed is part of what the caller actually heard.
    recording.outbound(frame);
  };

  /**
   * Where synthesized audio goes. With a paced carrier this is the queue, not
   * the socket — see carrier.pacedOutbound and ws/ulawPacer.js.
   */
  const sendFrame = (frame) => {
    if (pacer) pacer.push(frame);
    else sendFrameNow(frame);
  };

  /**
   * Drop buffered playback — the caller has interrupted.
   *
   * Our own queue first, for the reason ulawPacer.flush() documents: the
   * carrier's clear only drops what the CARRIER holds, and anything still
   * queued here would go out immediately after and resurrect the interrupted
   * sentence. Without a pacer there is no queue and this is a no-op.
   */
  const clearPlayback = () => {
    pacer?.flush();
    if (ws.readyState === ws.OPEN && streamId) carrier.clearAudio(ws, streamId);
  };

  /**
   * What to ask TTS for, in this carrier's terms.
   *
   * Asked for on BOTH kinds, not just `native`. A `pcm` bridge that stays silent
   * about the format gets the provider's default — MP3 for Fish — and hands it
   * to a PCM converter, which is noise on the line rather than an error. The
   * difference between the kinds is only whether the bytes still need
   * converting, not whether we have to state what we want.
   */
  const ttsFormatOpts = () => (ttsFormat
    ? {
      audioFormat: ttsFormat.format,
      ...(ttsFormat.kind === 'pcm' && ttsFormat.rate ? { sampleRate: ttsFormat.rate } : {}),
    }
    : {});

  /**
   * Push one synthesized audio stream to the carrier as 20ms mu-law frames.
   * `contentType` decides whether bytes are already mu-law (the native case) or
   * PCM that still needs converting.
   */
  /**
   * @param {AsyncIterable<Buffer>} stream
   * @param {string} contentType
   * @param {boolean} isUlaw
   * @param {Buffer[]|null} [collect] when given, every raw provider chunk is
   *   pushed here so a completed stream can be cached. See speakLine.
   * @returns {Promise<boolean>} true only if the whole stream reached the wire.
   *   A caller that caches the bytes MUST check this: a greeting cut short by a
   *   barge-in or a hangup is a truncated buffer, and caching that would replay
   *   the truncation on every later call to this agent.
   */
  const pumpAudio = async (stream, contentType, isUlaw, collect = null) => {
    const splitter = createFrameSplitter();
    // Stateful, because HTTP chunks split wherever they like: an odd-length
    // chunk leaves half a 16-bit sample, and converting each chunk on its own
    // byte-shifts everything after it into white noise.
    const pcm = isUlaw ? null : createPcmUlawConverter(ttsFormat?.rate || 24000);
    for await (const chunk of stream) {
      if (abortTurn || closed) break;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (!buf.length) continue;
      // Collected BEFORE conversion, so the cache holds exactly what the
      // provider sent and a replay runs the identical code path below.
      collect?.push(buf);
      const ulaw = isUlaw ? buf : pcm.push(buf);
      if (!ulaw.length) continue;
      for (const frame of splitter.push(ulaw)) sendFrame(frame);
    }
    if (abortTurn || closed) { splitter.reset(); return false; }
    const tail = splitter.flush();
    if (tail) sendFrame(tail);
    return true;
  };

  /**
   * Speak a fixed line (the welcome message) without running a full turn.
   *
   * ── THE GREETING IS THE ONE LINE WE ALREADY KNOW ─────────────────────────
   *
   * This runs the moment the callee says "hello?", so its cost is silence the
   * caller actually hears — and the text is IDENTICAL on every call to this
   * agent. Opening a TTS connection here and waiting for first byte cost
   * `ttsTtfaMs` (p50 581ms, p90 1450ms) per call, and a 500-recipient campaign
   * paid it 500 times for the same sentence. The browser never pays it: it
   * fetched and buffered its welcome over HTTP before the call button was
   * pressed. See services/voice/greetingAudio.js.
   *
   * On a miss the bytes are collected and cached, so the cost is paid once per
   * (voice, text, carrier format) rather than once per call — and only when the
   * stream COMPLETED, so a greeting cut short by a barge-in or a hangup is
   * never what the next caller hears.
   */
  const speakLine = async (text) => {
    if (!text || !voice || closed) return;
    const synthOpts = greetingSynthesisOpts(ttsFormat, settings);
    const isUlaw = ttsFormat?.kind === 'native';
    playout.beginGenerating();
    try {
      const cached = getGreetingAudio(voice, text, synthOpts);
      if (cached) {
        // Same pump, same splitter, same converter — the only difference is
        // where the bytes came from. Wrapped as a one-chunk async iterable
        // rather than given a second code path, because a second code path is
        // how the cached greeting and the streamed one drift apart in format.
        await pumpAudio((async function* one() { yield cached.buf; })(), cached.contentType, isUlaw);
      } else {
        const { stream, contentType } = await streamSynthesizeVoice(voice, text, {
          fast: true,
          pace: synthOpts.pace,
          ...ttsFormatOpts(),
        });
        const collected = [];
        const complete = await pumpAudio(stream, contentType, isUlaw, collected);
        if (complete) {
          rememberGreetingAudio(voice, text, synthOpts, Buffer.concat(collected), contentType);
        }
      }
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
    // Whichever path got us here — a real end of turn, or the settle timer —
    // the carried text is about to be spent, so the timer has no job left.
    cancelSettle();
    // A turn is starting, so the caller is not silent. Both the pending prompt
    // and the ESCALATION are dropped: the three no-input lines get harsher as
    // they go ("speak louder", then "call back another time"), and carrying a
    // count across a successful exchange would have the agent open with the
    // give-up line the next time the caller pauses to think.
    cancelNoInput();
    noInputAttempt = 0;
    // Marks "the caller is judged done speaking" — i.e. Deepgram's endpointing+grace
    // commit already fired to get here. Everything from here to the voiceTurnStream()
    // call (STT harvest) is otherwise invisible in logs/latency.log, which only times
    // from inside voiceTurnStream onward. See preLlmMs below.
    // Monotonic clock (performance.now), paired with turnFirstFrameAt above:
    // wireMs is the difference and must not move with the wall clock.
    const turnEndDetectedAt = performance.now();
    turnSeq += 1;
    turnId = `${callTag}:${turnSeq}`;
    turnFirstFrameAt = null;
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

      // ── Words the caller got in while we were still talking ──────────────
      //
      // harvestOverlap() recovered these before beginTurn() wiped them, and
      // already put them through both the energy and the echo tests. They go in
      // FRONT because that is the order they were said in: "yes" over the tail
      // of our reply, then "…and Tuesday works too" once we stopped.
      //
      // Taken here rather than at harvest time so that a caller who kept
      // talking gets ONE turn containing everything they said, instead of an
      // answer to the first half followed by an answer to the second.
      if (carriedUserText) {
        userText = userText ? `${carriedUserText} ${userText}`.trim() : carriedUserText;
        carriedUserText = '';
      }

      // ── The turn was ENTIRELY our own voice coming back ───────────────────
      //
      // armNextTurn keeps most echo out by not listening until the line is
      // quiet, but it cannot cover the tail the carrier was still playing out
      // of its own jitter buffer after our pacer drained. What survives that is
      // a transcript which is verbatim agent speech and nothing else.
      //
      // The runtime's stripAgentEcho() only trims a bounded PREFIX, on the
      // assumption there is a real request behind it; when there is not, it
      // leaves a phantom user turn that the LLM dutifully answers — the agent
      // talking to itself, which a caller experiences as the agent ignoring
      // them and monologuing. webCallModularRealtime.handler.js has always
      // discarded these; the phone bridge never did, on the transport where
      // there is no acoustic echo cancellation to make it rare.
      const lastAgentText = history
        .filter((m) => m?.role === 'assistant' && typeof m.content === 'string')
        .pop()?.content || '';
      if (userText && isEchoOfAgent(userText, lastAgentText)) {
        logger.info(
          `${carrier.label}: discarding "${userText}" — echo of the agent's own `
          + `previous reply ("${lastAgentText.slice(0, 60)}…")`,
        );
        return;
      }

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
      let pendingPcm = null;   // PCM->mu-law carry for the segment being played
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
          turnId,
          preLlmMs: Math.round(performance.now() - turnEndDetectedAt),
          // Silence the caller sat through before this turn was even declared
          // over — the recogniser's VAD timeout plus its confirmation grace.
          // Outside every previous metric, and the same size as the LLM wait.
          endpointMs: dg?.lastEndpointMs ?? null,
          // Ask TTS for the carrier's own format — see ttsFormatOpts().
          ...ttsFormatOpts(),
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
                  pendingPcm = null;
                  break;
                }
                playout.beginGenerating();
                pending = createFrameSplitter();
                // Per SEGMENT, not per call: each segment is its own PCM stream,
                // so a half sample must not survive into the next one.
                pendingPcm = ttsFormat?.kind === 'native'
                  ? null
                  : createPcmUlawConverter(ttsFormat?.rate || 24000);
                break;
              case 'audio-chunk': {
                if (abortTurn || closed || !pending) break;
                const buf = ev.chunk;
                const ulaw = pendingPcm ? pendingPcm.push(buf) : buf;
                if (!ulaw.length) break;
                for (const frame of pending.push(ulaw)) sendFrame(frame);
                break;
              }
              case 'audio-end': {
                if (pending && !abortTurn && !closed) {
                  const tail = pending.flush();
                  if (tail) sendFrame(tail);
                }
                pending = null;
                pendingPcm = null;
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
      // ── The only measurement of this turn the CALLER would recognise ──────
      //
      // logs/latency.log times the pipeline: end-of-speech → LLM → TTS's first
      // byte. On a phone call that is not when the caller hears anything. This
      // is: end-of-speech → the first byte written to the carrier socket, which
      // additionally covers the frame splitter and the outbound pacer queue.
      //
      // `paced` is what separates "the model was slow" from "the line was still
      // playing the last reply": a queue that is deep when a new turn starts
      // means every following turn is served late no matter how fast the model
      // answers, and it is invisible everywhere else — the modular bridge
      // computed these stats and never read them, unlike the PIOPIY bridge
      // which logs its own at call end.
      if (turnFirstFrameAt != null) {
        const paced = pacer?.stats();
        const wireMs = Math.round(turnFirstFrameAt - turnEndDetectedAt);
        logger.info(
          `${carrier.label}: turn wireMs=${wireMs}`
          + (paced ? ` pacerQueued=${paced.queuedFrames}f pacerMaxQueueMs=${paced.maxQueueMs} dropped=${paced.dropped}` : ''),
        );
        // Into logs/latency.log as its own record, joined to the pipeline
        // record by turnId. It used to live only in the server log, where
        // wireMs - ttfaMs (the pacer queue depth) could never be computed.
        logTurnLatency({
          kind: 'wire', channel: 'phone', agentId, turnId, wireMs,
          pacerQueuedFrames: paced?.queuedFrames ?? null,
          pacerMaxQueueMs: paced?.maxQueueMs ?? null,
          pacerDropped: paced?.dropped ?? null,
        });
      }
      playout.endGenerating();
      turnRunning = false;
      // Listening resumes when the caller can be heard over us, NOT here —
      // generation ending is not the same event as the carrier finishing
      // playback, and treating them as one fed our own echo into the caller's
      // next turn. See armNextTurn.
      armNextTurn();
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
    // Kept for the no-input prompts, which are picked by the agent's language
    // LABEL rather than by Deepgram's code — a Hindi agent must re-prompt in
    // Hindi, and noInputPromptFor takes the label. Set here so the two cannot
    // read different fields and disagree about what language this call is in.
    agentLanguages = langs;
    return toDeepgramLanguage(settings.sttLanguage) || toDeepgramLanguage(langs[0]);
  };

  const openDeepgram = () => {
    dgLanguage = resolveDgLanguage();
    dg = new DeepgramStreamSession({
      // The carrier's own wire format — no transcoding in either direction.
      encoding: 'mulaw',
      sampleRate: PHONE_SAMPLE_RATE,
      language: dgLanguage,
      // The agent's own turn-end profile (Call Configuration → Response speed),
      // resolved from exactly the same module the web transport uses. Two
      // things this fixes at once: the phone path had its own 500ms default, so
      // the same agent turned around at a different speed depending on how it
      // was reached; and an operator who wanted a slower window had to edit env
      // for every agent on the box. `openDeepgram` runs after settings are
      // loaded, so the profile here is the caller's agent, not a default.
      ...(() => {
        const profile = turnEndProfileFor(settings);
        return {
          endpointingMs: profile.endpointingMs,
          endpointGraceMs: profile.graceMs,
          unfinishedGraceMs: profile.unfinishedGraceMs,
        };
      })(),
      // Guarded, because Deepgram is fed the inbound leg unconditionally and a
      // phone line has no echo cancellation: our own reply comes back up it and
      // is transcribed like any other speech, so it can commit an end of turn
      // all by itself. Unguarded, the agent answered its own greeting.
      //
      // Dropping it rather than queueing it is correct: whatever closed that
      // turn was audio arriving while we were speaking, which is either echo
      // (worthless) or a barge — and a barge zeroes playout via the energy
      // detector, so a real interruption sees isSpeaking() false here and
      // passes straight through. armNextTurn() re-arms cleanly once the line is
      // quiet, so nothing the caller actually says afterwards is lost.
      onEndOfTurn: (reason) => {
        if (playout.isSpeaking()) {
          // Still dropped as an end of turn — we are mid-reply and must not
          // start another — but REMEMBERED. This is Deepgram saying the caller
          // finished the sentence they spoke over us, which is the same
          // semantic signal the whole pipeline trusts everywhere else, and
          // throwing it away entirely is what makes armNextTurn wait out a
          // settle window for someone who stopped talking seconds ago.
          overlapTurnEnded = true;
          logger.info(`${carrier.label}: end of turn (${reason}) while speaking — carried`);
          return;
        }
        runTurn();
      },
    });
    dg.connect();
    // Same rule as in runTurn's finally: the seq is whatever the session says
    // it is. The web-call bridge has always done this (`dgTurnSeq =
    // dgSession.beginTurn()`); the phone bridge dropped the return value, which
    // is the whole reason phone calls never got a reply while web calls did.
    dgTurnSeq = dg.beginTurn();
  };

  /**
   * Start listening for the caller's next turn — but not until they can
   * actually be heard over us.
   *
   * ── WHY THIS IS NOT JUST `dg.beginTurn()` IN runTurn's finally ────────────
   *
   * A browser gets acoustic echo cancellation for free: getUserMedia hands the
   * page a mic feed with the speaker's own output already subtracted. A phone
   * line has no such thing. The handset feeds our reply straight back up the
   * inbound leg, and the 'media' handler forwards every inbound frame to
   * Deepgram unconditionally — deliberately, so that a caller talking OVER the
   * agent is not lost when the barge lands.
   *
   * That trade is only safe if the turn boundary sits where the agent stops
   * being audible. It did not. runTurn's finally runs when voiceTurnStream
   * RESOLVES, i.e. when TTS has finished generating — and with a pacer holding
   * the outbound leg to real time, generation for an 8s reply completes in ~2s.
   * The turn was therefore armed with ~6s of our own speech still playing, and
   * every word of it was transcribed into the caller's brand-new turn.
   *
   * Two costs, and the second is the one that reads as "the phone agent is
   * slow":
   *
   *   1. the transcript opens with the agent's own words. stripAgentEcho() in
   *      the runtime trims a bounded PREFIX, so long echo survives it.
   *   2. end-of-turn never commits. deepgramStream treats ANY further
   *      transcript — interim or final — as proof the caller is still talking
   *      and cancels the pending speech_final candidate. Our own echo therefore
   *      re-arms the endpointing clock frame after frame, and the turn cannot
   *      close until the echo stops. The reply is late by however long the
   *      agent was still audible, which no server-side timing can see.
   *
   * Waiting for playout to drain fixes both at the source. Echo arriving before
   * this fires lands in the turn already finalized, and beginTurn() clears
   * `finals` and `_tail`, so it is discarded rather than misattributed.
   *
   * BARGE-IN IS NOT DELAYED BY THIS. A barge calls playout.stop(), which zeroes
   * endsAt, so isSpeaking() is already false by the time this runs and the arm
   * is immediate.
   */
  const armNextTurn = (deadline = Date.now() + MAX_ARM_WAIT_MS, since = Date.now()) => {
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    if (closed) return;

    if (playout.isSpeaking() && Date.now() < deadline) {
      armTimer = setTimeout(() => armNextTurn(deadline, since), ARM_POLL_MS);
      // Never hold the process open for a call that is already over.
      if (typeof armTimer.unref === 'function') armTimer.unref();
      return;
    }
    if (playout.isSpeaking()) {
      logger.warn(
        `${carrier.label}: still playing after ${MAX_ARM_WAIT_MS}ms — listening anyway`,
      );
    }

    // The sequence number MUST come from beginTurn(), never from a counter kept
    // here. finalizeTurn() compares the seq it is given against the session's
    // own _turnSeq and returns '' when they differ (the cross-turn bleed
    // guard). Incrementing a local copy instead drifted permanently out of
    // step, so every finalizeTurn returned '' and the agent never once answered
    // the caller — the greeting played and the call went dead.
    //
    // ── What did the caller say WHILE we were talking? ────────────────────
    //
    // Read before beginTurn(), because beginTurn() clears `finals` — and that
    // clear is where a caller's answer used to go to die. Deepgram is fed the
    // inbound leg for the whole reply (deliberately, see openDeepgram), so the
    // words ARE transcribed; they were simply wiped a moment later.
    //
    // Read the evidence count first: harvestOverlap() consumes it, and the deaf
    // window below is only diagnosable next to how much speech landed in it.
    const loudInDeafWindow = overlapLoudFrames;
    harvestOverlap();

    // dg.isAlive, not just truthiness: a session that died during the turn
    // (LLM/TTS phase) is still a non-null reference here, and beginTurn() on a
    // dead session silently arms a turn nothing will ever harvest. Recreate it
    // instead — the 'media' handler's own reconnect is the other half of this
    // (it covers a session dying while idle, the more common case; this covers
    // one dying mid-turn).
    if (dg && dg.isAlive) dgTurnSeq = dg.beginTurn();
    else openDeepgram();

    // ── How long this bridge was deaf, which nothing measured ────────────
    //
    // THE ONE PHONE-ONLY COST THAT NEVER APPEARS IN logs/latency.log. That file
    // times end-of-speech → LLM → TTS, i.e. the pipeline, and the pipeline is
    // identical on both transports. What is not identical is this: the browser
    // listens continuously, and this bridge cannot listen while it speaks, so
    // every reply is followed by a stretch in which the caller is not being
    // heard at all. A caller who answers into that stretch and is not recovered
    // waits it out and then says it again — which the caller experiences as the
    // agent taking the length of its own reply to respond, and which no
    // server-side timing can see, because from the pipeline's point of view the
    // turn started when they repeated themselves.
    //
    // Logged with the overlap evidence, because the pair is the diagnosis: a
    // long deaf window with loud frames in it means somebody was talking and we
    // were not listening, and whether their words survived is exactly what
    // harvestOverlap() just decided.
    const armWaitMs = Date.now() - since;
    if (armWaitMs >= ARM_POLL_MS * 2) {
      logger.info(
        {
          armWaitMs,
          loudFrames: loudInDeafWindow,
          recovered: Boolean(carriedUserText),
          noiseFloor: Math.round(noiseFloor),
          bargeThreshold: Math.round(bargeThresholds(noiseFloor).barge),
        },
        `${carrier.label}: listening again after ${armWaitMs}ms deaf`,
      );
    }

    // Listening has resumed, so this is the phone's `start-turn`: re-warm now,
    // while the caller is speaking, rather than serially after they stop. The
    // agent and KB caches are on a 5-minute TTL, which any real conversation
    // outlives — without this, one turn somewhere in the middle of every long
    // call silently pays the cold cost again.
    warmVoiceTurn(workspaceId, agentId, ttsFormat?.format ?? null, ttsFormat?.rate ?? null);

    // ── Somebody answered us mid-reply and is now waiting ─────────────────
    //
    // harvestOverlap() recovered real words, so a turn is owed. But the caller
    // may also be MID-SENTENCE — they said "yes, and also…" and the "and also"
    // is still coming. Answering immediately would cut them off, which is the
    // failure this whole file spends four hundred lines avoiding.
    //
    // So: wait out one ordinary endpointing window. If anything new arrives,
    // cancelSettle() drops this and the normal onEndOfTurn path takes over —
    // with the carried text prepended in runTurn, so nothing is lost either
    // way. If the line stays quiet, nobody is going to say anything else and
    // no end-of-turn will ever fire, so answer what we already have.
    if (carriedUserText) {
      // The settle window exists for a caller who is MID-SENTENCE — "yes, and
      // also…" — where answering the "yes" alone would cut them off. It does
      // not exist for a caller who already finished, and Deepgram tells us
      // which is which.
      //
      // Waiting anyway cost up to OVERLAP_SETTLE_MS on exactly the turns where
      // the caller was most responsive, and the wait is worse than it looks:
      // the timer starts when OUR playout ends, not when they stopped talking.
      // Someone who answered two seconds into a ten-second reply has been
      // silent for eight seconds by then and still waited another 700ms.
      //
      // Safe to act on because carriedUserText is not raw transcript: it has
      // already survived the loud-frame count, stripOverlapEcho() and
      // isEchoOfAgent(), so it is the caller's words rather than ours coming
      // back up the line.
      if (overlapTurnEnded) {
        logger.info(`${carrier.label}: answering over-talk immediately — Deepgram already closed it`);
        overlapTurnEnded = false;
        runTurn();
      } else {
        armSettle();
      }
    }
    overlapTurnEnded = false;

    // We are listening from this instant, so this is the moment the caller's
    // silence starts counting. Armed unconditionally: if a turn is already on
    // its way (the carriedUserText branch above), the timer's own guard sees
    // `turnRunning` and re-arms rather than talking over it.
    armNoInput();
  };

  /**
   * Recover the caller's words from the stretch where the agent was audible.
   *
   * TWO INDEPENDENT SIGNALS ARE REQUIRED, and neither is sufficient alone.
   * A phone line has no echo cancellation, so a transcript captured during
   * playout is mostly OUR OWN REPLY coming back up the handset — and a faithful
   * transcription of the wrong speaker passes every test built to catch a bad
   * transcription. Acting on that gives the caller an agent that answers
   * questions nobody asked, which reads as being ignored.
   *
   *   1. ENERGY. At least OVERLAP_MIN_LOUD_FRAMES inbound frames cleared the
   *      barge threshold — i.e. a multiple of THIS line's measured noise floor.
   *      Echo alone rarely does that consistently; a person speaking does.
   *   2. TEXT. What survives stripping the agent's own words is still a real
   *      utterance. stripOverlapEcho() removes the echoed run (see its note on
   *      why the suffix-only rule its sibling uses cannot work here), and
   *      isEchoOfAgent() then rejects any remainder that is still substantially
   *      agent speech.
   *
   * Anything that fails either test is discarded exactly as before, so the
   * worst case is the behaviour this replaces.
   *
   * ── THE RESIDUAL RISK, AND THE KNOB FOR IT ─────────────────────────────
   *
   * Both gates can miss the same thing: echo garbled enough that Deepgram
   * transcribes it as different words (so neither the token match nor the
   * similarity check recognises it) on a line reflective enough to clear the
   * energy bar. That would carry a phantom user turn — the exact failure the
   * blanket discard prevented. It is judged the better trade because the
   * failure it replaces (the caller's answer silently dropped, every time,
   * on every call) is certain rather than occasional, and because the LLM
   * handles one garbled turn far better than a caller handles being ignored.
   *
   * If it does show up on live traffic, raise PHONE_OVERLAP_FRAMES before
   * touching anything else: more required energy is the cheap, blunt fix, and
   * at a high enough value this degrades cleanly back to the old behaviour.
   * Every drop is logged with the raw transcript so the two cases are
   * distinguishable after the fact.
   */
  const harvestOverlap = () => {
    const loud = overlapLoudFrames;
    overlapLoudFrames = 0;
    if (!dg || carriedUserText) return;

    // takeTranscript(), not finalizeTurn(): there is nothing to flush (we are
    // not at an end of turn, we are at the end of OUR speech), and a flush here
    // would cost a Deepgram round trip on the one path that has no one waiting
    // for it — the same waste P3 removed from runTurn.
    const heard = dg.takeTranscript();
    if (!heard) return;

    if (loud < OVERLAP_MIN_LOUD_FRAMES) {
      logger.info(
        `${carrier.label}: dropping "${heard.slice(0, 60)}" heard during playout — `
        + `only ${loud} loud frame(s), so it is our own audio echoing back`,
      );
      return;
    }

    const lastAgentText = history
      .filter((m) => m?.role === 'assistant' && typeof m.content === 'string')
      .pop()?.content || '';
    const stripped = stripOverlapEcho(heard, lastAgentText).trim();

    // Two characters is the same floor the STT-hallucination filter uses: below
    // it there is no utterance, only a fragment of one.
    if (stripped.length < 2 || isEchoOfAgent(stripped, lastAgentText)) {
      logger.info(
        `${carrier.label}: dropping "${heard.slice(0, 60)}" heard during playout — `
        + 'nothing survives removing the agent\'s own words',
      );
      return;
    }

    carriedUserText = stripped;
    logger.info(
      { loudFrames: loud, raw: heard.slice(0, 80) },
      `${carrier.label}: caller talked over the agent — recovered "${stripped}"`,
    );
  };

  const cancelSettle = () => {
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
  };

  /**
   * Answer the carried text once the line has been quiet for one endpointing
   * window. Re-armed by every new transcript (see onEndOfTurn's sibling in
   * openDeepgram), so a caller who is still talking always wins the race.
   */
  const armSettle = () => {
    cancelSettle();
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (closed || turnRunning || !carriedUserText) return;
      logger.info(`${carrier.label}: answering what the caller said over us`);
      runTurn();
    }, OVERLAP_SETTLE_MS);
    if (typeof settleTimer.unref === 'function') settleTimer.unref();
  };

  const cancelNoInput = () => {
    if (noInputTimer) { clearTimeout(noInputTimer); noInputTimer = null; }
  };

  /**
   * Speak up if the caller stays silent for a whole no-input window.
   *
   * Armed by armNextTurn — i.e. the clock starts when WE started listening, not
   * when the reply was generated, so a long reply does not age into a re-prompt
   * the moment it finishes playing.
   *
   * THE PROMPT IS SPOKEN WITH speakLine(), not a turn. That is the same choice
   * noInputPrompt.js makes for the browser and for the same reason: the line
   * exists to break dead air on a deadline, so routing it through an LLM whose
   * p90 time-to-first-token is seconds would make the silence part of its own
   * cost. speakLine also pushes it into `transcript`/`history`, so the model
   * sees that it asked — otherwise its next turn would repeat the question the
   * caller has now heard twice.
   *
   * Attempts escalate and then STOP (noInputPromptFor returns null past the
   * script). After the last one the silence hangup, if the agent configures
   * one, is what ends the call — this must not become a loop that keeps a dead
   * line open, which is the failure mode of re-prompting forever.
   */
  const armNoInput = () => {
    cancelNoInput();
    if (closed) return;
    const attempt = noInputAttempt + 1;
    if (attempt > maxNoInputAttempts(agentLanguages)) return;
    const line = noInputPromptFor(agentLanguages, attempt);
    if (!line) return;

    const waitMs = noInputDelayMs(attempt);
    noInputTimer = setTimeout(async () => {
      noInputTimer = null;
      // The line went busy again between arming and firing — a turn is running,
      // we started speaking, or there is over-talk waiting to be answered.
      // Re-arm rather than drop: if that turn ends in silence too, the caller
      // still needs the prompt.
      if (closed || turnRunning || playout.isSpeaking() || carriedUserText) {
        armNoInput();
        return;
      }

      // ── Is the caller actually silent, or just not finished? ─────────────
      //
      // The timer measures time since we STARTED LISTENING, and those are not
      // the same thing. A caller who has been talking for twelve seconds
      // without Deepgram committing an end of turn — a long answer, a list of
      // numbers, a language it is struggling with — has a running timer and is
      // mid-sentence, and firing here would talk over them with "sorry, I
      // didn't catch that". That is worse than the silence this exists to
      // break, because it happens to the callers who ARE talking.
      //
      // `lastCallerSpeechAt` is the energy-based answer and therefore the right
      // one here: it is set from inbound level, so it is true even on the exact
      // failure this feature covers — the caller spoke and STT returned nothing.
      // Waiting out the remainder means the prompt lands a full window after
      // they stop, not a full window after we started listening.
      const quietFor = Date.now() - lastCallerSpeechAt;
      if (quietFor < waitMs) {
        noInputTimer = setTimeout(() => { noInputTimer = null; armNoInput(); },
          Math.max(250, waitMs - quietFor));
        if (typeof noInputTimer.unref === 'function') noInputTimer.unref();
        return;
      }

      // Deepgram is holding words it has not committed yet: a turn is about to
      // run on its own, so there is nothing to break.
      if (dg?.hasTranscript?.()) { armNoInput(); return; }

      noInputAttempt = attempt;
      logger.info(
        `${carrier.label}: caller silent for ${Math.round(quietFor)}ms — `
        + `re-prompt ${attempt}/${maxNoInputAttempts(agentLanguages)}`,
      );
      await speakLine(line);
      // Same as the end of a turn: listening resumes once the line is quiet,
      // and that re-arms the next (longer) window.
      armNextTurn();
    }, waitMs);
    if (typeof noInputTimer.unref === 'function') noInputTimer.unref();
  };

  // Status write + wallet settlement + post-call delivery, exactly once. Shared
  // with the bundled and PIOPIY bridges — see ws/callFinalizer.js.
  const finalizeCallLog = createCallFinalizer({
    workspaceId, agentId, label: carrier.label,
  });

  const cleanup = (status) => {
    closed = true;
    abortTurn = true;
    // First: a leaked 20ms interval would outlive the call permanently.
    pacer?.stop();
    pacer = null;
    turnPcmChunks = [];
    turnPcmSamples = 0;
    budget?.stop();
    playout.stop();
    // A chained setTimeout waiting on playout would otherwise keep re-arming a
    // Deepgram session for a call that has already hung up.
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    // Same reason: a pending "answer what they said over us" must not fire a
    // whole LLM+TTS turn at a caller who has already hung up — and neither
    // hangup guard may outlive the call it was guarding.
    cancelSettle();
    cancelNoInput();
    if (maxCallTimer) { clearTimeout(maxCallTimer); maxCallTimer = null; }
    if (silenceTimer) { clearInterval(silenceTimer); silenceTimer = null; }
    carriedUserText = '';
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
        // Re-based off the `start` event rather than socket construction: the
        // handshake is not part of what the callee waits through.
        connectedAtMs = Date.now();
        turnFirstFrameAt = null;

        // Started here rather than at construction: sendFrameNow needs streamId,
        // which does not exist until this event.
        // Only override when the carrier actually supplies one: Plivo has no
        // per-call parameters on `start`, so its id arrives on the socket URL
        // and must survive this.
        if (started.callLogId) callLogId = started.callLogId;

        try {
          // ── Everything here happens while the caller is listening to silence ──
          //
          // A carrier opens this socket the instant the callee picks up, so every
          // millisecond between here and the first frame of the greeting is dead
          // air on a live line. This used to be FOUR serial remote round trips —
          // agent row, wallet gate, voice resolution, call-log status write — and
          // from this deployment a single Supabase round trip measures
          // 750-1400ms, so the greeting started somewhere north of three seconds
          // after "hello?". A web call pays none of it: the browser already has
          // the agent loaded and fetched its welcome over HTTP before the call
          // button was pressed. That asymmetry is a large part of why the same
          // agent feels responsive on the web and slow on the phone, and it is
          // paid again by EVERY call in a bulk campaign.
          //
          // Three changes, all about ordering rather than doing less:
          //   1. the agent row and the wallet gate are independent — the gate
          //      needs only the workspace — so they run together;
          //   2. rendering the welcome needs the agent but NOT the voice, so it
          //      overlaps the voice lookup instead of following it;
          //   3. the IN_PROGRESS status write is fire-and-forget. Nothing here
          //      reads it back and nothing downstream waits on it; it was
          //      awaited only because it was written with `await`.
          //
          // loadAgent(), not a raw findFirst: it populates the same cache that
          // getRenderedWelcome() and voiceTurnStream() read moments later, so
          // this one read serves all three instead of being the first of several
          // identical queries.
          const [loadedAgent, gate] = await Promise.all([
            loadAgent(workspaceId, agentId),
            // This still gates every provider call below — it has to finish
            // before Deepgram, the voice lookup or the greeting spend anything.
            // Running it CONCURRENTLY with the agent read does not weaken that,
            // it just stops the two waits being additive.
            openCallBudget({
              workspaceId,
              type: 'PHONE_CALL',
              label: carrier.label,
              onExpire: () => {
                cleanup('COMPLETED');
                try { ws.close(); } catch { /* already gone */ }
              },
            }),
          ]);

          agent = loadedAgent;
          budget = gate.budget;
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
          // The dial-time gate on the outbound paths is not redundant with this
          // one: it stops us PLACING a call we cannot pay for, which is a cost
          // this check is already too late to avoid.
          //
          // The budget also hangs the call up when the balance is spent, since
          // passing a gate at pickup says nothing about a call's length. Closing
          // the media socket is the only lever this bridge has: Twilio's
          // <Connect><Stream> ends the call with it, while Plivo's stream
          // carries keepCallAlive, so there the line goes quiet and the caller
          // hangs up. Either way the agent stops costing money.
          if (!gate.allowed) {
            logger.warn(
              { workspaceId, agentId, callLogId, code: gate.code },
              `${carrier.label} refused: ${gate.code}`,
            );
            // Same reasoning as the catch below: a refused call has to say so on
            // its own row, or it is indistinguishable from every other way a
            // call ends one second after pickup.
            transcript.push({
              role: 'system',
              content: `This call was refused before it started (${gate.code}): ${gate.message || ''}`.trim(),
            });
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

          // Started BEFORE the voice lookup rather than after it, so the two
          // overlap. The RENDERED welcome, not the raw field: getRenderedWelcome
          // is what the web call speaks (the client fetches
          // /agents/:id/welcome), and it is where the agent's configured
          // language is applied — "a welcome stored in English must be spoken in
          // Hindi when Hindi is the selected language". It also strips
          // [placeholders], de-robotifies greetings that call themselves an AI,
          // and fixes an agent that thanks the caller "for calling" on a call WE
          // dialled — which is what `direction` is for: the agent's stored
          // callDirection describes what it is FOR, not what is happening on
          // this leg, and campaigns routinely dial out through agents saved as
          // INBOUND or saved with no direction at all. Reading
          // agent.welcomeMessage directly here meant the phone call opened in
          // English while the web call opened in Hindi, from the same Assistant
          // Details — the phone is a transport for this agent, not a different
          // agent.
          //
          // Cached on the agent row by content hash, so this is not an LLM round
          // trip per call. Never allowed to fail the call: an un-rendered
          // greeting is far better than dead air on answer.
          const welcomePending = getRenderedWelcome(workspaceId, agentId, { direction })
            .then((r) => r?.welcome || '')
            .catch((e) => {
              logger.warn(`Welcome rendering failed, using the raw message: ${e.message}`);
              return '';
            });

          voice = await resolveAgentVoice(agent.voice);
          if (!voice) throw new Error('Agent has no resolvable voice');

          // telephonyFormatForVoice, NOT telephonyOutputFormat(voice.provider.name):
          // a cloned voice sits under the synthetic `Custom` provider, and asking
          // THAT name whether it can do telephony is asking a billing label to
          // synthesize audio. It always says no — so every Fish- and
          // ElevenLabs-hosted clone threw here, on a line the callee had already
          // answered, and the call dropped after about a second with an empty
          // transcript. See services/voice/telephonyVoice.js.
          const synthProvider = synthesisProviderForVoice(voice, settings.ttsProvider);
          ttsFormat = telephonyFormatForVoice(voice, settings.ttsProvider);
          if (!ttsFormat) {
            throw new Error(
              // The provider that would really speak it, not the row's label —
              // "Custom cannot emit a telephony audio format" named a thing no
              // operator can act on.
              `The voice "${voice.name}" is spoken by ${synthProvider || 'no usable provider'}, `
              + 'which cannot emit a telephony audio format. Give this agent an ElevenLabs, '
              + 'Sarvam or Fish Audio voice (or a clone hosted by one) to hold a phone conversation.',
            );
          }

          // Ambience is wired here for the first time on the modular route. It was
          // already in all three BUNDLED bridges, so the same agent had a
          // background bed when it ran on xAI/ElevenLabs and dead silence between
          // sentences on the modular pipeline — the setting simply did nothing for
          // most agents, because most agents are modular.
          //
          // The bed REPLACES the plain pacer rather than running beside it: both
          // are 20ms mu-law clocks over the same socket, and two clocks writing to
          // one carrier is exactly the burst ulawPacer.js exists to prevent.
          // ambiencePump mixes the agent's audio into every bed frame, so it is a
          // superset — same start/push/flush/stop interface, which is why this is
          // a swap and not a branch everywhere downstream.
          //
          // Note it is armed even for a carrier that does NOT need pacing
          // (Twilio): a continuous bed has to be emitted on a clock whether or not
          // the carrier would tolerate a burst of speech.
          if (settings.ambientSound && settings.ambientSound !== 'None') {
            pacer = createAmbiencePump({
              presetName: settings.ambientSound,
              send: sendFrameNow,
              onError: (err) => logger.warn(`${carrier.label}: ambience pump: ${err.message}`),
            });
            if (!pacer) {
              logger.warn(`${carrier.label}: unknown ambience preset "${settings.ambientSound}" — no background bed`);
            }
          }
          if (!pacer && carrier.pacedOutbound) {
            pacer = createUlawPacer({
              send: sendFrameNow,
              onError: (err) => logger.warn(`${carrier.label}: outbound pacer: ${err.message}`),
            });
          }
          pacer?.start();

          // ── Call configuration, finally enforced on the phone ──────────
          //
          // All three of these are set on the Call configuration tab and were,
          // until now, honoured only by the browser: EditAgent.tsx enforces
          // them for a web call and nothing on the server did. So the same
          // agent obeyed its own settings in the tester and ignored them on a
          // real call — a "hang up after 15s of silence" agent held the line
          // open until the wallet ran out, on every number in a campaign.
          interruptible = agent.interruptibleEnabled !== false;

          // maxDuration is in MINUTES on the agent row. A hard ceiling, not a
          // target: it exists so a call that goes wrong (a hold-music loop, a
          // voicemail system talking to us forever) cannot bill indefinitely.
          const maxCallMs = Math.max(0, Number(agent.maxDuration) || 0) * 60_000;
          if (maxCallMs > 0) {
            maxCallTimer = setTimeout(() => {
              logger.info(`${carrier.label}: reached the ${agent.maxDuration}-minute limit — hanging up`);
              cleanup('COMPLETED');
              try { ws.close(); } catch { /* already gone */ }
            }, maxCallMs);
            if (typeof maxCallTimer.unref === 'function') maxCallTimer.unref();
          }

          // Silence hangup, in SECONDS. Measured from the last time the caller
          // was audible, and deliberately not from the last transcript: a
          // caller whom Deepgram is mis-transcribing is still a caller, and
          // hanging up on them because we could not read their words is worse
          // than staying on a quiet line. Never armed while the agent is
          // speaking — our own reply is not the caller's silence.
          const silenceMs = Math.max(0, Number(settings.maxSilenceBeforeHangup) || 0) * 1000;
          if (silenceMs > 0) {
            silenceTimer = setInterval(() => {
              if (closed || turnRunning || playout.isSpeaking()) {
                // Not silence we can judge — reset the clock rather than let a
                // long reply age into a hangup.
                lastCallerSpeechAt = Date.now();
                return;
              }
              if (Date.now() - lastCallerSpeechAt < silenceMs) return;
              logger.info(
                `${carrier.label}: no caller audio for ${settings.maxSilenceBeforeHangup}s — hanging up`,
              );
              cleanup('COMPLETED');
              try { ws.close(); } catch { /* already gone */ }
            }, 1000);
            if (typeof silenceTimer.unref === 'function') silenceTimer.unref();
          }
          lastCallerSpeechAt = Date.now();

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
          warmVoiceTurn(workspaceId, agentId, ttsFormat.format, ttsFormat.rate ?? null);

          // Fire and forget, see (3) above: a status write the greeting waits on
          // is a status write the CALLER waits on.
          if (callLogId) {
            prisma.agentCallLog.update({
              where: { id: callLogId },
              data: { status: 'IN_PROGRESS' },
            }).catch(() => {});
          }

          // Greet immediately. A carrier connects the media stream the moment
          // the callee answers, and silence on answer is what makes people hang
          // up before the agent has said anything.
          const greeting = (await welcomePending)
            || agent.welcomeMessage
            || `Hello, this is ${agent.name}.`;
          await speakLine(greeting);
          // The one number that says how long the callee heard nothing. Measured
          // to the WIRE (see turnFirstFrameAt), not to "TTS returned bytes",
          // because on a paced carrier those differ by the queue depth.
          if (turnFirstFrameAt != null) {
            logger.info(
              `${carrier.label}: greeting reached the wire ${turnFirstFrameAt - connectedAtMs}ms after answer`,
            );
          }
          // openDeepgram() armed a turn BEFORE the greeting was spoken, so that
          // turn has been collecting the greeting's own echo for as long as it
          // played. Re-arm it once the line is quiet — the first thing the
          // caller says must not arrive with our welcome message glued to the
          // front of it. Same reasoning as runTurn's finally; see armNextTurn.
          armNextTurn();
        } catch (err) {
          // Structured, because the interesting fields are the ones that differ
          // between a broken agent and a broken deployment, and a bare message
          // string sends whoever reads it back to the code to find out which.
          logger.error(
            { workspaceId, agentId, callLogId, voice: agent?.voice, err: err.message },
            `Failed to start ${carrier.label}`,
          );
          // Put the reason ON THE CALL LOG. Without this a refused call is a
          // FAILED row with a one-second duration and an EMPTY transcript —
          // which is the same shape a no-answer, a carrier reject and a wallet
          // refusal all produce, so the operator sees "the call hung up
          // instantly" and nothing that says why. The reason existed only in the
          // process log on a VPS, which is what turned a one-line config problem
          // into a repeated production incident.
          transcript.push({
            role: 'system',
            content: `This call could not start: ${err.message}`,
          });
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

        // The RAW frame, because a recording should be what the caller and the
        // line actually carried, not what we chose to listen to.
        recording.inbound(frame);

        // ── Subtract our own voice before anything looks at this audio ──────
        //
        // Everything below — STT, the barge detector, the noise floor, the
        // turn buffer — was written around the fact that during playout the
        // inbound leg is mostly OUR reply coming back up the handset. With the
        // echo removed they all get what the web bridge has always got: the
        // caller, on their own. `echo.pcm` is the untouched input whenever we
        // are not audible, which is most of a call.
        const echo = aec.process(decodeUlaw(frame));
        const pcm = echo.pcm;

        // Always feed STT — including while the agent speaks, so the words a
        // caller says over the top are not lost when the barge lands. Now it is
        // the CLEANED audio: transcribing the agent's own echo is what made
        // those words unusable even when they were captured.
        try {
          dg.send(echo.refActive ? encodeUlaw(pcm) : frame);
        } catch { /* session died; next attempt recreates */ }

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
          } else {
            // Louder than this line's own floor while we are silent: the caller
            // is talking. This is the signal the silence hangup is measured
            // against — deliberately energy, not transcript, so a caller
            // speaking a language Deepgram is mis-transcribing is not hung up on.
            lastCallerSpeechAt = Date.now();
          }
          if (settleTimer && rms > noiseFloor * BARGE_MARGIN) {
            // Louder than this line's floor with the agent silent: the caller is
            // still going. They said "yes" over us and are now finishing the
            // sentence, so let the real end-of-turn close it — runTurn will
            // prepend the carried text. Answering the "yes" on its own here is
            // exactly the mid-sentence cut-off this bridge exists to avoid.
            cancelSettle();
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

        // TWO bars, because the two decisions cost different things. See
        // BARGE_RMS_MIN and OVERLAP_RMS_MIN — they used to be one constant, and
        // it was the barge-in one, so the cheap decision inherited the
        // expensive decision's caution and quiet callers went unheard.
        const { barge: bargeThreshold, overlap: overlapThreshold } = bargeThresholds(noiseFloor);

        // ── A second, independent witness that the caller is talking ────────
        //
        // The canceller knows something no energy threshold can: how much of
        // this frame FAILED to cancel. Pure echo subtracts away to a fraction
        // of what arrived; a caller talking over us survives, because their
        // voice is not in the reference. That is a direct measurement of
        // double talk rather than an inference from loudness.
        //
        // Requiring convergence keeps the bootstrap frames, where the filter
        // cancels nothing and everything looks like double talk, out of it.
        const aecSaysCaller = echo.refActive && echo.converged && echo.doubleTalk;

        // ── And the same witness, read the other way ────────────────────────
        //
        // A converged filter that cancelled this frame cleanly is telling us the
        // frame was OURS. That is the one thing an energy threshold can never
        // establish, and it is what makes it safe to lower BARGE_RMS_MIN to a
        // level a normal caller can actually reach: the residual echo that the
        // old 2500 floor was really defending against is precisely the signal
        // the canceller can now identify by name. Used as a VETO only — never
        // as a trigger — so a call where the filter never converges behaves
        // exactly as it does today.
        const isOurEcho = echo.refActive && echo.converged && !echo.doubleTalk;

        // Counted once per frame, whichever witness spoke. It used to be
        // possible for one frame to increment this twice (loud AND double talk),
        // so "three loud frames" could be met by two.
        if (aecSaysCaller || rms >= overlapThreshold) {
          // The caller is audible over us, so they are not silent — this counts
          // for the silence hangup even when barge-in is switched off below.
          lastCallerSpeechAt = Date.now();
          // Energy evidence that SOMEONE talked over us, kept separately from
          // bargeCount because it does NOT have to be consecutive. A caller who
          // says "yes" over an eight-second reply produces two or three loud
          // frames and never trips the barge detector's run of five — and until
          // armNextTurn started reading this, that "yes" was thrown away and the
          // caller had to say it again. See OVERLAP_MIN_LOUD_FRAMES.
          overlapLoudFrames += 1;
        }

        // ── Do not cut the agent off on a line we have never measured ──────
        //
        // The threshold is `max(floor, noiseFloor * margin)`, so before this
        // line's noise floor has been observed the ADAPTIVE half contributes
        // nothing and the absolute floor decides alone. That floor is now set
        // where people speak rather than above it, which is right for a
        // measured line and wrong for an unmeasured one — and the unmeasured
        // stretch is the greeting, when the inbound leg is mostly our own
        // welcome coming back off the handset and the canceller has not had a
        // quiet moment to lock onto the echo path yet. Self-barging the
        // greeting ("a greeting that reached 'Hello' and stopped") is the
        // failure the old 2500 floor was really guarding against, and this
        // guards against it directly instead of by making every caller shout.
        //
        // noiseSamples only advances while the agent is quiet, so this clears
        // within half a second of the greeting ending and costs nothing after.
        const lineMeasured = noiseSamples >= NOISE_MIN_SAMPLES;

        if (rms >= bargeThreshold && !isOurEcho && lineMeasured) {
          // `interruptibleEnabled` off means the agent finishes its sentence —
          // NOT that the caller goes unheard. Only the interrupt is suppressed;
          // harvestOverlap() still recovers what they said, so an agent
          // configured not to be cut off still answers the question. Counting
          // frames is skipped rather than the whole block, so the noise floor
          // and the overlap evidence above keep updating either way.
          if (interruptible) bargeCount += 1;
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
                threshold: Math.round(bargeThreshold),
                noiseFloor: Math.round(noiseFloor),
                cutMs: Math.round(cutMs),
                aecConverged: echo.converged,
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
