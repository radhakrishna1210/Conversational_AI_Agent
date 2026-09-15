// The bundled (xAI / ElevenLabs) web call handler's start-up and end of call,
// driven with its dependencies mocked. Runs in a child process: see
// support/mockedHarness.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHarness, harnessSkip } from './support/mockedHarness.js';

test('bundled web call start-up and end of call', { skip: harnessSkip }, () => {
  const { status, output } = runHarness(new URL('./bundledWebCall.harness.mjs', import.meta.url));
  assert.equal(status, 0, output);
});
