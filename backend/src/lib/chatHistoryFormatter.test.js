import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssistantRequestPayload } from './chatHistoryFormatter.js';

test('buildAssistantRequestPayload keeps the latest user message and chat history', () => {
  const payload = buildAssistantRequestPayload({
    message: 'How does this work?',
    history: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ],
    systemPrompt: 'You are a helpful assistant.',
  });

  assert.equal(payload.message, 'How does this work?');
  assert.equal(payload.chatHistory.length, 2);
  assert.equal(payload.chatHistory[0].content, 'Hello');
  assert.equal(payload.systemPrompt, 'You are a helpful assistant.');
});

test('buildAssistantRequestPayload trims very long histories', () => {
  const history = Array.from({ length: 25 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message-${index}`,
  }));

  const payload = buildAssistantRequestPayload({ message: 'Summarize', history });

  assert.equal(payload.chatHistory.length, 10);
  assert.equal(payload.chatHistory[0].content, 'message-15');
  assert.equal(payload.chatHistory.at(-1).content, 'message-24');
});
