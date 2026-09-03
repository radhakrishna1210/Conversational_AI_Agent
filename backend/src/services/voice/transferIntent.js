// backend/src/services/voice/transferIntent.js
/**
 * "I want to talk to a person" — detecting it, and the protocol by which the
 * model tells the runtime it agrees.
 *
 * WHY TWO SIGNALS. A keyword pre-filter is fast, language-aware and cheap, but
 * brittle in both directions: "no, I don't need a manager" contains the word,
 * "get me someone who can actually fix this" contains none of them. The model
 * reads the whole conversation and is the better judge — but a judgement that
 * arrives as prose ("Sure, let me connect you") is unparseable. So the model
 * is asked for a STRUCTURED signal: when it decides the caller should be
 * handed to a human it begins its reply with the exact token below. The
 * runtime strips the token before anything is spoken, and acts on it.
 *
 * Why a marker token rather than a provider tool call: the pipeline streams
 * tokens straight into TTS through four different provider SDKs (Gemini, Groq,
 * OpenAI, Azure) and a speculative path that starts requests before the turn
 * commits; a tool-call round trip would have to be implemented and cancelled
 * correctly in every one of those, and the decision it carries is a single
 * bit. A leading token is that bit, arrives with the first delta, costs no
 * round trip, and is exercised by every provider through the one text path.
 *
 * Both signals are combined in the runtime: the marker is authoritative; the
 * pre-filter's HIGH-confidence matches (an explicit, unnegated request) are
 * also honoured on their own, so a model that forgets the protocol cannot
 * leave a caller who plainly asked for a person talking to a bot. Medium
 * matches only ever inform the model (they are surfaced in the prompt as a
 * hint), never trigger by themselves.
 */

export const TRANSFER_MARKER = '[[TRANSFER]]';

// ── Pre-filter vocabulary ────────────────────────────────────────────────────
// Who the caller wants. English, Hindi (Devanagari) and the romanised Hindi
// that code-switched callers actually produce. Kept as word lists so a new
// language is a line, not a regex rewrite.
const HUMAN_WORDS = [
  // English
  'human', 'person', 'real person', 'real human', 'someone real', 'actual person', 'live person', 'live agent',
  'representative', 'rep', 'agent', 'operator', 'manager', 'supervisor', 'boss', 'staff', 'team member',
  'somebody', 'someone', 'customer care', 'customer service', 'support team', 'front desk', 'receptionist',
  // Hindi / Hinglish
  'इंसान', 'आदमी', 'व्यक्ति', 'मैनेजर', 'सुपरवाइजर', 'एजेंट', 'किसी से', 'किसी इंसान', 'असली इंसान', 'स्टाफ',
  'insaan', 'insan', 'aadmi', 'admi', 'vyakti', 'manager se', 'kisi se', 'kisi insaan', 'asli insaan', 'staff se', 'supervisor se', 'agent se',
];
// What they want done.
const ACTION_WORDS = [
  // English
  'transfer', 'connect', 'put me through', 'speak to', 'speak with', 'talk to', 'talk with', 'get me', 'give me',
  'let me talk', 'let me speak', 'can i talk', 'can i speak', 'i want to talk', 'i want to speak', 'i need to talk', 'i need to speak',
  'escalate', 'hand me over', 'hand me off', 'pass me', 'forward me', 'call a', 'is there a',
  // Hindi / Hinglish
  'बात करनी', 'बात करना', 'बात कराओ', 'बात करवाओ', 'बात करवा', 'ट्रांसफर', 'कनेक्ट', 'मिलाओ', 'मिला दो', 'मिला दीजिए', 'लगाओ', 'लगा दो',
  'baat karni', 'baat karna', 'baat karao', 'baat karwao', 'baat karwa', 'transfer', 'connect', 'milao', 'mila do', 'mila dijiye', 'lagao', 'laga do', 'baat karo',
];
// Standalone requests that need no human-word at all.
const STANDALONE = [
  'transfer the call', 'transfer my call', 'transfer me', 'connect me to a person', 'i want a human', 'get me a human',
  'this is a bot', 'you are a bot', 'are you a robot', 'i don\'t want to talk to a machine', 'not a machine', 'speak to a human',
  'talk to a human', 'human please', 'operator please', 'agent please', 'manager please', 'real person please',
  'call transfer karo', 'call transfer kar do', 'transfer kar do', 'kisi insaan se baat karao', 'kisi se baat karao',
  'मुझे इंसान से बात करनी है', 'किसी इंसान से बात कराओ', 'कॉल ट्रांसफर करो', 'मैनेजर से बात कराओ',
];
// Negation / reported speech that flips a match off.
const NEGATION = [
  /\b(no|nope|nah|not|don'?t|do not|dont|never|without|no need|needn'?t|didn'?t|won'?t|wouldn'?t)\b[^.?!]{0,40}$/i,
  /\b(nahi|nahin|nai|mat|na)\b/i,
  /(नहीं|मत|ना)\s*$/u,
];
const REPORTED = [
  /\b(said|says|told|telling|asked|asking|mentioned|suggested)\b[^.?!]{0,40}\b(transfer|speak|talk|connect|human|person|manager|agent)\b/i,
  /\b(bola|boli|kaha|kehna|bataya)\b/i,
];

const norm = (t) => String(t ?? '').toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const has = (text, phrase) => {
  const p = phrase.toLowerCase();
  // Devanagari has no reliable \b; use plain containment for non-Latin.
  if (/[^\x00-\x7f]/.test(p)) return text.includes(p);
  return new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s|'s)`).test(text);
};

/**
 * Does the caller's turn ask for a human?
 *
 * @param {string} text the caller's transcript for this turn
 * @returns {{ requested: boolean, confidence: 'high'|'medium'|null, matched: string|null, negated: boolean }}
 *   `high`   an explicit, unnegated request ("can I speak to a real person")
 *   `medium` a human-word or action-word alone ("is the manager there?") —
 *            informative, never sufficient on its own
 */
export function detectTransferRequest(text) {
  const t = norm(text);
  if (!t) return { requested: false, confidence: null, matched: null, negated: false };

  // Negation is judged on the CLAUSE that carries the request, not the whole
  // turn: "kisi se baat karao, mujhe samajh nahi aa rahi" asks for a person
  // and then explains why; the "nahi" in the second clause negates nothing.
  const clauses = String(text ?? '').split(/[,.?!;।]+/).map(norm).filter(Boolean);
  const clauseWith = (phrase) => clauses.find((c) => has(c, phrase)) ?? t;
  const isNegated = (phrase) => {
    const c = clauseWith(phrase);
    return NEGATION.some((re) => re.test(c)) || REPORTED.some((re) => re.test(c));
  };

  const standalone = STANDALONE.find((p) => has(t, norm(p)));
  if (standalone) {
    const negated = isNegated(norm(standalone));
    return negated
      ? { requested: false, confidence: 'medium', matched: standalone, negated: true }
      : { requested: true, confidence: 'high', matched: standalone, negated: false };
  }

  const human = HUMAN_WORDS.find((w) => has(t, norm(w)));
  const action = ACTION_WORDS.find((w) => has(t, norm(w)));
  if (human && action) {
    const negated = isNegated(norm(human)) || isNegated(norm(action));
    return negated
      ? { requested: false, confidence: 'medium', matched: `${action} … ${human}`, negated: true }
      : { requested: true, confidence: 'high', matched: `${action} … ${human}`, negated: false };
  }
  if (human || action) {
    return { requested: false, confidence: 'medium', matched: human || action, negated: isNegated(norm(human || action)) };
  }
  return { requested: false, confidence: null, matched: null, negated: false };
}

// ── Marker handling on the streamed reply ────────────────────────────────────
// The model is told to put the marker FIRST. Tokens arrive in fragments
// ("[[", "TRANS", "FER]]" …), so the scanner holds the head of the reply until
// it can rule the marker in or out, then passes everything else through
// unchanged. A marker that appears later in the reply (models do this) is
// still honoured and still removed; it just cost one extra look.
const MARKER_RE = /\[\[\s*TRANSFER\s*\]\]/gi;
const MAX_HEAD = TRANSFER_MARKER.length + 6;

/** Remove every marker occurrence; report whether any was present. */
export function stripTransferMarker(text) {
  const s = String(text ?? '');
  const found = MARKER_RE.test(s);
  MARKER_RE.lastIndex = 0;
  return { text: found ? s.replace(MARKER_RE, '').replace(/^\s+/, '') : s, transfer: found };
}

/**
 * Streaming scanner: push(delta) → text safe to speak now; flush() → the rest.
 * found() is true as soon as a marker has been seen.
 */
export function createTransferMarkerScanner() {
  let head = '';
  let headDone = false;
  let found = false;
  const scanBody = (text) => {
    const r = stripTransferMarker(text);
    if (r.transfer) found = true;
    return r.text;
  };
  return {
    push(delta) {
      if (!delta) return '';
      if (headDone) return scanBody(delta);
      head += delta;
      const trimmed = head.replace(/^\s+/, '');
      // Could this still turn into the marker? Only if it is a prefix of it.
      const couldBeMarker = TRANSFER_MARKER.toLowerCase().startsWith(trimmed.slice(0, TRANSFER_MARKER.length).toLowerCase().replace(/\s+/g, ''))
        || /^\[\[\s*TRANSFER\s*\]\]?$/i.test(trimmed);
      if (trimmed.length < MAX_HEAD && couldBeMarker) return '';
      headDone = true;
      const out = scanBody(head);
      head = '';
      return out;
    },
    flush() {
      if (headDone) return '';
      headDone = true;
      const out = scanBody(head);
      head = '';
      return out;
    },
    found() { return found; },
  };
}

/**
 * The prompt paragraph that teaches the model the protocol. Two variants,
 * because the honest thing to say depends on whether a transfer can happen at
 * all on this call.
 */
export function transferPromptSection({ available, condition = '', targetLabel = 'a team member', callbackHint = true } = {}) {
  const when = condition
    ? `When ${String(condition).trim()}, or when the caller asks to speak to a person (any wording, any language — "transfer me", "real person", "manager", "किसी इंसान से बात कराओ"),`
    : 'When the caller asks to speak to a person — any wording, any language ("transfer me", "let me talk to someone real", "get me your manager", "किसी इंसान से बात कराओ") —';
  if (available) {
    return `- Human handover: ${when} begin your reply with the exact token ${TRANSFER_MARKER} and then ONE short sentence telling them you are connecting them to ${targetLabel} now (for example "${TRANSFER_MARKER} Sure, connecting you to ${targetLabel} now, one moment."). The token is a machine signal: it is never spoken, never explained, and never used unless you genuinely intend the handover. Do not use it for a caller who merely mentions a manager, quotes someone else, or says they do NOT want a person. Never say a transfer already happened or invent what the other person said — the system does the connecting and will tell you if it fails.`;
  }
  return `- Human handover: ${when} say honestly that you cannot connect them to a person on this call${callbackHint ? ', and offer to take their name and phone number so a team member can call them back, or to pass on a message' : ''}. Never pretend to transfer, never claim someone is coming to the line, and never invent what a colleague said.`;
}
