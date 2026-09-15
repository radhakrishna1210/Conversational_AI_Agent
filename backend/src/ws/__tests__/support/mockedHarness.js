// backend/src/ws/__tests__/support/mockedHarness.js
/**
 * Run a node:test file that replaces modules with node:test's `mock.module()`.
 *
 * The live-call code (the phone bridge, the web handlers, voiceTurnStream)
 * imports Prisma, carrier and provider clients directly, so the only way to
 * drive it end to end without a database or a network is to swap those
 * modules. `mock.module()` needs --experimental-test-module-mocks, which the
 * package.json test scripts do not pass — so a normal `*.test.js` wrapper runs
 * the harness in a child process with the flag, and fails with its output.
 *
 * Harness files are named `*.harness.mjs` so the test globs never pick them up
 * directly.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mock } from 'node:test';

const [MAJOR, MINOR] = process.versions.node.split('.').map(Number);

/** `mock.module()` landed in Node 22.3. */
export const moduleMocksSupported = MAJOR > 22 || (MAJOR === 22 && MINOR >= 3);

/** A skip reason for test(), or false when the harness can run. */
export const harnessSkip = moduleMocksSupported ? false : 'needs node:test module mocks (Node >= 22.3)';

/**
 * @param {URL|string} harnessUrl  the `*.harness.mjs` file, as import.meta-relative URL
 * @returns {{ status: number|null, output: string }}
 */
export function runHarness(harnessUrl, { timeoutMs = 120_000 } = {}) {
  const env = { ...process.env };
  // Set by an outer `node --test` for its own children; inherited, it makes the
  // nested runner report in the parent's wire format instead of exiting cleanly.
  delete env.NODE_TEST_CONTEXT;
  env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/unused';
  env.JWT_ACCESS_SECRET ||= 'test-access-secret';
  env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
  const r = spawnSync(
    process.execPath,
    ['--experimental-test-module-mocks', '--no-warnings', '--test', '--test-reporter=spec', fileURLToPath(harnessUrl)],
    { encoding: 'utf8', env, timeout: timeoutMs },
  );
  return { status: r.status, output: `${r.stdout || ''}\n${r.stderr || ''}${r.error ? `\n${r.error.message}` : ''}` };
}

/**
 * Replace one module. `named` become named exports; `dflt`, when given, the
 * default export. Handles the option rename between Node 22 and 24.
 * @param {URL|string} url
 */
export function mockModule(url, named = {}, dflt) {
  const specifier = String(url);
  if (MAJOR >= 24) {
    mock.module(specifier, { exports: dflt === undefined ? { ...named } : { ...named, default: dflt } });
  } else {
    mock.module(specifier, { namedExports: named, ...(dflt === undefined ? {} : { defaultExport: dflt }) });
  }
}
