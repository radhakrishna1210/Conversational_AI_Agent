// A welcome the caller cut off must not be described to the model as delivered.
//
// The live failure: the callee's "hello" cut the welcome off, the prompt still
// said "Welcome message already delivered … Do not repeat it", and the model
// answered by moving on to the next stage of the flow. The caller never heard
// who was calling or why. Bridges now pass `{ text, heard, interrupted }`.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentSystemPrompt } from '../agentRuntime.service.js';
import { interruptedWelcome } from '../voice/welcomeBarge.js';

const agent = {
  name: 'Priya',
  welcomeMessage: '',
  flowItems: '[]',
  languages: '["English"]',
  settings: JSON.stringify({ callDirection: 'OUTBOUND', welcomeOutbound: 'CONFIGURED' }),
};

const FULL = 'Hi, this is Priya from Sunrise Loans, calling about your loan application.';

describe('interrupted welcome in the system prompt', () => {
  test('says it was cut off, what was heard, and what was not', () => {
    const p = buildAgentSystemPrompt(agent, '', { spokenWelcome: interruptedWelcome(FULL, 'Hi, this is') });
    assert.ok(p.includes('CUT OFF'));
    assert.ok(p.includes('"Hi, this is…"'));
    assert.ok(p.includes(FULL));
    assert.ok(!p.includes('already delivered at call start'));
    assert.ok(!p.includes('do not greet or re-introduce yourself again'));
  });

  test('a welcome that played out keeps the "already delivered" rule', () => {
    const p = buildAgentSystemPrompt(agent, '', { spokenWelcome: FULL });
    assert.ok(p.includes(`already delivered at call start: "${FULL}"`));
    assert.ok(!p.includes('CUT OFF'));
  });

  test('an object that was not interrupted is treated as delivered', () => {
    const p = buildAgentSystemPrompt(agent, '', { spokenWelcome: { text: FULL, heard: FULL, interrupted: false } });
    assert.ok(p.includes(`already delivered at call start: "${FULL}"`));
  });

  test('an interrupted welcome with no text still names the configured one', () => {
    const p = buildAgentSystemPrompt(agent, '', { spokenWelcome: interruptedWelcome('', '') });
    assert.ok(p.includes('CUT OFF'));
    assert.ok(p.includes('"CONFIGURED"'));
  });
});
