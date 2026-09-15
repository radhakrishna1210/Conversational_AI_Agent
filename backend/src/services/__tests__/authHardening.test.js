// What these pin, all with the database stubbed:
//
//  1. A banned account cannot start or renew a session — by password, by
//     refresh token, or by Google. The admin ban used to set a flag nothing read.
//  2. Google may only link to, or create, an account under an email address it
//     has verified.
//  3. A session opens in the user's EARLIEST workspace, not whichever row
//     Postgres happens to return.
//  4. An emailed code is compared at most MAX_OTP_ATTEMPTS times per token.
//
// Lives under services/ because `npm test` only globs services/**/__tests__.

import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { default: prisma } = await import('../../config/prisma.js');
const auth = await import('../auth.service.js');
const { spendOtpAttempt, MAX_OTP_ATTEMPTS } = await import('../../controllers/authVerification.controller.js');

// Prisma model delegates are proxies, so node:test's mock.method cannot see
// their methods; plain assignment does stick, and is restored after each test.
const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

const PASSWORD = 'correct horse battery';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const MEMBERSHIP = { id: 'm1', userId: 'u1', workspaceId: 'ws1', role: 'Member', workspace: { id: 'ws1', name: 'W' } };

/** Stubs every write a successful login makes, and records the membership query. */
const stubSessionWrites = () => {
  const seen = {};
  stub(prisma.workspaceMember, 'findFirst', async (args) => { seen.membershipQuery = args; return MEMBERSHIP; });
  stub(prisma.refreshToken, 'create', async ({ data }) => data);
  return seen;
};

describe('banned accounts', () => {
  test('password login is refused with 403 once the password is right', async () => {
    stub(prisma.user, 'findUnique', async () => ({ id: 'u1', email: 'a@b.co', passwordHash: HASH, banned: true }));
    stubSessionWrites();
    await assert.rejects(
      auth.loginUser({ email: 'a@b.co', password: PASSWORD }),
      (err) => err.statusCode === 403 && err.code === 'ACCOUNT_SUSPENDED',
    );
  });

  test('a wrong password on a banned account still reads as bad credentials', async () => {
    stub(prisma.user, 'findUnique', async () => ({ id: 'u1', email: 'a@b.co', passwordHash: HASH, banned: true }));
    await assert.rejects(auth.loginUser({ email: 'a@b.co', password: 'nope' }), (err) => err.statusCode === 401);
  });

  test('refresh is refused, and the presented token is still revoked', async () => {
    let revoked = false;
    stub(prisma.refreshToken, 'findUnique', async () => ({ id: 'rt1', userId: 'u1', workspaceId: 'ws1', expiresAt: new Date(Date.now() + 60_000) }));
    stub(prisma.refreshToken, 'update', async () => { revoked = true; });
    stub(prisma.user, 'findUnique', async () => ({ id: 'u1', email: 'a@b.co', banned: true }));
    stubSessionWrites();
    await assert.rejects(auth.refreshTokens('raw'), (err) => err.statusCode === 403);
    assert.equal(revoked, true);
  });

  test('refresh for a deleted user answers 401 instead of crashing', async () => {
    stub(prisma.refreshToken, 'findUnique', async () => ({ id: 'rt1', userId: 'gone', workspaceId: null, expiresAt: new Date(Date.now() + 60_000) }));
    stub(prisma.refreshToken, 'update', async () => {});
    stub(prisma.user, 'findUnique', async () => null);
    await assert.rejects(auth.refreshTokens('raw'), (err) => err.statusCode === 401);
  });

  test('Google login is refused for a banned account already linked', async () => {
    stub(prisma.user, 'findUnique', async ({ where }) => (where.googleId ? { id: 'u1', email: 'a@b.co', googleId: 'g1', banned: true } : null));
    stubSessionWrites();
    await assert.rejects(
      auth.loginOrRegisterWithGoogle({ googleId: 'g1', email: 'a@b.co', emailVerified: true }),
      (err) => err.code === 'ACCOUNT_SUSPENDED',
    );
  });

  test('Google cannot be linked onto a banned account by email', async () => {
    let linked = false;
    stub(prisma.user, 'findUnique', async ({ where }) => (where.email ? { id: 'u1', email: 'a@b.co', banned: true } : null));
    stub(prisma.user, 'update', async () => { linked = true; });
    await assert.rejects(
      auth.loginOrRegisterWithGoogle({ googleId: 'g-new', email: 'a@b.co', emailVerified: true }),
      (err) => err.code === 'ACCOUNT_SUSPENDED',
    );
    assert.equal(linked, false);
  });
});

describe('Google email verification', () => {
  test('an unverified address cannot be linked to an existing account', async () => {
    let linked = false;
    stub(prisma.user, 'findUnique', async ({ where }) => (where.email ? { id: 'u1', email: 'owner@b.co' } : null));
    stub(prisma.user, 'update', async () => { linked = true; });
    await assert.rejects(
      auth.loginOrRegisterWithGoogle({ googleId: 'g-attacker', email: 'owner@b.co', emailVerified: false }),
      (err) => err.code === 'EMAIL_UNVERIFIED',
    );
    assert.equal(linked, false);
  });

  test('an unverified address cannot create an account either', async () => {
    let created = false;
    stub(prisma.user, 'findUnique', async () => null);
    stub(prisma.user, 'create', async () => { created = true; });
    await assert.rejects(
      auth.loginOrRegisterWithGoogle({ googleId: 'g2', email: 'someone@b.co' }),
      (err) => err.code === 'EMAIL_UNVERIFIED',
    );
    assert.equal(created, false);
  });

  test('an account already linked by googleId signs in regardless', async () => {
    stub(prisma.user, 'findUnique', async ({ where }) => (where.googleId ? { id: 'u1', email: 'a@b.co', googleId: 'g1' } : null));
    stubSessionWrites();
    const out = await auth.loginOrRegisterWithGoogle({ googleId: 'g1', email: 'a@b.co', emailVerified: false });
    assert.ok(out.accessToken);
  });

  test('a verified address links as before', async () => {
    let linked = false;
    stub(prisma.user, 'findUnique', async ({ where }) => (where.email ? { id: 'u1', email: 'a@b.co', name: 'A' } : null));
    stub(prisma.user, 'update', async ({ data }) => { linked = true; return { id: 'u1', email: 'a@b.co', ...data }; });
    stubSessionWrites();
    const out = await auth.loginOrRegisterWithGoogle({ googleId: 'g1', email: 'a@b.co', emailVerified: true });
    assert.equal(linked, true);
    assert.ok(out.accessToken);
  });
});

describe('workspace chosen at login', () => {
  test('password login orders memberships by joinedAt', async () => {
    stub(prisma.user, 'findUnique', async () => ({ id: 'u1', email: 'a@b.co', passwordHash: HASH }));
    const seen = stubSessionWrites();
    await auth.loginUser({ email: 'a@b.co', password: PASSWORD });
    assert.deepEqual(seen.membershipQuery.orderBy, { joinedAt: 'asc' });
  });

  test('refresh with no stored workspace orders memberships by joinedAt', async () => {
    stub(prisma.refreshToken, 'findUnique', async () => ({ id: 'rt1', userId: 'u1', workspaceId: null, expiresAt: new Date(Date.now() + 60_000) }));
    stub(prisma.refreshToken, 'update', async () => {});
    stub(prisma.user, 'findUnique', async () => ({ id: 'u1', email: 'a@b.co' }));
    const seen = stubSessionWrites();
    await auth.refreshTokens('raw');
    assert.deepEqual(seen.membershipQuery.orderBy, { joinedAt: 'asc' });
  });
});

describe('emailed code attempts', () => {
  const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');

  /** An in-memory token row honouring the conditional increment. */
  const tokenStore = (row) => {
    stub(prisma.verificationToken, 'updateMany', async ({ where, data }) => {
      const live = row.id === where.id && row.consumedAt === null && row.attempts < where.attempts.lt;
      if (!live) return { count: 0 };
      row.attempts += data.attempts.increment;
      return { count: 1 };
    });
    return row;
  };

  test('the right code is accepted', async () => {
    const row = tokenStore({ id: 't1', tokenHash: sha('123456'), consumedAt: null, attempts: 0 });
    assert.equal(await spendOtpAttempt(row, ' 123456 '), 'ok');
  });

  test('after MAX_OTP_ATTEMPTS wrong codes even the right one is refused', async () => {
    const row = tokenStore({ id: 't1', tokenHash: sha('123456'), consumedAt: null, attempts: 0 });
    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
      assert.equal(await spendOtpAttempt(row, String(100000 + i)), 'wrong');
    }
    assert.equal(await spendOtpAttempt(row, '123456'), 'exhausted');
  });

  test('parallel guesses cannot exceed the cap', async () => {
    const row = tokenStore({ id: 't1', tokenHash: sha('999999'), consumedAt: null, attempts: 0 });
    const verdicts = await Promise.all(Array.from({ length: 50 }, (_, i) => spendOtpAttempt(row, String(100000 + i))));
    assert.equal(verdicts.filter((v) => v === 'wrong').length, MAX_OTP_ATTEMPTS);
    assert.equal(row.attempts, MAX_OTP_ATTEMPTS);
  });
});
