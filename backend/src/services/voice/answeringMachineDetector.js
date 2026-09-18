// backend/src/services/voice/answeringMachineDetector.js
/**
 * Smart Answering Machine Detection (AMD)
 *
 * Distinguishes between human pick-ups and automated answering machines / voicemails.
 * - Human pick-up: Short, punchy opening (e.g. "Hello?", "Yes?", "Who is this?") followed by silence.
 * - Machine greeting: Extended continuous speech (e.g. "Hi, you have reached... please leave a message after the beep").
 */

const VOICEMAIL_PHRASES = [
  /\b(?:leave\s+(?:a\s+)?message)\b/i,
  /\b(?:after\s+the\s+(?:beep|tone))\b/i,
  /\b(?:at\s+the\s+tone)\b/i,
  /\b(?:not\s+available\s+to\s+take\s+your\s+call)\b/i,
  /\b(?:please\s+record\s+your\s+message)\b/i,
  /\b(?:mailbox\s+is\s+full)\b/i,
  /\b(?:forwarded\s+to\s+an\s+automated\s+voice)\b/i,
  /\b(?:press\s+\d\s+to)\b/i,
];

const HUMAN_GREETINGS = [
  /^(?:hello|hi|hey|yes|speaking|who is this|hello speaking|yeah)\??$/i,
];

/**
 * Creates an AMD session for the initial 2–4 seconds of an outbound/inbound call.
 */
export function createAnsweringMachineDetector(options = {}) {
  const maxEvalWindowMs = options.maxEvalWindowMs || 3500;
  const longSpeechDurationMs = options.longSpeechDurationMs || 1800;

  const startedAt = Date.now();
  let accumulatedTranscript = '';
  let speechDurationMs = 0;
  let evaluated = false;
  let result = null;

  /**
   * Feed incoming ASR transcript and speech segment duration into the detector.
   * @param {string} text
   * @param {number} [segmentDurationMs]
   */
  function processUtterance(text, segmentDurationMs = 0) {
    if (evaluated) return result;

    accumulatedTranscript = (accumulatedTranscript + ' ' + (text || '')).trim();
    speechDurationMs += segmentDurationMs;
    const elapsed = Date.now() - startedAt;

    // 1. Check for distinct voicemail phrase keywords
    for (const pattern of VOICEMAIL_PHRASES) {
      if (pattern.test(accumulatedTranscript)) {
        evaluated = true;
        result = {
          isMachine: true,
          confidence: 0.95,
          reason: 'phrase_match',
          transcript: accumulatedTranscript,
        };
        return result;
      }
    }

    // 2. Check for human short greeting
    for (const pattern of HUMAN_GREETINGS) {
      if (pattern.test(accumulatedTranscript)) {
        evaluated = true;
        result = {
          isMachine: false,
          confidence: 0.90,
          reason: 'human_short_burst',
          transcript: accumulatedTranscript,
        };
        return result;
      }
    }

    // 3. Long continuous speech without turn-yielding -> Machine greeting
    if (speechDurationMs >= longSpeechDurationMs || accumulatedTranscript.split(/\s+/).length >= 15) {
      evaluated = true;
      result = {
        isMachine: true,
        confidence: 0.85,
        reason: 'long_greeting',
        transcript: accumulatedTranscript,
      };
      return result;
    }

    // 4. If window expired and no machine traits found, assume human
    if (elapsed >= maxEvalWindowMs) {
      evaluated = true;
      result = {
        isMachine: false,
        confidence: 0.75,
        reason: 'eval_window_elapsed_human_default',
        transcript: accumulatedTranscript,
      };
      return result;
    }

    return { isMachine: false, pending: true, transcript: accumulatedTranscript };
  }

  return {
    processUtterance,
    isComplete: () => evaluated,
    getResult: () => result,
  };
}
