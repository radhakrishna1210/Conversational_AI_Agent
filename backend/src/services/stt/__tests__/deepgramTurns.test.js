// backend/src/services/stt/__tests__/deepgramTurns.test.js
/**
 * BUG-001 — cross-turn transcript attribution in DeepgramStreamSession.
 *
 * Drives the session against a fake Deepgram socket so the two race conditions
 * behind the "user turn with text the caller never said" symptom are
 * reproducible without a network or an API key. Each test below FAILED against
 * the pre-fix implementation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepgramStreamSession, looksUnfinished, maxEndpointCommitMs } from '../deepgramStream.service.js';

/** Minimal stand-in for the `ws` socket the session opens. */
function fakeSocket(session) {
  const sent = [];
  session.ws = {
    readyState: 1, // WebSocket.OPEN
    send: (payload) => sent.push(payload),
    close: () => {},
    on: () => {},
  };
  session._open = true;
  session.dead = false;
  return sent;
}

/** Push a final transcript result through the session's message handling. */
function emitFinal(session, transcript, confidence = 0.95) {
  session._handleMessage({
    is_final: true,
    channel: { alternatives: [{ transcript, confidence }] },
  });
}

const emitFromFinalize = (session) => session._handleMessage({ from_finalize: true });

test('a late flush cannot swallow the next turn\'s words', async () => {
  const s = new DeepgramStreamSession({ sampleRate: 16000 });
  fakeSocket(s);

  // Turn 1: caller was silent, client sends cancel-turn. The flush is fired but
  // NOT awaited — this is exactly what the handler does.
  const seq1 = s.beginTurn();
  const pendingFlush = s.finalizeTurn(1200, seq1);

  // Turn 2 starts immediately.
  const seq2 = s.beginTurn();
  assert.notEqual(seq1, seq2);

  // Deepgram closes out turn 1's flush. Per the protocol, everything before
  // this marker is flushed audio; everything after it is new.
  emitFromFinalize(s);
  await pendingFlush;

  // The caller now speaks in turn 2.
  emitFinal(s, 'I want to book an appointment');

  // Before the fix the stale flush had already called takeTranscript() on the
  // shared buffer, so these words were discarded.
  assert.equal(s.takeTranscript(), 'I want to book an appointment');
});

test('a flush that never completes stops stealing words once it times out', async () => {
  // The failure mode the from_finalize boundary alone does not cover: if
  // Deepgram never sends the marker, the redirect would stay open for the whole
  // timeout and eat a live turn's speech. The handler bounds this by using a
  // short timeout on the fire-and-forget cancel path.
  const s = new DeepgramStreamSession({ sampleRate: 16000 });
  fakeSocket(s);

  const seq1 = s.beginTurn();
  const pendingFlush = s.finalizeTurn(30, seq1); // no from_finalize will arrive
  s.beginTurn();
  await pendingFlush;

  emitFinal(s, 'real speech after the stalled flush');
  assert.equal(s._flushTarget, null);
  assert.equal(s.takeTranscript(), 'real speech after the stalled flush');
});

test('the cancelled turn\'s trailing words do not become the next turn\'s transcript', async () => {
  const s = new DeepgramStreamSession({ sampleRate: 16000 });
  fakeSocket(s);

  const seq1 = s.beginTurn();
  const pendingFlush = s.finalizeTurn(1200, seq1);

  // Turn 2 opens...
  s.beginTurn();

  // ...and only NOW does Deepgram deliver what it heard during turn 1. Before
  // the fix this landed in the fresh buffer and was reported as turn 2's
  // transcript — a user turn containing words the caller had not said in it.
  emitFinal(s, 'leftover audio from the discarded segment');
  emitFromFinalize(s);

  const flushed = await pendingFlush;
  assert.equal(flushed, 'leftover audio from the discarded segment',
    'stale words should be harvested by the flush that owns them');
  assert.equal(s.takeTranscript(), '', 'turn 2 must start empty');
});

test('a finalize for a superseded turn is a no-op', async () => {
  const s = new DeepgramStreamSession({ sampleRate: 16000 });
  fakeSocket(s);

  const seq1 = s.beginTurn();
  s.beginTurn(); // turn 2 supersedes turn 1
  emitFinal(s, 'turn two speech');

  assert.equal(await s.finalizeTurn(1200, seq1), '');
  assert.equal(s.takeTranscript(), 'turn two speech', 'turn 2 is untouched');
});

test('the normal single-turn path still returns the transcript', async () => {
  const s = new DeepgramStreamSession({ sampleRate: 16000 });
  fakeSocket(s);

  const seq = s.beginTurn();
  emitFinal(s, 'hello');
  emitFinal(s, 'there');
  const p = s.finalizeTurn(1200, seq);
  emitFromFinalize(s);
  assert.equal(await p, 'hello there');
});

test('words arriving DURING the flush still belong to the flushed turn', async () => {
  const s = new DeepgramStreamSession({ sampleRate: 16000 });
  fakeSocket(s);

  const seq = s.beginTurn();
  emitFinal(s, 'book me');
  const p = s.finalizeTurn(1200, seq);
  emitFinal(s, 'for Tuesday'); // trailing words released by the Finalize
  emitFromFinalize(s);

  assert.equal(await p, 'book me for Tuesday');
  assert.equal(s.takeTranscript(), '');
});

// ── End-of-turn confirmation (premature-cutoff fix) ─────────────────────────
// speech_final and UtteranceEnd used to share one callback. speech_final fires
// at `endpointing` (600ms) and UtteranceEnd at 1000ms, so speech_final always
// won and the turn was ended by a raw VAD timeout that lands inside an ordinary
// mid-sentence pause. These tests pin the corrected semantics.

/** Session with a short grace window so tests don't wait on production timings. */
function endOfTurnSession(graceMs = 40) {
  const fired = [];
  const s = new DeepgramStreamSession({
    sampleRate: 16000,
    endpointGraceMs: graceMs,
    onEndOfTurn: (reason) => fired.push(reason),
  });
  fakeSocket(s);
  s.beginTurn();
  return { s, fired };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** speech_final rides along on a result that also carries a transcript. */
function emitSpeechFinal(session, transcript = 'I would like to book') {
  session._handleMessage({
    is_final: true, speech_final: true,
    channel: { alternatives: [{ transcript, confidence: 0.95 }] },
  });
}

const emitInterim = (session, transcript) => session._handleMessage({
  is_final: false, channel: { alternatives: [{ transcript, confidence: 0.9 }] },
});

test('speech_final alone does NOT end the turn immediately', () => {
  const { s, fired } = endOfTurnSession();
  emitSpeechFinal(s);
  assert.deepEqual(fired, [], 'must wait out the grace window before committing');
});

test('an unchallenged speech_final commits after the grace window', async () => {
  const { s, fired } = endOfTurnSession(40);
  emitSpeechFinal(s);
  await sleep(90);
  assert.deepEqual(fired, ['speech_final']);
});

test('resuming speech during the grace window cancels the end of turn', async () => {
  // THE REGRESSION: caller pauses mid-sentence, Deepgram emits speech_final,
  // then the caller continues. Before the fix the turn had already ended and
  // the agent was replying over the rest of their sentence.
  const { s, fired } = endOfTurnSession(60);
  emitSpeechFinal(s, 'I would like to book');
  await sleep(25);            // still inside the grace window
  emitInterim(s, 'a table for four');
  await sleep(90);
  assert.deepEqual(fired, [], 'caller was still talking — turn must stay open');
});

test('speech_final can re-arm after being cancelled', async () => {
  const { s, fired } = endOfTurnSession(40);
  emitSpeechFinal(s, 'first part');
  await sleep(15);
  emitInterim(s, 'second part');   // cancels
  await sleep(60);
  assert.deepEqual(fired, []);
  emitSpeechFinal(s, 'second part done'); // caller really stops now
  await sleep(90);
  assert.deepEqual(fired, ['speech_final']);
});

test('the transcript carried WITH speech_final does not cancel its own candidate', async () => {
  // Ordering trap: the message that sets speech_final also carries a transcript.
  // If the cancel ran after the arm, every speech_final would cancel itself and
  // the turn would only ever end on UtteranceEnd.
  const { s, fired } = endOfTurnSession(40);
  emitSpeechFinal(s, 'that is all thanks');
  await sleep(90);
  assert.deepEqual(fired, ['speech_final']);
});

test('UtteranceEnd commits immediately, with no grace window', () => {
  const { s, fired } = endOfTurnSession(5000);
  s._handleMessage({ type: 'UtteranceEnd' });
  assert.deepEqual(fired, ['utterance_end'], 'authoritative signal is not debounced');
});

test('UtteranceEnd supersedes a pending speech_final candidate (fires once)', async () => {
  const { s, fired } = endOfTurnSession(40);
  emitSpeechFinal(s);
  s._handleMessage({ type: 'UtteranceEnd' });
  await sleep(90);
  assert.deepEqual(fired, ['utterance_end'], 'must not double-fire');
});

test('beginTurn drops a stale candidate from the previous turn', async () => {
  // Otherwise the leftover timer commits an end-of-turn against the turn that
  // just started, cutting the caller off as they begin speaking.
  const { s, fired } = endOfTurnSession(40);
  emitSpeechFinal(s);
  s.beginTurn();
  await sleep(90);
  assert.deepEqual(fired, []);
});

test('close() drops a pending candidate', async () => {
  const { s, fired } = endOfTurnSession(40);
  emitSpeechFinal(s);
  s.close();
  await sleep(90);
  assert.deepEqual(fired, []);
});

test('grace of 0 restores immediate commit on speech_final', () => {
  const { s, fired } = endOfTurnSession(0);
  emitSpeechFinal(s);
  assert.deepEqual(fired, ['speech_final'], 'opt-out escape hatch still works');
});

test('low-confidence finals are dropped', () => {
  const s = new DeepgramStreamSession({ sampleRate: 16000 });
  fakeSocket(s);
  s.beginTurn();
  emitFinal(s, 'noise driven guess', 0.10);
  emitFinal(s, 'real speech', 0.92);
  assert.equal(s.takeTranscript(), 'real speech');
});

test('a final with no confidence field is trusted', () => {
  const s = new DeepgramStreamSession({ sampleRate: 16000 });
  fakeSocket(s);
  s.beginTurn();
  s._handleMessage({ is_final: true, channel: { alternatives: [{ transcript: 'kept' }] } });
  assert.equal(s.takeTranscript(), 'kept');
});

test('interim results are never harvested', () => {
  const s = new DeepgramStreamSession({ sampleRate: 16000 });
  fakeSocket(s);
  s.beginTurn();
  s._handleMessage({ is_final: false, channel: { alternatives: [{ transcript: 'partial', confidence: 0.99 }] } });
  assert.equal(s.takeTranscript(), '');
});

test('finalize times out cleanly when from_finalize never arrives', async () => {
  const s = new DeepgramStreamSession({ sampleRate: 16000 });
  fakeSocket(s);
  const seq = s.beginTurn();
  emitFinal(s, 'partial turn');
  // Short timeout so the test does not sit for the production 1200ms.
  assert.equal(await s.finalizeTurn(30, seq), 'partial turn');
  assert.equal(s._flushTarget, null, 'flush redirection must be cleared');
});

// ─── Content-aware endpointing (premature-cutoff fix) ────────────────────────
//
// The reported symptom: the caller says "And general inquiry. Like, which" and
// the agent starts replying before they finish the sentence. Silence duration
// alone cannot tell "finished" from "thinking" — people pause longest exactly
// where they are least finished — so the grace window now reads the tail of the
// transcript. Each test below FAILED against the fixed-window implementation.

test('looksUnfinished: dangling words are not turn endings', () => {
  for (const t of [
    'And general inquiry. Like, which',   // the exact reported transcript
    'I want to book an appointment for',
    'My name is',
    'Can I speak to the',
    'so',
    'मुझे अपॉइंटमेंट चाहिए और',
  ]) {
    assert.equal(looksUnfinished(t), true, `expected unfinished: "${t}"`);
  }
});

test('looksUnfinished: complete thoughts still end the turn fast', () => {
  for (const t of [
    'I want to book an appointment.',
    'Yes',
    'What are your opening hours?',
    'Tuesday at four works',
    'मुझे अपॉइंटमेंट बुक करनी है।',
  ]) {
    assert.equal(looksUnfinished(t), false, `expected finished: "${t}"`);
  }
});

test('speech_final on a dangling tail waits longer than the normal grace', async () => {
  const fired = [];
  const session = new DeepgramStreamSession({
    onEndOfTurn: (r) => fired.push(r),
    endpointGraceMs: 40,
    // set via the instance so the test does not depend on env
  });
  session.unfinishedGraceMs = 300;
  fakeSocket(session);
  session.beginTurn();

  emitInterim(session, 'And general inquiry. Like, which');
  session._handleMessage({ speech_final: true });

  // Past the NORMAL grace: a finished turn would already have committed.
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(fired, [], 'must not cut the caller off mid-sentence');

  // Past the long grace: bounded — it does commit eventually.
  await new Promise((r) => setTimeout(r, 260));
  assert.deepEqual(fired, ['speech_final:unfinished']);
});

test('a completed thought still commits on the fast path', async () => {
  const fired = [];
  const session = new DeepgramStreamSession({
    onEndOfTurn: (r) => fired.push(r),
    endpointGraceMs: 40,
  });
  session.unfinishedGraceMs = 300;
  fakeSocket(session);
  session.beginTurn();

  emitInterim(session, 'I want to book an appointment.');
  session._handleMessage({ speech_final: true });

  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(fired, ['speech_final'], 'a finished turn must stay snappy');
});

test('resuming speech cancels the pending end of turn', async () => {
  const fired = [];
  const session = new DeepgramStreamSession({
    onEndOfTurn: (r) => fired.push(r),
    endpointGraceMs: 40,
  });
  session.unfinishedGraceMs = 200;
  fakeSocket(session);
  session.beginTurn();

  emitInterim(session, 'Like, which');
  session._handleMessage({ speech_final: true });
  await new Promise((r) => setTimeout(r, 60));
  emitInterim(session, 'Like, which doctor is available');  // they carried on

  await new Promise((r) => setTimeout(r, 260));
  assert.deepEqual(fired, [], 'further speech must cancel the candidate');
});

test('UtteranceEnd defers on a dangling tail instead of committing at once', async () => {
  const fired = [];
  const session = new DeepgramStreamSession({
    onEndOfTurn: (r) => fired.push(r),
    endpointGraceMs: 40,
  });
  session.unfinishedGraceMs = 250;
  fakeSocket(session);
  session.beginTurn();

  emitInterim(session, 'I need to reschedule my');
  session._handleMessage({ type: 'UtteranceEnd' });
  assert.deepEqual(fired, [], 'UtteranceEnd must not cut a mid-thought turn');

  await new Promise((r) => setTimeout(r, 320));
  assert.deepEqual(fired, ['utterance_end:unfinished'], 'but it is still bounded');
});

test('UtteranceEnd commits immediately on a complete thought', () => {
  const fired = [];
  const session = new DeepgramStreamSession({ onEndOfTurn: (r) => fired.push(r) });
  fakeSocket(session);
  session.beginTurn();

  emitInterim(session, 'That works for me.');
  session._handleMessage({ type: 'UtteranceEnd' });
  assert.deepEqual(fired, ['utterance_end']);
});

test("a new turn is not judged by the previous turn's last words", async () => {
  const fired = [];
  const session = new DeepgramStreamSession({
    onEndOfTurn: (r) => fired.push(r),
    endpointGraceMs: 40,
  });
  session.unfinishedGraceMs = 300;
  fakeSocket(session);
  session.beginTurn();
  emitInterim(session, 'book it for');   // dangling
  session.beginTurn();                   // next turn starts

  emitInterim(session, 'Yes');
  session._handleMessage({ speech_final: true });
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(fired, ['speech_final'], 'stale tail must not slow the new turn');
});

// A one-word turn is a fragment unless the word stands alone. An enumerated
// dangling-word list will always have holes — "मुझे" was the reported one — so
// short turns are judged by shape rather than by membership.
test('looksUnfinished: a bare fragment word is not a turn', () => {
  for (const t of ['मुझे', 'I', 'The', 'appointment', 'हमें', 'Can', 'because']) {
    assert.equal(looksUnfinished(t), true, `expected unfinished: "${t}"`);
  }
});

test('looksUnfinished: one-word answers still commit fast', () => {
  for (const t of ['Yes', 'no', 'Okay.', 'हाँ', 'जी', 'नहीं', 'thanks', 'What?', 'क्या']) {
    assert.equal(looksUnfinished(t), false, `expected finished: "${t}"`);
  }
});

test('looksUnfinished: the reported Hindi fragment defers', () => {
  assert.equal(looksUnfinished('मुझे'), true);
  assert.equal(looksUnfinished('मुझे अपॉइंटमेंट बुक करनी है।'), false);
});

// The client's RMS backstop is derived from this number. If it ever drops below
// the session's real commit point, the backstop wins the race on every turn and
// the mid-thought grace window silently stops working — which is exactly what
// happened when the two were maintained as separate constants.
test('published commit budget covers the longest grace window', () => {
  const session = new DeepgramStreamSession({ endpointingMs: 600 });
  const budget = maxEndpointCommitMs(600);
  assert.ok(
    budget >= 600 + session.unfinishedGraceMs,
    `budget ${budget} must cover endpointing + unfinished grace ${session.unfinishedGraceMs}`,
  );
});
