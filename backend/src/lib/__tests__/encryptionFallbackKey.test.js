// Production without ENCRYPTION_KEY says so, loudly and once — without breaking
// encryption, since existing ciphertexts may already use the fallback key.
//
// NODE_ENV and ENCRYPTION_KEY are fixed before the import because config/env.js
// reads them once, at import time. `node --test` runs each file in its own
// process, so this does not leak into other suites.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.ENCRYPTION_KEY = '';
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { default: logger } = await import('../logger.js');
const { encryptToken, decryptToken } = await import('../encryption.js');

test('warns once in production, and still round-trips', () => {
  const errors = [];
  const original = logger.error;
  logger.error = (...args) => { errors.push(args); };
  try {
    const a = encryptToken('secret-one');
    const b = encryptToken('secret-two');
    assert.equal(decryptToken(a), 'secret-one');
    assert.equal(decryptToken(b), 'secret-two');
  } finally {
    logger.error = original;
  }
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /ENCRYPTION_KEY is not set/);
});
