// A-06 (AUDIT_REPORT) / COMPLETION_REPORT Phase 1 #10 claimed "secrets redacted
// before storage" on the strength of one HTTP probe. Nothing pinned it. This
// does — an audit trail that stores the key you just rotated has leaked it to
// everyone who can read the panel.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../audit.service.js';

describe('audit redaction', () => {
  test('replaces every secret-shaped key, at any depth, and leaves the rest', () => {
    const out = redact({
      apiKey: 'sk-live-123',
      accessToken: 'a', refreshToken: 'r', password: 'p', passwordHash: 'h', token: 't', secret: 's',
      keySecret: 'k', authToken: 'x', webhookSecret: 'w', authValueCipher: 'c',
      nested: { secret: 'inner', keep: 'visible', deeper: { apiKey: 'z', ok: 1 } },
      keep: 'visible',
    });
    assert.deepEqual(out, {
      apiKey: '[redacted]',
      accessToken: '[redacted]', refreshToken: '[redacted]', password: '[redacted]', passwordHash: '[redacted]',
      token: '[redacted]', secret: '[redacted]', keySecret: '[redacted]', authToken: '[redacted]',
      webhookSecret: '[redacted]', authValueCipher: '[redacted]',
      nested: { secret: '[redacted]', keep: 'visible', deeper: { apiKey: '[redacted]', ok: 1 } },
      keep: 'visible',
    });
  });

  test('is case-insensitive and catches the *Cipher suffix', () => {
    assert.deepEqual(redact({ APIKEY: 1, AccessToken: 2, refreshTokenCipher: 3 }), { APIKEY: '[redacted]', AccessToken: '[redacted]', refreshTokenCipher: '[redacted]' });
  });

  test('walks arrays and returns non-objects untouched', () => {
    assert.deepEqual(redact([{ token: 'a' }, 'plain', 4]), [{ token: '[redacted]' }, 'plain', 4]);
    assert.equal(redact('str'), 'str');
    assert.equal(redact(null), null);
    assert.equal(redact(undefined), undefined);
  });

  test('does not mutate its input', () => {
    const src = { apiKey: 'k', nested: { secret: 's' } };
    redact(src);
    assert.deepEqual(src, { apiKey: 'k', nested: { secret: 's' } });
  });

  test('a key that merely CONTAINS a secret word is not redacted (no over-blanking of "tokenCount")', () => {
    assert.deepEqual(redact({ tokenCount: 12, secretsEnabled: true, apiKeyId: 'id-only' }), { tokenCount: 12, secretsEnabled: true, apiKeyId: 'id-only' });
  });
});
