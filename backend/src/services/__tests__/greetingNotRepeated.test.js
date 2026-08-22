// The agent must know which greeting it already spoke.
//
// The live failure this pins: greetings went per-direction (welcomeTextFor
// prefers settings.welcomeInbound/welcomeOutbound), but the system prompt kept
// naming the legacy agent.welcomeMessage column. An agent configured through
// the greeting tabs was therefore told "do not repeat X" about a string it had
// never said — usually an empty one — and was never told that the greeting it
// DID say was already delivered. On a real 1:29 call it re-spoke the full
// welcome on turns 3 and 5 before moving on.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentSystemPrompt } from '../agentRuntime.service.js';

const agent = (settings, welcomeMessage = '') => ({
  name: 'Anjali',
  welcomeMessage,
  flowItems: '[]',
  languages: '["Hindi"]',
  settings: JSON.stringify(settings),
});

describe('system prompt names the greeting that was actually spoken', () => {
  test('uses the per-direction inbound greeting, not the legacy column', () => {
    const p = buildAgentSystemPrompt(
      agent({ callDirection: 'INBOUND', welcomeInbound: 'नमस्ते, अंजलि बोल रही हूँ।' }, 'OLD LEGACY TEXT'),
      '',
    );
    assert.ok(p.includes('नमस्ते, अंजलि बोल रही हूँ।'));
    assert.ok(!p.includes('OLD LEGACY TEXT'));
  });

  test('uses the per-direction outbound greeting for an outbound agent', () => {
    const p = buildAgentSystemPrompt(
      agent({ callDirection: 'OUTBOUND', welcomeOutbound: 'OUT-GREETING', welcomeInbound: 'IN-GREETING' }, ''),
      '',
    );
    assert.ok(p.includes('OUT-GREETING'));
    assert.ok(!p.includes('IN-GREETING'));
  });

  test('an explicit spokenWelcome from the bridge wins', () => {
    const p = buildAgentSystemPrompt(
      agent({ callDirection: 'INBOUND', welcomeInbound: 'CONFIGURED' }, ''),
      '',
      { spokenWelcome: 'WHAT THE CALLER ACTUALLY HEARD' },
    );
    assert.ok(p.includes('WHAT THE CALLER ACTUALLY HEARD'));
  });

  test('never emits an empty greeting rule', () => {
    const p = buildAgentSystemPrompt(agent({}, ''), '');
    assert.ok(!p.includes('already delivered at call start: ""'));
  });

  test('still honours the legacy column when no per-direction greeting is set', () => {
    const p = buildAgentSystemPrompt(agent({ callDirection: 'INBOUND' }, 'LEGACY ONLY'), '');
    assert.ok(p.includes('LEGACY ONLY'));
  });
});
