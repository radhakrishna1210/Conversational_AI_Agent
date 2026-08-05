// Guards the prompt shape that makes the knowledge base cacheable.
//
// The rule these tests enforce was established by measuring the live Gemini API
// (backend/scratch/probe_gemini_cache4.mjs / 5.mjs): implicit caching matches a
// prefix of contents[] and ONLY when the system instruction is byte-identical
// across turns. A KB in the system instruction cached 0%; so did a KB in
// contents[] whenever the system prompt was rebuilt each turn. The shape below
// measured 87-88% cached from turn 2 on.
//
// So the invariant is: the system prompt must not vary within a conversation,
// and must not vary between two calls to the same agent.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeMessages,
  buildAgentSystemPrompt,
  KB_MESSAGE_HEADER,
} from '../agentRuntime.service.js';

const agent = {
  id: 'agent-1',
  name: 'Purva - Hospital Receptionist',
  welcomeMessage: 'Namaste, Purva speaking.',
  flowItems: JSON.stringify([{ title: 'Greet', body: 'Say hello', enabled: true }]),
  settings: JSON.stringify({ personaName: 'Purva' }),
  languages: JSON.stringify(['Hindi']),
};

const KB = '### Source: fees.pdf\nConsultation is 500 rupees.';
const prior = [
  { role: 'assistant', content: 'Namaste, Purva speaking.' },
  { role: 'user', content: 'What are your hours?' },
  { role: 'assistant', content: 'Nine to five.' },
];

const build = (over = {}) =>
  buildRuntimeMessages({
    agent,
    kbText: KB,
    prior,
    lastContent: 'What does a consultation cost?',
    supportsChatHistory: true,
    ...over,
  });

describe('buildRuntimeMessages — cacheable shape', () => {
  test('KB body is NOT in the system prompt', () => {
    const { systemPrompt } = build();
    assert.ok(!systemPrompt.includes('Consultation is 500 rupees'),
      'KB body in the system instruction is never cached — it must ride in contents[]');
  });

  test('KB is the first conversation turn, followed by an acknowledgement', () => {
    const { chatHistory } = build();
    assert.equal(chatHistory[0].role, 'user');
    assert.ok(chatHistory[0].content.startsWith(KB_MESSAGE_HEADER));
    assert.ok(chatHistory[0].content.includes('Consultation is 500 rupees'));
    assert.equal(chatHistory[1].role, 'assistant');
  });

  test('prior turns follow the KB, in order, as real turns', () => {
    const { chatHistory, systemPrompt } = build();
    assert.deepEqual(chatHistory.slice(2), prior);
    assert.ok(!systemPrompt.includes('What are your hours?'),
      'transcript in the system prompt zeroes the hit rate');
  });

  test('system prompt is IDENTICAL as the conversation grows', () => {
    // The cache key spans the system instruction; if it drifts turn to turn the
    // KB behind it is re-billed in full every time.
    const turn1 = buildRuntimeMessages({
      agent, kbText: KB, prior: [], lastContent: 'Hi', supportsChatHistory: true,
    });
    const turn7 = build();
    assert.equal(turn1.systemPrompt, turn7.systemPrompt);
  });

  test('affect goes on the current turn, never the system prompt', () => {
    const withAffect = build({ affectNote: 'The caller sounds rushed — be brisk.' });
    const without = build();
    assert.equal(withAffect.systemPrompt, without.systemPrompt,
      'a per-turn affect line in the system prompt invalidates the whole prefix');
    assert.ok(withAffect.message.includes('rushed'));
    assert.ok(withAffect.message.startsWith('What does a consultation cost?'));
  });

  test('two different calls to the same agent share a byte-identical prefix', () => {
    // This is what lets a 10k-contact campaign pay for the KB once rather than
    // once per call. Per-contact data must land in the message, not the prefix.
    const callA = build({ prior: [], lastContent: 'Hello' });
    const callB = build({ prior: [], lastContent: 'Is anyone there?' });
    assert.equal(callA.systemPrompt, callB.systemPrompt);
    assert.deepEqual(callA.chatHistory, callB.chatHistory);
  });

  test('no KB configured — no KB turn, and the prompt says so', () => {
    const { chatHistory, systemPrompt } = build({ kbText: '' });
    assert.deepEqual(chatHistory, prior);
    assert.ok(systemPrompt.includes('No knowledge base documents are configured'));
  });
});

describe('buildRuntimeMessages — providers without structured history', () => {
  test('falls back to the transcript-in-system-prompt shape', () => {
    const { systemPrompt, chatHistory, message } = build({ supportsChatHistory: false });
    assert.deepEqual(chatHistory, [], 'legacy providers get no chatHistory');
    assert.ok(systemPrompt.includes('Consultation is 500 rupees'), 'KB must stay inline');
    assert.ok(systemPrompt.includes('What are your hours?'), 'history must not be lost');
    assert.equal(message, 'What does a consultation cost?');
  });

  test('affect still reaches a legacy provider', () => {
    const { systemPrompt } = build({ supportsChatHistory: false, affectNote: 'sounds rushed' });
    assert.ok(systemPrompt.includes('sounds rushed'));
  });
});

describe('buildAgentSystemPrompt — kbInline', () => {
  test('bundled realtime engines keep the KB inline', () => {
    // xAI / ElevenLabs push ONE instruction blob at session open and have no
    // conversation turns to attach a KB message to.
    const inline = buildAgentSystemPrompt(agent, KB, { voiceMode: true });
    assert.ok(inline.includes('Consultation is 500 rupees'));
  });

  test('non-inline still instructs the model to ground answers in the KB', () => {
    const split = buildAgentSystemPrompt(agent, KB, { voiceMode: true, kbInline: false });
    assert.ok(!split.includes('Consultation is 500 rupees'));
    assert.ok(split.includes(KB_MESSAGE_HEADER));
    assert.ok(/NEVER invent facts/.test(split));
  });
});
