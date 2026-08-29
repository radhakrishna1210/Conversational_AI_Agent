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
 * @property {number} graceMs          confirmation window on a finished-sounding turn
 * @property {number} unfinishedGraceMs  confirmation window when the words dangle
 */

/** @type {Record<string, TurnEndProfile>} */
export const TURN_END_PROFILES = {
  fast: {
    id: 'fast',
    label: 'Fast',
    description:
      'Replies as soon as the caller pauses. Best for short answers — yes/no, '
      + 'menu choices, confirmations. Can cut off a caller who thinks mid-sentence.',
    endpointingMs: 250,
    graceMs: 250,
    unfinishedGraceMs: 800,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description:
      'Waits long enough for a natural mid-sentence pause before answering. '
      + 'The default, and the right choice for most conversations.',
    endpointingMs: 300,
    graceMs: 400,
    unfinishedGraceMs: 1100,
  },
  patient: {
    id: 'patient',
    label: 'Patient',
    description:
      'Gives the caller room to hesitate, spell a name, or read out a number '
      + 'without being interrupted. Slower to answer.',
    endpointingMs: 400,
    graceMs: 700,
    unfinishedGraceMs: 1600,
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
