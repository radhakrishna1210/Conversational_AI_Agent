import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildLatencyRecord } from '../latencyLog.js';
import { startEventLoopLagMonitor, snapshotEventLoopLag, stopEventLoopLagMonitor } from '../eventLoopLag.js';

describe('latency record shape', () => {
  test('stamps ts first, keeps every caller field, appends the lag snapshot', () => {
    const rec = buildLatencyRecord(
      { turnId: 'abc:3', kind: 'wire', channel: 'phone', wireMs: 412 },
      { now: () => new Date('2026-09-03T10:00:00.000Z'), lag: () => ({ elLagP50Ms: 1, elLagP99Ms: 9, elLagMaxMs: 12, elLagSamples: 40 }) },
    );
    assert.deepEqual(rec, {
      ts: '2026-09-03T10:00:00.000Z',
      turnId: 'abc:3', kind: 'wire', channel: 'phone', wireMs: 412,
      elLagP50Ms: 1, elLagP99Ms: 9, elLagMaxMs: 12, elLagSamples: 40,
    });
    // `ts` is the join/sort key for every downstream script; it must lead.
    assert.equal(Object.keys(rec)[0], 'ts');
  });

  test('a record without turnId still serialises (older call sites)', () => {
    const rec = buildLatencyRecord({ agentId: 'a1', channel: 'web', ttfaMs: 900 }, { lag: () => ({}) });
    assert.equal(rec.agentId, 'a1');
    assert.equal(rec.turnId, undefined);
    assert.doesNotThrow(() => JSON.stringify(rec));
  });
});

describe('event-loop lag sampler', () => {
  after(() => stopEventLoopLagMonitor());

  test('reports nulls before any sample, then integers in ms, and resets between snapshots', async () => {
    stopEventLoopLagMonitor();
    assert.deepEqual(snapshotEventLoopLag(), { elLagP50Ms: null, elLagP99Ms: null, elLagMaxMs: null, elLagSamples: 0 });

    startEventLoopLagMonitor(10);
    // The sampler needs one clean tick as its baseline before a stall registers,
    // so settle first, then block the loop for ~80ms, then let it sample the gap.
    await new Promise((r) => setTimeout(r, 30));
    const until = Date.now() + 80;
    while (Date.now() < until) { /* spin */ }
    await new Promise((r) => setTimeout(r, 50));

    const s1 = snapshotEventLoopLag();
    assert.ok(s1.elLagSamples > 0, 'took samples');
    assert.ok(Number.isInteger(s1.elLagP99Ms) && s1.elLagP99Ms >= 0);
    assert.ok(s1.elLagMaxMs >= 40, `max lag ${s1.elLagMaxMs}ms should reflect the 80ms stall`);

    const s2 = snapshotEventLoopLag();
    assert.equal(s2.elLagSamples, 0, 'snapshot resets the histogram');
  });
});
