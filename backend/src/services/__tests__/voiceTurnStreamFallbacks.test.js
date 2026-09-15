// voiceTurnStream's slow/throttled/stuck paths, driven end to end with the
// database, LLM and TTS mocked. The harness needs module mocks, so it runs in a
// child process — see ws/__tests__/support/mockedHarness.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHarness, harnessSkip } from '../../ws/__tests__/support/mockedHarness.js';

test('voiceTurnStream fallback paths', { skip: harnessSkip }, () => {
  const { status, output } = runHarness(new URL('./voiceTurnStreamFallbacks.harness.mjs', import.meta.url));
  assert.equal(status, 0, output);
});
