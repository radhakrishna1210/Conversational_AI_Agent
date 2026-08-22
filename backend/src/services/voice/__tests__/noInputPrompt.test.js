// What the agent says when the caller has gone quiet.
//
// Reported from a live call: "if I said something and the agent didn't notice,
// then for 8 to 10 seconds the agent says nothing and it keeps blank." A caller
// cannot tell "you weren't heard" from "nobody is there", and neither can we —
// so the line has to go out on a deadline, in the caller's language.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { noInputPromptFor, noInputDelayMs, maxNoInputAttempts } from '../noInputPrompt.js';

describe('noInputPromptFor', () => {
  test('speaks the agent\'s configured language, in its own script', () => {
    const hi = noInputPromptFor(['Hindi'], 1);
    assert.match(hi, /[\u0900-\u097F]/, 'a Hindi agent must be given Devanagari, not romanized text');
  });

  test('takes the first language when several are configured', () => {
    assert.equal(noInputPromptFor(['Hindi', 'English'], 1), noInputPromptFor('Hindi', 1));
  });

  test('escalates: each attempt is a different line', () => {
    const one = noInputPromptFor(['English'], 1);
    const two = noInputPromptFor(['English'], 2);
    const three = noInputPromptFor(['English'], 3);
    assert.notEqual(one, two);
    assert.notEqual(two, three);
  });

  test('stops asking rather than looping forever', () => {
    const past = maxNoInputAttempts(['English']) + 1;
    assert.equal(noInputPromptFor(['English'], past), null);
  });

  test('an unsupported language still gets a spoken line, not silence', () => {
    const out = noInputPromptFor(['Klingon'], 1);
    assert.ok(out && out.length > 0);
    assert.equal(out, noInputPromptFor(['English'], 1));
  });

  test('English variants and multi resolve to English', () => {
    for (const label of ['English (Indian)', 'English (British)', 'Multi', 'auto']) {
      assert.equal(noInputPromptFor([label], 1), noInputPromptFor(['English'], 1));
    }
  });

  test('no language configured is not a crash', () => {
    assert.ok(noInputPromptFor([], 1));
    assert.ok(noInputPromptFor(undefined, 1));
  });

  test('a zero or negative attempt yields nothing', () => {
    assert.equal(noInputPromptFor(['English'], 0), null);
    assert.equal(noInputPromptFor(['English'], -1), null);
  });
});

describe('noInputDelayMs', () => {
  test('waits longer before each successive prompt', () => {
    assert.ok(noInputDelayMs(2) > noInputDelayMs(1));
    assert.ok(noInputDelayMs(3) > noInputDelayMs(2));
  });

  test('the first prompt is soon enough to break dead air, late enough to be polite', () => {
    const first = noInputDelayMs(1);
    assert.ok(first >= 4000 && first <= 10000, `unexpected first delay ${first}`);
  });

  test('an override still produces an increasing sequence', () => {
    const a = noInputDelayMs(1, 3000);
    const b = noInputDelayMs(2, 3000);
    assert.equal(a, 3000);
    assert.ok(b > a, 'shortening the first prompt must not flatten the ladder');
  });
});
