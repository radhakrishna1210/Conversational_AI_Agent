// backend/src/services/voice/holdPause.js
/**
 * A timed hold INSIDE one spoken reply: "Ek minute, main manager se check karke
 * batati hoon, line par rahiye." … five seconds of silence … "Ji, manager se baat
 * ho gayi — aapke liye Deluxe Rs 1,800."
 *
 * WHY IT NEEDS ITS OWN MECHANISM. Neither existing tool can produce it. SSML
 * breaks are clamped to 400ms (disfluency.js — a long break reads as a dropped
 * line) and only ElevenLabs parses them at all. And a reply cannot be split
 * across two turns: once the agent stops, the next thing it says needs the
 * caller to speak first, and a caller who waits politely gets the no-input
 * prompt ("sorry, I couldn't hear you") instead of the manager's answer.
 *
 * So the model writes a marker between the two sentences, exactly the way the
 * handover protocol works (see transferIntent.js for why a marker token beats a
 * tool call on this pipeline). voiceTurnStream speaks what came before it,
 * emits `{ type: 'pause', ms }` in order, and speaks what came after; each
 * transport turns the pause into silence it plays like any other audio.
 *
 * POLICY, decided here once so every generation path agrees:
 *  - at most ONE hold per reply; extra markers are stripped and ignored;
 *  - a marker with no spoken text before it is ignored — silence nobody
 *    announced is a dead line, not a hold;
 *  - a marker with nothing after it is dropped by the consumer (the pause is
 *    only emitted in front of text that follows it) — there is nothing to wait
 *    FOR, and the no-input prompt already covers a quiet line;
 *  - the marker is NEVER spoken and never reaches a transcript, whether or not
 *    the agent has the feature switched on.
 */

export const HOLD_MARKER = '[[HOLD]]';
export const MIN_HOLD_SEC = 1;
export const MAX_HOLD_SEC = 10;

// One or two brackets: models told to write [[HOLD]] sometimes simplify it to
// [HOLD], and a tolerated variant is cheaper than the word "hold" spoken aloud.
const MARKER_RE = /\[{1,2}\s*HOLD\s*\]{1,2}/i;
const MARKER_RE_G = /\s*\[{1,2}\s*HOLD\s*\]{1,2}\s*/gi;
// The tail of a chunk that could still grow into a marker ("…rahiye. [[HO").
// Held back until the next delta decides it, so a marker split across LLM
// tokens is never half-spoken.
const PARTIAL_TAIL_RE = /\[(?:\[?\s*(?:H(?:O(?:L(?:D\s*\]?)?)?)?)?)?$/i;

/**
 * The agent's hold length in seconds, or null when the feature is off.
 * Absent, 0, and anything outside 1-10 or not a whole number are all "off" —
 * the validator refuses bad input on save, so reaching here with one means a
 * row older than the validator, and silence is the safe reading of it.
 */
export function holdPauseSecFor(settings) {
  const raw = settings?.holdPauseSec;
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= MIN_HOLD_SEC && n <= MAX_HOLD_SEC ? n : null;
}

/** Remove every marker from a finished string (transcripts, chat replies, history). */
export function stripHoldMarkers(text) {
  const s = String(text ?? '');
  if (!MARKER_RE.test(s) && !/\[\[\s*H(?:O(?:L(?:D)?)?)?\s*\]?$/i.test(s)) return s;
  return s
    .replace(MARKER_RE_G, ' ')
    // A reply cut off mid-marker (a stalled stream) must not leave "[[HO".
    .replace(/\s*\[\[\s*H(?:O(?:L(?:D)?)?)?\s*\]?$/i, '')
    .trim();
}

/**
 * Streaming scanner for ONE reply. push(delta) → { before, hold, after }: the
 * text safe to speak before a hold, whether a hold sits here, and the text after
 * it. `hold` is true at most once per reply. flush() → text still held back.
 *
 * @param {{ enabled?: boolean }} [opts] enabled=false strips markers and never
 *   reports a hold — the agent has no hold length configured.
 */
export function createHoldMarkerScanner({ enabled = true } = {}) {
  let buf = '';
  let spokeBefore = false;   // non-blank text has been released ahead of any hold
  let held = false;          // the reply's one hold has been reported

  return {
    push(delta) {
      const out = { before: '', hold: false, after: '' };
      if (!delta) return out;
      buf += delta;
      const append = (text) => {
        if (!text) return;
        if (out.hold) out.after += text;
        else {
          out.before += text;
          if (text.trim()) spokeBefore = true;
        }
      };
      let m;
      while ((m = MARKER_RE.exec(buf)) !== null) {
        // "[[HOLD]" at the very end is the one-bracket variant only by accident —
        // its second "]" is most likely the next token. Wait for it, or that
        // bracket would be left behind in the spoken text.
        if (m.index + m[0].length === buf.length && m[0].startsWith('[[') && !m[0].endsWith(']]')) break;
        append(buf.slice(0, m.index));
        buf = buf.slice(m.index + m[0].length);
        if (enabled && !held && spokeBefore) {
          held = true;
          out.hold = true;
        } else {
          // Stripped, not honoured. A space keeps "rahiye.[[HOLD]]Ji" from
          // gluing two words together; the reply filter tidies doubles.
          append(' ');
        }
      }
      const partial = PARTIAL_TAIL_RE.exec(buf);
      const cut = partial ? partial.index : buf.length;
      append(buf.slice(0, cut));
      buf = buf.slice(cut);
      return out;
    },

    /** End of stream. A marker that never completed is dropped; a lone "[" is text. */
    flush() {
      const rest = buf;
      buf = '';
      return /^\[\[/.test(rest) || /^\[\s*H/i.test(rest) ? '' : rest;
    },
  };
}

/**
 * One-shot form for a finished reply (the buffered fallback): the text before
 * the reply's hold, and after it. `hold` is false when there is no honoured hold,
 * in which case `before` is the whole reply with any markers removed.
 */
export function splitAtHold(text, { enabled = true } = {}) {
  const scanner = createHoldMarkerScanner({ enabled });
  const r = scanner.push(String(text ?? ''));
  const tail = scanner.flush();
  if (r.hold) r.after += tail; else r.before += tail;
  return r;
}

/**
 * The prompt line that teaches the protocol. Only for the modular engine in
 * voice mode — a bundled engine or a text chat would print the token.
 */
export function holdPromptRule(sec) {
  return `- Timed hold: ONLY where your instructions tell you to put the caller on hold or pause (for example while you "check with the manager"), you may write the exact token ${HOLD_MARKER} between two sentences of the SAME reply — first one short sentence asking them to stay on the line, then ${HOLD_MARKER}, then one short sentence with what you found out. The caller hears about ${sec} seconds of silence where the token is. The token is a machine signal: never spoken or explained, at most once per reply, never at the start or end of a reply, and never used when your instructions do not ask for a pause.`;
}
