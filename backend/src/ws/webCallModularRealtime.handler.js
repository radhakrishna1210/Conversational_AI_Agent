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
import { verifyAccessToken } from '../lib/jwt.js';
import prisma from '../config/prisma.js';
import { voiceTurnStream, warmVoiceTurn } from '../services/agentRuntime.service.js';
import { DeepgramStreamSession, isDeepgramConfigured, toDeepgramLanguage, maxEndpointCommitMs } from '../services/stt/deepgramStream.service.js';
import { analyzeSpeech, classifyCallerAffect, isEchoOfAgent } from '../services/stt/speechGate.js';
import { createFillerBudget } from '../services/voice/disfluency.js';

const AUTH_TIMEOUT_MS = 10_000;

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
  const useDeepgram = isDeepgramConfigured();
  // Hesitation budget for the WHOLE call. It lives here rather than inside the
  // turn because the rule it enforces — roughly one filler every few turns, the
  // rate real speech actually has — is a property of the conversation. A turn
  // in isolation cannot tell that the previous three already opened with "umm",
  // which is exactly how a prompt-only version drifts into sounding nervous.
  const fillerBudget = createFillerBudget();

  const authTimer = setTimeout(() => {
    if (!authenticated) ws.close(4001, 'Auth timeout');
  }, AUTH_TIMEOUT_MS);

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };
  const sendBinary = (buf) => {
    if (ws.readyState === ws.OPEN) ws.send(buf, { binary: true });
  };

  const runTurn = async (history) => {
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
      const dgStart = Date.now();
      try { streamedText = await dgSession.finalizeTurn(1200, dgTurnSeq); } catch { /* fall back to batch */ }
      const dgMs = Date.now() - dgStart;
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
          shouldAbort: () => bargeRequested,
          onEvent: (e) => {
            if (bargeRequested && e.type !== 'done') return; // caller cut in; drop reply audio
            if (e.type === 'transcript') {
              if (e.userText) send({ type: 'transcript', role: 'user', text: e.userText, done: true });
            } else if (e.type === 'audio-start') {
              // JSON control frame opens the stream; chunks follow as binary.
              send({ type: 'audio-start', contentType: e.contentType });
            } else if (e.type === 'audio-chunk') {
              // Forward the raw audio as an efficient binary frame (no base64
              // bloat over the wire) — the client appends it to a MediaSource.
              sendBinary(Buffer.from(e.data, 'base64'));
            } else if (e.type === 'audio-end') {
              if (e.text) send({ type: 'transcript', role: 'assistant', text: e.text, done: true });
              send({ type: 'audio-end' });
            } else if (e.type === 'done') {
              send({ type: 'done', reply: e.reply ?? null, timings: e.timings ?? null });
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

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearTimeout(authTimer);
    frames = [];
    if (dgSession) { dgSession.close(); dgSession = null; }
  };

  ws.on('message', async (raw, isBinary) => {
    // ── Auth handshake (must be first) ──────────────────────────────────────
    if (!authenticated) {
      if (isBinary) return; // ignore audio before auth
      const msg = safeJson(raw.toString(), null);
      if (msg?.type !== 'auth' || typeof msg.token !== 'string') {
        ws.close(4001, 'First message must be { type: "auth", token }');
        return;
      }
      try {
        const payload = verifyAccessToken(msg.token);
        if (payload.workspaceId && payload.workspaceId !== workspaceId) {
          throw new Error('Token workspace mismatch');
        }
      } catch (err) {
        logger.warn(`Modular web call auth failed: ${err.message}`);
        ws.close(4001, 'Invalid or expired token');
        return;
      }

      const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
      if (!agent) {
        ws.close(4004, 'Agent not found in this workspace');
        return;
      }

      // B3: tell Deepgram which language the caller speaks (else a Hindi agent's
      // audio is transcribed as English → empty → silent fallback to batch STT).
      if (useDeepgram) {
        const settings = safeJson(agent.settings, {});
        let langs = [];
        try { langs = JSON.parse(agent.languages || '[]'); } catch { /* ignore */ }
        dgLanguage = toDeepgramLanguage(settings.sttLanguage) || toDeepgramLanguage(langs[0]);
      }

      authenticated = true;
      clearTimeout(authTimer);
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
      send({
        type: 'ready',
        sttEndpointing: useDeepgram,
        endpointCommitMs: useDeepgram
          ? maxEndpointCommitMs(Number(process.env.DEEPGRAM_ENDPOINTING_MS) || 600)
          : 0,
      });
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
        // Warm agent/KB/voice/filler caches WHILE the caller is speaking, so a
        // cold cache costs nothing after they stop (the prepMs spikes in
        // latency.log). Fire-and-forget; the turn works identically without it.
        warmVoiceTurn(workspaceId, agentId);
        // B3: reuse the call-long Deepgram session; (re)connect only when there
        // is none or it died. Non-fatal — batch STT covers any failure.
        if (useDeepgram) {
          if (dgSession && !dgSession.isAlive) dgSession = null;
          if (dgSession) {
            // Opens a fresh, empty buffer for this turn AND stamps it with a
            // sequence number, so an in-flight flush from the previous turn
            // (cancel-turn does not await one) can neither leak its words into
            // this turn nor swallow this turn's opening words.
            dgTurnSeq = dgSession.beginTurn();
          } else {
            try {
              dgSession = new DeepgramStreamSession({
                sampleRate,
                language: dgLanguage,
                // How long Deepgram's VAD waits before emitting speech_final.
                // This is now a CANDIDATE signal, confirmed by the session's
                // grace window rather than trusted outright, so it no longer
                // has to be conservative on its own — see the end-of-turn note
                // in deepgramStream.service.js. Commit lands at
                // endpointing + grace (600 + 400 = ~1000ms of real silence),
                // which is a natural turn boundary rather than a mid-sentence
                // breath, while still beating the client's RMS backstop.
                endpointingMs: Number(process.env.DEEPGRAM_ENDPOINTING_MS) || 600,
                // Semantic turn end: fires only once the caller is genuinely
                // finished (confirmed speech_final, or an authoritative
                // UtteranceEnd). Nudges the client to end the turn ahead of its
                // RMS VAD. Only while capturing — never during the agent's reply.
                onEndOfTurn: (reason) => {
                  if (!capturing || turnActive) return;
                  logger.info(`Modular web call: end of turn (${reason})`);
                  send({ type: 'endpoint' });
                },
              });
              dgSession.connect();
              dgTurnSeq = dgSession.beginTurn();
            } catch (err) {
              logger.warn(`Deepgram session start failed, using batch STT: ${err.message}`);
              dgSession = null;
            }
          }
        }
        break;
      }
      case 'end-turn':
        capturing = false;
        await runTurn(msg.history);
        break;
      case 'cancel-turn':
        frames = [];
        capturing = false;
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

  ws.on('close', cleanup);
  ws.on('error', (err) => {
    logger.warn(`Modular web call socket error: ${err.message}`);
    cleanup();
  });
}
