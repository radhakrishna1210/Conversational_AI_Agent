import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCustomTemplate,
  extractPlaceholderIndices,
  literalTextLength,
  deriveCustomTemplateName,
  sanitiseDraft,
} from '../whatsappTemplates.service.js';

const ok = (over = {}) => validateCustomTemplate({
  label: 'Booking confirmed',
  category: 'UTILITY',
  language: 'en',
  bodyText: 'Hi {{1}}, your booking for {{2}} is confirmed.',
  placeholders: [{ index: 1, example: 'Priya' }, { index: 2, example: 'Room 3' }],
  ...over,
});

describe('extractPlaceholderIndices', () => {
  test('finds them in ascending order regardless of where they appear', () => {
    assert.deepEqual(extractPlaceholderIndices('on {{2}} for {{1}}'), [1, 2]);
  });

  test('deduplicates a placeholder used twice', () => {
    // Meta counts distinct positions, not occurrences — {{1}} twice is one value.
    assert.deepEqual(extractPlaceholderIndices('{{1}} and {{1}} again'), [1]);
  });

  test('ignores bare numbers and malformed braces', () => {
    assert.deepEqual(extractPlaceholderIndices('table for 4 people {x} {{}} {{a}}'), []);
  });
});

describe('literalTextLength', () => {
  test('measures only the words, not the placeholders', () => {
    assert.equal(literalTextLength('{{1}}{{2}}'), 0);
    assert.equal(literalTextLength('Hi {{1}}, confirmed.'), 'Hi , confirmed.'.length);
  });
});

describe('validateCustomTemplate', () => {
  test('accepts a well-formed template and normalises its placeholders', () => {
    const r = ok();
    assert.equal(r.ok, true);
    assert.equal(r.value.placeholders.length, 2);
    assert.equal(r.value.placeholders[0].example, 'Priya');
    assert.equal(r.value.category, 'UTILITY');
  });

  test('requires a name, a body, and words in the body', () => {
    assert.equal(ok({ label: '   ' }).ok, false);
    assert.equal(ok({ bodyText: '  ' }).ok, false);
    // Mirrors ChatFlow's checkBodyText — emoji-only bodies are refused there too.
    assert.equal(ok({ bodyText: '🎉🎉🎉', placeholders: [] }).ok, false);
  });

  test('enforces Meta\'s 1024-character body limit', () => {
    const r = ok({ bodyText: 'a'.repeat(1025), placeholders: [] });
    assert.equal(r.ok, false);
    assert.match(r.error, /1025 characters/);
  });

  test('rejects gapped placeholders, which Meta refuses without saying why', () => {
    const r = ok({
      bodyText: 'Hi {{1}} on {{3}}',
      placeholders: [{ index: 1, example: 'a' }, { index: 3, example: 'b' }],
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /no gaps/);
  });

  test('requires a sample for every placeholder', () => {
    const r = ok({ placeholders: [{ index: 1, example: 'Priya' }] });
    assert.equal(r.ok, false);
    assert.match(r.error, /\{\{2\}\}/);
  });

  test('rejects an unknown category and a nonsense language code', () => {
    assert.equal(ok({ category: 'PROMOTIONAL' }).ok, false);
    assert.equal(ok({ language: 'e' }).ok, false);
  });

  test('a body with no placeholders at all is valid', () => {
    // Static confirmations are legitimate; nothing requires a variable.
    assert.equal(ok({ bodyText: 'Your booking is confirmed.', placeholders: [] }).ok, true);
  });
});

describe('deriveCustomTemplateName', () => {
  test('always produces a Meta-legal name', () => {
    for (const label of ['Booking Confirmed!', 'très bien — ok?', '     ', '🎉']) {
      assert.match(deriveCustomTemplateName(label, 'cmrf1ypzv0003'), /^[a-z0-9_]{1,64}$/, `label: ${label}`);
    }
  });

  test('two templates sharing a label do not collide', () => {
    const a = deriveCustomTemplateName('Booking', 'ws123456');
    const b = deriveCustomTemplateName('Booking', 'ws123456');
    assert.notEqual(a, b);
  });

  test('stays within 64 characters for a very long label', () => {
    assert.ok(deriveCustomTemplateName('x'.repeat(300), 'ws123456').length <= 64);
  });
});

describe('sanitiseDraft', () => {
  const allowed = ['customer_name', 'appointment_date'];

  test('keeps placeholders bound to variables the agent captures', () => {
    const out = sanitiseDraft({
      bodyText: 'Hi {{1}}, confirmed for {{2}}.',
      placeholders: [
        { index: 1, variableKey: 'customer_name', example: 'Priya' },
        { index: 2, variableKey: 'appointment_date', example: 'Friday' },
      ],
    }, allowed);
    assert.equal(out.bodyText, 'Hi {{1}}, confirmed for {{2}}.');
    assert.equal(out.droppedCount, 0);
  });

  test('drops an invented variable and renumbers what survives', () => {
    // A placeholder bound to something the agent never captures could never be
    // filled — buildPositionalVariables refuses to send in exactly that case.
    const out = sanitiseDraft({
      bodyText: 'Hi {{1}}, {{2}} extras, on {{3}}.',
      placeholders: [
        { index: 1, variableKey: 'customer_name' },
        { index: 2, variableKey: 'invented_thing' },
        { index: 3, variableKey: 'appointment_date' },
      ],
    }, allowed);
    assert.equal(out.droppedCount, 1);
    assert.deepEqual(extractPlaceholderIndices(out.bodyText), [1, 2]);
    assert.equal(out.placeholders.map((p) => p.variableKey).join(','), 'customer_name,appointment_date');
  });

  test('never turns a literal number in the copy into a placeholder', () => {
    // The obvious renumbering — swap to a bare number, then convert bare numbers
    // back — silently rewrites "table for 4 people" as "table for{{4}}people".
    const out = sanitiseDraft({
      bodyText: 'Hi {{1}}, your table for 4 people on {{2}} is booked.',
      placeholders: [
        { index: 1, variableKey: 'customer_name' },
        { index: 2, variableKey: 'appointment_date' },
      ],
    }, allowed);
    assert.ok(out.bodyText.includes('for 4 people'), out.bodyText);
    assert.deepEqual(extractPlaceholderIndices(out.bodyText), [1, 2]);
  });

  test('an empty allow-list drops everything rather than trusting the model', () => {
    const out = sanitiseDraft({
      bodyText: 'Hi {{1}}.',
      placeholders: [{ index: 1, variableKey: 'anything' }],
    }, []);
    assert.equal(out.placeholders.length, 0);
    assert.equal(extractPlaceholderIndices(out.bodyText).length, 0);
  });

  test('survives a malformed reply without throwing', () => {
    for (const bad of [null, {}, { bodyText: 'x' }, { placeholders: 'nope' }]) {
      assert.doesNotThrow(() => sanitiseDraft(bad, allowed));
    }
  });
});
