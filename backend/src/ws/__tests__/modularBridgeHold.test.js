// A timed hold on the modular phone bridge — the silence on the wire, the
// listening and no-input timers held off for it, and barge-in during it —
// driven through the real bridge with its dependencies mocked. Runs in a child
// process: see support/mockedHarness.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHarness, harnessSkip } from './support/mockedHarness.js';

test('modular bridge timed hold', { skip: harnessSkip }, () => {
  const { status, output } = runHarness(new URL('./modularBridgeHold.harness.mjs', import.meta.url));
  assert.equal(status, 0, output);
});
