// backend/src/constants/__tests__/geminiModels.test.js
/**
 * Gemini changed how a caller says "skip the reasoning pass" between model
 * generations, and did NOT keep the old spelling working: `thinkingBudget: 0`
 * is an HTTP 400 on gemini-3.5-flash-lite, `thinkingLevel` is an HTTP 400 on
 * gemini-2.5-flash. On a live call a 400 is not a slower reply, it is dead air
 * — so the translation table is worth pinning even though it only ever emits a
 * two-key object.
 *
 * The expectations here mirror the measurements recorded in geminiModels.js.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  thinkingConfigFor,
  getGeminiAPIModel,
  SUPPORTED_GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL,
} from '../geminiModels.js';

describe('thinkingConfigFor — "no reasoning pass", spelled per model', () => {
  test('models that take a budget get a budget', () => {
    assert.deepEqual(thinkingConfigFor('gemini-2.5-flash', 0), { thinkingBudget: 0 });
    assert.deepEqual(thinkingConfigFor('gemini-3.1-flash-lite', 0), { thinkingBudget: 0 });
  });

  test('models that reject a budget but think by default get a level', () => {
    assert.deepEqual(thinkingConfigFor('gemini-3.6-flash', 0), { thinkingLevel: 'low' });
  });

  test('models that already default to no thinking are told nothing', () => {
    // Measured: asking gemini-3.5-flash-lite for thinkingLevel:'low' is SLOWER
    // than saying nothing (2.0s vs 1.05s to first token), and thinkingBudget:0
    // is a hard 400. Silence is both the fastest and the only safe answer.
    assert.equal(thinkingConfigFor('gemini-3.5-flash-lite', 0), null);
  });

  test('an unknown model is told nothing rather than guessed at', () => {
    // Every model accepts silence; only some accept each spelling. A model
    // added to the mapping without updating the table must not break calls.
    assert.equal(thinkingConfigFor('gemini-9.9-flash-lite', 0), null);
  });

  test('no thinkingBudget asked for means no thinkingConfig sent', () => {
    for (const m of ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']) {
      assert.equal(thinkingConfigFor(m, undefined), null, m);
    }
  });

  test('a non-zero budget is passed on where supported and dropped where not', () => {
    assert.deepEqual(thinkingConfigFor('gemini-2.5-flash', 512), { thinkingBudget: 512 });
    // Asking for MORE thinking is not worth failing a call over.
    assert.equal(thinkingConfigFor('gemini-3.5-flash-lite', 512), null);
  });
});

describe('model mapping', () => {
  test('the retired 2.5 lite endpoint resolves onto a live model', () => {
    // Google returns 404 "no longer available to new users" for this one, so an
    // agent still configured with it must not 404 on every turn.
    assert.equal(getGeminiAPIModel('gemini-2.5-flash-lite'), 'gemini-3.5-flash-lite');
  });

  test('the default model is one the mapping actually knows', () => {
    assert.ok(SUPPORTED_GEMINI_MODELS.includes(DEFAULT_GEMINI_MODEL));
    assert.doesNotThrow(() => getGeminiAPIModel(DEFAULT_GEMINI_MODEL));
  });

  test('every supported model has a thinking answer that does not throw', () => {
    for (const m of SUPPORTED_GEMINI_MODELS) {
      assert.doesNotThrow(() => thinkingConfigFor(getGeminiAPIModel(m), 0), m);
    }
  });
});
