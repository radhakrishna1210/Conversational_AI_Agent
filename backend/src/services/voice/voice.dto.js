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
    gender: raw.ssmlGender || 'NEUTRAL',
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
  const labels = raw.labels || {};
  return {
    providerVoiceId: raw.voice_id,
    name: raw.name,
    language: labels.language || labels.Language || null,
    accent: labels.accent || labels.Accent || null,
    gender: labels.gender || labels.Gender || null,
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
