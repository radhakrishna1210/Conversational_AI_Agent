import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sarvamLLMService, normalizeSarvamModel } from '../sarvam.service.js';
import { mapAgentModel } from '../../../controllers/llm.controller.js';
import { getLLMProvider, getLLMProviderWithFallback } from '../../llm.factory.js';
import { isValidModel, LLM_PROVIDERS } from '../../../constants/llmModels.js';
import { MODEL_GROUPS } from '../../platform/modelCatalog.js';

describe('Sarvam LLM Service & Model Catalog', () => {
  test('normalizeSarvamModel maps aliases and legacy models', () => {
    assert.equal(normalizeSarvamModel('sarvam-105b-conversations'), 'sarvam-105b-conversations');
    assert.equal(normalizeSarvamModel('sarvam-105b'), 'sarvam-105b');
    assert.equal(normalizeSarvamModel('sarvam-30b'), 'sarvam-105b-conversations');
    assert.equal(normalizeSarvamModel('sarvam-2b'), 'sarvam-105b-conversations');
    assert.equal(normalizeSarvamModel('sarvam-m'), 'sarvam-105b-conversations');
    assert.equal(normalizeSarvamModel('sarvam'), 'sarvam-105b-conversations');
    assert.equal(normalizeSarvamModel(null), 'sarvam-105b-conversations');
  });

  test('mapAgentModel maps Sarvam labels correctly', () => {
    const res1 = mapAgentModel('Sarvam 105B Conversations');
    assert.equal(res1.provider, 'sarvam');
    assert.equal(res1.model, 'sarvam-105b-conversations');

    const res2 = mapAgentModel('Sarvam 105B');
    assert.equal(res2.provider, 'sarvam');
    assert.equal(res2.model, 'sarvam-105b');

    const res3 = mapAgentModel('sarvam-105b-conversations');
    assert.equal(res3.provider, 'sarvam');
    assert.equal(res3.model, 'sarvam-105b-conversations');

    const res4 = mapAgentModel('sarvam-30b');
    assert.equal(res4.provider, 'sarvam');
    assert.equal(res4.model, 'sarvam-105b-conversations');
  });

  test('isValidModel validates sarvam models', () => {
    assert.equal(isValidModel('sarvam', 'sarvam-105b-conversations'), true);
    assert.equal(isValidModel('sarvam', 'sarvam-105b'), true);
    assert.equal(isValidModel('sarvam', 'invalid-model'), false);
  });

  test('getLLMProvider returns sarvamLLMService for sarvam', () => {
    const provider = getLLMProvider('sarvam');
    assert.equal(provider, sarvamLLMService);
  });

  test('formatMessages builds structured message history with systemPrompt', () => {
    const messages = sarvamLLMService.formatMessages(
      'What is the capital of India?',
      [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' }
      ],
      'You are a helpful assistant.'
    );

    assert.equal(messages.length, 4);
    assert.deepEqual(messages[0], { role: 'system', content: 'You are a helpful assistant.' });
    assert.deepEqual(messages[1], { role: 'user', content: 'Hi' });
    assert.deepEqual(messages[2], { role: 'assistant', content: 'Hello!' });
    assert.deepEqual(messages[3], { role: 'user', content: 'What is the capital of India?' });
  });

  test('MODEL_GROUPS contains Sarvam LLM models', () => {
    const llmGroup = MODEL_GROUPS.find((g) => g.key === 'llm');
    assert.ok(llmGroup, 'llm group exists');

    const sarvamConv = llmGroup.models.find((m) => m.id === 'llm:sarvam:sarvam-105b-conversations');
    assert.ok(sarvamConv, 'sarvam-105b-conversations exists in MODEL_GROUPS');
    assert.equal(sarvamConv.value, 'sarvam-105b-conversations');
    assert.equal(sarvamConv.provider, 'Sarvam');
    assert.equal(sarvamConv.envKey, 'SARVAM_API_KEY');

    const sarvamReasoning = llmGroup.models.find((m) => m.id === 'llm:sarvam:sarvam-105b');
    assert.ok(sarvamReasoning, 'sarvam-105b exists in MODEL_GROUPS');
    assert.equal(sarvamReasoning.value, 'sarvam-105b');
    assert.equal(sarvamReasoning.provider, 'Sarvam');
    assert.equal(sarvamReasoning.envKey, 'SARVAM_API_KEY');
  });

  test('sarvamLLMService health reports correct provider and status', () => {
    const health = sarvamLLMService.getHealth();
    assert.equal(health.provider, 'sarvam');
    assert.equal(typeof health.apiKeyConfigured, 'boolean');
  });
});
