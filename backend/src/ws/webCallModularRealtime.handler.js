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
import { voiceTurnStream } from '../services/agentRuntime.service.js';
import { DeepgramStreamSession, isDeepgramConfigured, toDeepgramLanguage } from '../services/stt/deepgramStream.service.js';

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
  let dgSession = null;   // B3 Deepgram streaming STT session for the current turn
  let dgLanguage;         // Deepgram language code derived from the agent (B3 Hindi fix)
  const useDeepgram = isDeepgramConfigured();

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

    // B3: finalize the streaming transcript (if any) before we discard the DG
    // session. Empty → voiceTurnStream falls back to batch STT on the WAV.
    let streamedText = '';
    if (dgSession) {
      try { streamedText = await dgSession.finish(); } catch { /* fall back to batch */ }
      dgSession = null;
    }

    if (!pcm.length && !streamedText) { send({ type: 'done', timings: null }); return; }

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
    if (dgSession) { dgSession.finish().catch(() => {}); dgSession = null; }
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
      send({ type: 'ready' });
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
      case 'start-turn':
        if (Number.isFinite(msg.sampleRate) && msg.sampleRate > 0) sampleRate = msg.sampleRate;
        frames = [];
        capturing = true;
        // B3: open a fresh Deepgram streaming session for this turn (gated on
        // DEEPGRAM_API_KEY). Non-fatal — batch STT covers any failure.
        if (useDeepgram) {
          try {
            dgSession = new DeepgramStreamSession({ sampleRate, language: dgLanguage });
            dgSession.connect();
          } catch (err) {
            logger.warn(`Deepgram session start failed, using batch STT: ${err.message}`);
            dgSession = null;
          }
        }
        break;
      case 'end-turn':
        capturing = false;
        await runTurn(msg.history);
        break;
      case 'cancel-turn':
        frames = [];
        capturing = false;
        if (dgSession) { dgSession.finish().catch(() => {}); dgSession = null; }
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
