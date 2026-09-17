/**
 * The agent fields a client is no longer allowed to set.
 *
 * A client picks a language and a voice. Which LLM reasons, which recogniser
 * listens and whether a bundled speech-to-speech engine replaces both is Super
 * Admin's decision (services/platform/modelAssignments.js), so a client save
 * carrying any of these has them removed before anything is stored.
 *
 * Removed silently rather than refused: an editor tab opened before this
 * shipped re-sends every field on every save, and turning each of those saves
 * into an error would lock people out of renaming their own agent.
 *
 * What an agent ALREADY has stored is untouched — an update never writes these
 * columns, so an existing agent keeps running the model it was saved with.
 */

/** Agent table columns that chose a model. */
export const CLIENT_LOCKED_COLUMNS = Object.freeze(['aiModel', 'transcription']);

/**
 * Settings-JSON keys that chose a model or configured one. `sttSilenceTimeoutMs`
 * came from the same Transcription picker; the browser test call still reads a
 * saved value, which is kept, but a client can no longer change it.
 */
export const CLIENT_LOCKED_SETTINGS = Object.freeze(['sttProvider', 'sttLanguage', 'sttSilenceTimeoutMs', 'voiceEngine']);

/**
 * Remove the locked fields from a split agent payload.
 *
 * @param {{ columns: object, extras: object }} payload
 * @returns {{ columns: object, extras: object, dropped: string[] }} new objects;
 *          the input is not mutated
 */
export function stripClientModelFields({ columns = {}, extras = {} } = {}) {
  const outColumns = { ...columns };
  const outExtras = { ...extras };
  const dropped = [];
  for (const key of CLIENT_LOCKED_COLUMNS) {
    if (key in outColumns) { delete outColumns[key]; dropped.push(key); }
  }
  for (const key of CLIENT_LOCKED_SETTINGS) {
    if (key in outExtras) { delete outExtras[key]; dropped.push(key); }
  }
  return { columns: outColumns, extras: outExtras, dropped };
}

/**
 * What a copy of an agent inherits from its source, so that "Create an Inbound
 * copy" of an agent behaves like the agent it was copied from — the one path
 * through which a new agent may carry a model the platform default did not
 * pick. Server-side on purpose: the client names the source agent, it does not
 * get to say what that agent runs.
 *
 * @param {{ aiModel?: string, transcription?: string, settings?: string }} source
 * @returns {{ columns: { aiModel: string, transcription: string }, settings: object }}
 */
export function inheritedModelFields(source) {
  let settings = {};
  try { settings = JSON.parse(source?.settings || '{}') || {}; } catch { settings = {}; }
  const inherited = {};
  for (const key of CLIENT_LOCKED_SETTINGS) {
    if (settings[key] !== undefined) inherited[key] = settings[key];
  }
  return {
    columns: {
      aiModel: typeof source?.aiModel === 'string' ? source.aiModel : '',
      transcription: typeof source?.transcription === 'string' ? source.transcription : '',
    },
    settings: inherited,
  };
}

/**
 * Two stored language lists, compared as the runtime reads them.
 * @param {string|string[]|null|undefined} a
 * @param {string|string[]|null|undefined} b
 */
export function sameLanguages(a, b) {
  const parse = (v) => {
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
  };
  return JSON.stringify(parse(a)) === JSON.stringify(parse(b));
}
