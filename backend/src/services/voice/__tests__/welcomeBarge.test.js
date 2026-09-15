// A caller's "hello?" must not cut off the welcome message.
//
// Reported from live use: the callee said "hello" over the welcome, barge-in
// cut it off, and the agent carried on with the next stage of the flow, so the
// caller never heard who was calling or why. These pin the decision the phone
// bridge now makes: sound only proposes a barge on the welcome, words decide it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createWelcomeGuard,
  heardPortion,
  interruptedWelcome,
  interruptionWords,
  isPickupOnly,
} from '../welcomeBarge.js';

const WELCOME = "Hi, this is Priya from Sunrise Loans. I'm calling about your personal loan application — is this a good time to talk?";

describe('isPickupOnly', () => {
  for (const said of [
    'Hello?', 'hello hello', 'Hi.', 'Yes, speaking.', "Who's this?", 'who is this',
    'Haan ji, boliye', 'hello kaun bol raha hai', 'हेलो', 'हाँ जी, बोलिए', 'कौन?',
    'Ho, bola', 'Hola, dígame', 'Allô?', 'Hmm, okay',
  ]) {
    test(`"${said}" is only a greeting`, () => assert.equal(isPickupOnly(said), true));
  }

  for (const said of ['not interested', 'hello, I am busy right now', 'wrong number', 'अभी नहीं', 'yes please']) {
    test(`"${said}" is more than a greeting`, () => assert.equal(isPickupOnly(said), false));
  }

  test('nothing said is not a greeting', () => {
    assert.equal(isPickupOnly(''), false);
    assert.equal(isPickupOnly('  ...  '), false);
  });
});

describe('interruptionWords', () => {
  test('pickup phrases carry none', () => {
    assert.deepEqual(interruptionWords('Hello? Hello, who is this?', WELCOME), []);
  });

  // With the canceller missing some echo, the welcome comes back in pieces and
  // out of order. None of that can be counted as the caller cutting in.
  test("the welcome's own words coming back up the line carry none", () => {
    assert.deepEqual(interruptionWords('hello loan application this is priya sunrise', WELCOME), []);
  });

  test('a real objection does', () => {
    assert.deepEqual(interruptionWords('Hello? Sorry, not interested', WELCOME), ['sorry', 'not', 'interested']);
  });
});

describe('createWelcomeGuard', () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, advance: (ms) => { t += ms; } };
  };

  test('a "hello" over the welcome never cuts it, however loud or long', () => {
    const c = clock();
    const guard = createWelcomeGuard(WELCOME, { now: c.now });
    for (let i = 0; i < 100; i++) {
      assert.equal(guard.shouldCut(true, i < 20 ? '' : 'Hello? Hello? Haan ji, kaun?'), false);
      c.advance(20);
    }
  });

  test('sound plus real words cuts it', () => {
    const c = clock();
    const guard = createWelcomeGuard(WELCOME, { now: c.now });
    assert.equal(guard.shouldCut(true, 'hello'), false);
    c.advance(20);
    assert.equal(guard.shouldCut(true, "hello I'm driving right now"), true);
  });

  // Deepgram's words land 300-600ms after they were spoken, usually after the
  // caller has paused, so the energy run is already over by then.
  test('words that arrive after the sound stopped still cut, within the hold', () => {
    const c = clock();
    const guard = createWelcomeGuard(WELCOME, { now: c.now, holdMs: 1200 });
    assert.equal(guard.shouldCut(true, ''), false);
    c.advance(600);
    assert.equal(guard.shouldCut(false, 'please call me later'), true);
  });

  test('...but not once the hold has run out', () => {
    const c = clock();
    const guard = createWelcomeGuard(WELCOME, { now: c.now, holdMs: 1200 });
    assert.equal(guard.shouldCut(true, ''), false);
    c.advance(1500);
    assert.equal(guard.shouldCut(false, 'please call me later'), false);
  });

  test('words with no sound behind them never cut (e.g. barge-in switched off)', () => {
    const guard = createWelcomeGuard(WELCOME);
    assert.equal(guard.shouldCut(false, 'please call me later'), false);
  });

  test('minWords is the knob', () => {
    const guard = createWelcomeGuard(WELCOME, { minWords: 1 });
    assert.equal(guard.shouldCut(true, 'busy'), true);
    const strict = createWelcomeGuard(WELCOME, { minWords: 3 });
    assert.equal(strict.shouldCut(true, 'not interested'), false);
  });
});

describe('heardPortion', () => {
  const text = 'Hi, this is Priya from Sunrise Loans, calling about your application.';

  test('the whole line when it played out', () => {
    assert.equal(heardPortion(text, 5000, 5000), text);
    assert.equal(heardPortion(text, 6000, 5000), text);
  });

  test('roughly the first part when cut early, on a word boundary', () => {
    const heard = heardPortion(text, 2000, 5000);
    assert.ok(text.startsWith(heard), heard);
    assert.ok(heard.length < text.length * 0.5, heard);
    assert.ok(heard.split(' ').length >= 2, heard);
  });

  test('never less than the first word', () => {
    assert.equal(heardPortion(text, 0, 5000), 'Hi,');
  });

  test('no duration means no basis to truncate', () => {
    assert.equal(heardPortion(text, 1000, 0), text);
    assert.equal(heardPortion(text, 1000, Number.NaN), text);
  });
});

test('interruptedWelcome is the shape buildAgentSystemPrompt reads', () => {
  assert.deepEqual(interruptedWelcome('Hi there, this is Priya.', 'Hi there,'), {
    text: 'Hi there, this is Priya.', heard: 'Hi there,', interrupted: true,
  });
});
