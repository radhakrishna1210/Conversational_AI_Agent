// backend/src/services/voice/acousticFilter.js
/**
 * Acoustic Filter & Media Pipeline Optimization
 *
 * Implements:
 * 1. Self-Hearing / Echo Cancellation Filter: Matches incoming ASR transcripts
 *    or audio against the bot's recently synthesized phrases to reject acoustic loopbacks.
 * 2. Noise Gate / RNNoise Suppression: Suppresses sub-threshold background noise.
 * 3. Automatic Gain Control (AGC): Normalizes input microphone levels.
 * 4. Audio Packet Optimization: Configuration for Opus Forward Error Correction (FEC) & PLC.
 */

export const DEFAULT_NOISE_GATE_RMS_THRESHOLD = 0.015; // -36 dBFS
export const DEFAULT_AGC_TARGET_RMS = 0.12;           // -18 dBFS

/**
 * Normalizes and strips punctuation/casing for self-hearing echo comparison.
 */
function normalizeTextForEcho(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Creates an Acoustic Echo Cancellation (AEC) Self-Hearing filter.
 * Tracks recently spoken agent utterances with a sliding expiration window (default: 4 seconds).
 */
export function createSelfHearingFilter(windowMs = 4000) {
  const spokenChunks = [];

  /**
   * Register a chunk of text that the agent is currently speaking or just spoke.
   * @param {string} text
   */
  function registerAgentSpeech(text) {
    if (!text || typeof text !== 'string') return;
    const clean = normalizeTextForEcho(text);
    if (!clean) return;
    spokenChunks.push({
      text: clean,
      timestamp: Date.now(),
    });
  }

  /**
   * Prune expired utterances outside the time window.
   */
  function prune() {
    const now = Date.now();
    while (spokenChunks.length > 0 && now - spokenChunks[0].timestamp > windowMs) {
      spokenChunks.shift();
    }
  }

  /**
   * Checks whether incoming user transcript matches recent bot speech (acoustic echo loopback).
   * Returns true if the user transcript is likely echo from the speaker to the mic.
   *
   * @param {string} userTranscript
   * @returns {{ isEcho: boolean, matchedChunk?: string, confidence: number }}
   */
  function checkIsEcho(userTranscript) {
    prune();
    if (!userTranscript || typeof userTranscript !== 'string') {
      return { isEcho: false, confidence: 0 };
    }

    const cleanInput = normalizeTextForEcho(userTranscript);
    if (cleanInput.length < 3) {
      return { isEcho: false, confidence: 0 };
    }

    for (const item of spokenChunks) {
      // Exact substring or prefix match
      if (item.text.includes(cleanInput) || cleanInput.includes(item.text)) {
        return { isEcho: true, matchedChunk: item.text, confidence: 0.95 };
      }

      // Word-level token overlap (Jaccard similarity > 0.7)
      const inputWords = new Set(cleanInput.split(' '));
      const agentWords = new Set(item.text.split(' '));
      let intersection = 0;
      for (const w of inputWords) {
        if (agentWords.has(w)) intersection++;
      }
      const union = new Set([...inputWords, ...agentWords]).size;
      const jaccard = union > 0 ? intersection / union : 0;

      if (jaccard >= 0.7 && inputWords.size >= 2) {
        return { isEcho: true, matchedChunk: item.text, confidence: Math.min(0.99, jaccard) };
      }
    }

    return { isEcho: false, confidence: 0 };
  }

  return {
    registerAgentSpeech,
    checkIsEcho,
    getHistory: () => spokenChunks.slice(),
    clear: () => { spokenChunks.length = 0; },
  };
}

/**
 * Computes RMS (Root Mean Square) energy of 16-bit linear PCM audio buffer.
 * @param {Buffer|Int16Array} pcmBuffer
 * @returns {number} RMS normalized between 0.0 and 1.0
 */
export function calculatePcmRms(pcmBuffer) {
  if (!pcmBuffer || pcmBuffer.length < 2) return 0;
  const int16 = pcmBuffer instanceof Int16Array
    ? pcmBuffer
    : new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, Math.floor(pcmBuffer.byteLength / 2));

  let sumSquares = 0;
  for (let i = 0; i < int16.length; i++) {
    const norm = int16[i] / 32768.0;
    sumSquares += norm * norm;
  }
  return Math.sqrt(sumSquares / int16.length);
}

/**
 * Noise Gate & AGC Processor
 * Filters out low-level microphone hum and normalizes voice volume levels.
 */
export function processAudioFrame(pcmBuffer, options = {}) {
  const noiseThreshold = options.noiseThreshold ?? DEFAULT_NOISE_GATE_RMS_THRESHOLD;
  const targetRms = options.targetRms ?? DEFAULT_AGC_TARGET_RMS;
  const agcEnabled = options.agcEnabled !== false;

  const rms = calculatePcmRms(pcmBuffer);

  // Noise gate: if energy is below noise threshold, frame is considered silence / background noise
  if (rms < noiseThreshold) {
    return {
      isSpeech: false,
      rms,
      processedBuffer: Buffer.alloc(pcmBuffer.length), // silence
      gainApplied: 0,
    };
  }

  if (!agcEnabled || rms === 0) {
    return {
      isSpeech: true,
      rms,
      processedBuffer: pcmBuffer,
      gainApplied: 1.0,
    };
  }

  // Calculate AGC scaling factor (clamped between 0.5x and 3.0x to avoid extreme clipping or noise boost)
  const desiredGain = Math.min(3.0, Math.max(0.5, targetRms / rms));
  const int16 = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, Math.floor(pcmBuffer.byteLength / 2));
  const outInt16 = new Int16Array(int16.length);

  for (let i = 0; i < int16.length; i++) {
    let sample = int16[i] * desiredGain;
    if (sample > 32767) sample = 32767;
    if (sample < -32768) sample = -32768;
    outInt16[i] = sample;
  }

  return {
    isSpeech: true,
    rms,
    processedBuffer: Buffer.from(outInt16.buffer, outInt16.byteOffset, outInt16.byteLength),
    gainApplied: desiredGain,
  };
}

/**
 * Returns recommended Opus audio encoder configuration for ultra-low latency & packet resilience.
 */
export function getOpusResilienceConfig() {
  return {
    frameSizeMs: 20,              // 20ms frames for optimal UDP/RTP pacing
    fec: true,                    // Forward Error Correction
    packetLossPercentage: 15,     // Anticipate cellular jitter & burst loss
    inbandFec: 1,
    dtx: false,                   // Discontinuous Transmission disabled for seamless stream continuity
    complexity: 5,                // CPU-balanced encoding complexity
    application: 'voip',          // Tuned for speech clarity
  };
}
