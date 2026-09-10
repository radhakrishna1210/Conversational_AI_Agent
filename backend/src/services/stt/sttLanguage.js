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

/**
 * Detects if the caller has switched language mid-call (e.g. Hindi, Hinglish, Spanish, French).
 *
 * @param {string} transcript - Speech-to-text transcript chunk
 * @param {string} currentLanguage - Current configured or active language
 * @returns {{ detected: boolean, language?: string, code?: string, provider?: string }}
 */
export function detectLanguageShift(transcript, currentLanguage = 'english') {
  if (!transcript || typeof transcript !== 'string') return { detected: false };
  const text = transcript.trim();
  if (!text) return { detected: false };

  const normCurrent = String(currentLanguage).toLowerCase().trim();

  // 1. Devanagari script presence -> Hindi / Marathi
  if (/[\u0900-\u097F]/.test(text)) {
    if (normCurrent !== 'hindi' && normCurrent !== 'hi' && normCurrent !== 'hi-in') {
      return { detected: true, language: 'hindi', code: 'hi-IN', provider: 'sarvam' };
    }
  }

  // 2. Tamil script -> Tamil
  if (/[\u0B80-\u0BFF]/.test(text)) {
    if (normCurrent !== 'tamil' && normCurrent !== 'ta' && normCurrent !== 'ta-in') {
      return { detected: true, language: 'tamil', code: 'ta-IN', provider: 'sarvam' };
    }
  }

  // 3. Telugu script -> Telugu
  if (/[\u0C00-\u0C7F]/.test(text)) {
    if (normCurrent !== 'telugu' && normCurrent !== 'te' && normCurrent !== 'te-in') {
      return { detected: true, language: 'telugu', code: 'te-IN', provider: 'sarvam' };
    }
  }

  // 4. Hinglish / Romanized Hindi keywords (requires 2+ matches or distinct Hindi markers)
  const distinctHinglish = /\b(?:namaste|dhanyawad|shukriya|theek hai|kripya|bataiye|mujhe|humko|kaise ho|kya hal hai)\b/i;
  const commonHinglish = /\b(?:kya|hai|hain|karo|karna|mera|meri|mere|nahi|nahin|suno|bolo|achha|bhai|yaar|aap|kaun|kahan|kab|kyun|lekin|aur|par|kitna|kitne)\b/gi;
  
  if (distinctHinglish.test(text) || (text.match(commonHinglish) || []).length >= 2) {
    if (normCurrent !== 'hindi' && normCurrent !== 'hi' && normCurrent !== 'hi-in' && normCurrent !== 'multi') {
      return { detected: true, language: 'hindi', code: 'hi-IN', provider: 'sarvam' };
    }
  }

  // 5. Spanish keywords
  const spanishDistinct = /\b(?:hola|gracias|por favor|buenos dias|buenas tardes|buenas noches|donde esta|como estas|necesito|ayuda|adios)\b/i;
  if (spanishDistinct.test(text) && normCurrent !== 'spanish' && normCurrent !== 'es') {
    return { detected: true, language: 'spanish', code: 'es', provider: 'deepgram' };
  }

  // 6. French keywords
  const frenchDistinct = /\b(?:bonjour|merci|s'il vous plait|sil vous plait|bonsoir|comment allez-vous|au revoir|aidez-moi)\b/i;
  if (frenchDistinct.test(text) && normCurrent !== 'french' && normCurrent !== 'fr') {
    return { detected: true, language: 'french', code: 'fr', provider: 'deepgram' };
  }

  return { detected: false };
}

/**
 * Resolves the voice profile (STT code, preferred STT provider, directive) when language is hot-swapped mid-call.
 *
 * @param {string} detectedLanguage
 * @param {object} [agent]
 * @returns {{ language: string, sttProvider: string, sttCode: string, systemPromptDirective: string }}
 */
export function resolveSwappedVoiceProfile(detectedLanguage, agent = {}) {
  const normLang = String(detectedLanguage || 'english').toLowerCase().trim();
  const entry = LANGUAGES[normLang] || { deepgram: 'en', sarvam: 'en-IN' };

  const preferredProvider = entry.sarvam && entry.sarvam !== 'unknown' ? 'sarvam' : 'deepgram';
  const sttCode = preferredProvider === 'sarvam' ? entry.sarvam : (entry.deepgram || 'en');

  return {
    language: normLang,
    sttProvider: preferredProvider,
    sttCode,
    systemPromptDirective: `[Language Note: The caller switched to ${normLang}. Respond naturally and fluently in ${normLang}.]`,
  };
}

