/**
 * The client's voice picker, as pure functions.
 *
 * A client sees one list of voices — a name and a play button each — with no
 * provider, tabs or filters. Three things have to be decided server-side for
 * that list to be usable, and all three live here so they can be tested:
 *
 *   1. WHICH voices can speak the agent's language. The stored `language` tag
 *      cannot answer that alone: a Sarvam speaker speaks every Indian language
 *      whatever its tag (the language is chosen at synthesis), and ElevenLabs
 *      runs its multilingual model, while a Google voice is bound to its locale.
 *   2. WHAT to call a voice. Google names are locale ids
 *      ("en-IN-Chirp3-HD-Despina"), and the same voice exists once per locale.
 *   3. WHAT ORDER. Mixed across providers, but stable, so paging and reopening
 *      the picker show the same list.
 */
import { normalizeLanguage, normalizeAccent, normalizeGender } from './voice.dto.js';

/** Languages Sarvam's speakers all serve — its catalogue is Indian locales. */
const SARVAM_LANGUAGES = new Set([
  'English', 'Hindi', 'Bengali', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Malayalam',
  'Marathi', 'Punjabi', 'Odia', 'Oriya', 'Assamese', 'Urdu', 'Nepali', 'Konkani',
]);

const parseJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
};

/**
 * An agent language label as the editor stores it.
 * "English (Indian)" → { language: "English", accent: "Indian" }; "Hindi" → { language: "Hindi", accent: null }
 */
export function parseAgentLanguage(label) {
  const m = /^\s*([^()]+?)\s*(?:\(([^)]+)\))?\s*$/.exec(String(label ?? ''));
  if (!m) return { language: null, accent: null };
  return {
    language: normalizeLanguage(m[1]) ?? null,
    accent: m[2] ? normalizeAccent(m[2]) : null,
  };
}

/** The provider that actually speaks a voice — a clone's host, not "Custom". */
export function speakingProvider(voice) {
  const name = voice?.provider?.name ?? voice?.providerName ?? null;
  if (name !== 'Custom') return name;
  const host = parseJson(voice?.metadata)?.clonedProvider;
  return host === 'elevenlabs' ? 'ElevenLabs' : host === 'fishaudio' ? 'FishAudio' : name;
}

/**
 * Can this voice speak `language`?
 *
 * @param {object} voice   a Voice row with `provider.name`, `language`, `metadata`
 * @param {string} language canonical name, e.g. "Hindi"
 */
export function voiceServesLanguage(voice, language) {
  if (!language) return true;
  const provider = speakingProvider(voice);
  // A workspace's own clone was made on purpose; never hide it.
  if (voice?.provider?.name === 'Custom' || voice?.providerName === 'Custom') return true;
  // ElevenLabs voices run on its multilingual model.
  if (provider === 'ElevenLabs') return true;
  if (provider === 'Sarvam') return SARVAM_LANGUAGES.has(language);

  const own = normalizeLanguage(voice?.language);
  if (own === language) return true;
  // Fish lists every language a voice was published with.
  if (provider === 'FishAudio') {
    const langs = parseJson(voice?.metadata)?.languages;
    if (Array.isArray(langs)) return langs.some((l) => normalizeLanguage(l) === language);
  }
  return false;
}

/**
 * The name a client sees.
 *   Google "en-IN-Chirp3-HD-Despina" → "Despina"; "en-IN-Wavenet-A" → "Wavenet A"
 *   "ritu" → "Ritu"; "Aoede (female)" → "Aoede"
 */
export function voiceDisplayName(name, providerName = null) {
  let out = String(name ?? '').trim();
  const locale = /^[a-z]{2,3}-[A-Za-z]{2,4}-(.+)$/.exec(out);
  if (locale && (providerName === 'Google' || providerName == null)) {
    const named = /^Chirp3-HD-(.+)$/i.exec(locale[1]);
    out = named ? named[1] : locale[1].replace(/-/g, ' ');
  }
  out = out.replace(/\s*\((?:female|male|neutral)\)\s*$/i, '').trim();
  if (!out) return 'Voice';
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * What a voice is made for, as a client reads it — in the order a voice agent
 * cares: a voice tagged both "conversational" and "narration" is offered as a
 * conversational voice. Keys are provider words normalised to lower-case with
 * hyphens (ElevenLabs "narrative_story" → "narrative-story").
 *
 * The stored `category` column is deliberately NOT shown as it stands: it holds
 * "premade" for almost every voice, and Google's tiers ("WaveNet", "Neural2").
 * It only counts when it names a use case, as Sarvam's style does. Free-text
 * descriptions are not keyword-matched either — "not suited for narration"
 * would read as a narration voice.
 */
const USE_CASES = [
  ['conversational', 'Conversational'],
  ['customer-support', 'Customer support'],
  ['customer-service', 'Customer support'],
  ['narration', 'Narration'],
  ['narrator', 'Narration'],
  ['storytelling', 'Storytelling'],
  ['narrative-story', 'Storytelling'],
  ['educational', 'Educational'],
  ['informative-educational', 'Educational'],
  ['news', 'News'],
  ['audiobook', 'Audiobook'],
  ['podcast', 'Podcast'],
  ['advertisement', 'Advertising'],
  ['advertising', 'Advertising'],
  ['meditation', 'Meditation'],
  ['social-media', 'Social media'],
  ['entertainment', 'Entertainment'],
  ['entertainment-tv', 'Entertainment'],
  ['gaming', 'Gaming'],
  ['character-voice', 'Character'],
  ['characters', 'Character'],
];

const GENDER_LABELS = { female: 'Female', male: 'Male', neutral: 'Neutral' };

/**
 * The line under a voice's name in the picker: its use case and gender, as far
 * as the provider said — "Conversational · Female", "Female", or "" when
 * neither is known. A workspace's own clone is simply "Cloned".
 *
 * @param {object} voice a Voice row with `provider.name`, `gender`, `category`, `metadata`
 * @returns {string}
 */
export function voiceCategoryLabel(voice) {
  if ((voice?.provider?.name ?? voice?.providerName) === 'Custom') return 'Cloned';

  const meta = parseJson(voice?.metadata) ?? {};
  const words = new Set();
  const add = (value) => {
    if (typeof value === 'string' && value.trim()) words.add(value.trim().toLowerCase().replace(/[\s_]+/g, '-'));
  };
  add(meta.labels?.use_case);   // ElevenLabs
  if (Array.isArray(meta.tags)) meta.tags.forEach(add); // Fish Audio
  add(meta.style);              // Sarvam
  add(voice?.category);

  const useCase = USE_CASES.find(([word]) => words.has(word))?.[1] ?? null;
  const gender = GENDER_LABELS[normalizeGender(voice?.gender)] ?? null;
  return [useCase, gender].filter(Boolean).join(' · ');
}

/** The display name for an agent's stored voice label ("Provider - Name"). */
export function voiceNameFromLabel(label) {
  const text = String(label ?? '').trim();
  if (!text) return '';
  const [provider, ...rest] = text.split(' - ');
  return rest.length ? voiceDisplayName(rest.join(' - '), provider.trim()) : voiceDisplayName(text);
}

/** FNV-1a — a stable, well-mixed order key, so the list is shuffled but repeatable. */
function orderKey(id) {
  let h = 0x811c9dc5;
  for (const ch of String(id)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Build the picker list.
 *
 * @param {object[]} voices    candidate Voice rows (provider gating already applied)
 * @param {{ languages?: string[], currentVoiceId?: string|null, q?: string }} opts
 *        `languages` are the agent's labels, primary first
 * @returns {{ id: string, name: string, category: string }[]}
 */
export function buildPickerList(voices, { languages = [], currentVoiceId = null, q = '' } = {}) {
  const wanted = languages.map(parseAgentLanguage).filter((l) => l.language);
  const primary = wanted[0] ?? null;

  const serves = (v) => wanted.length === 0 || wanted.some((l) => voiceServesLanguage(v, l.language));
  let pool = voices.filter(serves);
  // Never an empty picker because tags were thin: fall back to everything.
  if (pool.length === 0) pool = voices.slice();

  // The same voice once per locale (Google) becomes one entry: the one in the
  // agent's primary language, then its accent. Only within one provider — two
  // providers' "Priya" are different voices.
  const score = (v) => {
    let s = 0;
    if (v.id === currentVoiceId) s += 100;
    if (primary && normalizeLanguage(v.language) === primary.language) s += 10;
    if (primary?.accent && normalizeAccent(v.accent) === primary.accent) s += 5;
    return s;
  };
  const best = new Map();
  for (const v of pool) {
    const name = voiceDisplayName(v.name, speakingProvider(v));
    const key = `${speakingProvider(v) ?? ''}|${name.toLowerCase()}|${v.provider?.name === 'Custom' ? v.id : ''}`;
    const held = best.get(key);
    if (!held || score(v) > score(held.voice)) best.set(key, { voice: v, name });
  }

  let list = [...best.values()];
  const term = String(q ?? '').trim().toLowerCase();
  if (term) list = list.filter((e) => e.name.toLowerCase().includes(term));

  const isClone = (e) => (e.voice.provider?.name ?? e.voice.providerName) === 'Custom';
  list.sort((a, b) => {
    // The agent's current voice first, then this workspace's clones, then the
    // rest in a stable shuffle.
    if ((a.voice.id === currentVoiceId) !== (b.voice.id === currentVoiceId)) return a.voice.id === currentVoiceId ? -1 : 1;
    if (isClone(a) !== isClone(b)) return isClone(a) ? -1 : 1;
    return orderKey(a.voice.id) - orderKey(b.voice.id);
  });

  return list.map((e) => ({ id: e.voice.id, name: e.name, category: voiceCategoryLabel(e.voice) }));
}
