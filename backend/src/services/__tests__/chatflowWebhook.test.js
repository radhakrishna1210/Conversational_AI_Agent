import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

// The signing key is read at call time from CHATFLOW_WEBHOOK_SECRET, falling back
// to JWT_ACCESS_SECRET. Set both before importing so the module under test signs
// with something deterministic rather than ''.
process.env.CHATFLOW_WEBHOOK_SECRET = 'test-chatflow-secret-not-a-real-one';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.DATABASE_URL ??= 'postgresql://u:p@127.0.0.1:5499/dummy';

const { signStatusToken, verifyStatusToken } = await import('../chatflowWebhook.service.js');

describe('ChatFlow status callback token', () => {
  const ws = 'ckv9x2abc123def456';

  test('round-trips for the workspace it was minted for', () => {
    assert.equal(verifyStatusToken(ws, signStatusToken(ws)), true);
  });

  test('is stable, so a registered URL keeps working across restarts', () => {
    // The URL is stored on ChatFlow's side. A token that changed per process
    // would silently stop every workspace's delivery reports on deploy.
    assert.equal(signStatusToken(ws), signStatusToken(ws));
  });

  test('a token for one workspace does not authorise another', () => {
    const other = 'zzz88y7xwvu654321';
    assert.equal(verifyStatusToken(other, signStatusToken(ws)), false);
  });

  test('rejects a missing, empty or malformed token without throwing', () => {
    // timingSafeEqual throws on a length mismatch, so the length guard has to
    // come first — an exception here would be a 500 on an unauthenticated route.
    for (const bad of [undefined, null, '', 'short', 'x'.repeat(31), 'x'.repeat(33), 'x'.repeat(64)]) {
      assert.equal(verifyStatusToken(ws, bad), false, `token: ${String(bad)}`);
    }
  });

  test('rejects a token of the right length but wrong content', () => {
    const good = signStatusToken(ws);
    const flipped = (good[0] === 'a' ? 'b' : 'a') + good.slice(1);
    assert.equal(flipped.length, good.length);
    assert.equal(verifyStatusToken(ws, flipped), false);
  });

  test('is a 32-char hex capability, not something enumerable', () => {
    assert.match(signStatusToken(ws), /^[0-9a-f]{32}$/);
  });
});
