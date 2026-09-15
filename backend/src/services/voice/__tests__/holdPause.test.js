// What these pin: the model's [[HOLD]] marker is found however the token stream
// fragments it, at most one hold is honoured per reply, a hold with nothing said
// before it is ignored, and the marker itself never survives into anything a
// caller hears or a person reads — including when the agent has no hold length.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLD_MARKER, createHoldMarkerScanner, splitAtHold, stripHoldMarkers, holdPauseSecFor, holdPromptRule,
} from '../holdPause.js';
import { stripSpeechMarkup } from '../disfluency.js';

const PRE = 'Theek hai, ek minute — main manager se check karke batati hoon, line par rahiye. ';
const POST = ' Ji, manager se baat ho gayi. Aapke liye special rate — Deluxe Rs 1,800 per night.';
const REPLY = `${PRE}${HOLD_MARKER}${POST}`;

/** Feed `deltas` through one scanner and gather what it released, in order. */
function scan(deltas, opts) {
  const s = createHoldMarkerScanner(opts);
  let before = '';
  let after = '';
  let holds = 0;
  for (const d of deltas) {
    const r = s.push(d);
    if (holds) after += r.before; else before += r.before;
    if (r.hold) holds += 1;
    after += r.after;
  }
  const tail = s.flush();
  if (holds) after += tail; else before += tail;
  return { before, after, holds };
}

describe('createHoldMarkerScanner', () => {
  test('a marker split across two tokens is found and never released', () => {
    const r = scan([`${PRE}[[HO`, `LD]]${POST}`]);
    assert.equal(r.holds, 1);
    assert.equal(r.before, PRE);
    assert.equal(r.after, POST);
  });

  test('every way of cutting the reply into two tokens gives the same result', () => {
    for (let i = 1; i < REPLY.length; i++) {
      const r = scan([REPLY.slice(0, i), REPLY.slice(i)]);
      assert.equal(r.holds, 1, `cut at ${i}`);
      assert.equal(`${r.before}|${r.after}`, `${PRE}|${POST}`, `cut at ${i}`);
    }
  });

  test('one character per token still yields exactly one hold', () => {
    const r = scan([...REPLY]);
    assert.equal(r.holds, 1);
    assert.equal(r.before + r.after, PRE + POST);
    assert.ok(!/HOLD|\[\[|\]\]/.test(r.before + r.after));
  });

  test('only the first of several markers is a hold; the rest are stripped', () => {
    const r = scan(['One moment please. [[HOLD]] Checking. [[HOLD]] Still ', 'checking. [HOLD]', ' Done.']);
    assert.equal(r.holds, 1);
    assert.equal(r.before, 'One moment please. ');
    assert.ok(!/HOLD|\[|\]/.test(r.after), r.after);
    assert.match(r.after, /Checking\.\s+Still checking\.\s+Done\./);
  });

  test('a marker before anything was said is not a hold', () => {
    const r = scan(['  [[HOLD]] Hello, how can I help?']);
    assert.equal(r.holds, 0);
    assert.equal(r.before.trim(), 'Hello, how can I help?');
  });

  test('switched off, markers are stripped without gluing words together', () => {
    const r = scan(['Stay on the line.[[HOLD]]Thanks for waiting.'], { enabled: false });
    assert.equal(r.holds, 0);
    assert.equal(r.before, 'Stay on the line. Thanks for waiting.');
  });

  test('a marker cut off by the end of the stream is dropped, ordinary brackets are not held', () => {
    assert.equal(scan(['Please hold. [[HO']).before, 'Please hold. ');
    const r = scan(['Room [', 'Deluxe] is free.']);
    assert.equal(r.before, 'Room [Deluxe] is free.');
  });
});

describe('splitAtHold / stripHoldMarkers', () => {
  test('splits a finished reply once', () => {
    assert.deepEqual(splitAtHold(REPLY), { before: PRE, hold: true, after: POST });
    const off = splitAtHold(REPLY, { enabled: false });
    assert.equal(off.hold, false);
    assert.ok(!off.before.includes('HOLD'));
  });

  test('stripHoldMarkers leaves no trace, and leaves marker-free text untouched', () => {
    assert.equal(stripHoldMarkers(REPLY), `${PRE.trim()} ${POST.trim()}`);
    assert.equal(stripHoldMarkers('One. [[hold]] Two. [[HO'), 'One. Two.');
    assert.equal(stripHoldMarkers('  unchanged  '), '  unchanged  ');
  });

  test('transcript text (stripSpeechMarkup) never shows the marker', () => {
    assert.equal(stripSpeechMarkup('Please hold. [[HOLD]] Thanks for waiting.'), 'Please hold. Thanks for waiting.');
  });
});

describe('holdPauseSecFor / holdPromptRule', () => {
  test('only a whole number of seconds from 1 to 10 turns the feature on', () => {
    for (const v of [1, 5, 10, '7']) assert.equal(holdPauseSecFor({ holdPauseSec: v }), Number(v));
    for (const v of [undefined, null, '', 0, '0', 11, -1, 2.5, 'abc', true]) {
      assert.equal(holdPauseSecFor({ holdPauseSec: v }), null, JSON.stringify(v));
    }
    assert.equal(holdPauseSecFor(null), null);
  });

  test('the rule names the token and the length, and forbids speaking it', () => {
    const rule = holdPromptRule(5);
    assert.ok(rule.includes(HOLD_MARKER));
    assert.match(rule, /5 seconds/);
    assert.match(rule, /never spoken/);
  });
});
