// What these pin: the timed-hold rule reaches the model only on a modular voice
// turn of an agent that has a hold length. A bundled realtime engine (xAI,
// ElevenLabs ConvAI) builds its instructions from the same function with the
// same agent row and must NOT get it — nothing on those engines turns the token
// into silence, so it would be spoken. A text chat would print it. And an agent
// without the setting keeps a byte-identical prompt, so its cache is untouched.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentSystemPrompt, buildRuntimeMessages } from '../agentRuntime.service.js';
import { HOLD_MARKER } from '../voice/holdPause.js';

const agentWith = (settings) => ({
  id: 'agent-hold',
  name: 'Riya',
  welcomeMessage: 'Namaste, Hotel Sagar se Riya bol rahi hoon.',
  flowItems: JSON.stringify([{ title: 'Negotiate', body: 'If they ask for a discount, check with the manager.', enabled: true }]),
  settings: JSON.stringify(settings),
  languages: JSON.stringify(['Hindi']),
});
const KB = '### Source: rates.pdf\nDeluxe Rs 2,200 per night.';

describe('timed-hold prompt rule', () => {
  test('a modular voice turn with a hold length is told the token and the length', () => {
    const p = buildAgentSystemPrompt(agentWith({ holdPauseSec: 5 }), KB, { voiceMode: true, holdPauseSec: 5 });
    assert.ok(p.includes(HOLD_MARKER));
    assert.match(p, /about 5 seconds of silence/);
  });

  test('a bundled engine\'s instructions never carry it, even for an agent with a hold length', () => {
    // Exactly how xaiRealtime.service.js and elevenLabsRealtime.service.js call it.
    const p = buildAgentSystemPrompt(agentWith({ holdPauseSec: 5 }), KB, { voiceMode: true, spokenWelcome: 'Namaste.' });
    assert.ok(!p.includes(HOLD_MARKER));
  });

  test('a text chat never carries it', () => {
    const p = buildAgentSystemPrompt(agentWith({ holdPauseSec: 5 }), KB, { voiceMode: false, holdPauseSec: 5 });
    assert.ok(!p.includes(HOLD_MARKER));
  });

  test('an invalid or absent length adds nothing, byte for byte', () => {
    const agent = agentWith({});
    const base = buildAgentSystemPrompt(agent, KB, { voiceMode: true, kbInline: false });
    for (const holdPauseSec of [null, 0, 11, 'abc']) {
      assert.equal(buildAgentSystemPrompt(agent, KB, { voiceMode: true, kbInline: false, holdPauseSec }), base, String(holdPauseSec));
    }
  });

  test('buildRuntimeMessages passes the length through on both provider shapes', () => {
    for (const supportsChatHistory of [true, false]) {
      const { systemPrompt } = buildRuntimeMessages({
        agent: agentWith({ holdPauseSec: 3 }), kbText: KB, lastContent: 'discount milega?', voiceMode: true, supportsChatHistory, holdPauseSec: 3,
      });
      assert.match(systemPrompt, /about 3 seconds of silence/, `supportsChatHistory=${supportsChatHistory}`);
    }
  });
});
