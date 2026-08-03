// backend/src/services/voice/__tests__/sentenceBuffer.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { takeCompleteSentences, cleanForSpeech } from '../sentenceBuffer.js';

test('sentenceBuffer', async (t) => {
  await t.test('holds text until a terminator arrives', () => {
    const { chunk, rest } = takeCompleteSentences('Sure, I can help');
    assert.equal(chunk, '');
    assert.equal(rest, 'Sure, I can help');
  });

  await t.test('never splits mid-word across sub-word deltas', () => {
    // The regression this module exists to prevent: LLM deltas arrive as
    // "appo" | "int" | "ment" and must not be released as separate words.
    let buf = '';
    const released = [];
    for (const delta of ['Your appo', 'int', 'ment is ', 'confirmed', '.']) {
      buf += delta;
      const { chunk, rest } = takeCompleteSentences(buf);
      buf = rest;
      if (chunk) released.push(chunk);
    }
    assert.deepEqual(released, ['Your appointment is confirmed.']);
    assert.equal(buf, '');
  });

  await t.test('cuts at the LAST terminator, releasing several sentences at once', () => {
    const { chunk, rest } = takeCompleteSentences('One. Two! Three? And a tail');
    assert.equal(chunk, 'One. Two! Three?');
    assert.equal(rest, ' And a tail');
  });

  await t.test('treats the Hindi danda as a terminator', () => {
    const { chunk, rest } = takeCompleteSentences('मैं आपकी मदद कर सकती हूँ। और');
    assert.equal(chunk, 'मैं आपकी मदद कर सकती हूँ।');
    assert.equal(rest, ' और');
  });

  await t.test('releases at a word break past maxLen when unpunctuated', () => {
    const long = 'word '.repeat(40); // 200 chars, no terminator
    const { chunk, rest } = takeCompleteSentences(long);
    assert.ok(chunk.length > 0, 'should release rather than buffer forever');
    assert.ok(chunk.endsWith(' ') || !chunk.endsWith('wor'), 'must not cut mid-word');
    assert.equal(chunk + rest, long, 'no characters lost at the seam');
  });

  await t.test('does not release a short unpunctuated buffer', () => {
    const { chunk } = takeCompleteSentences('still typing', { maxLen: 160 });
    assert.equal(chunk, '');
  });

  await t.test('empty input is safe', () => {
    assert.deepEqual(takeCompleteSentences(''), { chunk: '', rest: '' });
    assert.deepEqual(takeCompleteSentences(undefined), { chunk: '', rest: '' });
  });

  await t.test('cleanForSpeech strips markdown and collapses whitespace', () => {
    assert.equal(cleanForSpeech('**Sure**,\n  I _can_ help.'), 'Sure, I can help.');
    assert.equal(cleanForSpeech('  ***  '), '');
  });
});
