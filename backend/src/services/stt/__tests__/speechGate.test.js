// backend/src/services/stt/__tests__/speechGate.test.js
/**
 * BUG-001 verification. These are the "simulate silence / simulate background
 * noise / simulate agent-speaking overlap" cases from the bug report, expressed
 * as synthetic PCM16 so they are reproducible in CI instead of being a manual
 * mic test somebody has to remember how to perform.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSpeech, isLikelySttHallucination, classifyCallerAffect, isEchoOfAgent, stripAgentEcho, stripOverlapEcho } from '../speechGate.js';
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

// ─── Caller affect: the "I'm sorry you're frustrated" misfire ────────────────
//
// classifyCallerAffect returned 'agitated' on `peakRms >= 0.3` alone. A close
// microphone reaches that, so the agent opened replies by apologising for a
// frustration the caller did not have. Agitation now needs volume AND pressured
// delivery, well clear of ordinary loud speech.

/** Synthetic analyzeSpeech() output — only the fields the classifier reads. */
const speechStub = ({ peakRms, voicedMs = 2000, durationMs = 2200 }) => ({
  hasSpeech: true, peakRms, voicedMs, durationMs,
  longestRunMs: 200, noiseFloor: 0.01, contrast: 5,
});

/** A transcript of `n` words, so words-per-second can be controlled. */
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

test('a loud microphone alone is NOT agitation', () => {
  // 6 words over 2s of voiced audio = 3 wps... at ordinary speaking volume.
  const affect = classifyCallerAffect(speechStub({ peakRms: 0.32 }), words(6));
  assert.notEqual(affect, 'agitated');
});

test('loud AND fast still reads as agitated', () => {
  // 0.5s of voiced audio for 2 words is not enough; use a real pressured turn.
  const affect = classifyCallerAffect(
    speechStub({ peakRms: 0.6, voicedMs: 2000, durationMs: 2100 }),
    words(7), // 7 words / 2s = 3.5 wps
  );
  assert.equal(affect, 'agitated');
});

test('the reported turn is not classified as frustrated', () => {
  // "And general inquiry. Like, which" — 5 words, unremarkable pace, loud mic.
  const affect = classifyCallerAffect(
    speechStub({ peakRms: 0.34, voicedMs: 2000, durationMs: 2400 }),
    'And general inquiry. Like, which',
  );
  assert.notEqual(affect, 'agitated');
});

test('quiet speech is still detected', () => {
  const affect = classifyCallerAffect(speechStub({ peakRms: 0.02 }), words(6));
  assert.equal(affect, 'quiet');
});

// ─── Echo of the agent's own voice ──────────────────────────────────────────
//
// Deepgram reports what it hears, so streamed transcripts bypassed every
// acoustic check. That holds until what it hears is the agent's reply coming
// back through the caller's speakers — then the transcript is perfectly
// accurate and completely wrong. Reported case: the agent asked
// "...उन्हें क्या परेशानी है?" and the next "caller turn" was "पर छाती है?".

test('a verbatim Hindi echo is caught', () => {
  const agent = 'अब, क्या आप मुझे बता सकती हैं कि मरीज़ किस समस्या के लिए डॉक्टर से मिलना चाहते हैं या उन्हें क्या परेशानी है?';
  assert.equal(isEchoOfAgent('मरीज़ किस समस्या के लिए डॉक्टर से मिलना चाहते हैं', agent), true);
});

test('re-segmented echo is left to the ACOUSTIC gate, not this one', () => {
  // "परेशानी" coming back as "पर छाती" is not verbatim, so this text check
  // deliberately does NOT fire — resolving toward keeping the turn. Echo that
  // mangled is quiet echo, and quiet echo fails the voiced-speech floor in the
  // handler. Documented here so the gap is a decision, not a surprise.
  const agent = 'या उन्हें क्या परेशानी है?';
  assert.equal(isEchoOfAgent('पर छाती है?', agent), false);
});

test('an English echo of the agent is caught', () => {
  const agent = 'Would you like to book a new appointment or reschedule an existing one?';
  assert.equal(isEchoOfAgent('book a new appointment or reschedule an existing one', agent), true);
});

test('a genuine reply to the agent is NOT treated as echo', () => {
  const agent = 'Would you like to book a new appointment or reschedule an existing one?';
  for (const real of [
    'I want to book a new one',          // shares words, different sentence
    'Tuesday afternoon if possible',
    'मुझे नया अपॉइंटमेंट चाहिए',
    'Can I speak to a doctor about my knee',
  ]) {
    assert.equal(isEchoOfAgent(real, agent), false, `real turn misread as echo: "${real}"`);
  }
});

test('short acknowledgements are never treated as echo', () => {
  const agent = 'Okay, I have booked that for Tuesday at four.';
  for (const s of ['okay', 'yes', 'हाँ', 'thanks', 'sure']) {
    assert.equal(isEchoOfAgent(s, agent), false, `"${s}" must survive`);
  }
});

test('no agent text yet means nothing can be echo', () => {
  assert.equal(isEchoOfAgent('I want to book an appointment', ''), false);
});

// ─── Echoed agent words glued to the front of a real turn ───────────────────
//
// The mixed case: capture opens while the agent's last syllables are still
// playing, so the transcript is <agent tail> + <what the caller actually said>.
// isEchoOfAgent must NOT fire here (the turn contains a real request); the
// prefix has to be trimmed instead.

test('the reported mixed echo is trimmed, not discarded', () => {
  const agent = 'नमस्ते, सिटी हॉस्पिटल में कॉल करने के लिए धन्यवाद। मैं पूर्वा, आपकी कैसे मदद कर सकती हूँ?';
  const heard = 'कर सकती हूँ मुझे appointment book करना था';
  assert.equal(stripAgentEcho(heard, agent), 'मुझे appointment book करना था');
  assert.equal(isEchoOfAgent(heard, agent), false, 'must not discard a turn with real content');
});

test('an English tail is trimmed', () => {
  const agent = 'Would you like to book a new appointment or reschedule an existing one?';
  assert.equal(
    stripAgentEcho('an existing one I want to reschedule please', agent),
    'I want to reschedule please',
  );
});

test('a caller quoting the MIDDLE of the question is left alone', () => {
  // "book a new appointment" is not where the agent's sentence ended, so it is
  // not echo — deleting it would destroy the caller's actual words.
  const agent = 'Would you like to book a new appointment or reschedule an existing one?';
  const said = 'book a new appointment please';
  assert.equal(stripAgentEcho(said, agent), said);
});

test('a single shared word at the boundary is not trimmed', () => {
  const agent = 'How may I help you today?';
  assert.equal(stripAgentEcho('today I need a doctor', agent), 'today I need a doctor');
});

test('never strips the whole turn away', () => {
  const agent = 'How may I help you today?';
  const said = 'help you today';
  // Nothing would remain, so the prefix rule declines; the full-echo guard and
  // the acoustic gate own that case instead.
  assert.equal(stripAgentEcho(said, agent), said);
});

test('no previous agent turn means nothing to trim', () => {
  assert.equal(stripAgentEcho('मुझे appointment चाहिए', ''), 'मुझे appointment चाहिए');
});

// ── P4: recovering a caller who answered while the agent was still talking ──
//
// The phone bridge feeds Deepgram the inbound leg for the WHOLE reply, so an
// overlap transcript is mostly our own audio echoing back off the handset. The
// shape is "<however much of the reply the line reflected> <what the caller
// said>", which stripAgentEcho() cannot touch because the echo is not the
// agent's suffix. Getting this wrong in either direction is expensive: too
// strict and the caller's "yes" is discarded and they repeat themselves; too
// loose and the LLM answers a question nobody asked.

describe('stripOverlapEcho', () => {
  const AGENT = 'I can help you with that, let me check the schedule for you.';

  test('strips a whole echoed reply and keeps the one word the caller said', () => {
    // The case that motivated this. stripAgentEcho() leaves it untouched and
    // isEchoOfAgent() then discards the lot, losing the answer.
    assert.equal(
      stripOverlapEcho('I can help you with that let me check the schedule for you yes', AGENT),
      'yes',
    );
  });

  test('strips an echoed run from the MIDDLE of the reply, not just the end', () => {
    assert.equal(stripOverlapEcho('let me check the schedule Tuesday please', AGENT), 'Tuesday please');
  });

  test('a transcript that is entirely echo comes back empty', () => {
    assert.equal(stripOverlapEcho('I can help you with that let me check', AGENT), '');
  });

  test('leaves a transcript that shares nothing with the agent alone', () => {
    assert.equal(stripOverlapEcho('Tuesday afternoon works better', AGENT), 'Tuesday afternoon works better');
  });

  test('one shared word is coincidence, not echo, and is never stripped', () => {
    // "schedule me for Tuesday" opens with a word the agent used. Stripping a
    // single token could change the meaning of a real request.
    assert.equal(stripOverlapEcho('schedule me for Tuesday', AGENT), 'schedule me for Tuesday');
  });

  test('matching ignores case and punctuation, as the transcripts differ in both', () => {
    assert.equal(stripOverlapEcho('Let me check, the schedule — Friday?', AGENT), 'Friday?');
  });

  test('a single-token transcript is returned untouched', () => {
    assert.equal(stripOverlapEcho('schedule', AGENT), 'schedule');
  });

  test('empty inputs are pass-throughs, not throws', () => {
    assert.equal(stripOverlapEcho('', AGENT), '');
    assert.equal(stripOverlapEcho('yes please', ''), 'yes please');
    assert.equal(stripOverlapEcho(null, AGENT), '');
    assert.equal(stripOverlapEcho('yes please', null), 'yes please');
  });

  test('what survives is not itself judged an echo — the two gates agree', () => {
    // The bridge runs isEchoOfAgent() on the remainder as a second, independent
    // check. These must not contradict each other, or a recovered turn would be
    // dropped anyway and the whole recovery is dead code.
    const recovered = stripOverlapEcho('I can help you with that let me check the schedule for you yes', AGENT);
    assert.equal(isEchoOfAgent(recovered, AGENT), false);
  });

  test('is bounded against a pathological transcript', () => {
    const long = Array(5000).fill('word').join(' ');
    const started = Date.now();
    stripOverlapEcho(long, long);
    assert.ok(Date.now() - started < 500, 'must not stall the turn');
  });
});
