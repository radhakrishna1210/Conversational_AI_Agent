// The bug these pin: a failed sync never advances `lastSyncAt`, so the
// 60-second scheduler sweep re-queued every broken integration on every tick —
// forever, with no backoff, no attempt cap and no circuit breaker.
//
// Measured on this deployment before the fix: 241,776 failed jobs (162,944
// google_sheets, 78,832 google_calendar), oldest 41 days back, several new
// failures a second. That saturated the Prisma connection pool, and the pool is
// shared — /auth/refresh started timing out, and because the browser reads a
// failed refresh as a dead session, users were logged out mid-work. A
// background sweep was denying service to the foreground app.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  backoffDelay,
  noteIntegrationFailure,
  noteIntegrationSuccess,
  isBackingOff,
  backingOffIds,
  resetIntegrationBackoff,
  integrationBackoffState,
} from '../integrationBackoff.js';

const BASE_MS = 5 * 60 * 1000;
const MAX_MS = 6 * 60 * 60 * 1000;

describe('backoffDelay', () => {
  beforeEach(() => resetIntegrationBackoff());

  test('grows exponentially from the first failure', () => {
    assert.equal(backoffDelay(1), BASE_MS);
    assert.equal(backoffDelay(2), BASE_MS * 2);
    assert.equal(backoffDelay(3), BASE_MS * 4);
  });

  test('is capped, so a long outage never becomes a permanent one', () => {
    // The alternative — giving up for good — is a quieter outage. A token that
    // expired usually gets re-authorised by a person eventually.
    assert.equal(backoffDelay(50), MAX_MS);
    assert.equal(backoffDelay(1000), MAX_MS);
    assert.ok(Number.isFinite(backoffDelay(1e6)));
  });

  test('a zero or negative count still yields the base delay, never zero', () => {
    // A zero delay is the runaway: retry immediately, forever.
    assert.equal(backoffDelay(0), BASE_MS);
    assert.equal(backoffDelay(-5), BASE_MS);
  });
});

describe('failure tracking', () => {
  beforeEach(() => resetIntegrationBackoff());

  test('one failure stops the next tick from re-queueing', () => {
    // This single assertion is the whole fix: before it, the answer was always
    // "yes, queue another one", once a minute, for 41 days.
    assert.equal(isBackingOff('i1'), false);
    noteIntegrationFailure('i1', 'Invalid Credentials');
    assert.equal(isBackingOff('i1'), true);
  });

  test('consecutive failures push the retry further out each time', () => {
    const first = noteIntegrationFailure('i1', 'boom');
    const second = noteIntegrationFailure('i1', 'boom');
    const third = noteIntegrationFailure('i1', 'boom');
    assert.deepEqual(
      [first.failures, second.failures, third.failures],
      [1, 2, 3],
    );
    assert.ok(third.delayMs > second.delayMs && second.delayMs > first.delayMs);
  });

  test('a success forgives the integration completely', () => {
    noteIntegrationFailure('i1', 'boom');
    noteIntegrationFailure('i1', 'boom');
    noteIntegrationSuccess('i1');
    assert.equal(isBackingOff('i1'), false);
    // And the count restarts, so one bad day does not permanently slow it down.
    assert.equal(noteIntegrationFailure('i1', 'boom').delayMs, BASE_MS);
  });

  test('backoff is per integration, not global', () => {
    // One broken Google Sheets connection must not stop everyone else syncing.
    noteIntegrationFailure('broken', 'boom');
    assert.equal(isBackingOff('broken'), true);
    assert.equal(isBackingOff('healthy'), false);
  });

  test('the window expires on its own', () => {
    noteIntegrationFailure('i1', 'boom');
    const later = Date.now() + BASE_MS + 1000;
    assert.equal(isBackingOff('i1', later), false, 'must retry once the delay has passed');
  });

  test('backingOffIds lists exactly who is waiting, for the job runner', () => {
    noteIntegrationFailure('a', 'boom');
    noteIntegrationFailure('b', 'boom');
    noteIntegrationSuccess('b');
    const ids = backingOffIds();
    assert.deepEqual([...ids], ['a']);
  });

  test('a missing integration id is ignored rather than tracked as ""', () => {
    // Manual and webhook jobs can carry no integration. Keying on undefined
    // would back off an entry that matches every future lookup.
    for (const id of [null, undefined, '']) noteIntegrationFailure(id, 'boom');
    assert.equal(integrationBackoffState().length, 0);
  });
});

describe('resetIntegrationBackoff', () => {
  beforeEach(() => resetIntegrationBackoff());

  test('reconnecting clears the penalty earned by the old credentials', () => {
    // Without this, reconnecting a broken integration appears to do nothing for
    // up to six hours — and the obvious next move, reconnecting again, also
    // appears to do nothing.
    noteIntegrationFailure('i1', 'Token has been expired or revoked.');
    assert.equal(isBackingOff('i1'), true);
    resetIntegrationBackoff('i1');
    assert.equal(isBackingOff('i1'), false);
  });

  test('clears everything when called with no id', () => {
    noteIntegrationFailure('a', 'boom');
    noteIntegrationFailure('b', 'boom');
    resetIntegrationBackoff();
    assert.equal(integrationBackoffState().length, 0);
  });
});

describe('integrationBackoffState', () => {
  beforeEach(() => resetIntegrationBackoff());

  test('reports why an integration is not syncing', () => {
    noteIntegrationFailure('i1', 'Invalid Credentials');
    const [entry] = integrationBackoffState();
    assert.equal(entry.integrationId, 'i1');
    assert.equal(entry.failures, 1);
    assert.equal(entry.lastError, 'Invalid Credentials');
    assert.ok(entry.nextAttemptAt > Date.now());
  });
});
