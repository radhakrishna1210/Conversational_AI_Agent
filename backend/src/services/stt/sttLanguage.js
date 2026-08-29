// backend/src/services/stt/sttLanguage.js
/**
 * One place that knows what an agent's language means to each speech provider.
 *
 * WHY THIS EXISTS
 *
 * The agent editor stores a DISPLAY NAME — "Hindi", "Tamil", "Multi" — because
 * that is what a person picks from a dropdown. Every provider wants a code, and
 * they do not want the same one: Deepgram takes `hi`, Sarvam takes `hi-IN`, and
 * Sarvam serves Indian locales only.
 *
 * Deepgram had a mapper. Sarvam did not, and the agent's raw setting was handed
 * to it untouched, so a Hindi agent's batch transcription requested
 * `language_code: "Hindi"` and Sarvam answered HTTP 400 with the list of codes
 * it actually accepts. That path had therefore NEVER worked for any agent with a
 * specific language set — only for "Multi", where the field was omitted
 * entirely and the failure stayed hidden.
 *
 * Keeping the two mappings in one table rather than one per provider is the
 * point. The alternative — a second map living next to the second provider — is
 * how the first one came to be missing.
 */

/**
 * Canonical languages, keyed by the lowercased display name the editor stores.
 *
 * `sarvam: null` means Sarvam does not serve that language. It is a real answer,
 * not a gap: sending an unsupported code is a hard 400, so those fall back to
 * Sarvam's own auto-detect rather than failing the turn.
 */
const LANGUAGES = {
  // "Multi" is the editor's multilingual / code-switching option, and the
  // default. Hinglish is the norm for this product, so it has to mean
  // "detect it" rather than "assume the agent's first language".
  multi:          { deepgram: 'multi',  sarvam: 'unknown' },
  multilingual:   { deepgram: 'multi',  sarvam: 'unknown' },
  auto:           { deepgram: 'multi',  sarvam: 'unknown' },

  hindi:          { deepgram: 'hi',     sarvam: 'hi-IN' },
  english:        { deepgram: 'en',     sarvam: 'en-IN' },
  // Sarvam publishes Indian English only, so every English variant maps there.
  'english (american)':   { deepgram: 'en-US', sarvam: 'en-IN' },
  'english (british)':    { deepgram: 'en-GB', sarvam: 'en-IN' },
  'english (indian)':     { deepgram: 'en-IN', sarvam: 'en-IN' },
  'english (australian)': { deepgram: 'en-AU', sarvam: 'en-IN' },

  tamil:      { deepgram: 'ta', sarvam: 'ta-IN' },
  telugu:     { deepgram: 'te', sarvam: 'te-IN' },
  kannada:    { deepgram: 'kn', sarvam: 'kn-IN' },
  malayalam:  { deepgram: 'ml', sarvam: 'ml-IN' },
  marathi:    { deepgram: 'mr', sarvam: 'mr-IN' },
  bengali:    { deepgram: 'bn', sarvam: 'bn-IN' },
  gujarati:   { deepgram: 'gu', sarvam: 'gu-IN' },
  punjabi:    { deepgram: 'pa', sarvam: 'pa-IN' },
  odia:       { deepgram: 'or', sarvam: 'od-IN' },
  assamese:   { deepgram: 'as', sarvam: 'as-IN' },
  urdu:       { deepgram: 'ur', sarvam: 'ur-IN' },
  nepali:     { deepgram: 'ne', sarvam: 'ne-IN' },
  konkani:    { deepgram: null, sarvam: 'kok-IN' },

  // Served by Deepgram, not by Sarvam — see the note on `sarvam: null` above.
  spanish:    { deepgram: 'es', sarvam: null },
  french:     { deepgram: 'fr', sarvam: null },
  german:     { deepgram: 'de', sarvam: null },
  portuguese: { deepgram: 'pt', sarvam: null },
  italian:    { deepgram: 'it', sarvam: null },
  dutch:      { deepgram: 'nl', sarvam: null },
  russian:    { deepgram: 'ru', sarvam: null },
  japanese:   { deepgram: 'ja', sarvam: null },
  korean:     { deepgram: 'ko', sarvam: null },
  mandarin:   { deepgram: 'zh', sarvam: null },
  chinese:    { deepgram: 'zh', sarvam: null },
};

/** Sarvam's own "work it out yourself" value. Valid input, unlike a bare omission. */
export const SARVAM_AUTODETECT = 'unknown';

/** Looks like a code already ("hi", "en-IN") rather than a display name. */
const isCode = (raw) => /^[a-z]{2}(-[A-Za-z]{2,})?$/.test(raw);

/**
 * Deepgram's `language` parameter for an agent's configured language.
 *
 * Re-exported from services/stt/deepgramStream.service.js, which is where every
 * existing caller imports it from.
 *
 * @param {string} [value] display name or code
 * @returns {string|undefined} undefined when nothing sensible can be said
 */
export function toDeepgramLanguage(value) {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (isCode(raw)) return raw;
  return LANGUAGES[raw.toLowerCase()]?.deepgram ?? undefined;
}

/**
 * Sarvam's `language_code` for an agent's configured language.
 *
 * Never returns something Sarvam would reject. An unknown or unsupported
 * language resolves to its auto-detect value rather than undefined, because the
 * failure being fixed is a hard 400 that killed the whole turn — a slightly
 * worse transcript is a far better outcome than none.
 *
 * @param {string} [value] display name or code
 * @returns {string} always a value Sarvam accepts
 */
export function toSarvamLanguage(value) {
  if (!value) return SARVAM_AUTODETECT;
  const raw = String(value).trim();

  // Already an Indian locale (hi-IN, ta-IN) — pass it through.
  if (/^[a-z]{2,3}-IN$/i.test(raw)) return raw.toLowerCase().replace(/-in$/, '-IN');

  const entry = LANGUAGES[raw.toLowerCase()];
  if (entry) return entry.sarvam ?? SARVAM_AUTODETECT;

  // A bare code we were not given a display name for ("hi", "ta"). Only promote
  // it when the table knows that language, so we never invent a locale.
  if (isCode(raw)) {
    const base = raw.slice(0, 2).toLowerCase();
    for (const value of Object.values(LANGUAGES)) {
      if (value.deepgram === base && value.sarvam) return value.sarvam;
    }
  }
  return SARVAM_AUTODETECT;
}

/** Exported for tests — the canonical table itself. */
export const STT_LANGUAGES = LANGUAGES;
