// backend/src/services/voice/turnEndProfile.js
/**
 * How long the agent waits, after the caller stops making noise, before it
 * decides the turn is over.
 *
 * WHY THIS IS A PER-AGENT SETTING AND NOT A CONSTANT
 *
 * This wait is pure dead air — a measured ~700ms at p50 on the default profile,
 * about a fifth of the whole turn budget — and it is the single most
 * conversation-dependent number in the pipeline. A support line where callers
 * read out order numbers needs the long window, because cutting someone off
 * mid-digit costs a whole extra turn. A qualification bot asking yes/no
 * questions wants the short one, because there every extra 400ms is felt.
 *
 * There is no value that is right for both, which is exactly why it must not be
 * hard-coded. The agent editor picks a profile; this module is the only place
 * the numbers live, so the web transport and the phone bridge cannot drift
 * apart the way they had before (600ms in one file, 500ms in another).
 *
 * `balanced` reproduces the behaviour every existing agent has today, and is
 * what an agent with no setting stored resolves to — so nothing changes for
 * anyone until they choose to change it.
 */

/**
 * @typedef {object} TurnEndProfile
 * @property {string} id
 * @property {string} label            shown in the agent editor
 * @property {string} description      what the caller experiences
 * @property {number} endpointingMs    silence before the recognizer says "final"
 * @property {number} graceMs          confirmation window on an ordinary turn
 * @property {number} unfinishedGraceMs  confirmation window when the words dangle
 * @property {number} finishedGraceMs  confirmation window when the words have
 *                                     clearly handed over the floor (a question,
 *                                     a danda, a standalone "yes") — see
 *                                     looksFinished() in stt/deepgramStream
 */

/** @type {Record<string, TurnEndProfile>} */
export const TURN_END_PROFILES = {
  fast: {
    id: 'fast',
    label: 'Fast',
    description:
      'Replies as soon as the caller pauses. Best for short answers — yes/no, '
      + 'menu choices, confirmations. Can cut off a caller who thinks mid-sentence.',
    endpointingMs: 200,
    graceMs: 200,
    unfinishedGraceMs: 650,
    finishedGraceMs: 60,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description:
      'Waits long enough for a natural mid-sentence pause before answering. '
      + 'The default, and the right choice for most conversations.',
    endpointingMs: 250,
    graceMs: 300,
    unfinishedGraceMs: 900,
    finishedGraceMs: 120,
  },
  patient: {
    id: 'patient',
    label: 'Patient',
    description:
      'Gives the caller room to hesitate, spell a name, or read out a number '
      + 'without being interrupted. Slower to answer.',
    endpointingMs: 350,
    graceMs: 600,
    unfinishedGraceMs: 1500,
    finishedGraceMs: 250,
  },
};

export const DEFAULT_TURN_END_PROFILE = 'balanced';

/**
 * Resolve an agent's stored setting to a profile.
 *
 * An agent that has chosen a profile gets exactly that profile. An agent that
 * has not falls back to the deployment's environment tuning, so existing
 * installs keep the timings they run today. See the note in the body.
 *
 * @param {object} [settings] - the agent's parsed settings JSON
 * @returns {TurnEndProfile}
 */
export function turnEndProfileFor(settings = {}) {
  const chosen = settings?.turnEndSensitivity;
  const explicit = Boolean(chosen && TURN_END_PROFILES[chosen]);
  const base = explicit ? TURN_END_PROFILES[chosen] : TURN_END_PROFILES[DEFAULT_TURN_END_PROFILE];

  // AN EXPLICIT CHOICE IN THE EDITOR WINS OVER THE ENVIRONMENT.
  //
  // The env vars predate this setting: they were how the whole deployment was
  // tuned when there was nowhere else to put the number. If they kept
  // overriding, someone selecting "Fast" would get whatever the box happened to
  // have in .env and no indication why — and on this deployment they would
  // silently get the Balanced timing, because DEEPGRAM_ENDPOINTING_MS is
  // already set to exactly that. A control that quietly does nothing is worse
  // than no control.
  //
  // So they now apply only to agents that have NOT chosen, which keeps existing
  // deployments tuned exactly as they are today while making the new control
  // mean what it says.
  if (explicit) return { ...base };

  const override = (name, fallback) => {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : fallback;
  };

  return {
    ...base,
    endpointingMs: override('DEEPGRAM_ENDPOINTING_MS', base.endpointingMs),
    graceMs: override('DEEPGRAM_ENDPOINT_GRACE_MS', base.graceMs),
    unfinishedGraceMs: override('DEEPGRAM_UNFINISHED_GRACE_MS', base.unfinishedGraceMs),
    finishedGraceMs: override('DEEPGRAM_FINISHED_GRACE_MS', base.finishedGraceMs),
  };
}

/**
 * Detect if the last utterance from the assistant was asking a complex, high-cognitive-load
 * question (e.g. 16-digit card number, order/tracking number, policy number, address, spelling).
 *
 * When callers are asked for numbers, dates, or card details, they often hesitate, look for
 * their wallet/receipt, or pause between digit groups. A static 250ms VAD timer would cut them off.
 *
 * @param {string} [lastAssistantText]
 * @returns {boolean}
 */
export function detectCognitiveLoadQuestion(lastAssistantText) {
  if (!lastAssistantText || typeof lastAssistantText !== 'string') return false;
  const text = lastAssistantText.trim();
  if (!text) return false;

  const COGNITIVE_PATTERNS = [
    /\b(16[- ]digit|card number|account number|policy number|tracking (number|id)|order (number|id)|ssn|passport|spell your|read (out |me )?(the |your )?number|what is your (full )?address|routing number|ifsc|cvv|expiry)\b/i,
    /\b(digit|pin code|zip code|license|registration number|reference number|confirmation code|otp)\b/i,
    // Hindi / Hinglish patterns (no ASCII \b on Devanagari strings)
    /(कार्ड नंबर|खाता नंबर|पॉलिसी नंबर|ऑर्डर नंबर|आधार|पिन कोड|पता क्या है|नंबर बताइए|नंबर बोलिए|नंबर बताएं)/i,
    /\b(card number|account number|policy number|order number|aadhaar|pin code|address bataiye|number bataiye)\b/i,
  ];

  return COGNITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Dynamically adapt the turn end profile based on previous conversation context.
 * Automatically expands silence grace to 1500ms when high cognitive load is detected,
 * while keeping standard dialogue crisp and fast (200ms–250ms).
 *
 * @param {TurnEndProfile} baseProfile
 * @param {string} [lastAssistantText]
 * @returns {TurnEndProfile}
 */
export function dynamicTurnEndProfileFor(baseProfile, lastAssistantText = '') {
  if (!baseProfile) return turnEndProfileFor({});
  const isCognitive = detectCognitiveLoadQuestion(lastAssistantText);

  if (!isCognitive) {
    return { ...baseProfile };
  }

  // Dynamic expansion for complex cognitive inputs
  return {
    ...baseProfile,
    graceMs: Math.max(baseProfile.graceMs, 800),
    unfinishedGraceMs: Math.max(baseProfile.unfinishedGraceMs, 1500),
    dynamicExpanded: true,
  };
}

/**
 * Worst-case real silence before this profile commits an end of turn.
 *
 * PUBLISHED TO THE BROWSER so its RMS-VAD backstop can sit clear of the server's
 * decision. The two race on every turn and the shorter one wins, so when they
 * are maintained as separate constants in separate files, lengthening the
 * server's window silently does nothing. Deriving one from the other is what
 * stops that recurring — and it is why a per-agent profile has to be published
 * rather than assumed.
 *
 * @param {TurnEndProfile} profile
 * @returns {number}
 */
export function maxCommitMsFor(profile) {
  return profile.endpointingMs + profile.unfinishedGraceMs;
}

/** Profiles as a plain list, for the agent editor's picker. */
export const turnEndProfileList = () => Object.values(TURN_END_PROFILES);

