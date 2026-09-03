// backend/src/ws/webCallModularRealtime.handler.js
/**
 * Browser <-> modular ("combined sources": STT + LLM + TTS) agent bridge for
 * Web Call — the low-latency B2 transport that replaces the modular pipeline's
 * record-a-segment-then-HTTP-POST flow (EditAgent.tsx submitVoiceTurn*). Mounted at:
 *   /api/v1/workspaces/:workspaceId/agents/:agentId/web-call
 *
 * Why a socket instead of the old POST-per-turn:
 *  - the caller's audio is streamed as raw PCM16 while they speak, so by the
 *    time they stop there is nothing left to upload (no webm encode, no upload
 *    wait);
 *  - the connection is opened once for the whole call, not re-established each
 *    turn;
 *  - replies stream back sentence-by-sentence (voiceTurnStream / B1), so the
 *    agent starts speaking before the full reply is generated.
 *
 * The CLIENT owns endpointing (its analyser-based VAD decides when a turn ends),
 * the conversation history, and the Recent Calls log — this handler is a thin,
 * stateless-per-turn wrapper around voiceTurnStream. That keeps the client's
 * existing call recording / ambient sound / barge-in intact.
 *
 * Protocol (all client->server control frames are JSON text; audio is binary):
 *   client: { type: 'auth', token }
 *   server: { type: 'ready' }                       (or closes on auth failure)
 *   client: { type: 'call-log', callLogId }         the Recent Calls row it opened
 *   client: { type: 'start-turn', sampleRate }      begin a listening segment
 *   client: <binary PCM16 mono frames>              caller audio for this turn
 *   client: { type: 'end-turn', history }           VAD detected end of speech
 *   client: { type: 'cancel-turn' }                 noise-only segment, discard
 *   client: { type: 'barge' }                       caller interrupted the reply
 *   server: { type: 'transcript', role, text, done }
 *   server: { type: 'audio', seq, audioBase64, contentType }   one per sentence
 *   server: { type: 'done', timings } | { type: 'error', message }
 */

import logger from '../lib/logger.js';
import { noInputPromptFor, noInputDelayMs, maxNoInputAttempts } from '../services/voice/noInputPrompt.js';
import { verifyAccessToken } from '../lib/jwt.js';
import prisma from '../config/prisma.js';
import { voiceTurnStream, warmVoiceTurn } from '../services/agentRuntime.service.js';
import { DeepgramStreamSession, isDeepgramConfigured, toDeepgramLanguage } from '../services/stt/deepgramStream.service.js';
import { turnEndProfileFor, maxCommitMsFor } from '../services/voice/turnEndProfile.js';
import { analyzeSpeech, classifyCallerAffect, isEchoOfAgent } from '../services/stt/speechGate.js';
import { createFillerBudget } from '../services/voice/disfluency.js';
import { openCallBudget } from '../services/billing/callBudget.js';
import { finalizeAbandonedCall } from './callFinalizer.js';
import { startHeartbeat } from './socketHeartbeat.js';
import { randomUUID } from 'node:crypto';
import { logTurnLatency } from '../lib/latencyLog.js';
import { parseTurnTiming } from './turnTiming.js';

/**
 * How long the browser gets to send its `auth` frame.
 *
 * This reaps a socket that connects and then says nothing — a scanner, a half-
 * open connection, a tab killed between the handshake and the first frame. It
 * is a deadline for THE CLIENT, and it is cleared the moment the auth frame
 * lands, not when the server has finished acting on it.
 *
 * That distinction is the bug this file had. One 10s timer covered both the
 * client's frame AND everything the server then did with it, including two
 * round trips to a database in another region. When the database was slow, a
 * browser that had authenticated in 40ms was hung up on for the server's own
 * tardiness — and reported as "Auth timeout", which sent every investigation
 * in the wrong direction.
 */
const AUTH_TIMEOUT_MS = Number(process.env.WEB_CALL_AUTH_TIMEOUT_MS) || 10_000;

/**
 * How long the SERVER gets to make a call ready once the caller has proved who
 * they are: load the agent and clear the wallet gate, both of which are remote
 * database work.
 *
 * Deliberately much longer than the client deadline above, because the failure
 * modes are not comparable. A client that has not spoken in ten seconds is
 * gone. A database that has not answered in ten seconds is usually about to,
 * and hanging up on a caller whose wallet is healthy — measured at 21.6s for
 * the gate alone on a bad day against Supabase — is a worse outcome than making
 * them wait.
 *
 * It is still bounded, because an unbounded wait is just a hang with extra
 * steps: when it expires the caller is told the backend is slow, which is true
 * and actionable, instead of "could not start", which is neither.
 */
const STARTUP_TIMEOUT_MS = Number(process.env.WEB_CALL_STARTUP_TIMEOUT_MS) || 30_000;

/** A startup slower than this is logged even when it succeeds — it is the only
 *  warning that the call path is drifting toward the timeout above. */
const STARTUP_SLOW_MS = Number(process.env.WEB_CALL_STARTUP_SLOW_MS) || 3_000;

/**
 * How long the browser gets to finalize its own call before the server does it
 * instead.
 *
 * The client is the PREFERRED finalizer: its terminal PATCH carries the final
 * transcript, and it uploads the call recording first — on a long call that
 * upload is seconds of work, and racing it would finalize the call while its
 * audio was still in flight. So this waits, and in the overwhelmingly common
 * case does nothing at all because the PATCH already landed.
 */
const CLIENT_FINALIZE_GRACE_MS = Number(process.env.WEB_CALL_FINALIZE_GRACE_MS) || 30_000;

/** Close code for a call refused or ended on balance. Distinct from a transport
 *  failure so the client can say "add funds" rather than "connection lost". */
const CLOSE_INSUFFICIENT_BALANCE = 4009;

const safeJson = (str, fallback) => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

/** Wrap raw little-endian PCM16 mono audio in a WAV container the STT REST
 *  endpoints accept. Sample rate is whatever the browser AudioContext used. */
function pcm16ToWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  const dataLen = pcm.length;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);            // fmt chunk length
  header.writeUInt16LE(1, 20);             // PCM
  header.writeUInt16LE(1, 22);             // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate (sampleRate * blockAlign)
  header.writeUInt16LE(2, 32);             // block align (mono * 16-bit)
  header.writeUInt16LE(16, 34);            // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, pcm]);
}

export async function handleWebCallModularUpgrade(ws, { workspaceId, agentId }) {
  let authenticated = false;
  let closed = false;

  // Per-turn state
  let sampleRate = 24000;
  let frames = [];        // PCM16 chunks for the turn currently being captured
  let capturing = false;
  let turnActive = false; // a reply is being generated/streamed right now
  let bargeRequested = false;
  // B3 Deepgram streaming STT — ONE session for the whole call (created on the
  // first start-turn, kept alive between turns, recreated only if it dies or
  // the client's sample rate changes). Per-turn sessions paid a TLS connect
  // every turn and fell back to batch STT whenever that connect was slow.
  let dgSession = null;
  let dgLanguage;         // Deepgram language code derived from the agent (B3 Hindi fix)
  // Sequence number of the Deepgram turn currently capturing. Every finalize is
  // bound to it so a flush that resolves after the next turn has started can
  // neither steal that turn's words nor donate the previous turn's (BUG-001).
  let dgTurnSeq = 0;
  // The agent's own turn-end profile (Call Configuration → Response speed).
  // Resolved once at auth, because it decides how the Deepgram socket is opened
  // and what the browser is told to keep its RMS backstop clear of.
  let turnProfile = turnEndProfileFor({});
  // ── Server-owned turn start ──────────────────────────────────────────────
  // The server decides when a turn ends (Deepgram's commit) but used to have to
  // ASK THE BROWSER to tell it so: it sent { type:'endpoint' }, the browser
  // called its own endTurnEarly(), and the browser sent 'end-turn' back. A full
  // round trip, on every turn, to be told something this process had already
  // decided — free on localhost and ~120ms from the VPS.
  //
  // The browser now sends its conversation history with 'start-turn' as well,
  // which is the only thing the server was actually missing (history cannot
  // change while the caller is speaking, so the copy from start-turn is the
  // same one end-turn would have carried). With that in hand the commit can run
  // the turn directly, and 'end-turn' becomes a confirmation rather than a
  // trigger.
  //
  // `segmentSeq` makes the two paths idempotent: whichever arrives first runs
  // the turn, the other is a no-op. Without it a client backstop firing at the
  // same moment as the commit would run the turn twice.
  let segmentSeq = 0;
  let turnStartedForSegment = -1;
  // One id per turn, `<call>:<segment>`. It rides on every latency record
  // this turn produces (pipeline here, 'audible' from the browser) and on the
  // audio-start/done frames, so the three can be joined offline. Without it
  // the log could say how fast the server was and never what the caller heard.
  const callTag = randomUUID().slice(0, 8);
  let turnId = null;
  // History as of this listening segment's start. `undefined` means the client
  // is an older build that does not send it yet — the server then waits for
  // 'end-turn' exactly as before, so an unpatched client keeps working.
  let segmentHistory;
  // How much talk time the wallet actually paid for. Armed once the gate passes.
  let budget = null;
  // The Recent Calls row for this call. The BROWSER creates it (this transport
  // does not own the call log) and tells us the id, so that if the browser then
  // vanishes we can still close the call out and bill it. Null until it arrives,
  // and it may never arrive if the client's POST failed.
  let callLogId = null;
  const useDeepgram = isDeepgramConfigured();
  // Hesitation budget for the WHOLE call. It lives here rather than inside the
  // turn because the rule it enforces — roughly one filler every few turns, the
  // rate real speech actually has — is a property of the conversation. A turn
  // in isolation cannot tell that the previous three already opened with "umm",
  // which is exactly how a prompt-only version drifts into sounding nervous.
  const fillerBudget = createFillerBudget();

  // Cleared when the auth FRAME arrives — see AUTH_TIMEOUT_MS.
  let authTimer = setTimeout(() => {
    if (!authenticated) refuse(4001, 'AUTH_TIMEOUT', 'No authentication was received. Reload the page and try again.');
  }, AUTH_TIMEOUT_MS);
  // Armed once the server starts doing its own work, cleared when the call is
  // ready. Null whenever no startup is in flight.
  let startupTimer = null;
  const clearAuthTimer = () => { if (authTimer) { clearTimeout(authTimer); authTimer = null; } };
  const clearStartupTimer = () => { if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; } };

  // Without this, a tab that crashes or drops off the network never produces a
  // 'close', so the call never ends as far as this process is concerned — and
  // the closed-tab backstop in cleanup() below only runs on 'close'.
  const stopHeartbeat = startHeartbeat(ws, { label: 'modular web call' });

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };
  const sendBinary = (buf) => {
    if (ws.readyState === ws.OPEN) ws.send(buf, { binary: true });
  };

  /**
   * Refuse the call and SAY WHY.
   *
   * Every startup failure used to be a bare ws.close(). A WebSocket close code
   * and reason are not delivered to page JavaScript in any useful form, so the
   * browser could only report that the socket went away — which is how a slow
   * database, an expired token and a missing agent all surfaced as the same
   * sentence, "The Web Call could not be started", and why the real cause took
   * a database probe to find rather than a glance at the screen.
   *
   * The error frame goes first and the close follows, because the client latches
   * the last error it saw before the close and shows that instead of its
   * fallback text.
   */
  const refuse = (closeCode, code, message) => {
    clearAuthTimer();
    clearStartupTimer();
    send({ type: 'error', code, message });
    if (ws.readyState === ws.OPEN) ws.close(closeCode, code);
  };

  /**
   * Run at most ONE turn per listening segment, whoever asks first.
   *
   * Both the server's own end-of-turn commit and the browser's 'end-turn' frame
   * route through here. Guarding on the segment number rather than on
   * `turnActive` matters: turnActive only covers the window while a reply is
   * being generated, and the two triggers can arrive in the same tick, before
   * it is set.
   */
  const beginTurnOnce = async (seq, history, endpointMs = null) => {
    if (seq !== segmentSeq || turnStartedForSegment === seq) return;
    turnStartedForSegment = seq;
    capturing = false;
    // The socket close from an expired budget and a turn trigger can cross on
    // the wire. Running the turn anyway would spend a full STT+LLM+TTS round on
    // minutes the wallet has already run out of.
    if (budget?.expired()) { frames = []; return; }
    await runTurn(history, endpointMs);
  };

  /**
   * Open the call-long Deepgram session, or reuse the live one.
   *
   * Called at AUTH rather than on the first 'start-turn', which is where it used
   * to live. That ordering cost the first turn of every call: the socket's TLS
   * handshake was still in flight while the caller spoke, so `dgListened` was
   * false and the turn fell back to batch STT — the 4515ms `sttMs` outlier in
   * logs/latency.log. Opening it while the greeting plays makes turn one behave
   * like every other turn.
   *
   * Non-fatal throughout: batch STT covers any failure.
   */
  const ensureDeepgramSession = () => {
    if (!useDeepgram) return;
    if (dgSession && !dgSession.isAlive) dgSession = null;
    if (dgSession) return;
    try {
      dgSession = new DeepgramStreamSession({
        sampleRate,
        language: dgLanguage,
        // All three come from the agent's own turn-end profile, so two agents
        // on this deployment can wait for different lengths of silence.
        endpointingMs: turnProfile.endpointingMs,
        endpointGraceMs: turnProfile.graceMs,
        unfinishedGraceMs: turnProfile.unfinishedGraceMs,
        finishedGraceMs: turnProfile.finishedGraceMs,
        // Semantic turn end: fires only once the caller is genuinely finished
        // (confirmed speech_final, or an authoritative UtteranceEnd).
        //
        // This now STARTS THE TURN rather than asking the browser to. The
        // 'endpoint' frame is still sent, because the browser owns the mic, the
        // "processing" indicator and its own no-input timers and has to know the
        // segment is over — but it is a notification now, not a request.
        onEndOfTurn: (reason) => {
          if (!capturing || turnActive) return;
          logger.info(`Modular web call: end of turn (${reason})`);
          const endpointMs = dgSession?.lastEndpointMs ?? null;
          send({ type: 'endpoint' });
          // Only when the client actually gave us history to run with. An older
          // client sends none, and there the browser's 'end-turn' still drives.
          if (segmentHistory !== undefined) {
            beginTurnOnce(segmentSeq, segmentHistory, endpointMs)
              .catch((err) => logger.warn(`Server-started turn failed: ${err.message}`));
          }
        },
      });
      dgSession.connect();
      dgTurnSeq = dgSession.beginTurn();
    } catch (err) {
      logger.warn(`Deepgram session start failed, using batch STT: ${err.message}`);
      dgSession = null;
    }
  };

  const runTurn = async (history, endpointMs = null) => {
    // Marks "the caller is judged done speaking" (client sent end-turn) — the same
    // reference point modularMediaBridge.js uses for its preLlmMs, so the two
    // channels are directly comparable in logs/latency.log.
    // performance.now(): monotonic. Date.now() moves with NTP/clock changes,
    // which on a long call turns into negative or wildly large durations.
    const turnEndDetectedAt = performance.now();
    const pcm = Buffer.concat(frames);
    frames = [];
    capturing = false;

    // B3: flush the streaming transcript for THIS turn — the session itself
    // stays open for the next one. Empty → voiceTurnStream falls back to
    // batch STT on the buffered WAV.
    let streamedText = '';
    // Was Deepgram actually listening to THIS turn (socket open the whole time)?
    // Captured before finalizeTurn, which can mark the session dead.
    const dgListened = Boolean(dgSession?.isConnected);
    if (dgSession) {
      const dgStart = performance.now();
      try { streamedText = await dgSession.finalizeTurn(1200, dgTurnSeq); } catch { /* fall back to batch */ }
      const dgMs = Math.round(performance.now() - dgStart);
      if (dgMs > 500) logger.info(`Deepgram finalize took ${dgMs}ms`);
      // An empty streaming transcript degrades the turn to batch STT (slower AND
      // less accurate). It used to be invisible — surface it, with the audio
      // length, so a misconfigured stream is diagnosable from the log. Only a
      // real problem when the stream wasn't up; see the silence gate below.
      if (!streamedText && pcm.length && !dgListened) {
        logger.warn(
          `Deepgram returned no transcript for a ${(pcm.length / 2 / sampleRate).toFixed(1)}s turn ` +
          `(lang=${dgLanguage ?? 'default'}, rate=${sampleRate}) — falling back to batch STT`,
        );
      }
      if (!dgSession.isAlive) dgSession = null; // died mid-call — next turn recreates it
    }

    if (!pcm.length && !streamedText) { send({ type: 'done', timings: null }); return; }

    // ── Silence gate (BUG-001) ────────────────────────────────────────────────
    // The caller said NOTHING this turn, so there is no turn to run. Without
    // this, buffered noise went to batch STT, and every batch engine in the
    // pipeline (ElevenLabs/Sarvam/Whisper-family) hallucinates stock filler on
    // near-silence. The LLM then answered that phantom text, so the caller
    // watched the agent reply — usually apologising for not understanding —
    // while they had said nothing.
    //
    // Three independent ways to know there was no speech:
    //  - Deepgram had an open socket for the whole segment and returned no
    //    words. It heard the audio live; if it found no speech there was none.
    //  - The segment is too short to contain a word at all.
    //  - ACOUSTIC ANALYSIS of the buffered PCM found no voiced speech.
    //
    // That third check is the one that was missing, and it is the one that
    // matters most. The first is conditional on `dgListened`, which is FALSE on
    // exactly the path that needs guarding — no DEEPGRAM_API_KEY, session died
    // mid-call, or TLS handshake still in flight. The whole batch-STT fallback
    // exists because those happen, and on that path a noise-only segment longer
    // than 400ms sailed straight through. analyzeSpeech() answers the question
    // from the PCM we already hold, with no dependency on any provider.
    //
    // This does NOT add latency: it is ~0.4ms of arithmetic on an in-memory
    // buffer (measured; 1.6ms at the 20s max segment), and when it fires it
    // REMOVES a multi-hundred-millisecond batch-STT round trip. Deliberately
    // not a silence timeout — that would recreate the "AI is thinking" pause
    // this is meant to prevent.
    const audioMs = (pcm.length / 2 / sampleRate) * 1000;
    const speech = analyzeSpeech(pcm, sampleRate);
    if (!streamedText && (dgListened || audioMs < 400 || !speech.hasSpeech)) {
      logger.info(
        `Modular web call: discarding silent ${Math.round(audioMs)}ms turn ` +
        `(dgListened=${dgListened} voicedMs=${speech.voicedMs} ` +
        `contrast=${speech.contrast.toFixed(2)} peak=${speech.peakRms.toFixed(4)})`,
      );
      send({ type: 'done', timings: null });
      return;
    }

    // ── Echo gate: the agent's own voice coming back through the mic ─────────
    //
    // Everything above is conditional on `!streamedText`, so a NON-EMPTY
    // Deepgram transcript bypassed every acoustic check in the pipeline. That
    // was a deliberate choice — Deepgram reports what it hears instead of
    // inventing filler, so second-guessing it risked dropping real speech — and
    // it holds right up until what it hears is the agent. Then the transcript
    // is perfectly accurate and completely wrong, and nothing downstream can
    // tell, because a faithful transcription of the wrong speaker passes every
    // test built to catch a bad transcription.
    //
    // Two independent signals, either sufficient:
    //  1. NO VOICED SPEECH in the caller's own audio. Post-AEC echo residual
    //     sits below the absolute noise floor, so when Deepgram returns words
    //     and the microphone shows nothing, the words did not come from this
    //     side of the call.
    //  2. THE WORDS MATCH WHAT THE AGENT JUST SAID. Catches the case where the
    //     echo IS loud enough to look like speech — which is precisely when
    //     signal 1 cannot help.
    if (streamedText && audioMs >= 400 && !speech.hasSpeech) {
      logger.info(
        `Modular web call: discarding "${streamedText}" — Deepgram returned words but the ` +
        `caller's mic had no voiced speech (voicedMs=${speech.voicedMs} ` +
        `contrast=${speech.contrast.toFixed(2)} peak=${speech.peakRms.toFixed(4)}); ` +
        'almost certainly the agent\'s own audio echoing back',
      );
      send({ type: 'done', timings: null });
      return;
    }
    const lastAgentText = (Array.isArray(history) ? history : [])
      .filter((m) => m?.role === 'assistant' && typeof m.content === 'string')
      .pop()?.content || '';
    if (streamedText && isEchoOfAgent(streamedText, lastAgentText)) {
      logger.info(
        `Modular web call: discarding "${streamedText}" — echo of the agent's own ` +
        `previous reply ("${lastAgentText.slice(0, 60)}…")`,
      );
      send({ type: 'done', timings: null });
      return;
    }

    turnActive = true;
    bargeRequested = false;
    const wav = pcm16ToWav(pcm, sampleRate);
    try {
      await voiceTurnStream(
        workspaceId,
        agentId,
        wav,
        'audio/wav',
        Array.isArray(history) ? history : [],
        {
          userText: streamedText,
          // Acoustic + transcript affect signal (rushed/hesitant/agitated/
          // quiet/null) — steers reply tone and TTS delivery turn-by-turn.
          affect: classifyCallerAffect(speech, streamedText),
          // BUG-001: lets voiceTurnStream apply the STT-hallucination filter to
          // the BATCH transcript with a second, independent signal. Text alone
          // is not enough to drop "okay"/"thank you" (a caller really says
          // those); text + "the audio had no voiced speech" is.
          audioHadSpeech: speech.hasSpeech,
          fillerBudget,
          channel: 'web',
          turnId,
          preLlmMs: Math.round(performance.now() - turnEndDetectedAt),
          // The wait BEFORE this turn began: Deepgram's VAD timeout plus the
          // confirmation grace. It is real dead air the caller sits through,
          // and until now it appeared in no metric at all — so every latency
          // discussion silently started ~700ms after the caller stopped
          // talking. Null when the browser's backstop ended the turn instead.
          endpointMs,
          shouldAbort: () => bargeRequested,
          onEvent: (e) => {
            if (bargeRequested && e.type !== 'done') return; // caller cut in; drop reply audio
            if (e.type === 'transcript') {
              if (e.userText) send({ type: 'transcript', role: 'user', text: e.userText, done: true });
            } else if (e.type === 'audio-start') {
              // JSON control frame opens the stream; chunks follow as binary.
              send({ type: 'audio-start', contentType: e.contentType, turnId, filler: e.filler === true });
            } else if (e.type === 'audio-chunk') {
              // Forward the raw audio as an efficient binary frame (no base64
              // bloat over the wire) — the client appends it to a MediaSource.
              // `chunk` is already a Buffer: the runtime used to base64-encode
              // every byte here purely so this line could decode it again.
              sendBinary(e.chunk);
            } else if (e.type === 'audio-end') {
              if (e.text) send({ type: 'transcript', role: 'assistant', text: e.text, done: true });
              send({ type: 'audio-end' });
            } else if (e.type === 'done') {
              send({ type: 'done', turnId, reply: e.reply ?? null, timings: e.timings ?? null });
            }
          },
        }
      );
    } catch (err) {
      logger.warn(`Modular web call turn failed: ${err.message}`);
      send({ type: 'error', message: err.message });
      send({ type: 'done', timings: null });
    } finally {
      turnActive = false;
    }
  };

  const cleanup = (status = 'COMPLETED') => {
    if (closed) return;
    closed = true;
    clearAuthTimer();
    clearStartupTimer();
    stopHeartbeat();
    budget?.stop();
    frames = [];
    if (dgSession) { dgSession.close(); dgSession = null; }

    // The media has stopped, so this instant — not whenever the backstop below
    // actually runs — is the end of the billable call.
    const endedAt = new Date();
    if (!callLogId) {
      // The client never told us which row this call belongs to — its POST to
      // /calls failed, or the call ended before that request came back. Nothing
      // to settle against. Logged because "this call was never billed" is
      // exactly the kind of thing that used to happen invisibly.
      if (authenticated) {
        logger.warn({ workspaceId, agentId }, 'Modular web call ended with no call log id — it cannot be billed');
      }
      return;
    }

    // Closed-tab backstop. Nothing here is awaited: the socket is already gone,
    // there is nobody to report to, and holding the handler open would only
    // delay teardown. finalizeAbandonedCall swallows its own failures and does
    // nothing at all if the browser finalized the call itself, which is what
    // normally happens.
    const backstop = setTimeout(() => {
      finalizeAbandonedCall(callLogId, {
        workspaceId, agentId, endedAt, status, label: 'modular web call',
      }).catch((err) => logger.warn(`Modular web call backstop failed: ${err.message}`));
    }, CLIENT_FINALIZE_GRACE_MS);
    // A pending backstop must never keep the process alive at shutdown. If the
    // server restarts inside the grace window the call is left to the 2-hour
    // reaper, exactly as it was before this existed.
    backstop.unref?.();
  };

  ws.on('message', async (raw, isBinary) => {
    // ── Auth handshake (must be first) ──────────────────────────────────────
    if (!authenticated) {
      if (isBinary) return; // ignore audio before auth
      const msg = safeJson(raw.toString(), null);
      if (msg?.type !== 'auth' || typeof msg.token !== 'string') {
        refuse(4001, 'AUTH_MALFORMED', 'The connection did not start with a valid sign-in. Reload the page and try again.');
        return;
      }
      // The client has met its deadline. Everything from here is the server's
      // own work, on its own budget — a slow database must never be reported as
      // the caller failing to authenticate.
      clearAuthTimer();
      try {
        const payload = verifyAccessToken(msg.token);
        if (payload.workspaceId && payload.workspaceId !== workspaceId) {
          throw new Error('Token workspace mismatch');
        }
      } catch (err) {
        logger.warn(`Modular web call auth failed: ${err.message}`);
        refuse(4001, 'AUTH_INVALID', 'Your session has expired. Sign in again and retry the call.');
        return;
      }

      // ── Server-side startup, on its own clock ───────────────────────────
      //
      // Two remote database round trips (the agent row, then the wallet gate).
      // Both were previously unguarded: a throw here — a connection-pool
      // timeout is the common one — rejected this async handler with nothing
      // sent, so the socket simply died and the browser reported a generic
      // failure. Now it is bounded, reported, and measured.
      const startupAt = Date.now();
      startupTimer = setTimeout(() => {
        if (authenticated) return;
        logger.error(
          { workspaceId, agentId, waitedMs: Date.now() - startupAt },
          'Modular web call gave up waiting on its own startup (database slow or unreachable)',
        );
        refuse(
          4503,
          'BACKEND_SLOW',
          'The service could not get ready in time — the database is not responding. Please try again in a moment.',
        );
      }, STARTUP_TIMEOUT_MS);

      let agent;
      try {
        agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
      } catch (err) {
        // The exact failure behind the reported bug: "Timed out fetching a new
        // connection from the connection pool", thrown into a handler with no
        // catch, killing the socket in silence.
        logger.error({ err, workspaceId, agentId }, 'Modular web call could not load the agent');
        refuse(4503, 'BACKEND_UNAVAILABLE', 'Could not reach the database to start this call. Please try again in a moment.');
        return;
      }
      if (startupTimer === null) return; // startup already gave up; socket is closing
      if (!agent) {
        refuse(4004, 'AGENT_NOT_FOUND', 'This agent no longer exists in this workspace.');
        return;
      }

      // B3: tell Deepgram which language the caller speaks (else a Hindi agent's
      // audio is transcribed as English → empty → silent fallback to batch STT).
      let agentLanguages = [];
      try { agentLanguages = JSON.parse(agent.languages || '[]'); } catch { /* ignore */ }
      const agentSettings = safeJson(agent.settings, {});
      // The agent's chosen wait-for-silence profile. Everything downstream —
      // how the Deepgram socket is opened, and the backstop the browser is told
      // to stay clear of — is derived from this one object.
      turnProfile = turnEndProfileFor(agentSettings);
      if (useDeepgram) {
        dgLanguage = toDeepgramLanguage(agentSettings.sttLanguage) || toDeepgramLanguage(agentLanguages[0]);
      }

      // ── Wallet gate ─────────────────────────────────────────────────────────
      //
      // THE hole that let balances go negative. This transport is the default
      // Web Call path, and it had no billing check of any kind: it authenticated
      // and started serving turns. The only gate on the modular web path ran in
      // createCallLog(), which deliberately only WARNS — the browser opens the
      // mic and this socket before it POSTs there, and ignores the reply, so
      // refusing the record stopped nothing. So a workspace at ₹0 could talk for
      // as long as it liked, and settlement (which must never refuse minutes
      // already served) wrote the whole thing off against an empty wallet.
      //
      // Checked HERE, before Deepgram/LLM/TTS exist, so a refused call costs us
      // no provider spend either. The budget is the other half of the same job:
      // passing the gate only means the call could START, so it also hangs up
      // when the balance is spent. See callBudget.js.
      const gateAt = Date.now();
      let gate;
      try {
        gate = await openCallBudget({
          workspaceId,
          type: 'WEB_CALL',
          label: 'modular web call',
          onWarn: (secondsLeft) => {
            send({
              type: 'error',
              code: 'BALANCE_LOW',
              message: `Your wallet balance runs out in about ${secondsLeft} seconds. Add funds to keep talking.`,
            });
          },
          onExpire: () => {
            send({
              type: 'error',
              code: 'INSUFFICIENT_BALANCE',
              message: 'Your wallet balance has run out. Add funds to place more calls.',
            });
            ws.close(CLOSE_INSUFFICIENT_BALANCE, 'INSUFFICIENT_BALANCE');
          },
        });
      } catch (err) {
        // A FAILED gate is not a REFUSED gate, and the difference decides who is
        // at fault. This one means we could not read the wallet at all, so the
        // caller is told the service is unavailable rather than that they are
        // out of money — which would be both wrong and, for a paying customer
        // sitting on a healthy balance, alarming.
        logger.error({ err, workspaceId, agentId, waitedMs: Date.now() - gateAt },
          'Modular web call could not verify the wallet balance');
        refuse(4503, 'BACKEND_UNAVAILABLE', 'Could not verify your balance to start this call. Please try again in a moment.');
        return;
      }
      if (startupTimer === null) return; // startup already gave up; socket is closing
      budget = gate.budget;
      if (!gate.allowed) {
        logger.info({ workspaceId, agentId, code: gate.code }, `Modular web call blocked: ${gate.code}`);
        refuse(CLOSE_INSUFFICIENT_BALANCE, gate.code, gate.message);
        return;
      }

      authenticated = true;
      clearAuthTimer();
      clearStartupTimer();
      // Startup is remote database work on every call, and it is the step that
      // silently grew until it blew the old timeout. Logged whenever it is slow
      // so the drift is visible BEFORE it starts refusing calls, rather than
      // being reconstructed from a database probe afterwards.
      const startupMs = Date.now() - startupAt;
      if (startupMs >= STARTUP_SLOW_MS) {
        logger.warn(
          { workspaceId, agentId, startupMs, gateMs: Date.now() - gateAt, budgetMs: STARTUP_TIMEOUT_MS },
          'Modular web call was slow to become ready',
        );
      }
      // Tell the client whether model-based endpointing is actually available.
      // Its RMS VAD is a BACKSTOP when it is, and the sole endpointer when it is
      // not, and those want very different timeouts: a backstop must sit well
      // clear of a natural mid-sentence pause (or it cuts the caller off before
      // the smarter signal can rule), while a sole endpointer has to stay
      // responsive. The client can't infer this, so state it.
      // endpointCommitMs: the worst case this server will wait before ending a
      // turn itself. The client's RMS backstop must stay clear of it, or the
      // backstop wins the race on every turn and the server's mid-thought grace
      // window is dead code. Sent rather than duplicated so the two cannot drift.
      // noInputPrompts: what to say when the caller has gone quiet, already in
      // the agent's language. Resolved HERE and shipped once, rather than asked
      // for when the silence happens: the whole point of the feature is to
      // break dead air on a deadline, so it must not depend on a round trip —
      // still less on an LLM turn — at the moment it is needed. The client owns
      // the listening segment on this transport, so it owns the timer too; the
      // server owns the wording because only it can see agent.languages.
      const noInputAttempts = maxNoInputAttempts(agentLanguages);
      send({
        type: 'ready',
        sttEndpointing: useDeepgram,
        endpointCommitMs: useDeepgram ? maxCommitMsFor(turnProfile) : 0,
        noInputPrompts: Array.from({ length: noInputAttempts },
          (_, i) => noInputPromptFor(agentLanguages, i + 1)),
        noInputDelaysMs: Array.from({ length: noInputAttempts },
          (_, i) => noInputDelayMs(i + 1)),
      });

      // Warm everything turn one would otherwise pay for, while the caller is
      // still hearing the greeting: the Deepgram TLS handshake, and the agent /
      // KB / voice / filler caches. Both are fire-and-forget — the call works
      // identically without them, just slower on its first turn.
      //
      // The rate has to be right FIRST. It is baked into the Deepgram URL, so a
      // session opened at the wrong rate is torn down and re-handshaked by the
      // first 'start-turn' — which would spend the warm-up and then throw it
      // away. The browser knows its AudioContext rate before it opens this
      // socket and now sends it here; an older client omits it and simply keeps
      // the previous behaviour of connecting on the first turn.
      if (Number.isFinite(msg.sampleRate) && msg.sampleRate > 0) {
        sampleRate = msg.sampleRate;
        ensureDeepgramSession();
      }
      warmVoiceTurn(workspaceId, agentId);
      return;
    }

    // ── Post-auth: binary = caller PCM, JSON = control ──────────────────────
    if (isBinary) {
      if (capturing) {
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        frames.push(buf);            // buffered for the WAV / batch-STT fallback
        dgSession?.send(buf);        // B3: also stream live to Deepgram
      }
      return;
    }

    const msg = safeJson(raw.toString(), null);
    if (!msg?.type) return;
    switch (msg.type) {
      case 'start-turn': {
        const newRate = Number.isFinite(msg.sampleRate) && msg.sampleRate > 0 ? msg.sampleRate : sampleRate;
        // Sample rate is baked into the Deepgram connection — a change (new
        // AudioContext) forces a fresh session.
        if (dgSession && newRate !== sampleRate) { dgSession.close(); dgSession = null; }
        sampleRate = newRate;
        frames = [];
        capturing = true;
        // A new listening segment. Whoever ends it — the server's own commit or
        // the browser's backstop — runs the turn exactly once against this id.
        segmentSeq += 1;
        turnId = `${callTag}:${segmentSeq}`;
        turnStartedForSegment = -1;
        // The conversation as it stands right now. Nothing can change it while
        // the caller is speaking, so this is the same history 'end-turn' would
        // have carried, available a whole turn earlier. Left undefined by older
        // clients, which keeps them on the wait-for-'end-turn' path.
        segmentHistory = Array.isArray(msg.history) ? msg.history : undefined;
        // Warm agent/KB/voice/filler caches WHILE the caller is speaking, so a
        // cold cache costs nothing after they stop (the prepMs spikes in
        // latency.log). Already warmed at auth; this covers config edits
        // mid-call. Fire-and-forget; the turn works identically without it.
        warmVoiceTurn(workspaceId, agentId);
        // Reuse the call-long session; (re)connect only when there is none or it
        // died. Normally a no-op — it was opened at auth.
        ensureDeepgramSession();
        // Opens a fresh, empty buffer for this turn AND stamps it with a
        // sequence number, so an in-flight flush from the previous turn
        // (cancel-turn does not await one) can neither leak its words into this
        // turn nor swallow this turn's opening words.
        if (dgSession) dgTurnSeq = dgSession.beginTurn();
        break;
      }
      case 'end-turn':
        capturing = false;
        // Usually a confirmation of a turn this server already started off its
        // own end-of-turn commit, in which case this is a no-op. It still
        // TRIGGERS the turn when the browser's RMS backstop won the race, or
        // when the client is an older build that sends no history on start-turn.
        await beginTurnOnce(segmentSeq, msg.history);
        break;
      case 'cancel-turn':
        // A cancel means the CLIENT's amplitude VAD judged the segment silent.
        // That judgement is not allowed to destroy words Deepgram has already
        // recognised. When the recogniser holds a transcript, the caller
        // demonstrably spoke, so this is a real turn that the transport simply
        // failed to notice — run it instead of discarding it.
        //
        // This is the server-side half of the same fix applied in the browser
        // (see endTurnEarly). Either half alone would still lose turns: the
        // client can miss Deepgram's endpoint entirely, and the server cannot
        // know the client gave up until this frame arrives.
        if (dgSession?.isAlive && dgSession.hasTranscript()) {
          logger.info('Modular web call: cancel-turn overridden — Deepgram has a transcript');
          await beginTurnOnce(segmentSeq, msg.history);
          break;
        }
        frames = [];
        capturing = false;
        // Nothing will run for this segment. Claim it so a commit landing right
        // behind this frame cannot resurrect a turn the caller was silent in.
        turnStartedForSegment = segmentSeq;
        // Flush the discarded turn's audio out of the stream so it can't bleed
        // into the next turn's transcript; the session itself stays open.
        //
        // Deliberately NOT awaited — awaiting would stall the restart of
        // listening by up to the flush timeout, and a cancelled turn is by
        // definition one the caller was silent in, so there is nothing worth
        // waiting for. Safe to fire and forget now that the flush is bound to
        // `dgTurnSeq` and routes its results away from the next turn's buffer.
        //
        // Short timeout on purpose. Nobody reads this result — it exists only to
        // drain the discarded audio — and while the flush is pending its results
        // are routed to it rather than to the turn now capturing. Bounding that
        // window at 300ms (a flush normally lands in 100-300ms) caps how much of
        // a real next turn could be misattributed if Deepgram never sends the
        // from_finalize marker. The 1200ms default is for `end-turn`, where the
        // transcript IS awaited and no other turn is running concurrently.
        if (dgSession) dgSession.finalizeTurn(300, dgTurnSeq).catch(() => {});
        break;
      case 'call-log':
        // The browser has opened its Recent Calls row and is handing us the id
        // purely so the call can still be closed out and billed if the browser
        // goes away. Ignored after the first one: the id cannot change mid-call,
        // and accepting a later one would let a stray frame redirect billing at
        // a different call's row.
        if (!callLogId && typeof msg.callLogId === 'string' && msg.callLogId) {
          callLogId = msg.callLogId;
        }
        break;
      case 'turn-timing': {
        // The browser measured end-of-speech -> its <audio> 'playing' event.
        // The only record of what a person actually heard; see turnTiming.js
        // for why a caller-supplied number is validated this hard.
        const timing = parseTurnTiming(msg);
        if (!timing) break;
        const record = { kind: 'audible', channel: 'web', agentId, ...timing };
        logger.info(record, 'Web call audible latency');
        logTurnLatency(record);
        break;
      }
      case 'barge':
        // Caller cut in. Stop the in-flight reply; the client has already
        // flushed its own playback locally.
        if (turnActive) bargeRequested = true;
        break;
      case 'stop':
        ws.close(1000, 'Call ended by client');
        break;
      default:
        break;
    }
  });

  // 'error' fires before 'close', so a socket that failed is recorded as FAILED
  // — cleanup() is single-shot and the first status wins.
  ws.on('close', () => cleanup('COMPLETED'));
  ws.on('error', (err) => {
    logger.warn(`Modular web call socket error: ${err.message}`);
    cleanup('FAILED');
  });
}
