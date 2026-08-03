// backend/src/services/stt/__tests__/speechGate.test.js
/**
 * BUG-001 verification. These are the "simulate silence / simulate background
 * noise / simulate agent-speaking overlap" cases from the bug report, expressed
 * as synthetic PCM16 so they are reproducible in CI instead of being a manual
 * mic test somebody has to remember how to perform.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSpeech, isLikelySttHallucination } from '../speechGate.js';
import { AMBIENT_PRESETS, createAmbienceSource, ULAW_FRAME_BYTES } from '../../voice/ambience.js';

const SR = 24000;

/** Build a PCM16 mono buffer from a per-sample generator returning -1..1. */
function pcm(durationMs, gen) {
  const n = Math.floor((SR * durationMs) / 1000);
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, gen(i / SR, i)));
    buf.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  return buf;
}

/**
 * Speech-like signal: a ~120Hz glottal pulse train (rich in harmonics, so the
 * zero-crossing rate lands in the voiced band) shaped by a ~4Hz syllable
 * envelope, which is what gives real speech its energy contrast between
 * syllables.
 *
 * The envelope floor is 0.3, NOT 0 — connected speech stays voiced across
 * syllable boundaries and its syllabic modulation is roughly 10dB, not
 * infinite. An earlier version of this generator gated fully to silence
 * between syllables, which made a 400ms word read as only 160ms of voiced
 * audio: harsher than anything a real caller produces, and it would have
 * pushed the detector's thresholds down to where genuine noise gets through.
 */
function speechGen(amplitude = 0.35) {
  return (t) => {
    const syllable = 0.3 + 0.7 * Math.abs(Math.sin(2 * Math.PI * 4 * t)); // 4 syllables/sec
    let s = 0;
    for (let h = 1; h <= 6; h++) s += Math.sin(2 * Math.PI * 120 * h * t) / h;
    return s * 0.4 * syllable * amplitude;
  };
}

// Deterministic PRNG so a failure is always reproducible.
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

test('digital silence is not speech', () => {
  const r = analyzeSpeech(pcm(3000, () => 0), SR);
  assert.equal(r.hasSpeech, false);
  assert.equal(r.voicedMs, 0);
});

test('near-silence with dither is not speech', () => {
  // What an open mic in a quiet room actually looks like.
  const r = analyzeSpeech(pcm(3000, () => (rand() * 2 - 1) * 0.002), SR);
  assert.equal(r.hasSpeech, false);
});

test('steady broadband room noise is not speech, even when loud', () => {
  // An air conditioner / fan / open window. RMS here is ABOVE the client VAD's
  // old fixed 0.025 threshold, which is exactly why that threshold produced
  // phantom turns. The adaptive floor nets it out.
  const r = analyzeSpeech(pcm(4000, () => (rand() * 2 - 1) * 0.08), SR);
  assert.equal(r.hasSpeech, false, `voicedMs=${r.voicedMs} snr=${r.contrast.toFixed(2)}`);
});

test('every REAL ambience preset is not speech (BUG-003 interaction)', () => {
  // The actual beds now mixed into the phone leg, not an approximation of them.
  // If any preset reads as speech, ambience would trip the agent's own VAD and
  // make BUG-001 (phantom turns on silence) worse instead of being neutral.
  // A preset whose gain was set too hot fails here rather than on a live call.
  for (const preset of Object.keys(AMBIENT_PRESETS)) {
    const src = createAmbienceSource(preset);
    const frames = 100; // 2s of bed at 8kHz
    const buf = Buffer.alloc(frames * ULAW_FRAME_BYTES * 2);
    for (let f = 0; f < frames; f++) {
      const frame = src.nextFrame();
      for (let i = 0; i < frame.length; i++) {
        buf.writeInt16LE(frame[i], (f * ULAW_FRAME_BYTES + i) * 2);
      }
    }
    const r = analyzeSpeech(buf, 8000);
    assert.equal(
      r.hasSpeech,
      false,
      `${preset}: voicedMs=${r.voicedMs} contrast=${r.contrast.toFixed(2)} peak=${r.peakRms.toFixed(4)}`,
    );
  }
});

test('steady mains-frequency hum is not speech, at any level', () => {
  // Worst case for the contrast gate: perfectly steady AND low-ZCR, so neither
  // discriminator gets help from the other. Loud enough to dwarf a soft talker.
  const r = analyzeSpeech(pcm(4000, (t) => 0.15 * Math.sin(2 * Math.PI * 100 * t)), SR);
  assert.equal(r.hasSpeech, false, `voicedMs=${r.voicedMs} contrast=${r.contrast.toFixed(2)}`);
});

test('an office noise bed (hum + hiss) is not speech', () => {
  const r = analyzeSpeech(pcm(4000, (t) => 0.05 * Math.sin(2 * Math.PI * 120 * t) + (rand() * 2 - 1) * 0.03), SR);
  assert.equal(r.hasSpeech, false, `voicedMs=${r.voicedMs} contrast=${r.contrast.toFixed(2)}`);
});

test('distant babble is not speech (hardest negative case)', () => {
  // Muffled conversation elsewhere in the room: low-passed, and slowly
  // modulated so it has more contrast than any other noise source. This is the
  // narrowest margin the gate has (~1.48 vs the 1.6 threshold) and is pinned
  // here so that any future retune that erodes it fails loudly.
  let lp = 0;
  const r = analyzeSpeech(pcm(4000, (t) => {
    lp = lp * 0.85 + (rand() * 2 - 1) * 0.06;
    return lp * (0.6 + 0.4 * Math.abs(Math.sin(2 * Math.PI * 3 * t)));
  }), SR);
  assert.equal(r.hasSpeech, false, `voicedMs=${r.voicedMs} contrast=${r.contrast.toFixed(2)}`);
});

test('a single transient (keystroke / chair creak) is not speech', () => {
  // Loud but 15ms long — cannot reach MIN_RUN_MS no matter how loud.
  const r = analyzeSpeech(pcm(3000, (t) => (t > 1.0 && t < 1.015 ? (rand() * 2 - 1) * 0.9 : 0)), SR);
  assert.equal(r.hasSpeech, false);
});

test('several scattered transients still are not speech', () => {
  // Guards the "sum of blips clears the total-duration bar" loophole: without
  // the contiguous-run requirement these would add up past MIN_VOICED_MS.
  const r = analyzeSpeech(pcm(4000, (t) => {
    const inBlip = [0.5, 1.2, 1.9, 2.6, 3.3].some((c) => t > c && t < c + 0.02);
    return inBlip ? (rand() * 2 - 1) * 0.8 : 0;
  }), SR);
  assert.equal(r.hasSpeech, false, `voicedMs=${r.voicedMs} runMs=${r.longestRunMs}`);
});

test('normal speech is detected', () => {
  const r = analyzeSpeech(pcm(2500, speechGen()), SR);
  assert.equal(r.hasSpeech, true, `voicedMs=${r.voicedMs} runMs=${r.longestRunMs}`);
});

test('quiet speech over room noise is still detected', () => {
  // The case a naive "raise the threshold" fix breaks: a soft talker on a noisy
  // line. Speech must survive at a realistic ~12dB SNR.
  const speech = speechGen(0.20);
  const r = analyzeSpeech(pcm(2500, (t, i) => speech(t, i) + (rand() * 2 - 1) * 0.02), SR);
  assert.equal(r.hasSpeech, true, `voicedMs=${r.voicedMs} snr=${r.contrast.toFixed(2)}`);
});

test('a short single word is detected', () => {
  // "Yes." — the shortest thing a caller can usefully say. If this fails the
  // gate has become a barge-in / yes-no killer.
  const speech = speechGen();
  const r = analyzeSpeech(pcm(1200, (t, i) => (t > 0.4 && t < 0.8 ? speech(t, i) : 0)), SR);
  assert.equal(r.hasSpeech, true, `voicedMs=${r.voicedMs} runMs=${r.longestRunMs}`);
});

test('speech with a long silent lead-in and tail is detected', () => {
  // The real shape of a turn: the segment opens while the caller is still
  // deciding to talk, and the VAD hangover leaves silence at the end.
  const speech = speechGen();
  const r = analyzeSpeech(pcm(5000, (t, i) => (t > 2.0 && t < 3.2 ? speech(t, i) : (rand() * 2 - 1) * 0.003)), SR);
  assert.equal(r.hasSpeech, true, `voicedMs=${r.voicedMs}`);
});

test('agent TTS echo residual is not speech', () => {
  // Simulates the agent's own voice leaking back through imperfect echo
  // cancellation: speech-shaped (so ZCR alone cannot reject it) but heavily
  // attenuated, which is what AEC leaves behind. It must sit below the
  // absolute floor.
  const r = analyzeSpeech(pcm(3000, speechGen(0.02)), SR);
  assert.equal(r.hasSpeech, false, `voicedMs=${r.voicedMs} peak=${r.peakRms.toFixed(4)}`);
});

test('degenerate inputs do not throw', () => {
  assert.equal(analyzeSpeech(Buffer.alloc(0), SR).hasSpeech, false);
  assert.equal(analyzeSpeech(null, SR).hasSpeech, false);
  assert.equal(analyzeSpeech(Buffer.alloc(10), 0).hasSpeech, false);
  assert.equal(analyzeSpeech(Buffer.alloc(2), SR).hasSpeech, false); // one sample
});

test('unambiguous artifacts are flagged even when the audio had speech', () => {
  for (const t of ['Thanks for watching!', 'Please subscribe', '.', '。', 'y',
    'Subtitles by the Amara.org community', '[BLANK_AUDIO]', '謝謝觀看', 'उपशीर्षक']) {
    assert.equal(isLikelySttHallucination(t, { audioHadSpeech: true }), true,
      `expected artifact: ${t}`);
  }
});

test('ambiguous backchannels are flagged ONLY when the audio was silent', () => {
  // The two-signal rule: text alone is not enough to drop these.
  for (const t of ['Thank you.', 'okay', 'you', 'Bye.', 'hmm', 'धन्यवाद', '謝謝']) {
    assert.equal(isLikelySttHallucination(t, { audioHadSpeech: false }), true,
      `should drop on silence: ${t}`);
    assert.equal(isLikelySttHallucination(t, { audioHadSpeech: true }), false,
      `should KEEP when the caller actually spoke: ${t}`);
  }
});

test('real caller utterances are never flagged', () => {
  for (const t of ['I want to book an appointment', 'yes please', 'no', 'hello there',
    'my order number is 4471', 'can you repeat that', 'thank you, that works',
    'okay so I need to reschedule']) {
    for (const audioHadSpeech of [true, false]) {
      assert.equal(isLikelySttHallucination(t, { audioHadSpeech }), false,
        `wrongly flagged: ${t}`);
    }
  }
});

test('empty and whitespace-only transcripts are flagged', () => {
  for (const t of ['', '   ', '\n\t', null, undefined]) {
    assert.equal(isLikelySttHallucination(t), true);
  }
});
