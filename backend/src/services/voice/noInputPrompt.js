/**
 * What the agent says when the caller has gone quiet — and when to say it.
 *
 * WHY: a caller who is not heard gets silence back. Either they said something
 * the pipeline missed (mic too quiet, speech landed while the agent was still
 * talking, STT returned nothing) or they genuinely said nothing — and from
 * their side those are the same experience: a dead line for eight or ten
 * seconds with no indication anyone is there. Reported from a live call as
 * "agent says nothing and it keeps blank".
 *
 * The reply is a fixed, pre-written line rather than an LLM turn on purpose:
 *  - It must arrive on a deadline. Asking a model whose p90 time-to-first-token
 *    is seconds to produce "sorry, I didn't catch that" would make the dead air
 *    it exists to break part of its own cost.
 *  - It costs no LLM quota, which matters precisely when the line is quiet
 *    because the model is being rate limited.
 *  - It never invents anything, so it cannot contradict the flow.
 *
 * ESCALATION. The three attempts are deliberately different in kind, not just
 * reworded. First assume WE missed it (the common case, and the polite reading).
 * Second, name a cause the caller can act on. Third, stop asking — repeating a
 * prompt at someone who has walked away is what makes an agent feel robotic, so
 * the last line hands the call back rather than fishing a fourth time.
 */

/**
 * Localized re-prompts, indexed by attempt.
 *
 * Keyed by the language LABEL as stored on `agent.languages` (the same values
 * the voice picker and DEEPGRAM_LANG use), lowercased. Written in the native
 * script because the string is handed straight to TTS — a romanized line is
 * read aloud with an English accent by a Hindi voice.
 */
const PROMPTS = {
  hindi: [
    'माफ़ कीजिए, मैं आपकी आवाज़ ठीक से नहीं सुन पाई। क्या आप दोबारा कह सकते हैं?',
    'अब भी आवाज़ नहीं आ रही। कृपया थोड़ा ज़ोर से बोलिए, या फ़ोन को पास लाइए।',
    'लगता है अभी बात नहीं हो पा रही। कोई बात नहीं — आप बाद में कभी भी कॉल कर सकते हैं।',
  ],
  english: [
    "Sorry, I didn't catch that. Could you say it again?",
    "I still can't hear you. Could you speak a little louder, or move closer to the phone?",
    "It seems we're having trouble connecting. No problem — feel free to call back any time.",
  ],
  tamil: [
    'மன்னிக்கவும், உங்கள் குரல் சரியாகக் கேட்கவில்லை. மீண்டும் சொல்ல முடியுமா?',
    'இப்போதும் கேட்கவில்லை. கொஞ்சம் சத்தமாகப் பேசுங்கள், அல்லது ஃபோனை அருகில் வையுங்கள்.',
    'இப்போது பேச முடியவில்லை போல. பரவாயில்லை — பிறகு எப்போது வேண்டுமானாலும் அழைக்கலாம்.',
  ],
  telugu: [
    'క్షమించండి, మీ మాట సరిగ్గా వినిపించలేదు. మళ్ళీ చెప్పగలరా?',
    'ఇప్పటికీ వినిపించడం లేదు. కొంచెం గట్టిగా మాట్లాడండి, లేదా ఫోన్‌ను దగ్గరగా పెట్టండి.',
    'ఇప్పుడు మాట్లాడలేకపోతున్నాం అనిపిస్తోంది. ఫర్వాలేదు — తర్వాత ఎప్పుడైనా కాల్ చేయవచ్చు.',
  ],
  spanish: [
    'Perdón, no le escuché bien. ¿Podría repetirlo?',
    'Sigo sin escucharle. ¿Podría hablar un poco más alto o acercarse al teléfono?',
    'Parece que hay problemas de conexión. No se preocupe, puede llamarnos cuando quiera.',
  ],
  french: [
    "Pardon, je ne vous ai pas bien entendu. Pouvez-vous répéter ?",
    "Je ne vous entends toujours pas. Pourriez-vous parler un peu plus fort ?",
    "On dirait que la ligne ne passe pas. Ce n'est pas grave, rappelez quand vous voulez.",
  ],
  german: [
    'Entschuldigung, ich habe Sie nicht verstanden. Können Sie das bitte wiederholen?',
    'Ich höre Sie immer noch nicht. Könnten Sie etwas lauter sprechen?',
    'Die Verbindung scheint nicht zu klappen. Kein Problem — rufen Sie gerne später wieder an.',
  ],
};

/**
 * Longest useful silence before the agent speaks up, per attempt (ms).
 *
 * 7s was tried first and came back as too eager from a live call: a caller who
 * has just been told something and is deciding what to say next reads a prompt
 * at seven seconds as being hurried, not helped. A pause that long is ordinary
 * in speech — people think, check a document, look something up — so the bar
 * for interrupting them has to sit above a normal thinking pause rather than at
 * the edge of one.
 */
const DEFAULT_DELAYS_MS = [10_000, 14_000, 18_000];

/** How the caller's language label maps onto a prompt set. */
const ALIASES = {
  'english (american)': 'english',
  'english (british)': 'english',
  'english (indian)': 'english',
  'english (australian)': 'english',
  multi: 'english',
  multilingual: 'english',
  auto: 'english',
  mandarin: 'english',
  chinese: 'english',
};

/**
 * The line to speak after `attempt` unanswered silences.
 *
 * Falls back to English rather than to nothing: a caller on an unsupported
 * language is still better served by a spoken prompt they may not understand
 * than by the dead air this exists to break — and silence would make the
 * feature quietly absent for exactly the tenants nobody tested.
 *
 * @param {string[]|string} languages agent.languages (parsed) or a single label
 * @param {number} attempt 1-based
 * @returns {string|null} null once the caller has been prompted enough
 */
export function noInputPromptFor(languages, attempt) {
  if (!Number.isFinite(attempt) || attempt < 1) return null;
  const first = Array.isArray(languages) ? languages[0] : languages;
  const label = String(first || '').trim().toLowerCase();
  const set = PROMPTS[ALIASES[label] || label] || PROMPTS.english;
  return attempt > set.length ? null : set[attempt - 1];
}

/** How long to wait before the nth prompt. Later prompts wait longer. */
export function noInputDelayMs(attempt, overrideMs = null) {
  const base = Number(overrideMs) > 0
    ? Number(overrideMs)
    : Number(process.env.NO_INPUT_PROMPT_MS) || DEFAULT_DELAYS_MS[0];
  if (!Number.isFinite(attempt) || attempt < 1) return base;
  const i = Math.min(attempt, DEFAULT_DELAYS_MS.length) - 1;
  // Scale the configured first delay by the same ratio the defaults use, so a
  // tenant who shortens the first prompt still gets an increasing sequence.
  return Math.round(base * (DEFAULT_DELAYS_MS[i] / DEFAULT_DELAYS_MS[0]));
}

/** Prompts available before the agent stops asking. */
export const maxNoInputAttempts = (languages) => {
  const first = Array.isArray(languages) ? languages[0] : languages;
  const label = String(first || '').trim().toLowerCase();
  return (PROMPTS[ALIASES[label] || label] || PROMPTS.english).length;
};
