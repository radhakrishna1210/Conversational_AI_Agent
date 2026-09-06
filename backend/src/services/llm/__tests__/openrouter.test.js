import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  openrouterService,
  normalizeOpenRouterModel,
  stripThinkingTokens,
  DEFAULT_OPENROUTER_MODEL,
} from '../openrouter.service.js';
import { mapAgentModel } from '../../../controllers/llm.controller.js';
import { getLLMProvider } from '../../llm.factory.js';
import { groqService } from '../../groq.service.js';
import { isValidModel, LLM_PROVIDERS } from '../../../constants/llmModels.js';
import { MODEL_GROUPS } from '../../platform/modelCatalog.js';

describe('OpenRouter LLM Service & Model Integration', () => {
  test('normalizeOpenRouterModel handles aliases and model normalization', () => {
    assert.equal(
      normalizeOpenRouterModel('meta-llama/llama-3.3-70b-instruct:free'),
      'meta-llama/llama-3.3-70b-instruct:free'
    );
    assert.equal(
      normalizeOpenRouterModel('openrouter/meta-llama/llama-3.3-70b-instruct:free'),
      'meta-llama/llama-3.3-70b-instruct:free'
    );
    assert.equal(
      normalizeOpenRouterModel('openrouter/anthropic/claude-3.5-haiku'),
      'anthropic/claude-3.5-haiku'
    );
    assert.equal(normalizeOpenRouterModel(null), DEFAULT_OPENROUTER_MODEL);
    assert.equal(normalizeOpenRouterModel(''), DEFAULT_OPENROUTER_MODEL);
  });

  test('stripThinkingTokens removes internal reasoning tags from voice replies', () => {
    const raw = '<think>The user wants to book an appointment. Let me check the schedule.</think>Sure, I can help you with that! What time works for you?';
    assert.equal(
      stripThinkingTokens(raw),
      'Sure, I can help you with that! What time works for you?'
    );

    const multiline = `<think>
1. User asked for support.
2. Formulate helpful response.
</think>Hello! How can I assist you today?`;
    assert.equal(
      stripThinkingTokens(multiline),
      'Hello! How can I assist you today?'
    );

    const noThink = 'Hello! Welcome to our clinic.';
    assert.equal(stripThinkingTokens(noThink), 'Hello! Welcome to our clinic.');
  });

  test('formatMessages builds structured message history with systemPrompt', () => {
    const messages = openrouterService.formatMessages(
      'I want to schedule a checkup',
      [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there! How can I help?' },
      ],
      'You are a dental clinic receptionist.'
    );

    assert.equal(messages.length, 4);
    assert.deepEqual(messages[0], { role: 'system', content: 'You are a dental clinic receptionist.' });
    assert.deepEqual(messages[1], { role: 'user', content: 'Hello' });
    assert.deepEqual(messages[2], { role: 'assistant', content: 'Hi there! How can I help?' });
    assert.deepEqual(messages[3], { role: 'user', content: 'I want to schedule a checkup' });
  });

  test('isValidModel validates OpenRouter and Groq models', () => {
    assert.equal(isValidModel('openrouter', 'meta-llama/llama-3.3-70b-instruct:free'), true);
    assert.equal(isValidModel('openrouter', 'qwen/qwen-2.5-72b-instruct:free'), true);
    assert.equal(isValidModel('openrouter', 'anthropic/claude-3.5-haiku'), true);
    // Any author/model path is valid for openrouter
    assert.equal(isValidModel('openrouter', 'custom-org/any-model-name'), true);
    // Invalid provider or empty model
    assert.equal(isValidModel('openrouter', 'no-slash-invalid'), false);
    assert.equal(isValidModel('groq', 'llama-3.1-8b-instant'), true);
  });

  test('mapAgentModel maps OpenRouter labels and formats', () => {
    const res1 = mapAgentModel('meta-llama/llama-3.3-70b-instruct:free');
    assert.equal(res1.provider, 'openrouter');
    assert.equal(res1.model, 'meta-llama/llama-3.3-70b-instruct:free');

    const res2 = mapAgentModel('openrouter/qwen/qwen-2.5-72b-instruct:free');
    assert.equal(res2.provider, 'openrouter');
    assert.equal(res2.model, 'qwen/qwen-2.5-72b-instruct:free');

    const res3 = mapAgentModel('Qwen 2.5 72B (Free / OpenRouter)');
    assert.equal(res3.provider, 'openrouter');
    assert.equal(res3.model, 'qwen/qwen-2.5-72b-instruct:free');

    const res4 = mapAgentModel('Claude 3.5 Haiku');
    assert.equal(res4.provider, 'openrouter');
    assert.equal(res4.model, 'anthropic/claude-3.5-haiku');

    const res5 = mapAgentModel('Groq Llama 3.1 8B (Fast Voice)');
    assert.equal(res5.provider, 'groq');
    assert.equal(res5.model, 'llama-3.1-8b-instant');

    const res6 = mapAgentModel('Gemma 3 27B (Free / OpenRouter)');
    assert.equal(res6.provider, 'openrouter');
    assert.equal(res6.model, 'google/gemma-3-27b-it:free');

    const res7 = mapAgentModel('PhoneLLM Alpha 1 (Pipecat Voice)');
    assert.equal(res7.provider, 'openrouter');
    assert.equal(res7.model, 'pipecat-ai/phonellm-alpha-1');

    const res8 = mapAgentModel('pipecat-ai/phonellm-alpha-1');
    assert.equal(res8.provider, 'openrouter');
    assert.equal(res8.model, 'pipecat-ai/phonellm-alpha-1');
  });

  test('getLLMProvider returns correct services', () => {
    const openrouterProv = getLLMProvider('openrouter');
    assert.equal(openrouterProv, openrouterService);

    const groqProv = getLLMProvider('groq');
    assert.equal(groqProv, groqService);
  });

  test('MODEL_GROUPS contains OpenRouter models in platform catalog', () => {
    const llmGroup = MODEL_GROUPS.find((g) => g.key === 'llm');
    assert.ok(llmGroup, 'llm group exists');

    const llama33 = llmGroup.models.find((m) => m.id === 'llm:openrouter:llama-3.3-70b-free');
    assert.ok(llama33, 'llama-3.3-70b-free exists in MODEL_GROUPS');
    assert.equal(llama33.value, 'meta-llama/llama-3.3-70b-instruct:free');
    assert.equal(llama33.provider, 'OpenRouter');
    assert.equal(llama33.envKey, 'OPENROUTER_API_KEY');

    const gemma3 = llmGroup.models.find((m) => m.id === 'llm:openrouter:gemma-3-27b-free');
    assert.ok(gemma3, 'gemma-3-27b-free exists in MODEL_GROUPS');
    assert.equal(gemma3.value, 'google/gemma-3-27b-it:free');

    const phonellm = llmGroup.models.find((m) => m.id === 'llm:phonellm:alpha-1');
    assert.ok(phonellm, 'phonellm:alpha-1 exists in MODEL_GROUPS');
    assert.equal(phonellm.value, 'pipecat-ai/phonellm-alpha-1');

    const qwen = llmGroup.models.find((m) => m.id === 'llm:openrouter:qwen-2.5-72b-free');
    assert.ok(qwen, 'qwen-2.5-72b-free exists in MODEL_GROUPS');
    assert.equal(qwen.provider, 'OpenRouter');

    const geminiExp = llmGroup.models.find((m) => m.id === 'llm:openrouter:gemini-2.0-flash-free');
    assert.ok(geminiExp, 'gemini-2.0-flash-free exists in MODEL_GROUPS');
    assert.equal(geminiExp.provider, 'OpenRouter');

    const haiku = llmGroup.models.find((m) => m.id === 'llm:openrouter:claude-3.5-haiku');
    assert.ok(haiku, 'claude-3.5-haiku exists in MODEL_GROUPS');
    assert.equal(haiku.provider, 'OpenRouter');
  });

  test('openrouterService health reports correct provider', () => {
    const health = openrouterService.getHealth();
    assert.equal(health.provider, 'openrouter');
    assert.equal(typeof health.apiKeyConfigured, 'boolean');
  });
});
