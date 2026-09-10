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

// Natural conjunction split points for lookahead token matching
const CONJUNCTION_LOOKAHEAD = /[,;]?\s+(?:and|but|so|because|however|although|or|yet|aur|lekin|kyunki)\s+/i;

/**
 * The "First Text Chunk" Hack:
 * Extract the first 3 to 4 words from a fresh LLM stream as soon as they form,
 * allowing streaming TTS (Cartesia, ElevenLabs Flash, Fish Audio) to begin synthesizing
 * audio immediately without waiting for a full sentence or punctuation terminator.
 *
 * @param {string} buf - accumulated text
 * @param {{ minWords?: number, maxWords?: number, minChars?: number }} [opts]
 * @returns {{ chunk: string, rest: string }}
 */
export function takeFirstSpeechChunk(buf, { minWords = 3, maxWords = 4, minChars = 14 } = {}) {
  if (!buf) return { chunk: '', rest: '' };

  const trimmed = buf.trimStart();
  if (trimmed.length < minChars) return { chunk: '', rest: buf };

  const words = trimmed.match(/\S+/g) || [];
  if (words.length < minWords) return { chunk: '', rest: buf };

  // If there's already an early sentence terminator, let normal sentence parsing handle it
  for (let i = 0; i < Math.min(trimmed.length, 30); i++) {
    if (TERMINATORS.includes(trimmed[i])) {
      return { chunk: '', rest: buf };
    }
  }

  // Count words up to target count
  const targetWordCount = Math.min(words.length, maxWords);
  let wordCount = 0;
  let cut = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === ' ' && (i > 0 && trimmed[i - 1] !== ' ')) {
      wordCount++;
      if (wordCount >= targetWordCount) {
        cut = i;
        break;
      }
    }
  }

  if (cut > 0 && trimmed.slice(0, cut).trim().length >= minChars) {
    const chunk = trimmed.slice(0, cut).trim();
    const rest = trimmed.slice(cut).trimStart();
    return { chunk, rest };
  }

  return { chunk: '', rest: buf };
}

/**
 * Take complete sentences or natural conjunction clauses currently in `buf`.
 *
 * Cuts at the LAST terminator in the buffer. If no terminator is found:
 * 1. Checks for conjunction boundaries (e.g. ", and", " but", " so") after
 *    `conjunctionMinChars` to emit clauses without waiting for end-of-sentence.
 * 2. If the buffer grows past `maxLen`, releases at the last word break.
 *
 * @param {string} buf - accumulated text
 * @param {{ maxLen?: number, minLen?: number, conjunctionSplit?: boolean, conjunctionMinChars?: number }} [opts]
 * @returns {{ chunk: string, rest: string }} `chunk` is '' when nothing is ready
 */
export function takeCompleteSentences(buf, {
  maxLen = 160,
  minLen = 12,
  conjunctionSplit = true,
  conjunctionMinChars = 35,
} = {}) {
  if (!buf) return { chunk: '', rest: '' };

  let cut = -1;
  for (let i = buf.length - 1; i >= 0; i--) {
    if (TERMINATORS.includes(buf[i])) { cut = i; break; }
  }

  // Lookahead token matching: if buffer has accumulated sufficient tokens and hits a conjunction,
  // split at the conjunction boundary to release the early clause to TTS.
  if (cut < 0 && conjunctionSplit && buf.length >= conjunctionMinChars) {
    const searchSlice = buf.slice(conjunctionMinChars - 10);
    const match = searchSlice.match(CONJUNCTION_LOOKAHEAD);
    if (match && match.index !== undefined) {
      const matchPos = (conjunctionMinChars - 10) + match.index;
      cut = matchPos;
    }
  }

  if (cut < 0 && buf.length > maxLen) cut = buf.lastIndexOf(' ');
  if (cut < 0) return { chunk: '', rest: buf };

  const chunk = buf.slice(0, cut + 1);
  // Too short to synthesize well, and the buffer is still small enough that
  // waiting costs nothing measurable — hold it for the next delta.
  if (chunk.trim().length < minLen && buf.length <= maxLen) return { chunk: '', rest: buf };

  return { chunk, rest: buf.slice(cut + 1) };
}

/**
 * Normalize one chunk for speech: markdown glyphs would be read aloud, and
 * newlines are just pauses. Returns '' when nothing speakable is left.
 *
 * `>` IS NOT IN THE MARKDOWN CLASS. It used to be, and that silently broke
 * every SSML pause tag the naturalness pass emits: `<break time="300ms"/>`
 * arrived at ElevenLabs as `<break time="300ms"/` — an unterminated tag, which
 * the parser either speaks aloud or drops along with the text after it. The
 * only `>` markdown actually uses is a blockquote marker at the START of a
 * line, so match exactly that and leave tags intact.
 * @param {string} chunk
 * @returns {string}
 */
export function cleanForSpeech(chunk) {
  return chunk
    .replace(/[*_#`]+/g, '')
    .replace(/^\s*>+\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
