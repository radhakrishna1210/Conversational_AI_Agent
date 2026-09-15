// backend/src/services/voice/welcomeBarge.js
/**
 * Keeps a caller's "hello?" from cutting off the welcome message.
 *
 * ── THE FAILURE ─────────────────────────────────────────────────────────────
 *
 * People answer the phone by talking. The agent greets the moment the call
 * connects, the callee says "hello?" at the same moment, and barge-in — tuned
 * for mid-call replies, where 100ms of sound over the agent really is someone
 * cutting in — stopped the welcome on the first syllable. The history still
 * said the whole welcome had been delivered, and the prompt said "do not repeat
 * it", so the model answered "hello" by moving on to the next stage of the
 * flow. The caller never heard who was calling or why.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 * While the welcome is playing, SOUND can only propose a barge; WORDS decide
 * it. The same idea as Vapi's `numWords` and LiveKit's `min_interruption_words`:
 * a pickup phrase ("hello", "haan ji, boliye", "who's this?") is the caller
 * joining the call, not asking the agent to stop, and the welcome is the answer
 * to all of them. Words that are also in the welcome do not count either — on a
 * phone line those are most likely our own voice coming back.
 *
 * Only the DECISION lives here, so it can be tested without a socket. The phone
 * bridge owns the frames, the transcript and the timers.
 * See backend/docs/WELCOME_BARGE_IN.md.
 */

/**
 * What people say when they pick up, or to show they are listening. None of it
 * is a reason to stop the welcome, which already answers every one of them.
 *
 * Keys are normalized exactly like the transcript tokens (lowercase, letters,
 * digits and combining marks only), so "Who's" is `whos` and Devanagari vowel
 * signs survive. Function words ("is", "this", "hai") are here because on their
 * own they never carry an interruption; leaving them out only makes the welcome
 * easier to cut, never harder.
 */
const PICKUP_WORDS = new Set([
  // English
  'hello', 'helo', 'hallo', 'hullo', 'hellow', 'hi', 'hey', 'hiya', 'yes', 'yeah',
  'yep', 'yup', 'ya', 'yah', 'ok', 'okay', 'sure', 'hmm', 'hm', 'mm', 'mmm', 'uh',
  'um', 'ah', 'oh', 'huh', 'who', 'whos', 'is', 'this', 'it', 'speaking', 'there',
  'calling', 'sir', 'madam', 'maam', 'mam',
  // Hindi / Marathi, romanized the way Deepgram writes them
  'haan', 'han', 'ha', 'haa', 'haanji', 'hanji', 'ji', 'jee', 'bolo', 'boliye',
  'bolie', 'bol', 'kaun', 'kon', 'koun', 'hai', 'hain', 'raha', 'rahe', 'rahi',
  'namaste', 'namaskar', 'ho', 'hoy', 'bola', 'bolta', 'boltay', 'ahe', 'aahe', 'aho',
  // Devanagari
  'हेलो', 'हैलो', 'हॅलो', 'हलो', 'हेल्लो', 'हाय', 'हाँ', 'हां', 'हा', 'जी', 'हाँजी',
  'हांजी', 'बोलो', 'बोलिए', 'बोलिये', 'बोल', 'कौन', 'कोन', 'कोण', 'है', 'हैं', 'रहा',
  'रहे', 'रही', 'नमस्ते', 'नमस्कार', 'सर', 'मैडम', 'ओके', 'हम्म', 'हो', 'होय', 'बोला',
  'बोलता', 'आहे', 'अहो',
  // "hello" in the other Indic scripts
  'ஹலோ', 'హలో', 'হ্যালো', 'હેલો', 'ಹಲೋ', 'ഹലോ', 'ਹੈਲੋ',
  // Spanish / French / German — the other languages noInputPrompt speaks
  'hola', 'bueno', 'diga', 'dígame', 'digame', 'sí', 'si', 'allo', 'allô', 'oui',
  'bonjour', 'ja', 'guten', 'tag',
]);

const tokenKey = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, '');

const tokensOf = (text) => String(text ?? '')
  .split(/\s+/)
  .slice(0, 120) // one utterance; a pathological transcript must not stall a frame
  .map(tokenKey)
  .filter(Boolean);

/**
 * Is everything in `text` a pickup phrase or a backchannel? False for empty
 * text: nothing said is not a greeting.
 */
export function isPickupOnly(text) {
  const tokens = tokensOf(text);
  return tokens.length > 0 && tokens.every((t) => PICKUP_WORDS.has(t));
}

/**
 * The words in `heard` that could be the caller interrupting: neither pickup
 * phrases nor words of the welcome itself.
 *
 * Excluding the welcome's vocabulary is deliberately blunt. Echo that the
 * canceller missed comes back as the welcome's own words, often re-segmented or
 * out of order, so the contiguous-run matching stripOverlapEcho() does is not
 * enough here. The price is that a caller who reuses the welcome's words ("not
 * a good time") needs more words to cut it off. They are still heard: the
 * bridge answers them the moment the welcome ends.
 */
export function interruptionWords(heard, welcomeText) {
  const welcome = new Set(tokensOf(welcomeText));
  return tokensOf(heard).filter((t) => !PICKUP_WORDS.has(t) && !welcome.has(t));
}

/**
 * Decides, frame by frame, whether the welcome may be cut off.
 *
 * `shouldCut(energyBarge, heard)` is called for each inbound frame while the
 * welcome is audible:
 *   energyBarge  the ordinary energy detector would cut on this frame
 *   heard        everything the recogniser has transcribed so far
 *
 * An energy barge stays PROPOSED for `holdMs`, because a transcript lands
 * 300-600ms after the words were spoken. By then the caller has often paused,
 * so the energy run is already over.
 *
 * @param {string} welcomeText
 * @param {object} [opts]
 * @param {number} [opts.minWords] interruption words needed to cut
 * @param {number} [opts.holdMs]   how long a proposal waits for its words
 * @param {() => number} [opts.now]
 */
export function createWelcomeGuard(welcomeText, { minWords = 2, holdMs = 1200, now = Date.now } = {}) {
  let proposedAt = null;
  let lastHeard = null;
  let lastVerdict = false;

  return {
    shouldCut(energyBarge, heard) {
      const t = now();
      if (energyBarge) proposedAt = t;
      if (proposedAt == null || t - proposedAt > holdMs) return false;
      // The transcript changes a few times a second; frames arrive 50 times one.
      const h = String(heard ?? '');
      if (h !== lastHeard) {
        lastHeard = h;
        lastVerdict = interruptionWords(h, welcomeText).length >= minWords;
      }
      return lastVerdict;
    },
  };
}

/**
 * Roughly the part of `text` a caller heard before being cut off, `heardMs`
 * into `totalMs` of audio.
 *
 * Weighted by characters rather than words, because TTS time follows length.
 * Only whole words are kept: half a word was not heard. Always keeps the first
 * word, since a barge cannot land before the echo grace has played some of the
 * line. It is an estimate, and it only has to be good enough for the model to
 * see where the welcome stopped.
 */
export function heardPortion(text, heardMs, totalMs) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (!(totalMs > 0) || !(heardMs < totalMs)) return words.join(' ');
  const budget = (Math.max(0, heardMs) / totalMs) * words.join(' ').length;
  let used = 0;
  let n = 0;
  for (const w of words) {
    if (used + w.length > budget) break;
    used += w.length + 1;
    n += 1;
  }
  return words.slice(0, Math.max(1, n)).join(' ');
}

/**
 * The `spokenWelcome` value a bridge hands the runtime once a welcome was cut:
 * the full text, what was heard of it, and the fact that it was interrupted.
 * buildAgentSystemPrompt reads this shape; a plain string still means the
 * welcome was delivered in full.
 */
export function interruptedWelcome(text, heard) {
  return { text: String(text ?? ''), heard: String(heard ?? ''), interrupted: true };
}
