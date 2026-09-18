import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSlidingWindowContext } from '../slidingWindowContext.js';
import { createDeterministicStateMachine, validateLuhn } from '../deterministicStateMachine.js';
import { createCallResumptionCache } from '../callResumptionCache.js';
import { createCallCostTracker } from '../costTrackerKillSwitch.js';

describe('Sliding Window Context Truncation', () => {
  test('retains only last N turns and generates background memory summary', () => {
    const ctx = createSlidingWindowContext({ maxRecentTurns: 3 });

    ctx.addTurn('user', 'Hello I want to check my flight');
    ctx.addTurn('agent', 'Sure what is your flight number?');
    ctx.addTurn('user', 'It is AI 101');
    ctx.addTurn('agent', 'Your flight is on time');
    ctx.addTurn('user', 'Can I change my seat?');

    assert.equal(ctx.getRecentTurns().length, 3);
    assert.ok(ctx.getSummary().length > 0, 'Should have compressed earlier turns into summary');
    
    const messages = ctx.getPromptMessages('You are an airline assistant');
    assert.ok(messages.some(m => m.role === 'system' && m.content.includes('Background Memory')));
  });
});

describe('Deterministic State Machine', () => {
  test('validates card number using Luhn algorithm', () => {
    assert.equal(validateLuhn('49927398716'), true);
    assert.equal(validateLuhn('49927398717'), false);
  });

  test('walks through deterministic OTP slot filling flow', () => {
    const sm = createDeterministicStateMachine({
      slots: [
        { name: 'otp', prompt: 'Please say your 4-digit code.', type: 'otp', length: 4 },
      ],
      completionMessage: 'OTP verified successfully.',
    });

    assert.equal(sm.isLocked(), true);
    assert.equal(sm.getCurrentPrompt(), 'Please say your 4-digit code.');

    // Bad attempt (not 4 digits)
    const badRes = sm.processUserInput('12');
    assert.equal(badRes.status, 'retry');

    // Good attempt
    const goodRes = sm.processUserInput('My code is 4829');
    assert.equal(goodRes.status, 'completed');
    assert.equal(goodRes.collected.otp, '4829');
    assert.equal(sm.isLocked(), false);
  });
});

describe('Call Resumption Cache', () => {
  test('preserves dropped call context for Caller-ID and retrieves within TTL', () => {
    const cache = createCallResumptionCache({ ttlMs: 5000 });
    cache.saveSession('+14155552671', { step: 'booking_confirmation', bookingId: 'BK994' });

    const resumed = cache.retrieveSession('+1 (415) 555-2671');
    assert.ok(resumed);
    assert.equal(resumed.isResumed, true);
    assert.equal(resumed.sessionState.bookingId, 'BK994');
  });

  test('expires old session outside TTL', async () => {
    const cache = createCallResumptionCache({ ttlMs: 10 });
    cache.saveSession('+14155559999', { test: 123 });

    await new Promise(r => setTimeout(r, 20));
    assert.equal(cache.retrieveSession('+14155559999'), null);
  });
});

describe('Cost Tracker & Fraud Kill-Switch', () => {
  test('calculates accurate multi-modal cost metrics', () => {
    const tracker = createCallCostTracker();
    tracker.recordLlmTokens(500, 100);
    tracker.recordTtsChars(250);

    const metrics = tracker.getMetrics();
    assert.equal(metrics.totalTokens, 600);
    assert.equal(metrics.ttsChars, 250);
    assert.ok(metrics.totalCostUsd >= 0);
    assert.equal(metrics.isTerminated, false);
  });

  test('trips fraud kill switch when token limit is exceeded', () => {
    const tracker = createCallCostTracker({ maxTokens: 1000 });
    tracker.recordLlmTokens(800, 300);

    assert.equal(tracker.isTerminated(), true);
    assert.equal(tracker.getMetrics().terminationReason, 'max_tokens_exceeded');
  });
});
