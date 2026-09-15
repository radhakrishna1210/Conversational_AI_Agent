// A timed hold on the modular web call: the pause frame relayed in order
// between the two audio segments, and never after a barge. Runs in a child
// process with module mocks: see support/mockedHarness.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHarness, harnessSkip } from './support/mockedHarness.js';

test('modular web call timed hold', { skip: harnessSkip }, () => {
  const { status, output } = runHarness(new URL('./webCallModularHold.harness.mjs', import.meta.url));
  assert.equal(status, 0, output);
});
