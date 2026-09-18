// The caller picker is per-tenant: a workspace is offered its own numbers and
// nobody else's. Runs in a child process: see ws/__tests__/support/mockedHarness.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHarness, harnessSkip } from '../../ws/__tests__/support/mockedHarness.js';

test('listCallerNumbers tenancy', { skip: harnessSkip }, () => {
  const { status, output } = runHarness(new URL('./callerNumbers.harness.mjs', import.meta.url));
  assert.equal(status, 0, output);
});
