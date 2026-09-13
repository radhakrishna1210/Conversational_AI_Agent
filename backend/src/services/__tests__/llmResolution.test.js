// backend/src/services/__tests__/llmResolution.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLlmForAgent } from '../agentRuntime.service.js';
import { mapAgentModel } from '../../controllers/llm.controller.js';

test('mapAgentModel and resolveLlmForAgent preserve selected models', async (t) => {
  await t.test('preserves individual Gemini models on voice turns (lowLatency=true)', () => {
    const testCases = [
      { input: 'gemini-3.1-flash', expectedModel: 'gemini-3.1-flash', expectedProvider: 'gemini' },
      { input: 'Gemini 3.1 Flash', expectedModel: 'gemini-3.1-flash', expectedProvider: 'gemini' },
      { input: 'gemini-3.5-flash', expectedModel: 'gemini-3.5-flash', expectedProvider: 'gemini' },
      { input: 'Gemini 3.5 Flash', expectedModel: 'gemini-3.5-flash', expectedProvider: 'gemini' },
      { input: 'gemini-2.5-flash', expectedModel: 'gemini-2.5-flash', expectedProvider: 'gemini' },
      { input: 'Gemini 2.5 Flash', expectedModel: 'gemini-2.5-flash', expectedProvider: 'gemini' },
      { input: 'gemini-3.5-flash-lite', expectedModel: 'gemini-3.5-flash-lite', expectedProvider: 'gemini' },
      { input: 'Gemini 3.5 Flash Lite', expectedModel: 'gemini-3.5-flash-lite', expectedProvider: 'gemini' },
    ];

    for (const tc of testCases) {
      const res = resolveLlmForAgent({ aiModel: tc.input }, { lowLatency: true });
      assert.equal(res.provider, tc.expectedProvider, `Provider mismatch for ${tc.input}`);
      assert.equal(res.model, tc.expectedModel, `Model mismatch for ${tc.input}`);
    }
  });

  await t.test('preserves other providers on voice turns (lowLatency=true)', () => {
    const testCases = [
      { input: 'gpt-4o', expectedProvider: 'openai', expectedModel: 'gpt-4o' },
      { input: 'GPT-4o', expectedProvider: 'openai', expectedModel: 'gpt-4o' },
      { input: 'gpt-4o-mini', expectedProvider: 'openai', expectedModel: 'gpt-4o-mini' },
      { input: 'Groq Llama 3.3', expectedProvider: 'groq', expectedModel: 'Groq Llama 3.3' },
      { input: 'allam-2-7b', expectedProvider: 'groq', expectedModel: 'allam-2-7b' },
      { input: 'qwen/qwen3.6-27b', expectedProvider: 'groq', expectedModel: 'qwen/qwen3.6-27b' },
      { input: 'sarvam-105b-conversations', expectedProvider: 'sarvam', expectedModel: 'sarvam-105b-conversations' },
    ];

    for (const tc of testCases) {
      const res = resolveLlmForAgent({ aiModel: tc.input }, { lowLatency: true });
      assert.equal(res.provider, tc.expectedProvider, `Provider mismatch for ${tc.input}`);
      assert.equal(res.model, tc.expectedModel, `Model mismatch for ${tc.input}`);
    }
  });

  await t.test('falls back to default voice model only when agent model is unspecified', () => {
    const res = resolveLlmForAgent({}, { lowLatency: true });
    assert.equal(res.provider, 'gemini');
    assert.equal(res.model, process.env.VOICE_LLM_MODEL || 'gemini-3.5-flash-lite');
  });
});
