// backend/src/services/stt/speechGate.js
/**
 * Server-side "did a human actually speak in this segment?" gate (BUG-001).
 *
 * WHY THIS EXISTS
 * ---------------
 * The modular web-call handler had exactly one silence gate, and it was
 * conditional on Deepgram:
 *
 *     if (!streamedText && (dgListened || audioMs < 400)) -> discard
 *
 * `dgListened` is false whenever the streaming STT is not actually up — no
 * DEEPGRAM_API_KEY, the session died mid-call, or the TLS handshake was still
 * in flight when the turn started. Those are not edge cases; the whole
 * batch-STT fallback path exists *because* they happen. On that path a
 * noise-only segment longer than 400ms sailed straight into batch STT, and
 * every batch STT engine in the pipeline (ElevenLabs, Sarvam, Whisper-family)
 * hallucinates stock filler when handed near-silence. That phantom text became
 * a user turn, the LLM answered it, and the caller watched the agent talk —
 * usually apologising for not understanding — while they had said nothing.
 *
 * So the gate has to be able to answer the question WITHOUT Deepgram, from the
 * PCM the handler already has buffered in memory.
 *
 * WHY LOUDNESS IS THE WRONG QUESTION
 * ----------------------------------
 * A plain RMS threshold cannot separate speech from steady broadband noise —
 * fan hum, an air conditioner, residual echo of the agent's own TTS, or the
 * synthesized background ambience. Those are exactly the signals that were
 * tripping the client's fixed 0.025 RMS VAD, and no choice of constant fixes
 * it, because room noise is routinely LOUDER than a soft talker. Raising the
 * threshold to reject the noise rejects the caller too.
 *
 * What actually separates the two is that speech is MODULATED and noise is
 * STEADY. Three cheap measures, applied together:
 *
 *  - MODULATION CONTRAST (primary). Ratio of the segment's loud level to its
 *    own quiet level. Steady sources sit near 1.0-1.5 regardless of volume;
 *    speech sits above 1.7 even when uninterrupted, and far higher the moment
 *    there is a pause. This is the discriminator that does not care how loud
 *    the room is.
 *  - ZERO-CROSSING RATE. Speech occupies a middle band (~0.01-0.40 crossings
 *    per sample). White/broadband noise sits near 0.5, and pure hum or DC drift
 *    near 0. This alone eliminates hiss and keystrokes outright — measured,
 *    white noise yields zero voiced frames — leaving contrast to handle the
 *    low-frequency steady sources that slip through.
 *  - ADAPTIVE FRAME THRESHOLD. The per-frame speech/quiet cut is the geometric
 *    midpoint between the segment's own quiet and loud levels, so it tracks the
 *    room instead of assuming one.
 *
 * A frame counts as voiced only if it clears the threshold AND lands in the ZCR
 * band. The segment counts as speech only if it is loud enough to not be echo
 * residual, modulated enough to not be a noise source, and has both enough
 * total voiced audio and one unbroken run to not be scattered transients.
 *
 * LATENCY
 * -------
 * O(n) with ~4 ops per sample over audio that is already in memory, run once
 * per turn on the ~400ms-20s buffer. A 5s 24kHz segment is 120k samples —
 * well under a millisecond. It also runs only on the path that was about to
 * make a multi-hundred-millisecond batch-STT network call, and when it says
 * "silence" it REMOVES that call. Net effect on the latency budget is
 * negative (faster), which is the whole point: the fix must not become the
 * "AI is thinking" pause it was meant to prevent.
 */

/** 20ms analysis frames — long enough for a stable RMS, short enough to
 *  resolve word boundaries. */
const FRAME_MS = 20;

/** Absolute noise floor (normalized 0..1 RMS). Nothing below this is speech at
 *  any SNR — it guards against a pathologically quiet segment where the
 *  adaptive floor would otherwise collapse toward zero and make dither look
 *  like a voice. */
const ABS_RMS_FLOOR = 0.012;

/**
 * MODULATION CONTRAST — the primary speech/noise discriminator.
 *
 * The ratio between the segment's loud level (95th percentile frame RMS) and
 * its quiet level (20th percentile). This, not absolute loudness, is what
 * actually separates the two populations:
 *
 *   steady noise (fan, hiss, hum, ambience bed)   contrast ~1.0-1.5
 *   continuous speech (no pauses, 10dB syllabic)  contrast ~2.5-3.5
 *   speech with any pause at all                  contrast >>10
 *
 * Loudness cannot do this job: room noise is routinely louder than a soft
 * talker, which is precisely why the client's fixed 0.025 RMS threshold was
 * firing on ambience. Steadiness is the invariant — a noise source that
 * modulated like speech would be speech.
 *
 * Calibrated against the measured corpus in __tests__/speechGate.test.js
 * (p95/p20 of frame RMS):
 *
 *   100Hz hum, steady                1.00      \
 *   white noise                      1.06       |  noise population
 *   office bed (hum + hiss)          1.06       |
 *   low-passed ambience bed          1.35       |
 *   distant babble (hardest)         1.48      /
 *   ------------------------------- 1.6 -------------------------------
 *   smooth-AM synthetic speech       1.79      \  speech population
 *   quiet speech over room noise     1.77      /
 *
 * 1.6 sits in the gap. The synthetic speech used to set the lower bound is a
 * SMOOTH amplitude-modulated tone, which is the most benign speech-like signal
 * there is; real speech has stops, plosives and closures and runs well above
 * it. So the margin on the speech side is understated and the margin on the
 * noise side is real.
 *
 * KNOWN LIMIT: distant babble at 1.48 is the closest call, and it is the
 * classic hard case for every VAD ever built (it is, after all, speech — just
 * not the caller's). This gate is deliberately the LAST line of defence behind
 * Deepgram's model-based endpointing, not the primary detector, so a narrow
 * margin there is acceptable; the cost of a miss is one batch-STT call, and
 * the hallucination filter still has to pass before any turn is created.
 */
const MIN_CONTRAST = 1.6;

/** Zero-crossing rate band that speech occupies (crossings per sample).
 *  Below: DC drift / low-frequency rumble. Above: broadband noise or hiss. */
const ZCR_MIN = 0.008;
const ZCR_MAX = 0.42;

/** Total voiced audio required before the segment counts as speech. Below a
 *  syllable's worth there is nothing for the LLM to answer anyway. */
const MIN_VOICED_MS = 200;

/**
 * ...and at least one UNBROKEN voiced run this long, so isolated transient
 * frames cannot sum their way past MIN_VOICED_MS.
 *
 * Three frames, not more. This is a BACKSTOP to MIN_VOICED_MS, not a second
 * duration test: measured against continuous speech, the longest run above the
 * frame threshold is only ~60ms, because on a segment with no pauses the
 * threshold sits at the geometric midpoint and the "runs" it measures are
 * individual syllable peaks rather than whole words. Requiring a word-length
 * run there rejected ordinary uninterrupted speech. The transient cases this
 * exists to catch (a keystroke, a click, a chair creak) are 15-20ms — a single
 * frame — and are additionally rejected by both MIN_VOICED_MS and the ZCR band,
 * since transients are broadband.
 */
const MIN_RUN_MS = 60;

/** Percentile of frame energies taken as the noise floor. The 20th percentile
 *  is below the inter-word gaps of continuous speech yet above the very
 *  quietest dither, so it is stable for both a silent segment and a segment
 *  that is speech end to end. */
const FLOOR_PERCENTILE = 0.2;

/** Percentile taken as the "loud" level. The 95th, not the maximum: a single
 *  click or a mic bump must not be able to define the segment's loud level and
 *  thereby manufacture contrast out of an otherwise silent turn. */
const PEAK_PERCENTILE = 0.95;

/**
 * Analyze a raw little-endian PCM16 mono buffer for human speech.
 *
 * @param {Buffer} pcm - little-endian signed 16-bit mono samples
 * @param {number} sampleRate
 * @returns {{
 *   hasSpeech: boolean,
 *   durationMs: number,
 *   voicedMs: number,
 *   longestRunMs: number,
 *   noiseFloor: number,
 *   peakRms: number,
 *   contrast: number,
 * }}
 */
export function analyzeSpeech(pcm, sampleRate) {
  const empty = {
    hasSpeech: false, durationMs: 0, voicedMs: 0, longestRunMs: 0,
    noiseFloor: 0, peakRms: 0, contrast: 0,
  };
  if (!pcm?.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return empty;

  const totalSamples = Math.floor(pcm.length / 2);
  const durationMs = (totalSamples / sampleRate) * 1000;
  const frameSamples = Math.max(1, Math.floor((sampleRate * FRAME_MS) / 1000));
  const frameCount = Math.floor(totalSamples / frameSamples);
  if (frameCount < 1) return { ...empty, durationMs };

  const rmsPerFrame = new Float32Array(frameCount);
  const zcrPerFrame = new Float32Array(frameCount);

  for (let f = 0; f < frameCount; f++) {
    const start = f * frameSamples;
    let sumSquares = 0;
    let crossings = 0;
    let prev = pcm.readInt16LE(start * 2);
    sumSquares += prev * prev;
    for (let i = 1; i < frameSamples; i++) {
      const s = pcm.readInt16LE((start + i) * 2);
      sumSquares += s * s;
      // Sign change = zero crossing. Treat 0 as positive so a run of digital
      // silence does not register as a crossing on every sample.
      if ((s < 0) !== (prev < 0)) crossings++;
      prev = s;
    }
    rmsPerFrame[f] = Math.sqrt(sumSquares / frameSamples) / 32768; // normalize 0..1
    zcrPerFrame[f] = crossings / frameSamples;
  }

  const sorted = Float32Array.from(rmsPerFrame).sort();
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const noiseFloor = at(FLOOR_PERCENTILE);
  const peakRms = at(PEAK_PERCENTILE);
  const contrast = noiseFloor > 0 ? peakRms / noiseFloor : Infinity;

  // Frame threshold: the GEOMETRIC midpoint between the quiet and loud levels —
  // i.e. halfway in the log/dB domain, which is how energy contrast actually
  // behaves. Using a fixed multiple of the noise floor instead was the bug: on
  // a segment that is speech end to end, the floor is measured on speech (there
  // are no silent frames to measure), so demanding floor x N rejected the very
  // signal it was supposed to pass. The midpoint self-scales: on a silent-gap
  // segment it sits just above the silence, on a continuous one it sits between
  // the syllable troughs and peaks. Never below the absolute floor, so a
  // pathologically quiet segment can't have dither promoted to "speech".
  const threshold = Math.max(ABS_RMS_FLOOR, Math.sqrt(noiseFloor * peakRms));

  let voicedFrames = 0;
  let run = 0;
  let longestRun = 0;
  for (let f = 0; f < frameCount; f++) {
    const loud = rmsPerFrame[f] > threshold;
    const speechLike = zcrPerFrame[f] >= ZCR_MIN && zcrPerFrame[f] <= ZCR_MAX;
    if (loud && speechLike) {
      voicedFrames++;
      run++;
      if (run > longestRun) longestRun = run;
    } else {
      run = 0;
    }
  }

  const voicedMs = voicedFrames * FRAME_MS;
  const longestRunMs = longestRun * FRAME_MS;

  // All four conditions must hold for the segment to count as a real turn:
  //  1. loud enough that it isn't silence, dither or AEC echo residual;
  //  2. modulated like speech rather than steady like a noise source;
  //  3. enough total voiced audio to be worth answering;
  //  4. at least one run long enough to be a word, so scattered transients
  //     cannot accumulate their way to (3).
  const hasSpeech = peakRms >= ABS_RMS_FLOOR
    && contrast >= MIN_CONTRAST
    && voicedMs >= MIN_VOICED_MS
    && longestRunMs >= MIN_RUN_MS;

  return {
    hasSpeech, durationMs, voicedMs, longestRunMs, noiseFloor, peakRms,
    contrast: Number.isFinite(contrast) ? contrast : 0,
  };
}

/**
 * Stock text that batch STT engines emit when handed silence or noise.
 *
 * These are training-set artifacts: the models were trained on subtitle corpora,
 * so with no speech to transcribe they fall back on the most common caption in
 * that corpus. They are well documented for Whisper and its derivatives and we
 * see the same behaviour from ElevenLabs and Sarvam. Every one of these is
 * longer than the 2-character guard in voiceTurnStream, which is why they were
 * getting through and being answered as if the caller had said them.
 *
 * Matching is on a normalized form (lowercased, punctuation and whitespace
 * stripped) so "Thank you." / "thank you!" / "Thank You" all collapse together.
 */
/**
 * ALWAYS-REJECT tier. Nobody phones a voice agent and says only this. These are
 * unambiguously transcription artifacts, so they are dropped whether or not the
 * audio analysis thought it heard speech.
 */
const ARTIFACTS_ALWAYS = new Set([
  'thanksforwatching', 'thankyouforwatching', 'thankyouwatching',
  'pleasesubscribe', 'subscribe', 'youtube', 'seeyounexttime',
  'subtitlesbytheamaraorgcommunity', 'transcriptionbycastingwordscom',
  'subtitlesbyamaraorgcommunity', 'copyright', 'endofvideo',
  'music', 'applause', 'silence', 'foreign', 'blank_audio', 'blankaudio',
  'inaudible', 'backgroundnoise',
  // CJK subtitle artifacts from multilingual models
  '謝謝觀看', '請不吝點贊', 'ご視聴ありがとうございました', '字幕由amaraorg社群提供',
  // Indic subtitle artifacts (Sarvam / multilingual Whisper)
  'उपशीर्षक', 'अमराओआरजी',
]);

/**
 * REJECT-ONLY-IF-THE-AUDIO-WAS-SILENT tier.
 *
 * These are the most common things STT invents on silence, but they are ALSO
 * ordinary conversational backchannels a caller genuinely says — "okay",
 * "thank you", "bye", "hmm". Dropping them unconditionally would break normal
 * turn-taking (the agent would ignore a caller who says "yes, thanks"), which
 * is its own reliability bug. So they only count as artifacts when the acoustic
 * analysis independently found no voiced speech in the segment.
 *
 * That two-signal requirement — the audio says silence AND the text is a known
 * silence-artifact — is what makes the filter safe to apply at all.
 */
const ARTIFACTS_IF_SILENT = new Set([
  'thankyou', 'thankyouverymuch', 'thankyousomuch', 'thanks', 'thank',
  'bye', 'byebye', 'goodbye', 'okay', 'ok', 'you', 'yeah', 'oh',
  'mm', 'mmm', 'hmm', 'uh', 'um', 'ah', 'huh', 'so', 'the', 'a',
  'seeyou', 'hello', 'hi',
  'धन्यवाद', 'शुक्रिया', 'नमस्ते', 'हाँ', 'जी',
  '謝謝', 'はい', 'ありがとう',
]);

/** Strip everything that is not a letter, digit or combining mark, in any
 *  script. Marks (\p{M}) must be KEPT: in Devanagari the vowel signs and the
 *  virama are combining marks, so dropping them turned "धन्यवाद" into "धनयवद"
 *  and the artifact list never matched. Punctuation and whitespace still go. */
const normalizeForMatch = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '');

/**
 * Is this transcript almost certainly an STT artifact rather than something the
 * caller actually said?
 *
 * Matches only on an EXACT normalized match of the WHOLE transcript — a
 * substring match would strip "thank you" out of "thank you, I'd like to book
 * for Tuesday" and mangle real turns.
 *
 * @param {string} text - the transcript to judge
 * @param {object} [opts]
 * @param {boolean} [opts.audioHadSpeech=false] - did analyzeSpeech() find voiced
 *   speech in the same segment? When true, the ambiguous backchannel tier is
 *   NOT applied, so a caller who really says "okay" is heard.
 * @returns {boolean}
 */
export function isLikelySttHallucination(text, { audioHadSpeech = false } = {}) {
  if (!text) return true;
  const normalized = normalizeForMatch(text);
  if (!normalized) return true;            // punctuation only, e.g. "." or "。"
  if (normalized.length < 2) return true;  // a single character is never a turn
  if (ARTIFACTS_ALWAYS.has(normalized)) return true;
  if (!audioHadSpeech && ARTIFACTS_IF_SILENT.has(normalized)) return true;
  return false;
}

export const __testing = {
  FRAME_MS, ABS_RMS_FLOOR, MIN_CONTRAST, ZCR_MIN, ZCR_MAX,
  MIN_VOICED_MS, MIN_RUN_MS, normalizeForMatch,
};

/**
 * Lightweight caller-affect heuristic from signals we already compute — the
 * analyzeSpeech() acoustics of the turn's PCM plus the transcript. No model,
 * no extra latency (<1ms of arithmetic). Deepgram's realtime streaming API
 * exposes no prosody/sentiment for live audio (its sentiment analysis is
 * batch-only), so this is derived locally.
 *
 * Returns one of 'rushed' | 'hesitant' | 'agitated' | 'quiet' | null (neutral /
 * not enough signal). Deliberately coarse: it feeds a TONE HINT into the LLM
 * prompt and small TTS delivery tweaks, where an occasional wrong label reads
 * as natural variation, not an error.
 */
export function classifyCallerAffect(speech, transcript = '') {
  if (!speech?.hasSpeech || !transcript?.trim()) return null;
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return null; // too short to judge
  const wps = speech.voicedMs > 400 ? words.length / (speech.voicedMs / 1000) : 0;
  const pauseRatio = speech.durationMs > 0 ? 1 - speech.voicedMs / speech.durationMs : 0;
  const disfluencies = words.filter((w) => /^(u+h+m*|u+m+|e+r+m*|h+m+|अं+|अच्छा|हम+)$/i.test(w.replace(/[.,!?]/g, ''))).length;

  if (wps >= 3.8) return 'rushed';
  if (disfluencies >= 2 || (pauseRatio > 0.65 && words.length >= 6)) return 'hesitant';
  if (speech.peakRms >= 0.3) return 'agitated';
  if (speech.peakRms > 0 && speech.peakRms < 0.04) return 'quiet';
  return null;
}
