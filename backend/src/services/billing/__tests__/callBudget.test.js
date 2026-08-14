// backend/src/services/billing/__tests__/callBudget.test.js
/**
 * The per-call spend deadline. Pure timers, no DB, so these run anywhere.
 *
 * This is the guard that keeps a wallet out of the negative once a call is
 * already connected — settlement cannot refuse minutes that were served, so if
 * this fails to fire, nothing else will stop the overdraft.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createCallBudget } from '../callBudget.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('the call is ended once the budget runs out', async () => {
  let ended = 0;
  const budget = createCallBudget({ maxSeconds: 0.05, onExpire: () => { ended += 1; } });

  assert.equal(budget.expired(), false);
  await wait(120);
  assert.equal(ended, 1);
  assert.equal(budget.expired(), true);
  budget.stop();
});

test('an ended call stops its timer, so a hangup cannot fire a late expiry', async () => {
  let ended = 0;
  const budget = createCallBudget({ maxSeconds: 0.05, onExpire: () => { ended += 1; } });
  budget.stop();
  await wait(120);
  assert.equal(ended, 0);
});

test('the caller is warned before the cutoff, not only at it', async () => {
  const events = [];
  const budget = createCallBudget({
    maxSeconds: 0.2,
    warnLeadSec: 0.1,
    onWarn: () => events.push('warn'),
    onExpire: () => events.push('expire'),
  });
  await wait(300);
  assert.deepEqual(events, ['warn', 'expire']);
  budget.stop();
});

test('a budget shorter than the warning lead still ends the call', async () => {
  // The warning is advisory; missing it must never cost the cutoff itself.
  const events = [];
  const budget = createCallBudget({
    maxSeconds: 0.05,
    warnLeadSec: 30,
    onWarn: () => events.push('warn'),
    onExpire: () => events.push('expire'),
  });
  await wait(120);
  assert.deepEqual(events, ['expire']);
  budget.stop();
});

test('an unbounded budget never ends the call', async () => {
  let ended = 0;
  const budget = createCallBudget({ maxSeconds: Infinity, onExpire: () => { ended += 1; } });
  assert.equal(budget.secondsLeft(), Infinity);
  await wait(80);
  assert.equal(ended, 0);
  budget.stop();
});

test('a mid-call top-up extends the deadline', async () => {
  let ended = 0;
  const budget = createCallBudget({ maxSeconds: 0.08, onExpire: () => { ended += 1; } });
  budget.extend(0.3);
  await wait(150);
  assert.equal(ended, 0, 'the original deadline must no longer apply');
  await wait(350);
  assert.equal(ended, 1);
  budget.stop();
});

test('a throwing hangup handler does not take the process down', async () => {
  const budget = createCallBudget({
    maxSeconds: 0.05,
    onExpire: () => { throw new Error('socket already gone'); },
  });
  await wait(120);
  assert.equal(budget.expired(), true);
  budget.stop();
});
