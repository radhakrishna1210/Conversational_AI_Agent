// backend/src/services/telephony/__tests__/concurrency.test.js
//
// The ceilings are two integers on a reserved Plan row; everything interesting
// in this module is the slot accounting around them. So the limits are seeded
// straight into the cache and no database is involved — this repo's notes are
// emphatic that the live Supabase is never to be written to from a test, and
// nothing else here mocks modules.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkConcurrency, acquireSlot, releaseSlot, snapshot,
  setConcurrencyLimits, __resetForTests,
} from '../concurrency.js';

/** Plivo India's documented default, and our live ceiling as of 2026-08-16. */
const CARRIER_CEILING = 50;
/** ...minus the default safety buffer of 5. */
const USABLE = 45;

const reset = (perWorkspace = 0) =>
  __resetForTests({ carrierCeiling: CARRIER_CEILING, perWorkspace });

test('allows calls below the ceiling and refuses at it', async () => {
  reset();
  for (let i = 0; i < USABLE; i += 1) {
    const gate = await checkConcurrency('ws1');
    assert.equal(gate.allowed, true, `slot ${i} should be free`);
    acquireSlot({ workspaceId: 'ws1', callLogId: `call-${i}` });
  }

  const full = await checkConcurrency('ws1');
  assert.equal(full.allowed, false);
  assert.equal(full.code, 'CONCURRENCY_LIMIT',
    'campaignRunner\'s existing wait loop keys on exactly this string');
  assert.equal(full.ceiling, USABLE);
});

test('holds back a safety buffer from the carrier ceiling', async () => {
  reset();
  for (let i = 0; i < USABLE; i += 1) acquireSlot({ workspaceId: 'ws1', callLogId: `c${i}` });

  const gate = await checkConcurrency('ws1');
  assert.equal(gate.allowed, false);
  // The point of the buffer: we stop short, so an inbound call or a manual test
  // dial is not the thing our own campaign gets 5030'd.
  assert.ok(gate.ceiling < CARRIER_CEILING,
    `usable ${gate.ceiling} must leave headroom under the carrier's ${CARRIER_CEILING}`);
});

test('releasing a slot lets the next call through', async () => {
  reset();
  for (let i = 0; i < USABLE; i += 1) acquireSlot({ workspaceId: 'ws1', callLogId: `c${i}` });
  assert.equal((await checkConcurrency('ws1')).allowed, false);

  releaseSlot('c0');
  assert.equal((await checkConcurrency('ws1')).allowed, true);
});

test('acquire is idempotent — a repeated call log id is one slot', () => {
  reset();
  acquireSlot({ workspaceId: 'ws1', callLogId: 'same' });
  acquireSlot({ workspaceId: 'ws1', callLogId: 'same' });
  acquireSlot({ workspaceId: 'ws1', callLogId: 'same' });
  assert.equal(snapshot().active, 1);
});

test('a null call log id takes no slot', () => {
  reset();
  acquireSlot({ workspaceId: 'ws1', callLogId: null });
  assert.equal(snapshot().active, 0);
  releaseSlot(null);            // and must not throw
  releaseSlot('never-acquired');
  assert.equal(snapshot().active, 0);
});

test('the per-workspace cap stops one tenant taking the whole pool', async () => {
  reset(3);

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await checkConcurrency('noisy')).allowed, true);
    acquireSlot({ workspaceId: 'noisy', callLogId: `n${i}` });
  }

  const capped = await checkConcurrency('noisy');
  assert.equal(capped.allowed, false);
  assert.equal(capped.ceiling, 3);
  assert.match(capped.message, /workspace/i,
    'the message must say it is a tenant cap, not a full platform');

  // The whole point of the cap: a DIFFERENT tenant is unaffected.
  assert.equal((await checkConcurrency('quiet')).allowed, true);
});

test('the global ceiling still binds when every tenant is under its own cap', async () => {
  reset(100);   // per-tenant effectively uncapped
  for (let i = 0; i < USABLE; i += 1) acquireSlot({ workspaceId: `ws${i}`, callLogId: `c${i}` });

  const gate = await checkConcurrency('ws-new');
  assert.equal(gate.allowed, false, 'one call each from many tenants still fills the pool');
});

test('snapshot reports per-workspace usage', () => {
  reset();
  acquireSlot({ workspaceId: 'a', callLogId: '1' });
  acquireSlot({ workspaceId: 'a', callLogId: '2' });
  acquireSlot({ workspaceId: 'b', callLogId: '3' });

  const s = snapshot();
  assert.equal(s.active, 3);
  assert.deepEqual(s.byWorkspace, { a: 2, b: 1 });
  assert.equal(s.safetyBuffer, CARRIER_CEILING - USABLE);
});

test('limits are validated before anything is written', async () => {
  reset();
  // These all throw on the argument, before the row is touched, which is why
  // they are safe to assert without a database.
  await assert.rejects(() => setConcurrencyLimits({ carrierCeiling: 0 }), /at least 1/);
  await assert.rejects(() => setConcurrencyLimits({ carrierCeiling: 2.5 }), /whole number/);
  await assert.rejects(() => setConcurrencyLimits({ carrierCeiling: 'lots' }), /whole number/);
  await assert.rejects(() => setConcurrencyLimits({ perWorkspace: -1 }), /whole number/);
});

test('a raised ceiling frees the calls that were queued behind the old one', async () => {
  reset();
  for (let i = 0; i < USABLE; i += 1) acquireSlot({ workspaceId: 'ws1', callLogId: `c${i}` });
  assert.equal((await checkConcurrency('ws1')).allowed, false);

  // What a Super Admin change looks like once it lands in the cache.
  __resetForTests({ carrierCeiling: 200, perWorkspace: 0 });
  for (let i = 0; i < USABLE; i += 1) acquireSlot({ workspaceId: 'ws1', callLogId: `c${i}` });
  assert.equal((await checkConcurrency('ws1')).allowed, true);
});
