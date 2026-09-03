// The bug these pin: how long the agent waits after a caller stops speaking was
// a set of environment variables, so it was one number for a whole deployment.
// It is pure dead air on every turn (~700ms at p50, measured, and absent from
// every latency metric because the clock started after it), and the right
// amount of it is a property of the CONVERSATION — a line where callers read
// out order numbers must not cut them off mid-digit, a yes/no qualifier should
// not sit waiting.
//
// The trap when moving it onto the agent is precedence. This deployment already
// sets DEEPGRAM_ENDPOINTING_MS to exactly the Balanced value, so an env override
// that kept winning would have made the new control appear to do nothing for
// the one profile most likely to be tried first.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  turnEndProfileFor,
  maxCommitMsFor,
  turnEndProfileList,
  TURN_END_PROFILES,
  DEFAULT_TURN_END_PROFILE,
} from '../turnEndProfile.js';

const ENV_KEYS = [
  'DEEPGRAM_ENDPOINTING_MS',
  'DEEPGRAM_ENDPOINT_GRACE_MS',
  'DEEPGRAM_UNFINISHED_GRACE_MS',
  'DEEPGRAM_FINISHED_GRACE_MS',
];

describe('turnEndProfileFor', () => {
  let saved;
  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test('an agent with no setting behaves exactly as it does today', () => {
    assert.deepEqual(turnEndProfileFor({}), TURN_END_PROFILES[DEFAULT_TURN_END_PROFILE]);
    assert.deepEqual(turnEndProfileFor(), TURN_END_PROFILES[DEFAULT_TURN_END_PROFILE]);
    assert.deepEqual(turnEndProfileFor(null), TURN_END_PROFILES[DEFAULT_TURN_END_PROFILE]);
  });

  test('an explicit choice beats the environment', () => {
    // The exact shape of the trap: the box is tuned to the Balanced numbers, and
    // the user picks Fast. They must get Fast.
    process.env.DEEPGRAM_ENDPOINTING_MS = '300';
    process.env.DEEPGRAM_ENDPOINT_GRACE_MS = '400';
    process.env.DEEPGRAM_UNFINISHED_GRACE_MS = '1100';

    const fast = turnEndProfileFor({ turnEndSensitivity: 'fast' });
    assert.deepEqual(
      { e: fast.endpointingMs, g: fast.graceMs, u: fast.unfinishedGraceMs },
      { e: 250, g: 250, u: 800 },
    );
  });

  test('the environment still tunes agents that have not chosen', () => {
    // Existing deployments keep the timings they run today.
    process.env.DEEPGRAM_ENDPOINTING_MS = '500';
    process.env.DEEPGRAM_ENDPOINT_GRACE_MS = '600';
    const p = turnEndProfileFor({});
    assert.equal(p.endpointingMs, 500);
    assert.equal(p.graceMs, 600);
    assert.equal(p.unfinishedGraceMs, TURN_END_PROFILES.balanced.unfinishedGraceMs);
  });

  test('an unknown or malformed setting falls back rather than throwing', () => {
    for (const bad of ['turbo', '', 0, false, [], {}]) {
      assert.deepEqual(
        turnEndProfileFor({ turnEndSensitivity: bad }),
        TURN_END_PROFILES[DEFAULT_TURN_END_PROFILE],
        `"${String(bad)}" should fall back to the default`,
      );
    }
  });

  test('a blank or zero env value cannot collapse the window to nothing', () => {
    // A zero grace means "commit the instant the VAD twitches", i.e. cut the
    // caller off mid-sentence — the failure the grace window exists to prevent.
    process.env.DEEPGRAM_ENDPOINT_GRACE_MS = '0';
    process.env.DEEPGRAM_ENDPOINTING_MS = 'not-a-number';
    const p = turnEndProfileFor({});
    assert.equal(p.graceMs, TURN_END_PROFILES.balanced.graceMs);
    assert.equal(p.endpointingMs, TURN_END_PROFILES.balanced.endpointingMs);
  });

  test('the returned profile is a copy, so a caller cannot corrupt the table', () => {
    const p = turnEndProfileFor({ turnEndSensitivity: 'patient' });
    p.graceMs = 99999;
    assert.equal(TURN_END_PROFILES.patient.graceMs, 700);
  });

  test('every profile carries a finished tier shorter than its ordinary window', () => {
    // The short tier exists to skip dead air on a tail that has handed over the
    // floor. A profile whose "finished" wait is not shorter than its ordinary
    // one would make the tier a no-op, and the log would show it as working.
    for (const p of turnEndProfileList()) {
      assert.ok(Number.isFinite(p.finishedGraceMs) && p.finishedGraceMs >= 0, p.id);
      assert.ok(p.finishedGraceMs < p.graceMs, `${p.id}: finished must be shorter than ordinary`);
      assert.ok(p.graceMs < p.unfinishedGraceMs, `${p.id}: ordinary must be shorter than unfinished`);
    }
  });

  test('the finished tier follows the same precedence as the other windows', () => {
    process.env.DEEPGRAM_FINISHED_GRACE_MS = '90';
    // Unconfigured agent: the environment tunes it.
    assert.equal(turnEndProfileFor({}).finishedGraceMs, 90);
    // Explicit choice: the profile wins, the environment is ignored.
    assert.equal(
      turnEndProfileFor({ turnEndSensitivity: 'patient' }).finishedGraceMs,
      TURN_END_PROFILES.patient.finishedGraceMs,
    );
  });

  test('profiles are ordered fastest-first and strictly increasing', () => {
    // The editor renders them in this order, and a picker whose middle option
    // is not actually in the middle is worse than no picker.
    const list = turnEndProfileList();
    assert.deepEqual(list.map((p) => p.id), ['fast', 'balanced', 'patient']);
    for (let i = 1; i < list.length; i++) {
      assert.ok(
        list[i].endpointingMs + list[i].graceMs > list[i - 1].endpointingMs + list[i - 1].graceMs,
        `${list[i].id} must wait longer than ${list[i - 1].id}`,
      );
    }
  });
});

describe('maxCommitMsFor', () => {
  test('is the WORST case, which is what the browser backstop must clear', () => {
    // The browser's RMS fallback and this commit point race on every turn and
    // the shorter one wins. Publishing the ordinary case instead of the worst
    // case is how lengthening the server's window silently did nothing before.
    const p = TURN_END_PROFILES.balanced;
    assert.equal(maxCommitMsFor(p), p.endpointingMs + p.unfinishedGraceMs);
    assert.ok(maxCommitMsFor(p) > p.endpointingMs + p.graceMs);
  });

  test('every profile publishes a commit point the client can sit above', () => {
    for (const p of turnEndProfileList()) {
      assert.ok(maxCommitMsFor(p) > 0 && Number.isFinite(maxCommitMsFor(p)), p.id);
    }
  });
});
