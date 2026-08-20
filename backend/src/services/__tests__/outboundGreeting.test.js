// backend/src/services/__tests__/outboundGreeting.test.js
/**
 * The no-knowledge-base path for turning an inbound greeting into an outbound
 * one. Most live agents have no KB at all, so this — not the LLM rewrite — is
 * what an outbound campaign actually speaks.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { stripInboundThanks, welcomeTextFor } from '../agentRuntime.service.js';

describe('stripInboundThanks — rebuilding an outbound opener', () => {
  test('keeps the company that was hidden inside the thanks clause', () => {
    const out = stripInboundThanks(
      "Thank you for calling Innovate Solutions, my name is Sarah. I'm here to help you schedule a demonstration.",
      'Sarah',
    );
    assert.match(out, /^Hi, this is Sarah calling from Innovate Solutions\./);
    assert.match(out, /schedule a demonstration/);
  });

  test('never leaves the thanks behind, whatever else it does', () => {
    const inputs = [
      'Hello, thank you for calling. This is Priya. How can I assist you today?',
      'Thanks for calling BrightNest Home Services! My name is Riley.',
      'Hi there and thank you for calling us today.',
    ];
    for (const raw of inputs) {
      assert.doesNotMatch(stripInboundThanks(raw, 'Riley'), /for calling/i, raw);
    }
  });

  test('does not introduce the agent twice', () => {
    const out = stripInboundThanks(
      'Hello, thank you for calling. This is Priya. How can I assist you today?',
      'Priya',
    );
    assert.equal(out.match(/Priya/g).length, 1);
    assert.match(out, /^Hi, this is Priya\./);
    assert.match(out, /How can I assist you today\?$/);
  });

  test('a department is not a company', () => {
    // "thank you for calling support" — inventing "calling from support" would
    // be worse than saying nothing at all.
    const out = stripInboundThanks(
      'Hello, thank you for calling support. I am your customer service assistant. How can I help?',
      'Anjali',
    );
    assert.doesNotMatch(out, /calling from/);
    assert.match(out, /^Hi, this is Anjali\./);
  });

  test('with no persona and no company it only removes the contradiction', () => {
    const out = stripInboundThanks('Thank you for calling. How can I help you today?', '');
    assert.equal(out, 'How can I help you today?');
  });

  test('a greeting that never thanked anyone is left alone apart from the opener', () => {
    const out = stripInboundThanks('How can I help you today?', 'Sarah');
    assert.equal(out, 'How can I help you today?');
  });

  test('the remainder starts as its own sentence', () => {
    const out = stripInboundThanks(
      'Thanks for calling Acme Corp, this is Meera. how can I help?',
      'Meera',
    );
    assert.match(out, /^Hi, this is Meera calling from Acme Corp\. How can I help\?$/);
  });

  test('the opener does not say hello twice', () => {
    const out = stripInboundThanks(
      'Hello, thank you for calling support. I am your customer service assistant.',
      'Ananya',
    );
    assert.equal(out, 'Hi, this is Ananya. I am your customer service assistant.');
  });

  test('a dangling conjunction left by the removal is cleaned up', () => {
    const out = stripInboundThanks(
      'Hello, thank you for calling BrightNest Home Services! My name is Riley, and I am here to help.',
      'Riley',
    );
    assert.equal(out, 'Hi, this is Riley calling from BrightNest Home Services. I am here to help.');
  });

  test('a persona containing regex metacharacters does not throw', () => {
    assert.doesNotThrow(() => stripInboundThanks('Thank you for calling. This is A.J. here.', 'A.J.'));
  });
});

// ── Rate-limit detection ─────────────────────────────────────────────────────
//
// Free-tier Gemini is 15 requests per MINUTE per model, which one live call very
// nearly saturates on its own. Everything that keeps a call alive under that —
// falling back to a sibling model whose quota is separate, and NOT hedging a
// second request into the limit that just rejected the first — hangs off this
// one predicate, and it matches on provider error TEXT because no SDK on this
// path exposes a stable code. So it is exactly the kind of thing that breaks
// silently when a provider rewords a message.
import { isRateLimited } from '../agentRuntime.service.js';

describe('isRateLimited', () => {
  test('recognises how each provider says "over quota"', () => {
    const quota = [
      // Google, verbatim from the live API on 2026-08-19.
      '[429 Too Many Requests] You exceeded your current quota. quotaId: '
      + 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier, quotaValue: 15',
      'got status: 429 RESOURCE_EXHAUSTED',
      'Groq: rate limit reached for model',
      'Request failed: Too Many Requests',
    ];
    for (const m of quota) assert.ok(isRateLimited(new Error(m)), m);
  });

  test('does not mistake other failures for a quota problem', () => {
    // These must NOT fall back or retry — another model fails identically, and
    // the timeout marker in particular drives the hedge, which is a different
    // decision entirely.
    const other = [
      'llm-timeout',
      '[404 Not Found] models/gemini-2.5-flash-lite is no longer available',
      '[400 Bad Request] Request contains an invalid argument.',
      'fetch failed',
    ];
    for (const m of other) assert.equal(isRateLimited(new Error(m)), false, m);
  });

  test('a missing or empty error is not a rate limit', () => {
    assert.equal(isRateLimited(null), false);
    assert.equal(isRateLimited(new Error('')), false);
  });
});

// ── Per-direction welcome resolution ────────────────────────────────────────
//
// The greeting used to be produced by an LLM rewrite that was told to "keep the
// original intent and warmth" — i.e. to paraphrase. It did, and an operator who
// wrote a careful two-sentence opener with a consent question heard the call
// open with something recognisably about the same topic and recognisably not
// what they wrote. The greeting is data now, and these pin the fallback chain
// so an agent that has never had the new fields keeps behaving exactly as it did.

describe('welcomeTextFor — which greeting this call opens with', () => {
  const agent = { name: 'Feedback Campaign', welcomeMessage: 'LEGACY' };

  test('prefers the per-direction field for the direction of THIS call', () => {
    const settings = { welcomeInbound: 'IN', welcomeOutbound: 'OUT' };
    assert.equal(welcomeTextFor(agent, settings, 'INBOUND'), 'IN');
    assert.equal(welcomeTextFor(agent, settings, 'OUTBOUND'), 'OUT');
  });

  test('this call direction outranks the agent\'s configured one', () => {
    // The case that produced "thank you for calling" on a call we dialled: a
    // campaign dialling OUTBOUND through an agent saved as INBOUND.
    const settings = { callDirection: 'INBOUND', welcomeInbound: 'IN', welcomeOutbound: 'OUT' };
    assert.equal(welcomeTextFor(agent, settings, 'OUTBOUND'), 'OUT');
  });

  test('unknown direction falls back to the agent\'s configured side', () => {
    // An inbound webhook on a number that could be either passes nothing.
    assert.equal(
      welcomeTextFor(agent, { callDirection: 'OUTBOUND', welcomeInbound: 'IN', welcomeOutbound: 'OUT' }, null),
      'OUT',
    );
    assert.equal(
      welcomeTextFor(agent, { callDirection: 'INBOUND', welcomeInbound: 'IN', welcomeOutbound: 'OUT' }, null),
      'IN',
    );
  });

  test('an agent that only ever had welcomeMessage is unchanged', () => {
    // No migration, no behaviour change: every existing agent lands here.
    assert.equal(welcomeTextFor(agent, {}, 'INBOUND'), 'LEGACY');
    assert.equal(welcomeTextFor(agent, {}, 'OUTBOUND'), 'LEGACY');
    assert.equal(welcomeTextFor(agent, {}, null), 'LEGACY');
  });

  test('a blank or whitespace-only per-direction field is not a greeting', () => {
    assert.equal(welcomeTextFor(agent, { welcomeOutbound: '' }, 'OUTBOUND'), 'LEGACY');
    assert.equal(welcomeTextFor(agent, { welcomeOutbound: '   ' }, 'OUTBOUND'), 'LEGACY');
  });

  test('never returns empty — dead air on answer is the worst outcome', () => {
    // The persona comes off the agent row (getPersonaName parses agent.settings),
    // not from the settings object passed alongside it, so the fixture has to
    // carry it the way a real row does.
    const bare = { name: 'X', welcomeMessage: '', settings: JSON.stringify({ personaName: 'Anjali' }) };
    assert.equal(welcomeTextFor(bare, { personaName: 'Anjali' }, 'OUTBOUND'), 'Hello, this is Anjali.');
  });

  test('the stored text is returned verbatim, not rewritten', () => {
    // Including the consent question a paraphrase kept dropping.
    const written = 'नमस्ते, मैं सनराइज़ हॉस्पिटल से अंजलि बोल रही हूँ। क्या अभी दो मिनट बात करने का सही समय है?';
    assert.equal(welcomeTextFor(agent, { welcomeOutbound: written }, 'OUTBOUND'), written);
  });
});
