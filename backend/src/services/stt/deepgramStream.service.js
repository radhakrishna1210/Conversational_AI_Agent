// backend/src/services/stt/deepgramStream.service.js
/**
 * Deepgram streaming speech-to-text (B3). Transcribes the caller's audio AS
 * THEY SPEAK over a WebSocket, so the transcript is ready the instant they stop
 * — removing batch STT (0.7–3.5s in logs/latency.log) from the turn's critical
 * path.
 *
 * Opt-in and fully additive: only used when DEEPGRAM_API_KEY is set. The
 * modular Web Call handler streams the same PCM it already buffers into a
 * session here; if Deepgram yields no transcript (or the key is absent) the
 * handler falls back to the existing batch STT on the buffered WAV. Nothing
 * changes until a key is configured.
 *
 * Protocol: wss://api.deepgram.com/v1/listen with `Authorization: Token <key>`,
 * raw linear16 PCM frames in, JSON results out (channel.alternatives[0].
 * transcript, is_final). One session now serves the WHOLE call: each turn ends
 * with `{ type: 'Finalize' }` (flush → result flagged from_finalize) instead of
 * closing the socket, `{ type: 'KeepAlive' }` pings bridge the silent stretches
 * while the agent speaks, and `{ type: 'CloseStream' }` is only sent at
 * call end. Per-turn TLS reconnects were both slow (~0.3-0.8s setup that a
 * short utterance couldn't hide) and flaky (a failed connect meant an empty
 * transcript → silent fallback to batch STT → +1-2s on the turn).
 */

import WebSocket from 'ws';
import logger from '../../lib/logger.js';

export function isDeepgramConfigured() {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

/**
 * Minimum confidence for a final result to be accepted as something the caller
 * actually said (BUG-001). Deepgram scores every final; results driven by noise
 * rather than speech score low, and accepting them created user turns from
 * words nobody spoke.
 *
 * 0.35 is deliberately permissive. Genuine speech — including accented,
 * code-switched and telephony-bandwidth audio, which is the norm here — scores
 * well above it, while noise-driven guesses sit below. Set high enough to
 * "clean up" transcripts and it starts silently deleting real words from real
 * callers, which is a worse failure than the one being fixed.
 */
const MIN_FINAL_CONFIDENCE = Number(process.env.DEEPGRAM_MIN_CONFIDENCE) || 0.35;

// Map an agent's language (display name like "Hindi" / "English (Indian)", or an
// ISO code) to the Deepgram `language` param. Without this, a Hindi agent's
// audio is transcribed as English → empty/garbage → silent fallback to batch
// STT (which is exactly what the logs showed: sttProvider stayed "sarvam").
const DEEPGRAM_LANG = {
  // "Multi" is the UI's multilingual/code-switching option. Without these entries
  // it fell through to the agent's first language (e.g. Hindi), so a caller
  // speaking English — or Hinglish, which is the norm for this use case — was
  // transcribed by a Hindi-only model and came back garbled or empty.
  multi: 'multi', multilingual: 'multi', auto: 'multi',
  hindi: 'hi', english: 'en', 'english (american)': 'en-US', 'english (british)': 'en-GB',
  'english (indian)': 'en-IN', 'english (australian)': 'en-AU', tamil: 'ta', telugu: 'te',
  spanish: 'es', french: 'fr', german: 'de', portuguese: 'pt', italian: 'it', dutch: 'nl',
  russian: 'ru', japanese: 'ja', korean: 'ko', mandarin: 'zh', chinese: 'zh',
};

export function toDeepgramLanguage(value) {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (/^[a-z]{2}(-[A-Za-z]{2,})?$/.test(raw)) return raw; // already a code like "hi" / "en-IN"
  return DEEPGRAM_LANG[raw.toLowerCase()];
}

export class DeepgramStreamSession {
  /**
   * @param {object} opts
   * @param {number} opts.sampleRate - PCM16 sample rate the browser is sending
   * @param {string} [opts.language] - optional Deepgram language code (e.g. 'en', 'hi')
   * @param {number} [opts.endpointingMs] - silence (ms) after which Deepgram's
   *   VAD sets speech_final. Note this is a VAD timeout, NOT a semantic judgement
   *   that the caller has finished a thought — it cannot tell a mid-sentence
   *   breath from the end of a turn, which is why it only arms a candidate here
   *   rather than ending the turn outright.
   * @param {() => void} [opts.onEndOfTurn] - called when the caller is judged to
   *   have FINISHED their turn, i.e. it is safe to start generating a reply.
   *   Fired either by a confirmed speech_final (see the grace window below) or
   *   immediately by UtteranceEnd. Receives the reason as its argument, for logs.
   * @param {number} [opts.endpointGraceMs] - how long a speech_final candidate
   *   must go unchallenged before it is committed as a real end of turn.
   */
  constructor({
    sampleRate = 24000, language, endpointingMs, onEndOfTurn, endpointGraceMs,
  } = {}) {
    this.sampleRate = sampleRate;
    this.language = language;
    this.endpointingMs = endpointingMs;
    this.onEndOfTurn = typeof onEndOfTurn === 'function' ? onEndOfTurn : null;

    // ── End-of-turn confirmation (premature-cutoff fix) ─────────────────────
    // Deepgram emits TWO end-of-speech signals and they are not equivalent:
    //
    //   speech_final  fires after `endpointing` ms of VAD-detected silence.
    //                 FAST but wrong a lot of the time — at 500ms it lands
    //                 squarely inside an ordinary mid-sentence pause (people
    //                 pause 400-700ms before a name, a number, or mid-list).
    //   UtteranceEnd  fires after `utterance_end_ms` of WORD-TIMING silence.
    //                 Slower (>=1000ms) but authoritative.
    //
    // Both used to be wired to the same callback. Since speech_final always
    // fires first, it always won, and UtteranceEnd — the signal specifically
    // documented here as "what lets the caller pause mid-sentence without the
    // turn being cut" — was dead code. Every turn was ended by the 500ms VAD
    // signal, so the agent started replying while the caller was mid-sentence.
    //
    // The fix keeps speech_final's speed without trusting it blindly: it arms a
    // CANDIDATE end of turn, and any further speech within the grace window
    // cancels it. Committing at endpointing + grace still beats waiting for
    // UtteranceEnd, so the common case gets no slower.
    this.endpointGraceMs = Number.isFinite(endpointGraceMs)
      ? endpointGraceMs
      : (Number(process.env.DEEPGRAM_ENDPOINT_GRACE_MS) || 400);
    this._endpointTimer = null;
    this.ws = null;
    this.finals = [];
    this._open = false;
    this._pending = [];
    this.dead = false;          // socket errored/closed — caller should recreate
    this._finalizeWaiters = []; // resolvers waiting on a { from_finalize } result
    this._lastAudioAt = 0;
    this._keepAliveTimer = null;

    // ── Turn attribution (BUG-001) ──────────────────────────────────────────
    // Monotonic turn counter. finalizeTurn() is bound to the turn it was issued
    // for, so a flush that resolves late — after the next turn has already
    // started — cannot harvest, and therefore cannot discard, the NEW turn's
    // words.
    this._turnSeq = 0;
    // While a flush is in flight, results still arriving belong to the turn
    // being flushed, not the one now accumulating. They are appended here
    // instead of to `finals`, which keeps the two turns' words separate.
    this._flushTarget = null;
  }

  /**
   * Socket actually OPEN right now (handshake done, not dead) — i.e. Deepgram
   * really was listening to this turn's audio. `isAlive` is true even while the
   * TLS handshake is still in flight, so it can't answer "did anyone hear
   * that?"; callers use this one to distinguish "the caller said nothing" from
   * "the stream wasn't up yet".
   */
  get isConnected() {
    return this._open && !this.dead && this.ws?.readyState === WebSocket.OPEN;
  }

  /** Still connected and usable for another turn? */
  get isAlive() {
    return !this.dead && this.ws && this.ws.readyState !== WebSocket.CLOSED
      && this.ws.readyState !== WebSocket.CLOSING;
  }

  connect() {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error('DEEPGRAM_API_KEY not set');

    // Code-switching (`language=multi`) is a nova-3 capability. nova-2 still
    // ACCEPTS the parameter at handshake — it just doesn't code-switch — so a
    // wrong model here fails silently rather than loudly. Pick the model from
    // the language instead of trusting DEEPGRAM_MODEL blindly.
    const model = this.language === 'multi'
      ? (process.env.DEEPGRAM_MODEL_MULTI || 'nova-3')
      : (process.env.DEEPGRAM_MODEL || 'nova-2');

    const params = new URLSearchParams({
      model,
      encoding: 'linear16',
      sample_rate: String(this.sampleRate),
      channels: '1',
      punctuate: 'true',
      smart_format: 'true',
      // MUST be true: Deepgram only emits speech_final / UtteranceEnd as part of
      // interim-results processing. With it off, the semantic endpointing below
      // never fired and onSpeechFinal was dead code — turns were ended solely by
      // the client's RMS VAD, which cuts off mid-sentence on a natural pause.
      // Interims are ignored when harvesting (the is_final gate in onmessage).
      interim_results: 'true',
    });
    if (this.language) params.set('language', this.language);
    // Endpointing = Deepgram's semantic end-of-speech detector (silence ms before
    // it marks the utterance final). Enables the speech_final signal below.
    if (Number.isFinite(this.endpointingMs) && this.endpointingMs > 0) {
      params.set('endpointing', String(this.endpointingMs));
    }
    // UtteranceEnd is the word-timing-based end-of-turn signal. It is far more
    // reliable than speech_final on noisy input (where VAD-based endpointing can
    // miss the final word), and it is what lets the caller pause mid-sentence
    // without the turn being cut. Deepgram requires >= 1000ms.
    const utteranceEndMs = Number(process.env.DEEPGRAM_UTTERANCE_END_MS) || 1000;
    if (utteranceEndMs >= 1000) params.set('utterance_end_ms', String(utteranceEndMs));

    this.ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
      headers: { Authorization: `Token ${key}` },
    });

    this.ws.on('open', () => {
      this._open = true;
      for (const buf of this._pending) {
        try { this.ws.send(buf); } catch { /* dropped */ }
      }
      this._pending = [];
      // Deepgram closes idle streams after ~10s of no audio (NET-0001). The
      // session now lives for the WHOLE call — including the silent stretches
      // while the agent is speaking — so ping KeepAlive whenever no audio has
      // flowed recently.
      this._keepAliveTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN && Date.now() - this._lastAudioAt > 4000) {
          try { this.ws.send(JSON.stringify({ type: 'KeepAlive' })); } catch { /* noop */ }
        }
      }, 4000);
    });

    this.ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      this._handleMessage(msg);
    });
    this.ws.on('close', (code, reason) => {
      // 1000/1001 are normal teardown; anything else killed the stream mid-call
      // and every subsequent turn would silently degrade to batch STT.
      if (code && code !== 1000 && code !== 1001) {
        logger.warn(`Deepgram STT closed unexpectedly (${code}): ${reason?.toString?.() || 'no reason given'}`);
      }
      this.dead = true;
      this._notifyFinalize();
      this._stopKeepAlive();
    });
    this.ws.on('error', (err) => {
      logger.warn(`Deepgram STT stream error: ${err.message}`);
      this.dead = true;
      this._notifyFinalize();
      this._stopKeepAlive();
    });
  }

  /**
   * Handle one decoded result frame. Split out of the socket's 'message'
   * listener so turn-attribution behaviour is testable without a live Deepgram
   * connection (see __tests__/deepgramTurns.test.js).
   */
  _handleMessage(msg) {
    // Deepgram reports config/auth problems as an in-band Error frame. Without
    // this the socket just goes quiet and every turn silently falls back to
    // batch STT, which is indistinguishable from "the caller said nothing".
    if (msg?.type === 'Error' || msg?.error) {
      logger.warn(`Deepgram STT error frame: ${msg.description || msg.message || msg.error}`);
      return;
    }
    // UtteranceEnd: word-timing-based end of turn (needs utterance_end_ms).
    // Authoritative — it has already waited out a full word-timed silence, so it
    // commits immediately with no grace window.
    if (msg?.type === 'UtteranceEnd') { this._commitEndOfTurn('utterance_end'); return; }

    const alt = msg?.channel?.alternatives?.[0];

    // ANY further speech — interim or final — means the caller is still talking,
    // so a pending speech_final candidate was a mid-sentence pause, not the end
    // of their turn. Cancel it. This must run BEFORE the speech_final check
    // below, because the message carrying speech_final also carries a
    // transcript and would otherwise cancel the candidate it just armed.
    if (alt?.transcript && this._endpointTimer) {
      clearTimeout(this._endpointTimer);
      this._endpointTimer = null;
    }

    if (alt?.transcript && msg.is_final) {
      // Minimum-confidence gate (BUG-001). Deepgram scores each final; a
      // result driven by noise rather than speech comes back with a low
      // score. Accepting those produced user turns from words the caller
      // never said. `confidence` is absent on some result shapes — treat a
      // missing score as trustworthy rather than inventing a rejection.
      const confidence = typeof alt.confidence === 'number' ? alt.confidence : 1;
      if (confidence < MIN_FINAL_CONFIDENCE) {
        logger.info(
          `Deepgram: dropping low-confidence final (${confidence.toFixed(2)} < ` +
          `${MIN_FINAL_CONFIDENCE}): "${alt.transcript}"`,
        );
      } else if (this._flushTarget) {
        // A flush is in flight: this word was spoken BEFORE the turn boundary,
        // so it belongs to the turn being finalized, not the one now running.
        this._flushTarget.push(alt.transcript);
      } else {
        this.finals.push(alt.transcript);
      }
    }
    // speech_final: VAD says the caller stopped. Treat as a CANDIDATE only —
    // arm the grace window rather than ending the turn here.
    if (msg?.speech_final) this._armEndOfTurnCandidate();
    // from_finalize: the flush we requested in finalizeTurn() has completed —
    // every pending word is now in `finals`, wake the waiter immediately
    // (instead of the old wait-for-socket-close, which cost up to 3s a turn).
    if (msg?.from_finalize) this._notifyFinalize();
  }

  /**
   * A speech_final arrived: the caller MIGHT be done. Start (or restart) the
   * grace window. If they resume speaking before it expires, _handleMessage
   * cancels this and the turn continues — which is the whole point.
   */
  _armEndOfTurnCandidate() {
    if (this._endpointTimer) clearTimeout(this._endpointTimer);
    if (this.endpointGraceMs <= 0) { this._commitEndOfTurn('speech_final'); return; }
    this._endpointTimer = setTimeout(() => {
      this._endpointTimer = null;
      this._commitEndOfTurn('speech_final');
    }, this.endpointGraceMs);
  }

  /** The caller really is done. Fire once; drop any pending candidate. */
  _commitEndOfTurn(reason) {
    if (this._endpointTimer) { clearTimeout(this._endpointTimer); this._endpointTimer = null; }
    this.onEndOfTurn?.(reason);
  }

  _notifyFinalize() {
    const waiters = this._finalizeWaiters;
    this._finalizeWaiters = [];
    for (const w of waiters) w();
  }

  _stopKeepAlive() {
    if (this._keepAliveTimer) { clearInterval(this._keepAliveTimer); this._keepAliveTimer = null; }
  }

  /** Feed one PCM16 frame (queued until the socket is open). */
  send(buf) {
    if (!this.ws || this.dead) return;
    this._lastAudioAt = Date.now();
    if (this._open && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(buf); } catch { /* dropped */ }
    } else {
      this._pending.push(buf);
    }
  }

  /** Return everything transcribed so far and clear it (per-turn harvest). */
  takeTranscript() {
    const text = this.finals.join(' ').trim();
    this.finals = [];
    return text;
  }

  /**
   * Open a new turn. Returns the turn's sequence number, which the caller must
   * pass back to finalizeTurn() so a late flush from a PREVIOUS turn cannot
   * harvest this one's words.
   *
   * Note this does NOT touch `_flushTarget`: if a flush is still in flight it
   * keeps collecting the old turn's trailing words, and the new turn starts
   * from a genuinely empty buffer.
   */
  beginTurn() {
    this._turnSeq += 1;
    this.finals = [];
    // Drop any speech_final candidate left over from the previous turn — it
    // would otherwise commit an end-of-turn against the turn just started,
    // cutting the caller off the instant they began speaking.
    if (this._endpointTimer) { clearTimeout(this._endpointTimer); this._endpointTimer = null; }
    return this._turnSeq;
  }

  /**
   * End ONE TURN without closing the socket: ask Deepgram to flush whatever
   * audio it's still holding ({ type: 'Finalize' } → a final result flagged
   * from_finalize), then hand back the turn's transcript. The session stays
   * open for the next turn — no per-turn TLS reconnect, no close-wait.
   *
   * Usually resolves in ~100-300ms; when endpointing already fired
   * speech_final the transcript is complete before we even ask. Returns ''
   * on any failure so the caller can fall back to batch STT.
   *
   * @param {number} [timeoutMs]
   * @param {number} [seq] - the value beginTurn() returned for the turn being
   *   finalized. When a newer turn has since started this call is a no-op that
   *   returns '' — see the cross-turn bleed note below.
   */
  async finalizeTurn(timeoutMs = 1200, seq = null) {
    // ── Cross-turn bleed guard (BUG-001) ──────────────────────────────────
    // `cancel-turn` fires this WITHOUT awaiting it, and the client starts the
    // next turn immediately. Two things went wrong as a result:
    //   1. the discarded segment's words arrived after the next turn's buffer
    //      had been cleared, so they were attributed to a turn the caller had
    //      not spoken in yet — phantom transcript, exactly the reported symptom;
    //   2. the late flush called takeTranscript() and swallowed the opening
    //      words of the new turn.
    // Binding the flush to its turn fixes (2); routing results through
    // _flushTarget for the duration of the flush fixes (1).
    if (seq != null && seq !== this._turnSeq) return '';

    if (!this.ws || this.dead) return this.takeTranscript();
    // Never connected yet (TLS handshake still in flight)? Nothing is buffered
    // server-side — don't burn the timeout waiting on a socket with no data.
    if (!this._open) return this.takeTranscript();

    // Take this turn's words now, and keep collecting into the same array while
    // the flush is in flight so trailing words land with the right turn.
    const harvested = this.finals;
    this.finals = [];
    this._flushTarget = harvested;

    try {
      this.ws.send(JSON.stringify({ type: 'Finalize' }));
    } catch {
      this._flushTarget = null;
      return harvested.join(' ').trim();
    }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._finalizeWaiters = this._finalizeWaiters.filter((w) => w !== wake);
        resolve();
      }, timeoutMs);
      const wake = () => { clearTimeout(timer); resolve(); };
      this._finalizeWaiters.push(wake);
    });
    // Only stop redirecting if no LATER flush has taken over in the meantime.
    if (this._flushTarget === harvested) this._flushTarget = null;
    return harvested.join(' ').trim();
  }

  /** Tear the session down (call end). Safe to call twice. */
  close() {
    this.dead = true;
    if (this._endpointTimer) { clearTimeout(this._endpointTimer); this._endpointTimer = null; }
    this._stopKeepAlive();
    this._notifyFinalize();
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'CloseStream' }));
    } catch { /* noop */ }
    try { this.ws?.close(); } catch { /* already closed */ }
  }

  /**
   * Back-compat single-shot flow: flush, harvest, close. Resolves as soon as
   * the flush completes rather than waiting for the socket close event.
   */
  async finish(timeoutMs = 1200) {
    const text = await this.finalizeTurn(timeoutMs);
    this.close();
    return text;
  }
}
