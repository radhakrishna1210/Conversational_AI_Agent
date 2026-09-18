// backend/src/services/voice/backChannel.js
/**
 * Fast Back-Channeling & Agreement Token Detection
 *
 * Phone calls are messy. Users frequently emit listener tokens ("yeah", "uh-huh", "ok", "haan")
 * while the bot or caller is speaking.
 *
 * Running a full multi-second LLM turn on a standalone "yeah" is expensive, slow, and introduces
 * awkward pauses. This module detects back-channel tokens with ultra-fast regex/token matching
 * (<1ms) to acknowledge or hold the floor without triggering a heavy LLM rewrite loop.
 */

// Normalized back-channel tokens across English and Hindi / Hinglish
const BACKCHANNEL_TOKENS = new Set([
  // English
  'yeah', 'yes', 'yep', 'yup', 'ok', 'okay', 'uh-huh', 'uh huh', 'uhhuh',
  'mm-hmm', 'mm hmm', 'mmhmm', 'mhm', 'got it', 'right', 'sure', 'alright',
  'understood', 'cool', 'i see', 'i hear you',
  // Hindi / Hinglish
  'हाँ', 'जी', 'जी हाँ', 'ठीक है', 'अच्छा', 'सही है', 'बिल्कुल',
  'haan', 'han', 'ji', 'ji haan', 'theek hai', 'thik hai', 'achha', 'accha',
  'sahi hai', 'bilkul', 'samjha', 'samajh gaya',
]);

const PUNCTUATION_STRIP = /[.,!?;:…\n\r"'\(\)\[\]]+/g;

/**
 * Normalizes input text into clean lowercase token sequence.
 * @param {string} text
 * @returns {string}
 */
export function normalizeBackChannelText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(PUNCTUATION_STRIP, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Check if the given transcript is a standalone back-channel utterance.
 *
 * @param {string} transcript
 * @returns {boolean}
 */
export function isStandaloneBackChannel(transcript) {
  const normalized = normalizeBackChannelText(transcript);
  if (!normalized) return false;
  return BACKCHANNEL_TOKENS.has(normalized);
}

/**
 * Detect if an utterance starts with or contains back-channel agreement tokens.
 *
 * @param {string} transcript
 * @returns {{ isBackChannel: boolean, token: string | null, isStandalone: boolean, rest: string }}
 */
export function detectBackChannel(transcript) {
  const normalized = normalizeBackChannelText(transcript);
  if (!normalized) {
    return { isBackChannel: false, token: null, isStandalone: false, rest: '' };
  }

  // Exact match
  if (BACKCHANNEL_TOKENS.has(normalized)) {
    return {
      isBackChannel: true,
      token: normalized,
      isStandalone: true,
      rest: '',
    };
  }

  // Prefix match (e.g. "Yeah, can I change my appointment?")
  for (const token of BACKCHANNEL_TOKENS) {
    if (normalized.startsWith(token + ' ')) {
      const rest = normalized.slice(token.length).trim();
      return {
        isBackChannel: true,
        token,
        isStandalone: false,
        rest,
      };
    }
  }

  return { isBackChannel: false, token: null, isStandalone: false, rest: normalized };
}
