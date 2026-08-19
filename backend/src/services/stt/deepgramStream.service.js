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

/**
 * Words a turn does not end on.
 *
 * Silence duration alone cannot tell "I'm finished" from "I'm thinking", and no
 * choice of timeout fixes that: people pause longest exactly where they are
 * least finished — hunting for a word, mid-list, before a name or a number.
 * But what they SAID at the moment they paused is a strong signal, and it costs
 * nothing to read. "And general inquiry. Like, which…" is not a turn anyone
 * would take the floor after; a human listener waits, because "which" demands a
 * continuation.
 *
 * Conjunctions, articles, prepositions, determiners, question words, bare
 * copulas and hesitations — all of them dangle. Content words do not: "book an
 * appointment" is a complete thought even without punctuation.
 *
 * Deliberately a SMALL, high-precision list. A false "still talking" costs a few
 * hundred ms of extra wait; a false "finished" cuts the caller off mid-sentence,
 * which is the bug being fixed. When unsure, this list stays out of it.
 */
const DANGLING_WORDS = new Set([
  // conjunctions / subordinators
  'and', 'or', 'but', 'so', 'because', 'if', 'when', 'while', 'that', 'than', 'then',
  // question words — almost never terminal in a statement
  'which', 'what', 'who', 'whom', 'whose', 'where', 'how', 'why',
  // articles / determiners / possessives
  'the', 'a', 'an', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'this', 'these', 'those',
  // prepositions
  'to', 'of', 'for', 'in', 'on', 'at', 'with', 'from', 'about', 'into', 'over', 'under', 'like',
  // bare copulas / auxiliaries left hanging
  'is', 'are', 'was', 'were', 'am', 'be', 'been', 'do', 'does', 'did', 'can', 'could',
  'will', 'would', 'should', 'have', 'has', 'had',
  // hesitations
  'um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'mm',
  // Hindi / Hinglish — conjunctions, postpositions and possessives dangle for
  // the same reasons as their English counterparts.
  //
  // NOTE the copulas (है / हैं / था / थे / हूँ) are deliberately ABSENT, unlike
  // the English "is/are/was". Hindi is verb-final, so the copula is exactly
  // where a sentence is SUPPOSED to end — "मुझे अपॉइंटमेंट बुक करनी है" is a
  // complete thought. Listing them here (as an earlier version did) would make
  // every properly-finished Hindi turn wait out the long grace window, i.e.
  // add a second of dead air to every reply in the language this product is
  // mostly used in.
  'और', 'या', 'लेकिन', 'क्योंकि', 'अगर', 'जब', 'कि', 'जो', 'तो',
  'का', 'की', 'के', 'में', 'से', 'को', 'पर', 'ने',
  'मेरा', 'मेरी', 'आपका', 'आपकी', 'कौन', 'कैसे', 'कहाँ', 'क्यों',
  // Oblique/dative pronouns — Hindi puts these BEFORE the thing being asked
  // for ("मुझे अपॉइंटमेंट चाहिए"), so a turn ending on one is always a fragment.
  'मुझे', 'मुझको', 'हमें', 'आपको', 'तुम्हें', 'उसे', 'उन्हें', 'इसे',
  'मैं', 'हम', 'यह', 'वह', 'ये', 'वो', 'इस', 'उस', 'किस', 'कुछ', 'कोई',
  'अं', 'अंम', 'हम्म',
]);

/**
 * One-word utterances that ARE a complete turn.
 *
 * Needed because of the rule below: a single word is otherwise treated as a
 * fragment, and these are the cases where that would be wrong. Answers,
 * acknowledgements and requests-to-repeat are genuinely whole turns, and making
 * a caller who says "हाँ" wait out the long window would be its own bug.
 *
 * "what"/"क्या" appear here rather than in the dangling list on purpose: alone
 * they mean "pardon?" and are complete, while mid-sentence ("...tell me what")
 * they dangle — and the dangling check only runs on multi-word turns.
 */
const COMPLETE_ONE_WORD = new Set([
  'yes', 'yeah', 'yep', 'yup', 'no', 'nope', 'okay', 'ok', 'sure', 'right',
  'correct', 'exactly', 'thanks', 'thank', 'hello', 'hi', 'bye', 'goodbye',
  'maybe', 'please', 'done', 'stop', 'wait', 'repeat', 'pardon', 'sorry', 'what',
  'हाँ', 'हां', 'जी', 'नहीं', 'ना', 'ठीक', 'अच्छा', 'सही', 'बस',
  'धन्यवाद', 'शुक्रिया', 'नमस्ते', 'क्या', 'रुकिए', 'माफ',
]);

/**
 * Does this transcript look like the caller was cut off mid-thought?
 *
 * Exported for testing — the whole value of this heuristic is that it is
 * inspectable and adjustable without a live call.
 *
 * @param {string} text - the turn's transcript so far
 * @returns {boolean}
 */
export function looksUnfinished(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return false;
  // Terminal punctuation is Deepgram's own judgement that a sentence closed.
  // Trust it — but only when the last word is not itself a dangler, because
  // smart_format happily punctuates "Like, which." as you can see in the logs.
  const tokens = raw.toLowerCase().replace(/[.,!?;:।॥…"')\]]+$/g, '')
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}\p{M}']/gu, ''))
    .filter(Boolean);
  if (!tokens.length) return false;
  const last = tokens[tokens.length - 1];

  // SHORT-TURN RULE. An enumerated word list will always have holes — "मुझे"
  // was one, and shipping a longer list just moves the hole somewhere else. A
  // turn that is a SINGLE word is a fragment unless it is one of the handful of
  // words that stand alone ("yes", "हाँ", "okay"). That generalizes: it catches
  // every one-word opening of a sentence the caller was still building,
  // including the ones nobody thought to list.
  //
  // The asymmetry justifies it. A wrong "unfinished" costs the caller an extra
  // ~700ms of patience on a rare one-word content turn; a wrong "finished"
  // means the agent talks over them, which is the bug this exists to stop.
  if (tokens.length === 1) return !COMPLETE_ONE_WORD.has(last);

  return DANGLING_WORDS.has(last);
}

/**
 * Deepgram's VAD silence timeout, in ms — the ONE place the default lives.
 *
 * It had been copy-pasted into four call sites that had already drifted apart
 * (600ms in the web handler and in maxEndpointCommitMs, 500ms in the phone
 * bridge), so the same agent committed end-of-turn at a different moment
 * depending on which transport the caller reached it through, and the client's
 * RMS backstop was derived from a number the phone path did not actually use.
 *
 * The default is deliberately short. It is not the whole wait: committing is
 * gated behind a grace window that ANY further speech cancels (see
 * endpointGraceMs / unfinishedGraceMs below), so this value sets how fast a
 * finished sentence turns around, not how easily a pausing caller gets cut off.
 */
export function defaultEndpointingMs() {
  return Number(process.env.DEEPGRAM_ENDPOINTING_MS) || 300;
}

/**
 * Worst-case real silence before this session commits an end of turn:
 * Deepgram's VAD timeout plus the longest grace window (the mid-thought one).
 *
 * PUBLISHED TO THE CLIENT so its RMS-VAD backstop can sit clear of it. These
 * two timeouts race on every turn, and whichever is shorter decides — so when
 * they are maintained as independent constants in two files, raising the server
 * grace silently does nothing because the client keeps firing first. That is
 * not hypothetical: extending the grace for mid-thought pauses had exactly zero
 * effect until this was wired up, because the backstop sat 100ms below the new
 * commit point. Deriving one from the other is what stops it recurring.
 *
 * @param {number} [endpointingMs]
 * @returns {number}
 */
export function maxEndpointCommitMs(endpointingMs) {
  const endpointing = Number.isFinite(endpointingMs) && endpointingMs > 0
    ? endpointingMs
    : defaultEndpointingMs();
  const unfinishedGrace = Number(process.env.DEEPGRAM_UNFINISHED_GRACE_MS) || 1100;
  return endpointing + unfinishedGrace;
}

/**
 * Which Deepgram model this session should open with.
 *
 * Exported and pure so the choice is testable without a socket — it is decided
 * from two fields that are set at construction and never change, and getting it
 * wrong fails SILENTLY (a wrong model still completes the handshake and still
 * returns transcripts, just worse ones).
 *
 * Code-switching (`language=multi`) is a nova-3 capability. nova-2 still
 * ACCEPTS the parameter at handshake — it just doesn't code-switch — so a
 * wrong model here fails silently rather than loudly. Pick the model from
 * the language instead of trusting DEEPGRAM_MODEL blindly.
 *
 * ── And from the ENCODING, for the same class of reason ─────────────────
 *
 * `mulaw` is only ever set by a carrier bridge, so it is an exact statement
 * that this session is listening to an 8kHz G.711 phone line rather than a
 * browser's 24kHz linear16. Deepgram ships a model trained on exactly that
 * — narrowband, codec-damaged, one side of a call — and handing that audio
 * to the wideband general model instead is a silent accuracy loss, not an
 * error.
 *
 * IT IS A LATENCY BUG, NOT A QUALITY ONE, WHICH IS WHY IT IS FIXED HERE.
 * A weaker transcript ends on a dangling token far more often, and
 * looksUnfinished() answers a dangling tail by waiting out
 * `unfinishedGraceMs` (1100ms) instead of `endpointGraceMs` (400ms). The
 * comment on that heuristic prices it: "a wrong 'unfinished' costs the
 * caller an extra ~700ms". Paid on the phone, per turn, on transcripts that
 * only dangled because the model could not hear the last word — which is
 * most of why the same agent turns around slower on a call than in a
 * browser.
 *
 * Overridable, and NOT applied to `multi`: the code-switching model has no
 * phonecall variant, and asking for one would fail the handshake.
 *
 * @param {string} [language] - the Deepgram language code, or 'multi'
 * @param {string} [encoding] - the wire format the audio arrives in
 * @returns {string}
 */
export function resolveDeepgramModel(language, encoding) {
  if (language === 'multi') return process.env.DEEPGRAM_MODEL_MULTI || 'nova-3';
  if (encoding === 'mulaw') return process.env.DEEPGRAM_MODEL_PHONE || 'nova-2-phonecall';
  return process.env.DEEPGRAM_MODEL || 'nova-2';
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
    encoding = 'linear16',
  } = {}) {
    this.sampleRate = sampleRate;
    this.language = language;
    // Wire format of the audio being fed in. 'linear16' is the browser path
    // (PCM16 at the AudioContext's rate). 'mulaw' is the telephony path: a
    // carrier's media stream is 8kHz G.711, and Deepgram decodes it natively,
    // so the phone bridge hands frames straight over without transcoding — the
    // same zero-conversion principle the bundled engines get from g711_ulaw.
    this.encoding = encoding;
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
    // Grace applied instead when the transcript ends mid-thought (see
    // looksUnfinished). Longer on purpose: the caller is hunting for a word, and
    // the cost of guessing wrong here is the agent talking over them. It is only
    // ever paid on turns that genuinely dangle, so ordinary turns keep the fast
    // path and the average is unchanged.
    this.unfinishedGraceMs = Number(process.env.DEEPGRAM_UNFINISHED_GRACE_MS) || 1100;
    this._endpointTimer = null;
    // Most recent transcript text seen this turn (interim OR final). Interims
    // are what make this work — the tail is known before Deepgram commits it.
    this._tail = '';
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

    const model = resolveDeepgramModel(this.language, this.encoding);

    const params = new URLSearchParams({
      model,
      encoding: this.encoding,
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
      // A speech_final candidate armed just before the socket died must not
      // survive it. Callers that reconnect on death (the phone bridge) create a
      // FRESH session while this one is still in scope via closures — an
      // un-cleared timer would fire onEndOfTurn() later against whatever `dg` the
      // caller has by then, ending a turn nobody asked to end.
      if (this._endpointTimer) { clearTimeout(this._endpointTimer); this._endpointTimer = null; }
      this._notifyFinalize();
      this._stopKeepAlive();
    });
    this.ws.on('error', (err) => {
      logger.warn(`Deepgram STT stream error: ${err.message}`);
      this.dead = true;
      if (this._endpointTimer) { clearTimeout(this._endpointTimer); this._endpointTimer = null; }
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
    // Authoritative about SILENCE — it has waited out a full word-timed gap —
    // but silence is not the same as being finished. When the transcript ends
    // mid-thought it still only arms a candidate, so a caller who paused to
    // hunt for a word gets the rest of their sentence. Bounded either way: the
    // candidate commits when its window expires.
    if (msg?.type === 'UtteranceEnd') {
      if (looksUnfinished(this._tail)) this._armEndOfTurnCandidate('utterance_end');
      else this._commitEndOfTurn('utterance_end');
      return;
    }

    const alt = msg?.channel?.alternatives?.[0];
    if (alt?.transcript) this._tail = alt.transcript;

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
  _armEndOfTurnCandidate(reason = 'speech_final') {
    if (this._endpointTimer) clearTimeout(this._endpointTimer);
    // Content-aware window. A turn ending on "and", "which" or "um" is not a
    // turn — it is a caller mid-sentence — so it gets the long window; anything
    // that reads as a finished thought keeps the fast one.
    const unfinished = looksUnfinished(this._tail);
    const graceMs = unfinished ? this.unfinishedGraceMs : this.endpointGraceMs;
    if (graceMs <= 0) { this._commitEndOfTurn(reason); return; }
    this._endpointTimer = setTimeout(() => {
      this._endpointTimer = null;
      this._commitEndOfTurn(unfinished ? `${reason}:unfinished` : reason);
    }, graceMs);
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
    this._tail = ''; // the previous turn's last words must not judge this one
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
