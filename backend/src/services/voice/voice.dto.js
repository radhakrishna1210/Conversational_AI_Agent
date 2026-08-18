// backend/src/services/voice/voice.dto.js
/**
 * VoiceDTO – normalises raw provider responses into a common shape before
 * writing to the database or returning from the API.
 *
 * @typedef {Object} VoiceDTO
 * @property {string}  providerVoiceId – the provider's own identifier
 * @property {string}  name            – human-readable voice name
 * @property {string}  [language]      – e.g. "English"
 * @property {string}  [accent]        – e.g. "Indian" or locale code "en-IN"
 * @property {string}  [gender]        – "MALE" | "FEMALE" | "NEUTRAL"
 * @property {string}  [category]      – e.g. "Standard" | "Neural" | "Chirp" | "premade"
 * @property {string}  [metadata]      – JSON string with provider-specific extras
 */

// ─── Google locale parser ─────────────────────────────────────────────────────

/**
 * Maps IETF language tags to human-readable values used in the UI.
 * Format: "en-IN" → { language: "English", accent: "Indian" }
 */
const LANGUAGE_MAP = {
  af: 'Afrikaans', ar: 'Arabic', bg: 'Bulgarian', bn: 'Bengali', ca: 'Catalan',
  cmn: 'Chinese (Mandarin)', cs: 'Czech', cy: 'Welsh', da: 'Danish', de: 'German',
  el: 'Greek', en: 'English', es: 'Spanish', et: 'Estonian', eu: 'Basque',
  fi: 'Finnish', fil: 'Filipino', fr: 'French', gl: 'Galician', gu: 'Gujarati',
  he: 'Hebrew', hi: 'Hindi', hr: 'Croatian', hu: 'Hungarian', id: 'Indonesian',
  is: 'Icelandic', it: 'Italian', ja: 'Japanese', ka: 'Georgian', km: 'Khmer',
  kn: 'Kannada', ko: 'Korean', lo: 'Lao', lt: 'Lithuanian', lv: 'Latvian',
  ml: 'Malayalam', mr: 'Marathi', ms: 'Malay', my: 'Burmese', nb: 'Norwegian',
  ne: 'Nepali', nl: 'Dutch', pa: 'Punjabi', pl: 'Polish', pt: 'Portuguese',
  ro: 'Romanian', ru: 'Russian', si: 'Sinhala', sk: 'Slovak', sq: 'Albanian',
  sr: 'Serbian', su: 'Sundanese', sv: 'Swedish', sw: 'Swahili', ta: 'Tamil',
  te: 'Telugu', th: 'Thai', tr: 'Turkish', uk: 'Ukrainian', ur: 'Urdu',
  vi: 'Vietnamese', yue: 'Cantonese', zu: 'Zulu',
};

const REGION_MAP = {
  AF: 'Afghan', AE: 'UAE', AR: 'Argentine', AU: 'Australian', AT: 'Austrian',
  BE: 'Belgian', BD: 'Bangladeshi', BR: 'Brazilian', BG: 'Bulgarian',
  CA: 'Canadian', CH: 'Swiss', CL: 'Chilean', CN: 'Chinese', CO: 'Colombian',
  CZ: 'Czech', DE: 'German', DK: 'Danish', EG: 'Egyptian', ES: 'Spanish',
  ET: 'Ethiopian', FI: 'Finnish', FR: 'French', GB: 'British', GH: 'Ghanaian',
  GR: 'Greek', HK: 'Hong Kong', HU: 'Hungarian', ID: 'Indonesian', IE: 'Irish',
  IL: 'Israeli', IN: 'Indian', IQ: 'Iraqi', IT: 'Italian', JO: 'Jordanian',
  JP: 'Japanese', KE: 'Kenyan', KR: 'Korean', KW: 'Kuwaiti', LK: 'Sri Lankan',
  LB: 'Lebanese', LY: 'Libyan', MA: 'Moroccan', MX: 'Mexican', MY: 'Malaysian',
  NG: 'Nigerian', NL: 'Dutch', NO: 'Norwegian', NZ: 'New Zealand', OM: 'Omani',
  PE: 'Peruvian', PH: 'Filipino', PK: 'Pakistani', PL: 'Polish', PT: 'Portuguese',
  QA: 'Qatari', RO: 'Romanian', RU: 'Russian', SA: 'Saudi', SG: 'Singaporean',
  SE: 'Swedish', SY: 'Syrian', TH: 'Thai', TN: 'Tunisian', TR: 'Turkish',
  TW: 'Taiwanese', TZ: 'Tanzanian', UA: 'Ukrainian', US: 'American',
  UZ: 'Uzbek', VE: 'Venezuelan', VN: 'Vietnamese', YE: 'Yemeni', ZA: 'South African',
  ZW: 'Zimbabwean',
};

// ─── Cross-provider label normalisation ──────────────────────────────────────
//
// Every provider labels voices differently: Google emits BCP-47 locales
// ("en-IN"), ElevenLabs emits free text from whoever published the voice
// ("english"/"en", "indian"), Cartesia emits bare codes ("en"). listVoices()
// filters `language` with an exact match, so without a single canonical form
// the language dropdown silently returns nothing for anything but Google.
// Everything below funnels those variants into the same human-readable names
// LANGUAGE_MAP / REGION_MAP already produce.

/** Reverse lookups: "english" → "English", "indian" → "Indian". */
const LANGUAGE_BY_NAME = new Map();
for (const name of Object.values(LANGUAGE_MAP)) {
  if (!LANGUAGE_BY_NAME.has(name.toLowerCase())) LANGUAGE_BY_NAME.set(name.toLowerCase(), name);
}
const REGION_BY_NAME = new Map();
for (const name of Object.values(REGION_MAP)) {
  if (!REGION_BY_NAME.has(name.toLowerCase())) REGION_BY_NAME.set(name.toLowerCase(), name);
}

/** "us-southern" → "Us Southern"; used when no map entry matches. */
function titleCase(str) {
  return str
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Canonicalise a language label from any provider.
 * Accepts codes ("en"), locales ("en-IN"), or names ("english", "English").
 * @param {string|null|undefined} raw
 * @returns {string|null} e.g. "English", or null when there's nothing to map
 */
export function normalizeLanguage(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  if (LANGUAGE_MAP[lower]) return LANGUAGE_MAP[lower];        // "en"
  if (LANGUAGE_BY_NAME.has(lower)) return LANGUAGE_BY_NAME.get(lower); // "english"

  const code = lower.split(/[-_]/)[0];                        // "en-IN" → "en"
  if (LANGUAGE_MAP[code]) return LANGUAGE_MAP[code];

  return titleCase(trimmed);
}

/**
 * Canonicalise an accent/region label from any provider.
 * Accepts region codes ("IN"), locales ("en-IN"), or names ("indian").
 * @param {string|null|undefined} raw
 * @returns {string|null} e.g. "Indian", or null when there's nothing to map
 */
export function normalizeAccent(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  if (REGION_BY_NAME.has(lower)) return REGION_BY_NAME.get(lower);     // "indian"
  if (trimmed.length === 2 && REGION_MAP[trimmed.toUpperCase()]) {     // "IN"
    return REGION_MAP[trimmed.toUpperCase()];
  }

  const parts = lower.split(/[-_]/);                                    // "en-IN" → "IN"
  if (parts.length > 1) {
    const region = parts[parts.length - 1].toUpperCase();
    if (REGION_MAP[region]) return REGION_MAP[region];
  }

  return titleCase(trimmed);
}

/**
 * Canonicalise gender to lowercase so it compares equal across providers
 * (Google emits "FEMALE", ElevenLabs "Female", Sarvam "female").
 * @param {string|null|undefined} raw
 * @returns {string|null} "male" | "female" | "neutral" | other lowercase value
 */
export function normalizeGender(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;
  if (lower === 'feminine') return 'female';
  if (lower === 'masculine') return 'male';
  return lower;
}

/**
 * Parses a Google TTS locale code (e.g. "en-IN-Wavenet-A") into
 * { language, accent } using human-readable names.
 * @param {string} locale  Full voice name or BCP-47 tag like "en-IN"
 * @returns {{ language: string, accent: string }}
 */
export function parseGoogleLocale(locale) {
  if (!locale) return { language: 'Unknown', accent: 'Unknown' };
  // e.g. "en-IN-Wavenet-A" or "en-IN"
  const parts = locale.split('-');
  const langCode = (parts[0] || '').toLowerCase();
  const regionCode = (parts[1] || '').toUpperCase();
  return {
    language: LANGUAGE_MAP[langCode] || langCode,
    accent: REGION_MAP[regionCode] || regionCode || 'Standard',
  };
}

// ─── Normalisation helpers ────────────────────────────────────────────────────

/**
 * Normalise a Google TTS voice entry into VoiceDTO.
 * @param {Object} raw – voice object from @google-cloud/text-to-speech listVoices()
 * @returns {VoiceDTO}
 */
export function fromGoogleVoice(raw) {
  // raw.name e.g. "en-IN-Chirp3-HD-Despina"
  // raw.languageCodes e.g. ["en-IN"]
  // raw.ssmlGender e.g. "FEMALE" | "MALE" | "NEUTRAL"
  // raw.naturalSampleRateHertz
  const locale = (raw.languageCodes && raw.languageCodes[0]) || raw.name || '';
  const { language, accent } = parseGoogleLocale(locale);

  // Detect category from name pattern
  let category = 'Standard';
  const nameLower = (raw.name || '').toLowerCase();
  if (nameLower.includes('chirp3-hd')) category = 'Chirp HD';
  else if (nameLower.includes('chirp')) category = 'Chirp';
  else if (nameLower.includes('neural2')) category = 'Neural2';
  else if (nameLower.includes('wavenet')) category = 'WaveNet';
  else if (nameLower.includes('polyglot')) category = 'Polyglot';
  else if (nameLower.includes('news')) category = 'News';
  else if (nameLower.includes('studio')) category = 'Studio';

  return {
    providerVoiceId: raw.name,
    name: raw.name,
    language,
    accent,
    gender: normalizeGender(raw.ssmlGender) || 'neutral',
    category,
    metadata: JSON.stringify({
      locale,
      naturalSampleRateHertz: raw.naturalSampleRateHertz,
      languageCodes: raw.languageCodes,
      rawGender: raw.ssmlGender,
    }),
  };
}

/**
 * Normalise an ElevenLabs voice entry into VoiceDTO.
 * @param {Object} raw – voice object from ElevenLabs GET /voices
 * @returns {VoiceDTO}
 */
export function fromElevenLabsVoice(raw) {
  // raw.voice_id, raw.name, raw.labels, raw.category, raw.description
  // Labels are free text supplied by whoever published the voice, so they
  // arrive in every casing and shape ("english"/"en"/"English", "indian").
  // Normalise so Voice Library additions filter alongside Google/Sarvam voices.
  const labels = raw.labels || {};
  return {
    providerVoiceId: raw.voice_id,
    name: raw.name,
    language: normalizeLanguage(labels.language || labels.Language),
    accent: normalizeAccent(labels.accent || labels.Accent),
    gender: normalizeGender(labels.gender || labels.Gender),
    category: raw.category || 'premade',
    metadata: JSON.stringify({
      description: raw.description || null,
      labels,
      previewUrl: raw.preview_url || null,
      fineTuning: raw.fine_tuning || null,
    }),
  };
}

/**
 * Normalise a Sarvam voice entry into VoiceDTO.
 * @param {Object} raw – voice object from Sarvam GET /voices
 * @returns {VoiceDTO}
 */
export function fromSarvamVoice(raw) {
  let gender = null;
  if (raw.gender === 'female' || raw.gender === 'feminine') gender = 'female';
  else if (raw.gender === 'male' || raw.gender === 'masculine') gender = 'male';
  else if (raw.gender) gender = raw.gender.toLowerCase();

  // Extract base language (e.g., hi-IN -> Hindi)
  let language = raw.language_code || 'en-IN';
  let accent = null;
  const parts = language.split('-');
  if (parts.length > 0) {
    language = LANGUAGE_MAP[parts[0].toLowerCase()] || parts[0];
    if (parts[1]) {
      accent = REGION_MAP[parts[1].toUpperCase()] || parts[1];
    }
  }

  return {
    providerVoiceId: raw.name,
    name: raw.name,
    language,
    accent,
    gender,
    category: raw.style || 'conversational',
    metadata: JSON.stringify({
      language_code: raw.language_code,
      style: raw.style,
      tone: raw.tone,
      rawGender: raw.gender
    }),
  };
}

/**
 * Normalise a Cartesia voice entry into VoiceDTO.
 * @param {Object} raw – voice object from Cartesia GET /voices
 * @returns {VoiceDTO}
 */
export function fromCartesiaVoice(raw) {
  let gender = null;
  if (raw.gender === 'feminine' || raw.gender === 'female') gender = 'female';
  else if (raw.gender === 'masculine' || raw.gender === 'male') gender = 'male';
  else if (raw.gender) gender = raw.gender.toLowerCase();

  return {
    providerVoiceId: raw.id,
    name: raw.name || 'Unknown Voice',
    language: raw.language || 'en',
    accent: null,
    gender,
    category: raw.is_public ? 'premade' : 'custom',
    metadata: JSON.stringify({
      originalGender: raw.gender,
      description: raw.description,
      country: raw.country,
      is_owner: raw.is_owner,
      is_public: raw.is_public,
      created_at: raw.created_at,
    }),
  };
}

/**
 * Normalise one Fish Audio voice model into a VoiceDTO.
 *
 * Fish's model library returns TTS "models" (including instant clones), keyed by
 * `_id` — which is exactly the value passed back as `reference_id` on every
 * synthesis call, so it is persistent and reusable rather than per-request.
 *
 * Field names are handled defensively: the list-models reference page 404s, so
 * the response shape here was inferred from the create-model docs (`_id`,
 * `title`, `state`, `visibility`, `train_mode`) and must be confirmed against a
 * live account — see scripts/probe-fish.js.
 *
 * @param {object} raw
 * @returns {import('./voice.dto.js').VoiceDTO}
 */
export function fromFishAudioVoice(raw, { preferLanguages = [] } = {}) {
  const langs = Array.isArray(raw.languages)
    ? raw.languages.filter((l) => typeof l === 'string')
    : (typeof raw.language === 'string' ? [raw.language] : []);

  // Fish voices are frequently MULTILINGUAL (e.g. ["es","pt","en","hi"]) but the
  // Voice table has one indexed `language` column, and that column is what the
  // picker filters on. Taking langs[0] blindly filed a voice that speaks Hindi
  // under "Spanish", so a Hindi agent could never find it. The full list is
  // always kept in metadata.
  //
  // The voice's OWN first language wins whenever this deployment serves it:
  // Fish lists a model's languages primary-first, so a Hindi voice tagged
  // ["hi","en"] IS a Hindi voice. Consulting our preference order first instead
  // filed EVERY multilingual voice under whichever of ours ranked highest — with
  // FISH_VOICE_LANGUAGES=en,hi that labelled the entire catalogue "English" and
  // left the picker's language filter offering English and nothing else.
  // Only when we don't serve the voice's own primary does preference order
  // decide, which is what keeps a Spanish-primary Hindi speaker reachable.
  const prefs = preferLanguages.map((p) => String(p).trim().toLowerCase());
  const speaks = (p) => langs.some((l) => l.toLowerCase() === p || l.toLowerCase().startsWith(`${p}-`));
  const ownPrimary = typeof langs[0] === 'string' ? langs[0].toLowerCase().split(/[-_]/)[0] : null;
  const primary = (ownPrimary && prefs.includes(ownPrimary) ? langs[0] : prefs.find(speaks))
    ?? langs[0];
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
  // Fish has no dedicated gender field on a model; when absent, a conventional
  // gender tag is the only signal. Anything else stays null rather than guessed.
  const genderRaw = raw.gender
    || tags.find((t) => /^(male|female|neutral|masculine|feminine)$/i.test(t))
    || null;

  // Fish reports BARE language codes ("en", "ar"), not locales ("en-US"), so a
  // language value must never be fed to normalizeAccent: it reads a 2-letter
  // string as a REGION code, which turned an Arabic voice ("ar") into accent
  // "Argentine" and an English one ("en") into the junk value "En". Only derive
  // an accent from a real locale, or from an explicit accent field.
  const localeForAccent = raw.accent
    || (typeof primary === 'string' && /[-_]/.test(primary) ? primary : null);

  return {
    providerVoiceId: raw._id || raw.id,
    name: raw.title || raw.name || 'Unknown Voice',
    // MUST canonicalise: listVoices filters on these columns, so a raw "en-US"
    // here would make the voice invisible to the picker's language filter.
    language: normalizeLanguage(primary),
    accent: normalizeAccent(localeForAccent),
    gender: normalizeGender(genderRaw),
    category: raw.visibility === 'public' ? 'premade' : 'custom',
    metadata: JSON.stringify({
      description: raw.description ?? null,
      tags,
      languages: langs,
      visibility: raw.visibility ?? null,
      state: raw.state ?? null,
      trainMode: raw.train_mode ?? null,
      author: raw.author?.nickname ?? raw.author?.name ?? null,
      likeCount: raw.like_count ?? null,
    }),
  };
}
