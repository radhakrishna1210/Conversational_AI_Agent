// backend/src/services/voice/speculativeTurn.js
/**
 * Speculative execution on interim transcripts.
 *
 * THE SERIALISATION THIS REMOVES. Deepgram transcribes WHILE the caller speaks,
 * but until this module existed nothing was done with those words until the
 * turn had committed — endpointing silence, then a confirmation grace window,
 * then harvest, then the first LLM request. Measured on this deployment the
 * silence-to-commit alone is ~700ms at p50 and the model's first token another
 * ~900ms, in series. Both are dead air.
 *
 * The idea (the owner's): start the LLM request on the transcript-so-far, in
 * parallel with continued listening, and keep the result ONLY if the transcript
 * the turn finally commits with is the one the request was made for. A
 * superseded request is cancelled all the way to the provider socket; a
 * matching one hands its already-received tokens to the turn, which then starts
 * TTS immediately instead of waiting for a first token.
 *
 * THREE RULES THIS MODULE ENFORCES, BECAUSE A WRONG REPLY SPOKEN EARLY IS FAR
 * WORSE THAN A SLOW CORRECT ONE:
 *
 *   1. Nothing speculative ever reaches the caller. Tokens are buffered here and
 *      only released to voiceTurnStream — which is what emits audio — via
 *      take(), which is called after the turn has committed.
 *   2. A speculation is used only when its text MATCHES the committed
 *      transcript (normalised: case, whitespace, punctuation). Anything else is
 *      discarded and the ordinary path runs, which makes the fallback exactly
 *      as reliable as the code that existed before this module.
 *   3. Every discarded request is aborted and counted. Speculation multiplies
 *      LLM calls; the latency record carries how many were started, how many
 *      were wasted, and roughly how many tokens they cost, so the trade can be
 *      read off the log rather than guessed.
 *
 * MODES — the per-agent aggressiveness setting (`settings.speculation`):
 *
 *   'off'        never speculate (today's behaviour, byte for byte).
 *   'candidate'  speculate once, when Deepgram reports speech_final — i.e. at
 *                the START of the grace window. The window (250-700ms by
 *                profile) then overlaps the model's first token instead of
 *                preceding it. Hit rate is very high: the grace window is only
 *                ever extended when the caller resumes, which the log shows is
 *                rare. At most ONE extra request per resumed pause. THE DEFAULT.
 *   'interim'    also speculate on interim transcripts during speech, debounced,
 *                so the model may have FINISHED before the caller stops. Higher
 *                hit rate on latency, more wasted requests: every meaningful
 *                interim delta cancels and restarts. For agents whose owner has
 *                looked at the cost column and decided.
 *
 * The module is transport-agnostic: the web handler and the phone bridge both
 * drive it from the Deepgram session's onTranscript / onEndOfTurnCandidate
 * hooks and call take() from their runTurn.
 */

import logger from '../../lib/logger.js';

export const SPECULATION_MODES = ['off', 'candidate', 'interim'];
export const DEFAULT_SPECULATION_MODE = 'candidate';

/**
 * Resolve an agent's stored setting (or the deployment default) to a mode.
 * `VOICE_SPECULATION` is the operator default for agents that have not chosen;
 * `VOICE_SPECULATION=off` is also the platform-wide kill switch.
 */
export function speculationModeFor(settings = {}) {
  const env = String(process.env.VOICE_SPECULATION || '').toLowerCase();
  if (env === 'off') return 'off';
  const chosen = String(settings?.speculation || '').toLowerCase();
  if (SPECULATION_MODES.includes(chosen)) return chosen;
  if (SPECULATION_MODES.includes(env)) return env;
  return DEFAULT_SPECULATION_MODE;
}

/**
 * Transcript equality for the hit test. Deepgram's final for a stretch of audio
 * usually differs from its last interim only in punctuation and casing
 * ("what are your hours" → "What are your hours?"), and those differences do
 * not change what the model should answer. Whitespace is collapsed for the
 * same reason. Anything beyond that — a different word, an extra word — is a
 * different question and is NOT a match.
 */
export function normalizeForMatch(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Does `candidate` cover the same words as `committed`? */
export function speculationMatches(candidate, committed) {
  const a = normalizeForMatch(candidate);
  const b = normalizeForMatch(committed);
  return Boolean(a) && a === b;
}

/**
 * One in-flight speculative LLM stream: pumps the iterator eagerly into a
 * buffer so tokens accumulate while the transport is still listening, and
 * exposes an async iterator that replays the buffer and then continues live.
 */
class Speculation {
  constructor({ text, start, trigger }) {
    this.text = text;
    this.trigger = trigger;            // 'candidate' | 'interim' — for the log
    this.startedAt = performance.now();
    this.firstTokenAt = null;
    this.doneAt = null;
    this.buffered = [];                // deltas received so far
    this.chars = 0;
    this.error = null;
    this.returnValue = undefined;      // converseStream's { provider, model, ragMs }
    this.aborted = false;
    this.controller = new AbortController();
    this._waiters = [];
    this._iterator = null;
    this._pump(start);
  }

  async _pump(start) {
    try {
      this._iterator = start({ signal: this.controller.signal });
      for (;;) {
        const r = await this._iterator.next();
        if (this.aborted) break;
        if (r.done) { this.returnValue = r.value; break; }
        if (this.firstTokenAt == null) this.firstTokenAt = performance.now();
        this.buffered.push(r.value);
        this.chars += String(r.value).length;
        this._wake();
      }
    } catch (err) {
      if (!this.aborted) this.error = err;
    } finally {
      this.doneAt = performance.now();
      this._wake();
    }
  }

  _wake() {
    const w = this._waiters; this._waiters = [];
    for (const r of w) r();
  }

  /** Cancel: abort the provider request and release the generator. */
  abort() {
    if (this.aborted) return;
    this.aborted = true;
    try { this.controller.abort(); } catch { /* noop */ }
    try { this._iterator?.return?.().catch?.(() => {}); } catch { /* noop */ }
    this._wake();
  }

  /**
   * The iterator voiceTurnStream consumes in place of a fresh converseStream():
   * replays what is buffered, then yields live deltas until the stream ends.
   * Its return value is the underlying stream's ({ provider, model, ragMs }).
   */
  iterator() {
    const self = this;
    let i = 0;
    let closed = false; // return() was called: nothing further, buffered or live
    return {
      async next() {
        for (;;) {
          if (closed) return { value: undefined, done: true };
          if (i < self.buffered.length) return { value: self.buffered[i++], done: false };
          if (self.error) throw self.error;
          if (self.doneAt != null || self.aborted) return { value: self.returnValue, done: true };
          await new Promise((resolve) => self._waiters.push(resolve));
        }
      },
      async return() {
        closed = true;
        self.abort();
        return { value: undefined, done: true };
      },
      [Symbol.asyncIterator]() { return this; },
    };
  }
}

/**
 * Create a per-call speculator.
 *
 * @param {object} opts
 * @param {'off'|'candidate'|'interim'} opts.mode
 * @param {(messages: Array<{role:string, content:string}>, o: { signal: AbortSignal }) => AsyncIterator} opts.start
 *   starts one LLM stream for the given messages — the transport binds this to
 *   converseStream(workspaceId, agentId, ...) so this module never touches the
 *   runtime directly.
 * @param {() => Array<{role:string, content:string}>} opts.history  the conversation
 *   as it stands (without the turn being spoken); read at start time.
 * @param {number} [opts.debounceMs]     interim mode: quiet time before a restart
 * @param {number} [opts.minDeltaChars]  interim mode: smallest change worth a restart
 * @param {string} [opts.label]          for logs
 */
export function createSpeculator({
  mode = DEFAULT_SPECULATION_MODE,
  start,
  history = () => [],
  debounceMs = Number(process.env.VOICE_SPECULATION_DEBOUNCE_MS) || 180,
  minDeltaChars = Number(process.env.VOICE_SPECULATION_MIN_DELTA) || 4,
  label = 'speculation',
} = {}) {
  if (typeof start !== 'function') throw new Error('createSpeculator needs start()');
  const enabled = mode !== 'off';
  let current = null;         // the live Speculation, if any
  let debounceTimer = null;
  let pendingText = null;     // interim text waiting for the debounce
  let turnOpen = false;
  // Per-call totals for the latency record and the cost column.
  const stats = { started: 0, wasted: 0, wastedChars: 0, hits: 0, misses: 0, none: 0 };
  // Per-turn snapshot (reset by beginTurn).
  let turnStats = { started: 0, wasted: 0, wastedChars: 0 };

  const clearDebounce = () => {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    pendingText = null;
  };

  const discard = (spec, why) => {
    if (!spec) return;
    spec.abort();
    stats.wasted += 1; turnStats.wasted += 1;
    stats.wastedChars += spec.chars; turnStats.wastedChars += spec.chars;
    logger.debug?.(`${label}: discarded ${spec.trigger} speculation (${why}, ${spec.chars} chars)`);
  };

  const launch = (text, trigger) => {
    const clean = String(text || '').trim();
    if (!clean) return;
    if (current && !current.aborted) {
      if (speculationMatches(current.text, clean)) return; // same words: keep it
      discard(current, 'superseded');
    }
    const msgs = [...history(), { role: 'user', content: clean }];
    current = new Speculation({ text: clean, trigger, start: (o) => start(msgs, o) });
    stats.started += 1; turnStats.started += 1;
  };

  return {
    mode,
    /** A listening segment opened; nothing from a previous turn may survive. */
    beginTurn() {
      turnOpen = true;
      clearDebounce();
      if (current) { discard(current, 'new turn'); current = null; }
      turnStats = { started: 0, wasted: 0, wastedChars: 0 };
    },
    /** Deepgram's onTranscript: the turn's words so far changed. */
    onTranscript(text, { isFinal = false } = {}) {
      if (!enabled || mode !== 'interim' || !turnOpen) return;
      const clean = String(text || '').trim();
      if (!clean) return;
      // A final is a firm statement of the words; an interim is a guess that
      // the next frame may revise. Finals launch at once, interims after a
      // quiet debounce so a word-by-word interim stream does not start one
      // request per word.
      if (current && !current.aborted && normalizeForMatch(current.text) === normalizeForMatch(clean)) {
        clearDebounce();
        return;
      }
      const delta = Math.abs(clean.length - (pendingText ?? current?.text ?? '').length);
      if (!isFinal && delta < minDeltaChars && current && !current.aborted) return;
      pendingText = clean;
      if (isFinal) {
        clearDebounce();
        launch(clean, 'interim');
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        const t = pendingText; pendingText = null;
        if (t && turnOpen) launch(t, 'interim');
      }, debounceMs);
      debounceTimer.unref?.();
    },
    /** Deepgram's onEndOfTurnCandidate: speech_final, grace window opening. */
    onCandidate(text) {
      if (!enabled || !turnOpen) return;
      clearDebounce();
      launch(text, 'candidate');
    },
    /** The caller resumed inside the grace window. The speculation stays alive:
     *  if they only added punctuation-level noise it may still match, and if
     *  they added words the next candidate/take supersedes it anyway. */
    onCandidateCancelled() { /* deliberate no-op */ },
    /**
     * The turn committed with `finalText`. Returns the matching speculation's
     * handle for voiceTurnStream, or null (after discarding whatever was in
     * flight) when the ordinary path must run.
     *
     * @returns {{ iterator: AsyncIterator, text: string, startedAt: number,
     *   firstTokenAt: number|null, bufferedChars: number, trigger: string,
     *   turn: { started: number, wasted: number, wastedChars: number } } | null}
     */
    take(finalText) {
      turnOpen = false;
      clearDebounce();
      const spec = current; current = null;
      const turn = { ...turnStats };
      if (!enabled || !spec) { stats.none += 1; return { hit: null, turn }; }
      if (spec.aborted || spec.error) { discard(spec, spec.error ? 'errored' : 'aborted'); stats.misses += 1; return { hit: null, turn: { ...turnStats } }; }
      if (!speculationMatches(spec.text, finalText)) {
        discard(spec, `mismatch: "${spec.text}" vs "${finalText}"`);
        stats.misses += 1;
        return { hit: null, turn: { ...turnStats } };
      }
      stats.hits += 1;
      return {
        hit: {
          iterator: spec.iterator(),
          text: spec.text,
          startedAt: spec.startedAt,
          firstTokenAt: spec.firstTokenAt,
          bufferedChars: spec.chars,
          trigger: spec.trigger,
        },
        turn,
      };
    },
    /** Turn cancelled / call over: abort anything in flight. */
    abort() {
      turnOpen = false;
      clearDebounce();
      if (current) { discard(current, 'abandoned'); current = null; }
    },
    /** Per-call totals. */
    stats() { return { ...stats }; },
  };
}
