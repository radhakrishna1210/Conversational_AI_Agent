// backend/src/services/__tests__/welcomeDirection.test.js
//
// What these pin: every call opens with a greeting that suits the way the call
// is going, whichever engine speaks it — and the model is told the greeting that
// was actually spoken.
//
// The failures they guard against were all live:
//   - an inbound caller to an agent built for outbound calling heard its
//     outbound pitch ("Hi, this is Anjali calling from Sunrise Hospital. Is this
//     a good time to talk?"), because the empty Incoming tab fell through to the
//     legacy column, which the editor keeps as a mirror of the outbound greeting;
//   - the English "thank you for calling" rewrite ran on text the member typed
//     into the Outgoing tab and deleted their consent question;
//   - the prompt named the configured direction's greeting, not the spoken one;
//   - xAI spoke no greeting at all, and ElevenLabs spoke the raw legacy column.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const {
  resolveWelcome,
  renderWelcome,
  neutralGreeting,
  companyFromGreetings,
  stripInboundThanks,
  readsAsOtherDirection,
  buildRuntimeMessages,
} = await import('../agentRuntime.service.js');
const { buildGreetingItem } = await import('../voice/xaiRealtime.service.js');
const { firstMessageFor } = await import('../voice/elevenLabsRealtime.service.js');
const { closingLineOf } = await import('../campaignRunner.service.js');

/** An agent row the way the database holds one: settings is a JSON string. */
const agentRow = ({ settings = {}, welcomeMessage = '', languages = ['English (Indian)'], name = 'Sunrise desk' } = {}) => ({
  id: 'agent_1',
  name,
  welcomeMessage,
  languages: JSON.stringify(languages),
  settings: JSON.stringify({ personaName: 'Anjali', ...settings }),
  flowItems: '[]',
});

const OUTBOUND_PITCH = 'Hi, this is Anjali calling from Sunrise Hospital. Is this a good time to talk?';

describe('an inbound call never opens with the outbound pitch', () => {
  test('the reported case: an agent built for outbound, Incoming tab empty', () => {
    // The editor saves welcomeMessage as a mirror of the configured direction.
    const agent = agentRow({
      welcomeMessage: OUTBOUND_PITCH,
      settings: { callDirection: 'OUTBOUND', welcomeOutbound: OUTBOUND_PITCH, welcomeInbound: '' },
    });
    const out = renderWelcome(agent, { direction: 'INBOUND' });
    assert.equal(out.source, 'neutral');
    assert.equal(out.welcome, 'Hello, this is Anjali from Sunrise Hospital. How can I help you today?');
    assert.doesNotMatch(out.welcome, /calling from|good time/i);
  });

  test('the same agent still speaks its own outbound greeting on an outbound call', () => {
    const agent = agentRow({ welcomeMessage: OUTBOUND_PITCH, settings: { callDirection: 'OUTBOUND', welcomeOutbound: OUTBOUND_PITCH } });
    assert.deepEqual(renderWelcome(agent, { direction: 'OUTBOUND' }), { welcome: OUTBOUND_PITCH, rendered: false, source: 'authored' });
  });

  test('a legacy greeting that announces a call is not used inbound, whatever the saved direction', () => {
    const agent = agentRow({ welcomeMessage: 'Hello, I am calling from our sales team about an offer.' });
    const out = resolveWelcome(agent, JSON.parse(agent.settings), 'INBOUND');
    assert.equal(out.source, 'neutral');
  });

  test('the Marathi "कॉल करत आहे" counts as announcing a call', () => {
    assert.equal(readsAsOtherDirection('नमस्कार, मी सनराइज़ हॉस्पिटलमधून कॉल करत आहे', 'INBOUND'), true);
  });

  test('an inbound-style legacy greeting on an undirected agent is still used — no existing agent changes', () => {
    const agent = agentRow({ welcomeMessage: 'Thank you for calling Sunrise Hospital. How can I help?' });
    assert.deepEqual(resolveWelcome(agent, JSON.parse(agent.settings), 'INBOUND'), { text: 'Thank you for calling Sunrise Hospital. How can I help?', source: 'legacy' });
  });

  test('a greeting typed into the Incoming tab is always spoken as written', () => {
    const agent = agentRow({ settings: { callDirection: 'OUTBOUND', welcomeInbound: 'Namaste, Sunrise Hospital. Kaise madad karun?' } });
    assert.equal(renderWelcome(agent, { direction: 'INBOUND' }).source, 'authored');
  });
});

describe('neutral greetings', () => {
  test('in the agent\'s language, and gender-neutral where the language marks gender', () => {
    const hindi = agentRow({ languages: ['Hindi'], settings: { welcomeOutbound: OUTBOUND_PITCH } });
    const marathi = agentRow({ languages: ['Marathi'], settings: { welcomeOutbound: OUTBOUND_PITCH } });
    const hi = neutralGreeting(hindi, JSON.parse(hindi.settings), 'INBOUND');
    const mr = neutralGreeting(marathi, JSON.parse(marathi.settings), 'INBOUND');
    assert.match(hi, /नमस्ते/);
    assert.match(mr, /नमस्कार/);
    // The persona's gender is unknown: no feminine/masculine verb endings.
    assert.doesNotMatch(hi, /सकती|सकता|रही|रहा/);
    assert.doesNotMatch(mr, /शकते|शकतो|करते|करतो/);
    assert.match(hi, /Sunrise Hospital/, 'the business named in the member\'s own greeting is reused');
  });

  test('a language without a template falls back to English rather than to the wrong direction', () => {
    const tamil = agentRow({ languages: ['Tamil'] });
    assert.equal(neutralGreeting(tamil, {}, 'INBOUND'), 'Hello, this is Anjali. How can I help you today?');
  });

  test('the outbound neutral greeting with no business is the long-standing persona line', () => {
    assert.equal(neutralGreeting(agentRow(), {}, 'OUTBOUND'), 'Hello, this is Anjali.');
  });

  test('a greeting made only of placeholders never becomes dead air', () => {
    const agent = agentRow({ settings: { welcomeOutbound: '[Opening line]' } });
    const out = renderWelcome(agent, { direction: 'OUTBOUND' });
    assert.equal(out.source, 'neutral');
    assert.ok(out.welcome.length > 0);
  });
});

describe('companyFromGreetings', () => {
  test('reads a business name only when it is written as one', () => {
    assert.equal(companyFromGreetings(OUTBOUND_PITCH), 'Sunrise Hospital');
    assert.equal(companyFromGreetings('Welcome to BrightNest Home Services! How can I help?'), 'BrightNest Home Services');
    assert.equal(companyFromGreetings('Hi, this is Ravi calling from Bank of India about your card.'), 'Bank of India');
    assert.equal(companyFromGreetings("Hi, I'm Sarah from Acme. Thank you for calling!"), 'Acme');
    assert.equal(companyFromGreetings('Hi, this is Anjali from our support team.'), '', 'lowercase is a department');
    assert.equal(companyFromGreetings('Hello, thank you for calling support.'), '');
    assert.equal(companyFromGreetings(''), '');
  });
});

describe('the outbound "thank you for calling" rewrite', () => {
  test('never touches a greeting typed into the Outgoing tab — the consent question survives', () => {
    const written = 'Hi Rahul, this is Anjali from Sunrise Hospital. Thanks for calling us yesterday — is now a good time to talk?';
    const agent = agentRow({ settings: { welcomeOutbound: written } });
    const out = renderWelcome(agent, { direction: 'OUTBOUND' });
    assert.equal(out.welcome, written);
    assert.equal(out.rendered, false);
  });

  test('a member\'s own Outgoing text is spoken as written even when it does say "thank you for calling"', () => {
    // No past-call wording here, so nothing but scoping protects it: the editor
    // warns about the phrase, but the member decides — the runtime must not
    // silently rebuild a greeting someone typed and saved on purpose.
    const written = 'Hello! Thank you for calling Sunrise Hospital while we were closed — this is Anjali, returning your call.';
    const agent = agentRow({ settings: { welcomeOutbound: written } });
    assert.equal(renderWelcome(agent, { direction: 'OUTBOUND' }).welcome, written);
  });

  test('still fixes the legacy single field on an outbound call', () => {
    const agent = agentRow({ welcomeMessage: 'Thank you for calling Innovate Solutions, my name is Anjali. I can help you book a demo.' });
    const out = renderWelcome(agent, { direction: 'OUTBOUND' });
    assert.equal(out.source, 'legacy');
    assert.match(out.welcome, /^Hi, this is Anjali calling from Innovate Solutions\./);
  });

  test('a legacy Hindi thanks it cannot rewrite becomes the neutral greeting instead', () => {
    const agent = agentRow({ languages: ['Hindi'], welcomeMessage: 'नमस्ते, सनराइज़ हॉस्पिटल में कॉल करने के लिए धन्यवाद।' });
    const out = renderWelcome(agent, { direction: 'OUTBOUND' });
    assert.equal(out.source, 'neutral');
    assert.doesNotMatch(out.welcome, /धन्यवाद/);
  });

  test('keeps the company carried by the introduction instead of dropping it', () => {
    assert.equal(
      stripInboundThanks('Thank you for calling, this is Anjali from Sunrise Hospital. How can I help?', 'Anjali'),
      'Hi, this is Anjali calling from Sunrise Hospital. How can I help?',
    );
  });

  test("an \"I'm Sarah\" introduction is not repeated", () => {
    assert.equal(stripInboundThanks("Hi, I'm Sarah from Acme. Thank you for calling!", 'Sarah'), 'Hi, this is Sarah calling from Acme.');
  });

  test('a thanks for a PAST call is left alone', () => {
    const text = 'Hi Rahul, this is Anjali from Sunrise Hospital. Thanks for calling us yesterday — is now a good time to talk?';
    assert.equal(stripInboundThanks(text, 'Anjali'), text);
  });

  test('"Tim Sarah" is not read as "…im Sarah"', () => {
    assert.match(stripInboundThanks('Thank you for calling. Please hold for Tim Sarah.', 'Sarah'), /Tim Sarah/);
  });
});

describe('the prompt names the greeting that was spoken', () => {
  // An INBOUND-configured agent on an outbound campaign call: the callee heard
  // the Outgoing greeting, so that is what the model must be told it said.
  const agent = agentRow({ settings: { callDirection: 'INBOUND', welcomeInbound: 'Thank you for calling Sunrise Hospital.', welcomeOutbound: OUTBOUND_PITCH } });

  for (const supportsChatHistory of [true, false]) {
    test(`spokenWelcome reaches the system prompt (chat history: ${supportsChatHistory})`, () => {
      const { systemPrompt } = buildRuntimeMessages({ agent, voiceMode: true, supportsChatHistory, spokenWelcome: OUTBOUND_PITCH, lastContent: 'hello?' });
      assert.match(systemPrompt, /Is this a good time to talk\?/);
      assert.doesNotMatch(systemPrompt, /Thank you for calling Sunrise Hospital/);
    });
  }

  test('without it, the configured direction\'s greeting is named, as before', () => {
    const { systemPrompt } = buildRuntimeMessages({ agent, voiceMode: true, supportsChatHistory: true, lastContent: 'hello?' });
    assert.match(systemPrompt, /Thank you for calling Sunrise Hospital/);
  });
});

describe('bundled engines speak the rendered greeting', () => {
  test('xAI opens with a verbatim force_message', () => {
    assert.deepEqual(buildGreetingItem('Hello, this is Anjali.', { interruptible: false }), {
      type: 'conversation.item.create',
      item: { type: 'force_message', role: 'assistant', interruptible: false, content: [{ type: 'output_text', text: 'Hello, this is Anjali.' }] },
    });
    assert.equal(buildGreetingItem('x').item.interruptible, true, 'interruptible unless the agent says otherwise');
  });

  test('ElevenLabs sends the rendered greeting, not the raw legacy column', () => {
    const agent = { welcomeMessage: 'Thank you for calling Sunrise Hospital.' };
    assert.equal(firstMessageFor(OUTBOUND_PITCH, agent), OUTBOUND_PITCH);
    assert.equal(firstMessageFor(null, agent), 'Thank you for calling Sunrise Hospital.', 'a caller without a rendered greeting keeps the old behaviour');
    assert.equal(firstMessageFor('  ', { welcomeMessage: '' }), null);
  });
});

describe('closingLineOf — the campaign closing line', () => {
  test('comes from settings, where the editor saves it', () => {
    assert.equal(closingLineOf({ settings: JSON.stringify({ endCallMessage: 'Thank you, goodbye.' }) }), 'Thank you, goodbye.');
    assert.equal(closingLineOf({ settings: { endCallMessage: ' Bye. ' } }), 'Bye.');
    assert.equal(closingLineOf({ endCallMessage: 'on the row', settings: '{}' }), '', 'the row never had one');
    assert.equal(closingLineOf({ settings: '{not json' }), '');
  });
});
