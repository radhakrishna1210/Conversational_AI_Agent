// backend/src/services/voice/__tests__/disfluency.test.js
/**
 * Unit tests for the naturalness filter.
 * Run with: node --test src/services/voice/__tests__/disfluency.test.js
 *
 * The rules here are the ones a prompt cannot hold, so they are tested at the
 * level a caller would notice: what actually gets spoken.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createReplyTextFilter,
  createFillerBudget,
  filterReplyText,
  stripSpeechMarkup,
} from '../disfluency.js';

/** Feed a reply through a filter one delta at a time, as the LLM would. */
const stream = (deltas, opts = {}) => {
  const f = createReplyTextFilter(opts);
  let out = '';
  for (const d of deltas) out += f.push(d);
  out += f.flush();
  return out;
};

const ssml = { ssmlBreaks: true };

// ─── Opening fillers ──────────────────────────────────────────────────────────

describe('opening hesitation', () => {
  it('keeps one, and gives it the pause the prompt asks for', () => {
    const out = filterReplyText('Hmm, so that one is usually ready by Friday.', ssml);
    assert.match(out, /^Hmm, <break time="300ms"\/> so that one/);
  });

  it('collapses a stacked opener to a single marker', () => {
    const out = filterReplyText('Umm, well, so I can check that for you.', ssml);
    assert.equal((out.match(/umm|well/gi) || []).length, 1);
    assert.match(out, /^Umm,/);
  });

  it('drops a filler that sits in front of a price', () => {
    const out = filterReplyText('Umm, the price is 4,999 rupees.', ssml);
    assert.equal(out, 'The price is 4,999 rupees.');
  });

  it('drops a filler in front of a number written with a symbol', () => {
    const out = filterReplyText('Hmm, that plan is ₹1,200 a month.', ssml);
    assert.match(out, /^That plan is ₹1,200/);
  });

  it('re-capitalizes the reply after removing the opener', () => {
    const out = filterReplyText('Uh, we open at 9.', { ssmlBreaks: true, allowFiller: false });
    assert.equal(out, 'We open at 9.');
  });

  it('does not promote a second filler after the budget refuses the first', () => {
    // "Hmm" is refused for spacing; "let me see" must not quietly take its
    // place, or the reply hesitates anyway and the rate rule bought nothing.
    const budget = createFillerBudget({ everyNTurns: 3, maxPerCall: 1 });
    budget.nextTurn();
    assert.ok(budget.allowHesitation('umm'), 'spend the call budget');
    budget.nextTurn();
    const out = filterReplyText('Hmm, let me see, Tuesday works fine.', { ...ssml, budget });
    assert.equal(out, 'Tuesday works fine.');
  });

  it('capitalizes the opener it keeps, not the one the model wrote first', () => {
    const budget = createFillerBudget({ everyNTurns: 0, maxPerCall: 10 });
    budget.nextTurn();
    const out = filterReplyText('let me see, Tuesday works fine.', { ...ssml, budget });
    assert.match(out, /^Let me see, <break/);
  });

  it('strips fillers entirely when the toggle is off', () => {
    const out = filterReplyText('Hmm, let me look that up.', { allowFiller: false, ssmlBreaks: true });
    assert.match(out, /^Let me look/);
  });
});

describe('discourse markers', () => {
  it('keeps one the model punctuated as a marker', () => {
    const out = filterReplyText("Right, that's booked for Tuesday.", ssml);
    assert.match(out, /^Right, <break time="300ms"\/> that's booked/);
  });

  it('LEAVES AN ADVERB ALONE — "Right away" is not a discourse marker', () => {
    // The dangerous false positive: rewriting this to "Right, <pause> away…"
    // would mangle an ordinary sentence.
    const out = filterReplyText("Right away, I'll get that booked.", ssml);
    assert.equal(out, "Right away, I'll get that booked.");
  });

  it('does not treat a word merely STARTING with a marker as one', () => {
    const out = filterReplyText('Sorry, could you repeat that?', ssml);
    assert.equal(out, 'Sorry, could you repeat that?');
  });
});

describe('mid-sentence fillers', () => {
  it('removes them — hesitation is turn-initial only', () => {
    const out = filterReplyText('I can check that, um, right now.', ssml);
    assert.ok(!/\bum\b/i.test(out), out);
    assert.match(out, /I can check that, right now\./);
  });

  it('does not eat a unit that merely looks like a filler', () => {
    const out = filterReplyText('It is 5 mm wide.', ssml);
    assert.equal(out, 'It is 5 mm wide.');
  });
});

// ─── Pause markup ─────────────────────────────────────────────────────────────

describe('break tags', () => {
  it('clamps an over-long pause to something usable on a call', () => {
    const out = filterReplyText('Sure. <break time="3s"/> Let me check.', ssml);
    assert.match(out, /<break time="700ms"\/>/);
  });

  it('raises a too-short pause to the floor', () => {
    const out = filterReplyText('Sure. <break time="10ms"/> Let me check.', ssml);
    assert.match(out, /<break time="120ms"\/>/);
  });

  it('caps how many survive in one reply', () => {
    const out = filterReplyText(
      'A <break time="300ms"/> b <break time="300ms"/> c <break time="300ms"/> d <break time="300ms"/> e.',
      ssml,
    );
    assert.ok((out.match(/<break/g) || []).length <= 2, out);
  });

  it('converts pauses to commas for a provider that cannot parse SSML', () => {
    const out = filterReplyText('Sure. <break time="300ms"/> Let me check.', { ssmlBreaks: false });
    assert.ok(!out.includes('<break'), out);
    assert.ok(!out.includes('>'), out);
  });

  it('never emits a tag split across two LLM deltas', () => {
    const out = stream(['Okay. <brea', 'k time="300ms"/> Done.'], ssml);
    assert.match(out, /<break time="300ms"\/>/);
    assert.ok(!/<brea(?!k)/.test(out), out);
  });

  it('holds a partial tag that never completes rather than speaking it', () => {
    const out = stream(['All set. <break tim'], ssml);
    assert.ok(!out.includes('<'), out);
  });

  it('strips markup from text a human will read', () => {
    assert.equal(
      stripSpeechMarkup('Hmm, <break time="300ms"/> that works.'),
      'Hmm, that works.',
    );
  });
});

// ─── Budget ───────────────────────────────────────────────────────────────────

describe('filler budget', () => {
  it('rations hesitations to roughly one every few turns', () => {
    const budget = createFillerBudget({ everyNTurns: 3, maxPerCall: 10 });
    const kept = [];
    for (let turn = 0; turn < 9; turn++) {
      budget.nextTurn();
      const out = filterReplyText('Hmm, let me check that.', { ...ssml, budget });
      kept.push(/^Hmm/.test(out));
    }
    const total = kept.filter(Boolean).length;
    assert.ok(total >= 2 && total <= 4, `expected ~3 fillers in 9 turns, got ${total}`);
  });

  it('stops entirely once the per-call cap is spent', () => {
    const budget = createFillerBudget({ everyNTurns: 1, maxPerCall: 2 });
    let kept = 0;
    for (let turn = 0; turn < 8; turn++) {
      budget.nextTurn();
      // Alternate the sound so the never-twice-running rule isn't what's tested.
      const text = turn % 2 ? 'Hmm, one moment.' : 'Umm, one moment.';
      if (/^(Hmm|Umm)/.test(filterReplyText(text, { ...ssml, budget }))) kept++;
    }
    assert.equal(kept, 2);
  });

  it('never repeats the same hesitation sound back-to-back', () => {
    const budget = createFillerBudget({ everyNTurns: 0, maxPerCall: 10 });
    budget.nextTurn();
    assert.ok(budget.allowHesitation('hmm'));
    budget.nextTurn();
    assert.equal(budget.allowHesitation('hmm'), false);
    budget.nextTurn();
    assert.ok(budget.allowHesitation('umm'));
  });
});

// ─── Streaming equivalence ────────────────────────────────────────────────────

describe('streaming', () => {
  it('produces the same text however the deltas are chopped up', () => {
    const text = 'Hmm, so that one is usually ready by Friday afternoon.';
    const whole = filterReplyText(text, ssml);
    const byWord = stream(text.split(/(?<= )/), ssml);
    const byChar = stream([...text], ssml);
    assert.equal(byWord, whole);
    assert.equal(byChar, whole);
  });

  it('handles a reply shorter than the head buffer', () => {
    assert.equal(stream(['Sure.'], ssml), 'Sure.');
  });

  it('handles an empty reply', () => {
    assert.equal(stream([''], ssml), '');
  });

  it('keeps Devanagari replies intact', () => {
    const out = filterReplyText('जी, आपका अपॉइंटमेंट बुक हो गया है।', ssml);
    assert.equal(out, 'जी, आपका अपॉइंटमेंट बुक हो गया है।');
  });

  it('strips a Hindi hesitation opener when the budget says no', () => {
    const out = filterReplyText('अं, मैं देखती हूँ।', { ssmlBreaks: true, allowFiller: false });
    assert.equal(out, 'मैं देखती हूँ।');
  });
});
