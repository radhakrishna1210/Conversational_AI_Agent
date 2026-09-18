// Lending a client a number the main Plivo account already holds, driven
// through the real service with Prisma and the carrier client mocked. Runs in a
// child process: see ws/__tests__/support/mockedHarness.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHarness, harnessSkip } from '../../../ws/__tests__/support/mockedHarness.js';

test('attachMainAccountNumber', { skip: harnessSkip }, () => {
  const { status, output } = runHarness(new URL('./attachNumber.harness.mjs', import.meta.url));
  assert.equal(status, 0, output);
});
