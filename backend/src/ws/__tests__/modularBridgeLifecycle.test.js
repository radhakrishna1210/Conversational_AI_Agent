// The modular phone bridge's answer path — greeting, first listen, Deepgram
// session lifecycle — driven through the real bridge with its dependencies
// mocked. Runs in a child process: see support/mockedHarness.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHarness, harnessSkip } from './support/mockedHarness.js';

test('modular bridge start-up lifecycle', { skip: harnessSkip }, () => {
  const { status, output } = runHarness(new URL('./modularBridgeLifecycle.harness.mjs', import.meta.url));
  assert.equal(status, 0, output);
});
