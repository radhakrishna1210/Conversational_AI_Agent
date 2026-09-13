// What these pin: when the LLM quota is being hit, the requests nobody on a
// live line is waiting for step aside — and when it is not, nothing changes.
//
// The failure they guard against: on a shared requests-per-minute quota, a bulk
// campaign's post-call extractions and hedged requests were taken from the same
// budget as the live calls' turns, so the more calls were up, the more turns
// failed over to a sibling model or failed outright. A FAILED extraction also
// meant no WhatsApp confirmation for a booking that did happen.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const {
  isLlmUnderPressure, noteLlmRateLimited, deferWhileLlmPressured,
  __resetLlmPressureForTests, LLM_PRESSURE_COOLDOWN_MS,
} = await import('../llmPressure.js');
const { extractWhenLlmHasHeadroom } = await import('../../ws/callFinalizer.js');

/** A clock the test moves, and a sleep that moves it instead of waiting. */
const fakeClock = (start = 1_000_000) => {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
    sleep: async (ms) => { t += ms; await Promise.resolve(); },
  };
};

beforeEach(() => __resetLlmPressureForTests());

describe('the pressure signal', () => {
  test('is off until a rate limit is seen, and lifts after the cooldown', () => {
    const t0 = 5_000_000;
    assert.equal(isLlmUnderPressure(t0), false);
    noteLlmRateLimited('test', t0);
    assert.equal(isLlmUnderPressure(t0 + 1), true);
    assert.equal(isLlmUnderPressure(t0 + LLM_PRESSURE_COOLDOWN_MS - 1), true);
    assert.equal(isLlmUnderPressure(t0 + LLM_PRESSURE_COOLDOWN_MS), false);
  });

  test('every new rate limit extends it', () => {
    const t0 = 5_000_000;
    noteLlmRateLimited('test', t0);
    noteLlmRateLimited('test', t0 + LLM_PRESSURE_COOLDOWN_MS - 10);
    assert.equal(isLlmUnderPressure(t0 + LLM_PRESSURE_COOLDOWN_MS + 10), true);
  });
});

describe('deferWhileLlmPressured', () => {
  test('without pressure the job runs straight away — a paid tier sees no delay', async () => {
    const clock = fakeClock();
    let sleeps = 0;
    const out = await deferWhileLlmPressured(() => 'done', { now: clock.now, sleep: async () => { sleeps += 1; } });
    assert.equal(out, 'done');
    assert.equal(sleeps, 0);
  });

  test('under pressure the job waits until it lifts', async () => {
    const clock = fakeClock();
    noteLlmRateLimited('test', clock.now());
    let ranAt = null;
    await deferWhileLlmPressured(() => { ranAt = clock.now(); }, { now: clock.now, sleep: clock.sleep, pollMs: 5_000 });
    assert.ok(ranAt - 1_000_000 >= LLM_PRESSURE_COOLDOWN_MS, `ran after ${ranAt - 1_000_000}ms`);
  });

  test('never waits past its cap — post-call delivery is late, not lost', async () => {
    const clock = fakeClock();
    noteLlmRateLimited('test', clock.now());
    let ran = false;
    // Keep the pressure on for the whole wait.
    const sleep = async (ms) => { clock.advance(ms); noteLlmRateLimited('still limited', clock.now()); };
    await deferWhileLlmPressured(() => { ran = true; }, { now: clock.now, sleep, maxWaitMs: 30_000, pollMs: 5_000 });
    assert.equal(ran, true);
  });

  test('deferred jobs run one at a time, in order', async () => {
    const clock = fakeClock();
    noteLlmRateLimited('test', clock.now());
    const events = [];
    const job = (name) => async () => {
      events.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, 5));
      events.push(`end ${name}`);
    };
    // A cap that never fires, so only a finished job can release the line.
    const opts = { now: clock.now, sleep: clock.sleep, pollMs: 30_000, stepCap: () => new Promise(() => {}) };
    await Promise.all([
      deferWhileLlmPressured(job('a'), opts),
      deferWhileLlmPressured(job('b'), opts),
      deferWhileLlmPressured(job('c'), opts),
    ]);
    assert.deepEqual(events, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  test('a job that never returns does not hold every later call\'s delivery behind it', async () => {
    const clock = fakeClock();
    noteLlmRateLimited('test', clock.now());
    const opts = { now: clock.now, sleep: clock.sleep, pollMs: 30_000, stepCap: () => Promise.resolve() };
    deferWhileLlmPressured(() => new Promise(() => {}), opts); // hangs forever
    let ran = false;
    await deferWhileLlmPressured(() => { ran = true; }, opts);
    assert.equal(ran, true);
  });
});

describe('post-call extraction under a rate limit', () => {
  const RATE_LIMIT = '[429 Too Many Requests] Quota exceeded: GenerateRequestsPerMinutePerProjectPerModel-FreeTier';
  const passThrough = (fn) => Promise.resolve().then(fn);

  test('a rate-limited extraction is retried once, and sets the pressure for everyone else', async () => {
    const results = [{ error: RATE_LIMIT }, { variables: [{ key: 'customer_name', value: 'Krishna' }] }];
    let calls = 0;
    const out = await extractWhenLlmHasHeadroom('ws_1', 'agent_1', 'call_1', {
      extract: async () => results[calls++],
      defer: passThrough,
    });
    assert.equal(calls, 2);
    assert.equal(out.variables[0].value, 'Krishna');
    assert.equal(isLlmUnderPressure(), true);
  });

  test('any other failure is not retried — a bad transcript fails the same way twice', async () => {
    let calls = 0;
    const out = await extractWhenLlmHasHeadroom('ws_1', 'agent_1', 'call_1', {
      extract: async () => { calls += 1; return { error: 'Unexpected token < in JSON' }; },
      defer: passThrough,
    });
    assert.equal(calls, 1);
    assert.match(out.error, /JSON/);
    assert.equal(isLlmUnderPressure(), false);
  });

  test('a successful extraction runs once', async () => {
    let calls = 0;
    await extractWhenLlmHasHeadroom('ws_1', 'agent_1', 'call_1', {
      extract: async () => { calls += 1; return { variables: [] }; },
      defer: passThrough,
    });
    assert.equal(calls, 1);
  });
});
