// backend/src/services/voice/sentenceBuffer.js
/**
 * Shared sentence-boundary buffering for token-streaming TTS providers
 * (ElevenLabs stream-input, Fish Audio /tts/live).
 *
 * WHY THIS EXISTS AS A SHARED MODULE: LLM stream deltas are sub-word fragments
 * ("appo", "int", "ment"). An earlier version of the ElevenLabs path forwarded
 * every delta with a trailing space, so the model was asked to speak
 * "appo int ment" and whole replies came out as fluent gibberish — text
 * correct, audio not a language. Releasing only COMPLETE sentences is the fix,
 * and it is not provider-specific: every incremental-text TTS API has the same
 * contract (partial phrases degrade generation quality). Duplicating this logic
 * per provider is how that bug comes back.
 */

// Sentence terminators: ASCII, Hindi danda / double danda, and newline.
const TERMINATORS = '.!?…।॥\n';

/**
 * Take every complete sentence currently in `buf`.
 *
 * Cuts at the LAST terminator in the buffer (so several finished sentences are
 * released together rather than one per call). If the buffer grows past
 * `maxLen` with no terminator in sight — a long clause, or a model that just
 * doesn't punctuate — it releases at the last word break instead, so audio
 * still starts promptly. Never cuts mid-word.
 *
 * @param {string} buf - accumulated text
 * @param {{ maxLen?: number }} [opts] - word-break release threshold
 * @returns {{ chunk: string, rest: string }} `chunk` is '' when nothing is ready
 */
export function takeCompleteSentences(buf, { maxLen = 160 } = {}) {
  if (!buf) return { chunk: '', rest: '' };

  let cut = -1;
  for (let i = buf.length - 1; i >= 0; i--) {
    if (TERMINATORS.includes(buf[i])) { cut = i; break; }
  }
  if (cut < 0 && buf.length > maxLen) cut = buf.lastIndexOf(' ');
  if (cut < 0) return { chunk: '', rest: buf };

  return { chunk: buf.slice(0, cut + 1), rest: buf.slice(cut + 1) };
}

/**
 * Normalize one chunk for speech: markdown glyphs would be read aloud, and
 * newlines are just pauses. Returns '' when nothing speakable is left.
 * @param {string} chunk
 * @returns {string}
 */
export function cleanForSpeech(chunk) {
  return chunk.replace(/[*_#`>]+/g, '').replace(/\s+/g, ' ').trim();
}
