// The arming condition for phone barge-in.
//
// Every case here is a live bug that shipped: the agent could not be
// interrupted on a phone call at all, while the same agent interrupted
// correctly on a web call, because the bridge's idea of "the caller is hearing
// me" described this process rather than the far end.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createPlayoutWindow } from '../playoutWindow.js';

/** A window on a clock we control, so no test waits on real audio. */
const at = (start = 1_000_000) => {
  let clock = start;
  const w = createPlayoutWindow({ frameMs: 20, now: () => clock });
  return { w, advance: (ms) => { clock += ms; }, now: () => clock };
};

/** Ship `ms` of audio the way the bridge does: instantly, in 20ms frames. */
const ship = (w, ms) => { for (let i = 0; i < ms / 20; i++) w.noteFrame(); };

describe('playout window', () => {
  test('is silent before anything is spoken', () => {
    const { w } = at();
    assert.equal(w.isSpeaking(), false);
    assert.equal(w.remainingMs(), 0);
  });

  // THE BUG. A 10s reply is generated and handed to the carrier in well under a
  // second; the caller then hears it for another ~9s. Barge-in must stay armed
  // for those 9s, which is precisely the window it used to be dead for.
  test('stays speaking after generation ends, until the carrier drains', () => {
    const { w, advance } = at();
    w.beginGenerating();
    ship(w, 10_000);          // 10s of audio, shipped instantly
    advance(400);
    w.endGenerating();        // TTS done; the caller has heard 400ms of it

    assert.equal(w.isSpeaking(), true);
    assert.equal(w.remainingMs(), 9_600);

    advance(9_599);
    assert.equal(w.isSpeaking(), true, 'still 1ms of audio left to play');
    advance(1);
    assert.equal(w.isSpeaking(), false);
  });

  // THE OTHER BUG. voiceTurnStream emits one audio-start per sentence segment,
  // and segments are produced far faster than they play. Restarting the echo
  // grace on each one meant a multi-sentence reply never left the grace window.
  test('the echo grace runs from the utterance, not from each sentence', () => {
    const { w, advance } = at();
    w.beginGenerating();      // sentence 1
    ship(w, 4_000);
    advance(300);
    w.beginGenerating();      // sentence 2, 300ms later
    ship(w, 4_000);
    advance(300);
    w.beginGenerating();      // sentence 3
    ship(w, 4_000);

    // 600ms of wall clock has passed since the caller started hearing us, so a
    // 500ms grace is over — even though the newest segment began just now.
    assert.equal(w.speakingForMs(), 600);
  });

  test('a new utterance after real silence does restart the grace', () => {
    const { w, advance } = at();
    w.beginGenerating();
    ship(w, 100);
    w.endGenerating();
    advance(5_000);                      // reply played out; caller took a turn
    assert.equal(w.isSpeaking(), false);

    w.beginGenerating();
    assert.equal(w.speakingForMs(), 0);  // grace re-arms for the new reply
  });

  test('a gap in the audio is not credited as buffered playout', () => {
    const { w, advance } = at();
    w.beginGenerating();
    ship(w, 100);
    advance(5_000);          // carrier went quiet long ago
    w.noteFrame();
    // One frame, not 100ms of stale credit plus one.
    assert.equal(w.remainingMs(), 20);
  });

  test('stop() ends playback immediately — the carrier was flushed too', () => {
    const { w } = at();
    w.beginGenerating();
    ship(w, 10_000);
    w.stop();
    assert.equal(w.isSpeaking(), false);
    assert.equal(w.remainingMs(), 0);
  });

  // The bridge calls beginGenerating() again on the next turn after a barge;
  // stop() must not leave the window unable to speak again.
  test('speaks again after a barge', () => {
    const { w, advance } = at();
    w.beginGenerating();
    ship(w, 10_000);
    w.stop();
    advance(2_000);

    w.beginGenerating();
    ship(w, 1_000);
    w.endGenerating();
    assert.equal(w.isSpeaking(), true);
    assert.equal(w.remainingMs(), 1_000);
    assert.equal(w.speakingForMs(), 0);
  });

  test('defaults to the carrier frame size when none is given', () => {
    const w = createPlayoutWindow();
    w.noteFrame();
    // 160 mu-law bytes at 8kHz = 20ms, from telephonyAudio.FRAME_MS.
    assert.ok(w.remainingMs() > 15 && w.remainingMs() <= 20);
  });
});
