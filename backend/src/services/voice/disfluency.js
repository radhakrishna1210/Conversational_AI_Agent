// backend/src/services/voice/disfluency.js
/**
 * Naturalness control for spoken replies — pauses in, excess hesitation out.
 *
 * WHY THIS IS CODE AND NOT JUST PROMPTING
 * ---------------------------------------
 * The prompt asks the model to hesitate "sparingly, at most once every few
 * turns". A prompt cannot enforce a RATE: an LLM reads "sparingly" as a style
 * flag and then applies it to nearly every reply, because that is what the
 * instruction most recently primed. Measured against real speech the target is
 * ~2-6 disfluencies per 100 words — roughly one filler every 3-5 agent turns —
 * and the failure mode of overshooting is not "slightly too casual", it is an
 * agent that sounds nervous or incompetent. Listeners rate heavily-disfluent
 * speakers as LESS competent even while rating them as more human.
 *
 * So the prompt PERMITS fillers and this module GUARANTEES the ceiling. The
 * prompt is the soft signal; the budget below is the hard one.
 *
 * AND A FLOOR, BECAUSE A CEILING ALONE PRODUCED SILENCE
 * ----------------------------------------------------
 * The ceiling only ever had something to trim when the model wrote a filler in
 * the first place, and in practice it does not. A low-latency model, told to
 * answer in "1-2 short spoken sentences" and to answer only what was asked,
 * writes clean prose on essentially every turn — six typical replies through
 * this module came out byte-identical, budget untouched. Every rule below was
 * running correctly and the caller heard a robot, because "at most one every
 * few turns" and "at least one every few turns" are different guarantees and
 * only the first one was implemented.
 *
 * So injection (`inject: true`) is the other half: when a reply arrives with no
 * marker of its own and the budget says a turn is due, one is added — under
 * exactly the same rules that govern a model-written one (turn-initial, never
 * before a number, never the same word twice running, suppressed when the
 * caller is in a hurry). The two paths share one budget, so a turn the model
 * opened naturally does not also get an injected opener, and the combined rate
 * is what the budget says it is rather than the sum of two unaware mechanisms.
 *
 * The two tiers are gated differently on purpose — see DISCOURSE vs HESITATION
 * below. Injecting "Alright," is safe enough to be on by default in voice mode;
 * injecting "Umm" is not, and stays behind the agent's Filler Words toggle.
 *
 * THE RULES, AND WHY EACH ONE EXISTS
 * ----------------------------------
 *  1. Turn-initial only. Real hesitation clusters at the start of a turn and
 *     before genuinely hard content. Scattered mid-sentence "um"s are the
 *     single most common way synthetic speech overshoots into parody.
 *  2. At most ONE per reply, never a hesitation stacked on a discourse marker
 *     ("Umm, well, so…" is the model's favourite and nobody talks like that).
 *  3. Never before a number, price, date or confirmation. Hesitating before a
 *     price does not read as thoughtful, it reads as making it up — this is the
 *     most damaging placement there is, which is why it is a hard block rather
 *     than a budget item.
 *  4. Never the same filler sound twice running. Three cached variants cycling
 *     in order is audibly a loop.
 *  5. Budgeted across the call, not just the reply (see createFillerBudget).
 *
 * PAUSES DO THE REAL WORK
 * -----------------------
 * A 300ms pause before a considered answer reads as thoughtful; the WORD "um"
 * before the same answer reads as unsure. Pauses carry most of the perceived
 * humanity at none of the credibility cost, so they are treated as the primary
 * mechanism and verbal fillers as the rationed extra.
 *
 * `<break time="0.3s"/>` is real SSML that ElevenLabs honours on every model
 * except v3 (which has no realtime WebSocket, so it is not reachable from the
 * live-call path anyway). Providers that do NOT parse SSML would SPEAK the tag
 * aloud, so every break must be either clamped-and-kept or converted back to a
 * comma before it leaves this module — see createReplyTextFilter({ ssmlBreaks }).
 */

/** Hard ceiling on a single pause. ElevenLabs allows up to 3s; three seconds of
 *  silence on a live phone call is indistinguishable from a dropped connection,
 *  and the caller starts talking over the agent. */
const MAX_BREAK_MS = Number(process.env.VOICE_MAX_BREAK_MS || 700);
const MIN_BREAK_MS = 120;

/** Pauses allowed per reply. Replies are 1-2 sentences in voice mode, so two
 *  pauses is already at the edge of "thoughtful" and three is "struggling". */
const MAX_BREAKS_PER_REPLY = Number(process.env.VOICE_MAX_BREAKS_PER_REPLY || 2);

/**
 * How much of the reply to hold before deciding on the opening filler.
 *
 * The rules above are all about the FIRST few words, so only the head needs
 * buffering — everything after it streams straight through. 24 characters is
 * one or two LLM deltas (tens of ms), which is noise against an ~800ms
 * time-to-first-audio budget, and the head is released early anyway the moment
 * it contains a sentence terminator.
 */
const HEAD_CHARS = 24;

/** Characters of the remainder scanned for digits/currency when deciding
 *  whether this reply is "about to say a number" (rule 3). */
const NUMERIC_LOOKAHEAD = 44;

// ─── Filler lexicon ───────────────────────────────────────────────────────────

/**
 * HESITATION markers — the risky tier. These signal "I do not have the answer
 * yet", which is exactly the impression to ration. Budgeted.
 */
const HESITATION = [
  'u+m+', 'u+h+', 'e+r+m*', 'h+m+', 'm+h+m+', 'mm+',
  "let me see", "let'?s see", 'one sec(?:ond)?', 'give me a sec(?:ond)?',
  // Devanagari hesitations only. Hindi discourse particles (जी, तो, अच्छा) are
  // deliberately absent: they are ordinary polite speech, not hesitation, and
  // stripping them would flatten the register the Hinglish prompt works to get.
  //
  // The conjunct forms are load-bearing. "हम+" was matching हम — the ordinary
  // pronoun "we" — so "हम सुबह नौ बजे खुलते हैं" ("we open at nine") lost its
  // subject and was spoken to the caller as "सुबह नौ बजे खुलते हैं". The
  // hesitation is हम्म, with the halant; requiring it cannot match the pronoun.
  'अं+', 'हम्+म्?', 'उम्+म्?', 'एक सेकंड', 'एक मिनट',
];

/**
 * DISCOURSE markers — the safe tier. "So", "Right", "Okay" opening a turn is
 * how people actually talk and carries no incompetence signal, so these are not
 * budgeted. They are still de-duplicated (rule 4) and still blocked before
 * numbers (rule 3), because "So, right, it's 4,999" is its own kind of robotic.
 */
const DISCOURSE = [
  'well', 'so', 'right', 'okay', 'ok', 'actually', 'you know', 'i mean', 'look',
];

/**
 * What INJECTION may add, per tier and script.
 *
 * Deliberately not the same lists as HESITATION/DISCOURSE above. Those are
 * regex fragments describing everything that must be RECOGNISED (including
 * elongations like "ummmm" and forms nobody would choose deliberately); these
 * are literal words that must be SPOKEN, so each one is chosen to sound right
 * coming out of a TTS engine at the head of a sentence.
 *
 * The Hindi lists are ordinary spoken particles rather than transliterated
 * English ones: an agent whose voice is Hindi opening with "Alright" is the
 * exact robotic tell this is meant to remove.
 */
const INJECT_DISCOURSE = {
  en: ['Alright', 'Okay', 'Right', 'Sure', 'So', 'Well', 'Got it', 'Yeah'],
  // No "हाँ" — it means "yes", and an unprompted yes in front of a statement
  // answers a question the caller did not ask.
  hi: ['जी', 'अच्छा', 'ठीक है', 'तो'],
};
const INJECT_HESITATION = {
  en: ['Hmm', 'Umm', 'Uhh', 'Let me see', 'One sec'],
  hi: ['अं', 'हम्म', 'एक सेकंड'],
};

/**
 * A reply that already opens conversationally gets nothing added — "Alright,
 * sure, I can do that" is more robotic than the plain version, not less. This
 * is a wider net than the DISCOURSE list because it also catches openers that
 * are perfectly natural but are NOT markers ("Thanks", "Sorry", "Perfect"), and
 * those need no help.
 */
const ALREADY_NATURAL_RE = new RegExp(
  '^(?:sure|absolutely|certainly|of course|yes|yeah|yep|no|nope|not really|got it|'
  + 'perfect|great|awesome|lovely|nice|alright|all right|okay|ok|right|well|so|'
  + 'thanks|thank you|sorry|apologies|hi|hello|hey|'
  + 'जी|अच्छा|ठीक|हाँ|हां|नहीं|ज़रूर|जरूर|माफ़|माफ|नमस्ते|धन्यवाद|शुक्रिया)'
  + '(?![\\p{L}\\p{N}])',
  'iu',
);

/** Script of a reply, used to pick which injection list to draw from. */
const DEVANAGARI_RE = /[ऀ-ॿ]/;

/**
 * First words after which the reply can safely be lower-cased so an injected
 * opener reads as one sentence ("Alright, we're open till six").
 *
 * Anything NOT on this list — a proper noun, a product name, a word we simply
 * do not recognise — gets a full stop instead ("Alright. Dr Mehta is free at
 * four"), which is still natural speech and can never mangle a name. Guessing
 * wrong here is visible in the transcript, so the unknown case takes the safe
 * branch rather than the pretty one.
 */
const LOWERCASEABLE_FIRST_WORDS = new Set([
  'we', 'you', 'your', 'yours', 'it', 'its', "it's", 'that', "that's", 'this',
  'the', 'a', 'an', 'our', 'ours', 'they', 'their', "they're", 'there', "there's",
  'here', "here's", 'he', 'she', 'his', 'her', 'let', "let's", 'yes', 'no',
  'of', 'for', 'to', 'and', 'but', 'so', 'if', 'when', 'while', 'what', "what's",
  'how', 'why', 'where', 'which', 'who', 'can', 'could', 'would', 'should',
  'will', 'do', 'does', 'did', 'is', 'are', 'was', 'were', 'have', 'has', 'had',
  'may', 'might', 'must', 'give', 'just', 'both', 'either', 'any', 'all', 'most',
  'sorry', 'thanks', 'sure', 'okay',
]);

/** Words that must keep their capital even mid-sentence. */
const ALWAYS_CAPITAL_RE = /^I(?:['’]|$)/;

/**
 * Is this reply delivering a confirmation? Rule 3's other half — "Hmm, the
 * appointment is confirmed" undoes the confirmation it is announcing, in
 * exactly the way hesitating in front of a price does. Only the HESITATION tier
 * is blocked; "Alright, the appointment is confirmed" is fine.
 */
const CONFIRMATION_RE = /\b(?:confirm(?:ed)?|booked|reserved|all set|done|scheduled|sorted)\b|बुक|कन्फर्म|पक्का|तय/iu;

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

const alt = (list) => list.join('|');

/** One leading filler plus whatever separates it from the real reply. */
const LEADING_FILLER_RE = new RegExp(
  `^[\\s"'“‘]*(?:(?<hes>${alt(HESITATION)})|(?<dis>${alt(DISCOURSE)}))` +
  '(?![\\p{L}\\p{N}])' +               // must be a whole word, not a prefix
  '(?<sep>[\\s,.…!—–-]*)',
  'iu',
);

/**
 * A filler sitting MID-sentence. Requires punctuation or a word before it, so
 * this can never match the deliberately-kept opener. Best-effort: it runs
 * per-chunk, so a filler split across two LLM deltas can survive — the head
 * filter is the guarantee, this is cleanup.
 *
 * Deliberately a NARROWER list than HESITATION. Bare "mm" is also a unit
 * ("5 mm wide") and the multi-word forms ("one second") are ordinary content
 * mid-sentence; only tokens that can be nothing but hesitation are safe to
 * delete from the middle of a sentence without reading it.
 */
const MID_HESITATION = ['u+m+', 'u+h+', 'e+r+m*', 'h+m+', 'अं+', 'हम्+म्?', 'उम्+म्?'];
const MID_FILLER_RE = new RegExp(
  `([\\p{L}\\p{N},;:])\\s+(?:${alt(MID_HESITATION)})\\s*,?\\s+`,
  'giu',
);

/** SSML pause tag, in either s or ms, with or without the self-closing slash. */
const BREAK_RE = /<\s*break\s+time\s*=\s*["']?\s*(\d+(?:\.\d+)?)\s*(ms|s)\s*["']?\s*\/?\s*>/gi;

/** An unterminated tag at the very end of a chunk ("…<brea"). Held back so a
 *  tag split across two LLM deltas is never emitted half-formed. */
const PARTIAL_TAG_RE = /<[^>]*$/;

/** Anything that would be READ ALOUD if it reached a TTS engine as-is. */
const MARKDOWN_RE = /[*_#`]+/g;
const BLOCKQUOTE_RE = /^\s*>+\s?/gm;

// ─── Text helpers ─────────────────────────────────────────────────────────────

/** Tidy punctuation left behind after removing a filler or a break tag. */
function tidy(text) {
  return text
    .replace(/\s*,\s*,/g, ',')
    .replace(/\s+([,.!?…।॥])/g, '$1')
    .replace(/,\s*([.!?…।॥])/g, '$1')
    .replace(/\s{2,}/g, ' ');
}

/** Sentence-case the reply again after its opening word was removed. Devanagari
 *  is caseless, so this is a no-op there rather than a wrong-script guess. */
function recapitalize(text) {
  return text.replace(/^([a-z])/, (c) => c.toUpperCase());
}

/**
 * Strip every speech-only marker so the text can be shown as a transcript.
 * The caller HEARD the pause; they should not READ "<break time=…>".
 */
export function stripSpeechMarkup(text) {
  if (!text) return '';
  return tidy(String(text).replace(BREAK_RE, ' ')).trim();
}

/** Clamp one break tag to a length that works on a live call (see MAX_BREAK_MS). */
function clampBreak(value, unit) {
  const ms = unit.toLowerCase() === 's' ? Number(value) * 1000 : Number(value);
  if (!Number.isFinite(ms)) return null;
  return Math.min(MAX_BREAK_MS, Math.max(MIN_BREAK_MS, Math.round(ms)));
}

// ─── Filler budget ────────────────────────────────────────────────────────────

/**
 * Per-CALL hesitation budget. Owned by the transport (one per WebSocket
 * connection) because the rate that matters — "once every few turns" — is a
 * property of the conversation, not of any single reply. A turn cannot see that
 * the previous three turns already hesitated; this can.
 *
 * Callers that have no call-scoped state (the one-shot NDJSON endpoint) simply
 * pass none: the per-reply rules still apply, and the LLM's own restraint
 * governs the rate, which is the behaviour that existed before this module.
 *
 * The budget is shared by BOTH directions — the model wrote a filler and we are
 * deciding whether to keep it, or the model wrote none and we are deciding
 * whether to add one. That sharing is the point: two mechanisms each rationing
 * to "one every few turns" without seeing each other produce twice the rate.
 *
 * @param {{ everyNTurns?: number, maxPerCall?: number, everyNOpeners?: number }} [opts]
 *   everyNOpeners — spacing for the SAFE tier (discourse markers). Tighter than
 *   everyNTurns because "Alright" carries none of the incompetence signal that
 *   makes hesitation something to ration; the only failure mode it has is
 *   sounding like a tic, which the spacing and the no-repeat rule handle.
 */
export function createFillerBudget({ everyNTurns = 3, maxPerCall = 4, everyNOpeners = 2 } = {}) {
  let turn = 0;
  let used = 0;
  let lastUsedTurn = -Infinity;
  let lastHesitation = '';
  let lastDiscourse = '';
  let lastOpenerTurn = -Infinity;
  const recentOpeners = [];   // last few spoken openers, to avoid an audible tic

  /** Record that THIS turn opened with a marker, whoever put it there. */
  const noteOpener = (key) => {
    lastOpenerTurn = turn;
    lastDiscourse = key;
    recentOpeners.push(key);
    if (recentOpeners.length > 3) recentOpeners.shift();
  };

  return {
    /** Call once at the start of each agent turn. */
    nextTurn() { turn += 1; },

    /** May this reply open with a hesitation? Consumes the budget when it may. */
    allowHesitation(word) {
      const key = String(word || '').toLowerCase();
      if (used >= maxPerCall) return false;
      if (turn - lastUsedTurn < everyNTurns) return false;
      // Never the same sound twice running — but FORGIVE it afterwards. Models
      // have a favourite filler and will write "Hmm" every time; a rule that
      // remembers forever then blocks forever, and the agent silently stops
      // sounding human at all. Blocking once spaces the repeat out to double
      // the normal gap, which is the intent (no audible loop) without the
      // starvation.
      if (key && key === lastHesitation) { lastHesitation = ''; return false; }
      used += 1;
      lastUsedTurn = turn;
      lastHesitation = key;
      return true;
    },

    /** Discourse markers are unbudgeted but never repeat back-to-back. */
    allowDiscourse(word) {
      const key = String(word || '').toLowerCase();
      if (key && key === lastDiscourse) return false;
      // Counts against the INJECTION cadence even though it is unbudgeted
      // itself: this turn already opens with a marker, so the next turn should
      // not have one added on top of it.
      noteOpener(key);
      return true;
    },

    /**
     * Is this turn due an ADDED opener at all?
     *
     * Checked once before either tier is offered the turn, because the spacing
     * that matters is "did the LAST turn already open with a marker" — and the
     * hesitation tier tracks only its own history. Without this, a turn the
     * model opened with "Right," was immediately followed by an injected "Uhh,"
     * (both cadences were individually satisfied) and the agent opened two
     * consecutive replies with a marker, which is the tic the spacing exists to
     * prevent.
     */
    openerDue() { return turn - lastOpenerTurn >= everyNOpeners; },

    /**
     * May the transport play its pre-synthesized "Mm-hmm" while the LLM works?
     *
     * Same spacing as a spoken opener, for the same reason — the caller cannot
     * tell whether the beat they heard was a cached clip or a generated word,
     * so the two have to ration against one shared history or the agent
     * acknowledges twice in a row.
     */
    allowAudioAck() { return turn - lastOpenerTurn >= everyNOpeners; },

    /** The transport played an ack — this turn has now had its opener. */
    noteAudioAck() { noteOpener(' ack'); },

    /**
     * Pick a hesitation to ADD to a reply that has none, or null when this turn
     * is not due one. Same gates as allowHesitation and the same accounting —
     * a hesitation is a hesitation whether the model wrote it or we did.
     */
    pickHesitation(list = []) {
      if (!list.length) return null;
      if (used >= maxPerCall) return null;
      if (turn - lastUsedTurn < everyNTurns) return null;
      const fresh = list.filter((w) => w.toLowerCase() !== lastHesitation);
      const word = pickRandom(fresh.length ? fresh : list);
      used += 1;
      lastUsedTurn = turn;
      lastHesitation = word.toLowerCase();
      noteOpener(word.toLowerCase());
      return word;
    },

    /** Pick a discourse marker to ADD, or null when this turn is not due one. */
    pickDiscourse(list = []) {
      if (!list.length) return null;
      if (turn - lastOpenerTurn < everyNOpeners) return null;
      const fresh = list.filter((w) => !recentOpeners.includes(w.toLowerCase()));
      const word = pickRandom(fresh.length ? fresh : list);
      noteOpener(word.toLowerCase());
      return word;
    },

    stats() { return { turn, used, maxPerCall, everyNTurns, everyNOpeners }; },
  };
}

/** A budget that permits one opening filler per reply and tracks nothing else. */
const PERMISSIVE_BUDGET = {
  nextTurn() {},
  allowHesitation() { return true; },
  allowDiscourse() { return true; },
  // Injection is refused outright without a call-scoped budget. Rate is the
  // whole point of adding a filler, and a caller with no per-call state cannot
  // hold one — so it gets the ceiling-only behaviour that existed before.
  openerDue() { return false; },
  allowAudioAck() { return true; },
  noteAudioAck() {},
  pickHesitation() { return null; },
  pickDiscourse() { return null; },
  stats() { return { permissive: true }; },
};

// ─── Injection ────────────────────────────────────────────────────────────────

/**
 * Attach an opener to a reply that has none, choosing the join so the result is
 * a sentence a human would have written.
 *
 * The join matters more than it looks. "Alright, We're open till six" is what a
 * naive concatenation gives you, and it is visibly wrong in the transcript the
 * caller can read afterwards — so a known function word gets lower-cased and
 * joined with a comma, while anything unrecognised (a name, a product) keeps
 * its capital behind a full stop instead. Both are natural speech; only one of
 * them can mangle a proper noun.
 */
function joinOpener(word, rest, { ssmlBreaks }) {
  const pause = ssmlBreaks ? '<break time="250ms"/> ' : '';
  const first = (rest.match(/^[\p{L}'’]+/u) || [''])[0];

  // Devanagari is caseless and "I" must stay capital — both join cleanly as-is.
  if (DEVANAGARI_RE.test(first) || ALWAYS_CAPITAL_RE.test(first)) {
    return { kept: `${word}, ${pause}`, rest };
  }
  // Match on the STEM, not the whole token: "we're", "that's" and "you'll" are
  // the most common way a spoken reply opens, and looking them up whole missed
  // every one of them — which is how "Okay. We're open till six" (two clipped
  // sentences) came out instead of "Okay, we're open till six".
  const stem = first.toLowerCase().replace(/[’]/g, "'").split("'")[0];
  if (LOWERCASEABLE_FIRST_WORDS.has(stem)) {
    return { kept: `${word}, ${pause}`, rest: rest.charAt(0).toLowerCase() + rest.slice(1) };
  }
  return { kept: `${word}. ${pause}`, rest };
}

/**
 * Decide whether to add an opener to a reply that arrived without one.
 *
 * Every refusal here mirrors a rule the model-written path already enforces, so
 * an injected filler can never land somewhere a kept one would have been
 * stripped from — in particular never in front of a price, which is the
 * placement that costs the agent its credibility.
 *
 * @returns {{ kept: string, rest: string } | null}
 */
function injectOpener(rest, { budget, allowFiller, ssmlBreaks }) {
  if (!rest || !rest.trim()) return null;
  if (!budget.openerDue()) return null;
  // Rule 3, same lookahead as the keep path: nothing in front of a number.
  if (/[\d₹$€£%]/.test(rest.slice(0, NUMERIC_LOOKAHEAD))) return null;
  // Already conversational — adding to it stacks markers (rule 2).
  if (ALREADY_NATURAL_RE.test(rest)) return null;

  const script = DEVANAGARI_RE.test(rest.slice(0, 40)) ? 'hi' : 'en';
  const hesitationOk = allowFiller && !CONFIRMATION_RE.test(rest.slice(0, NUMERIC_LOOKAHEAD));

  // Hesitation first when it is allowed AND due: it is the rarer of the two, so
  // offering it the turn first is what keeps it from being permanently crowded
  // out by the tighter discourse cadence.
  const word = (hesitationOk ? budget.pickHesitation(INJECT_HESITATION[script]) : null)
    || budget.pickDiscourse(INJECT_DISCOURSE[script]);
  if (!word) return null;

  return joinOpener(word, rest, { ssmlBreaks });
}

// ─── Head rules ───────────────────────────────────────────────────────────────

/**
 * Apply rules 1-4 to the opening of a reply.
 *
 * @param {string} head
 * @param {{ allowFiller: boolean, budget: object, ssmlBreaks: boolean, inject: boolean }} ctx
 *   inject — may an opener be ADDED when the model wrote none? Off by default,
 *   so a caller that only wants the ceiling keeps the exact behaviour it had.
 * @returns {{ kept: string, rest: string }} `kept` is the opener to emit
 *   verbatim (never re-scanned for mid-sentence fillers, or it would delete
 *   itself); `rest` is the remainder, still subject to the other rules.
 */
export function applyHeadRules(head, { allowFiller = true, budget = PERMISSIVE_BUDGET, ssmlBreaks = false, inject = false } = {}) {
  let rest = head;
  let kept = '';
  // Once a filler has been TURNED DOWN, no later one in the same reply may take
  // its place. Without this, "Hmm, let me see, Tuesday works" answered the
  // budget's "no" to "Hmm" by promoting "let me see" instead — the reply
  // hesitated anyway and the spacing rule bought nothing. One decision per
  // reply, and a rejection is a decision.
  let rejected = false;

  // Loop so a stacked opener ("Umm, well, so …") collapses to at most one
  // marker instead of leaving the second and third in place (rule 2).
  for (let i = 0; i < 3; i++) {
    const m = LEADING_FILLER_RE.exec(rest);
    if (!m || !m.groups) break;
    const hesitation = m.groups.hes;
    const discourse = m.groups.dis;
    const word = (hesitation || discourse || '').toLowerCase();
    const after = rest.slice(m[0].length);

    // A discourse marker is only a marker when the model punctuated it as one.
    // "Right, that's ready Friday" opens with a marker; "Right away, I'll book
    // that" opens with an adverb, and rewriting it to "Right, <pause> away…"
    // would mangle the sentence. Hesitations ("um", "uh") are never ordinary
    // words, so they need no such evidence. When in doubt, leave the text alone.
    if (discourse && !/[,.…!—–-]/.test(m.groups.sep || '')) break;

    // Rule 3 — about to say a number/price/date: no filler of any tier.
    const aboutToQuote = /[\d₹$€£%]/.test(after.slice(0, NUMERIC_LOOKAHEAD));

    const permitted = !kept && !rejected           // rule 2: only the first one
      && !aboutToQuote
      && (hesitation
        ? allowFiller && budget.allowHesitation(word)
        : budget.allowDiscourse(word));

    if (permitted) {
      // A filler with no pause after it is worse than no filler at all — it
      // lands as a clipped syllable rather than as hesitation. Give it the
      // pause the prompt asks for, whether or not the model wrote one.
      // recapitalize because the kept opener may not be the one the model put
      // first ("Hmm, let me see…" → "Let me see, …").
      const opener = recapitalize(hesitation || discourse);
      kept = ssmlBreaks
        ? `${opener}, <break time="300ms"/> `
        : `${opener}, `;
    } else {
      rejected = true;
    }
    // Keep peeling either way. Stopping as soon as one marker is KEPT was the
    // bug: "Umm, well, so I can check" kept the "Umm" and left "well, so"
    // sitting behind it, which is the stacked opener the rule exists to
    // prevent. Subsequent markers still match, but `permitted` is now false
    // because `kept` is set, so they are stripped.
    rest = after;
  }

  if (!kept) rest = recapitalize(rest.replace(/^[\s,.…!—–-]+/, ''));

  // Nothing survived the peel (or there was nothing to peel) — this is the turn
  // the floor exists for. `rejected` is respected: a marker the budget just
  // turned down must not be replaced by one we chose ourselves.
  if (!kept && inject && !rejected) {
    const added = injectOpener(rest, { budget, allowFiller, ssmlBreaks });
    if (added) return added;
  }
  return { kept, rest };
}

// ─── Streaming filter ─────────────────────────────────────────────────────────

/**
 * Build a stateful filter for ONE reply.
 *
 * Sits between the LLM token stream and TTS, so it works identically on all
 * three synthesis paths (token-streaming WebSocket, first-sentence split, and
 * the buffered fallback) instead of each having its own idea of what a filler
 * is. Feed it raw deltas; it returns text that is safe to speak.
 *
 * @param {{ allowFiller?: boolean, ssmlBreaks?: boolean, budget?: object, inject?: boolean }} opts
 *   ssmlBreaks — does the TTS provider actually parse SSML? When false, pause
 *   tags are converted back to commas rather than passed on to be spoken aloud.
 *   inject — add an opener when the model wrote none (needs a call-scoped
 *   budget; see createFillerBudget).
 * @returns {{ push(delta: string): string, flush(): string }}
 */
export function createReplyTextFilter({ allowFiller = true, ssmlBreaks = false, budget = PERMISSIVE_BUDGET, inject = false } = {}) {
  let head = '';
  let headDone = false;
  let carry = '';        // trailing partial tag held until it completes
  let breaksUsed = 0;

  /** Clamp/convert pause tags and clean up leftovers. Applied to every chunk. */
  const handleBreaks = (text) => text.replace(BREAK_RE, (_m, value, unit) => {
    if (!ssmlBreaks) return ', ';
    const ms = clampBreak(value, unit);
    if (ms == null) return ', ';
    if (breaksUsed >= MAX_BREAKS_PER_REPLY) return ', ';
    breaksUsed += 1;
    return `<break time="${ms}ms"/>`;
  });

  /** Everything that applies to text past the opener. */
  const body = (text) => {
    if (!text) return '';
    let out = text.replace(MARKDOWN_RE, '').replace(BLOCKQUOTE_RE, '');
    out = out.replace(MID_FILLER_RE, '$1 ');   // rule 1: turn-initial only
    out = handleBreaks(out);
    return tidy(out);
  };

  /** Split off a tag that is still being written, so it is never half-emitted. */
  const holdPartial = (text) => {
    const m = PARTIAL_TAG_RE.exec(text);
    if (!m) return { ready: text, held: '' };
    return { ready: text.slice(0, m.index), held: text.slice(m.index) };
  };

  const releaseHead = () => {
    headDone = true;
    // Drop a tag the model started and never finished. Reached only via
    // flush() — push() has already split any partial into `carry` — and the
    // alternative is speaking "<break tim" to the caller.
    head = head.replace(PARTIAL_TAG_RE, '');
    const { kept, rest } = applyHeadRules(head, { allowFiller, budget, ssmlBreaks, inject });
    head = '';
    // `kept` bypasses body(): it already carries its own pause, and running the
    // mid-sentence rule over it would strip the filler we just decided to keep.
    if (kept && ssmlBreaks) breaksUsed += 1;
    return kept + body(rest);
  };

  return {
    push(delta) {
      if (!delta) return '';
      const text = carry + delta;
      carry = '';

      if (!headDone) {
        head += text;
        // Release early once the opener is unambiguous — either enough
        // characters to judge, or a sentence has already ended inside it.
        if (head.length < HEAD_CHARS && !/[.!?…।॥]/.test(head)) return '';
        const { ready, held } = holdPartial(head);
        if (!ready.trim()) return '';   // head is nothing but a partial tag
        head = ready;
        carry = held;
        return releaseHead();
      }

      const { ready, held } = holdPartial(text);
      carry = held;
      return body(ready);
    },

    /** End of stream: emit whatever is still held back. */
    flush() {
      const tail = carry;
      carry = '';
      if (!headDone) {
        head += tail;
        return releaseHead();
      }
      // An unterminated tag at end-of-stream is never going to complete.
      return body(tail.replace(PARTIAL_TAG_RE, ''));
    },
  };
}

/**
 * One-shot convenience for non-streaming callers (the buffered fallback and the
 * legacy voiceTurn path): run a complete reply through the same rules.
 */
export function filterReplyText(text, opts = {}) {
  const f = createReplyTextFilter(opts);
  return `${f.push(String(text ?? ''))}${f.flush()}`.trim();
}

export const __testing = {
  HEAD_CHARS, MAX_BREAK_MS, MIN_BREAK_MS, MAX_BREAKS_PER_REPLY,
  LEADING_FILLER_RE, MID_FILLER_RE, BREAK_RE, tidy, clampBreak,
  INJECT_DISCOURSE, INJECT_HESITATION, ALREADY_NATURAL_RE, joinOpener,
};
