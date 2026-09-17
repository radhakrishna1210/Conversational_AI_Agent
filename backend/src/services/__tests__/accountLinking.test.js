// One email address is one account, whether its owner signs in with a password
// or with Google. What these pin, all with the database stubbed:
//
//  1. Lookups ignore case and surrounding space, so `Krishna@Gmail.com` and
//     Google's `krishna@gmail.com` reach the same row.
//  2. A password sign-in on an account that has no password says so
//     (PASSWORD_NOT_SET) instead of "invalid credentials".
//  3. "Forgot password" mails a code to an account created with Google, and
//     that code sets its first password — after which both ways in work.
//  4. Linking Google keeps a password whose owner proved the mailbox, and drops
//     one nobody verified (an invite accepted by the inviter), ending its sessions.
//  5. Signup never makes a second account for an address that already has one.
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
const authCtrl = await import('../../controllers/auth.controller.js');
const verifyCtrl = await import('../../controllers/authVerification.controller.js');

// Prisma model delegates are proxies, so node:test's mock.method cannot see
// their methods; plain assignment does stick, and is restored after each test.
const restores = [];
const stub = (obj, name, fn) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};
afterEach(() => { while (restores.length) restores.pop()(); });

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const PASSWORD = 'correct horse battery';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const MEMBERSHIP = { id: 'm1', userId: 'u1', workspaceId: 'ws1', role: 'Member', workspace: { id: 'ws1', name: 'W' } };

/** Runs an Express handler and captures what it answered. */
const call = async (handler, body) => {
  const out = { status: 200, body: undefined };
  const res = {
    status(code) { out.status = code; return this; },
    json(payload) { out.body = payload; return this; },
  };
  await handler({ body, headers: {} }, res);
  return out;
};

/** Stubs every write a successful sign-in makes. */
const stubSessionWrites = () => {
  stub(prisma.workspaceMember, 'findFirst', async () => MEMBERSHIP);
  stub(prisma.refreshToken, 'create', async ({ data }) => data);
};

/** Stubs mail delivery and records what would have been sent. */
const captureMail = () => {
  const sent = [];
  stub(verifyCtrl.mailer, 'isConfigured', () => true);
  stub(verifyCtrl.mailer, 'send', async (mail) => { sent.push(mail); });
  return sent;
};

/**
 * An in-memory User table behind prisma.user and $queryRaw, honouring the
 * unique email and googleId columns the real one has.
 */
const userTable = (rows = []) => {
  const table = rows.map((r) => ({ passwordHash: null, googleId: null, emailVerifiedAt: null, banned: false, createdAt: new Date(), ...r }));
  const match = (where) => table.find((u) => Object.entries(where).every(([k, v]) => u[k] === v)) ?? null;
  stub(prisma.user, 'findUnique', async ({ where }) => match(where));
  stub(prisma.user, 'create', async ({ data }) => {
    if (table.some((u) => u.email === data.email)) throw new Error('P2002: email');
    const row = { id: `u${table.length + 1}`, passwordHash: null, googleId: null, emailVerifiedAt: null, banned: false, createdAt: new Date(), ...data };
    table.push(row);
    return row;
  });
  stub(prisma.user, 'update', async ({ where, data }) => Object.assign(match(where), data));
  stub(prisma, '$queryRaw', async (_sql, email) => table.filter((u) => u.email.toLowerCase() === email).map((u) => ({ id: u.id })));
  return table;
};

describe('email lookup', () => {
  test('addresses are trimmed and lower-cased', () => {
    assert.equal(auth.normalizeEmail('  Krishna@Gmail.COM '), 'krishna@gmail.com');
    assert.equal(auth.normalizeEmail(undefined), '');
  });

  test('a stored lower-case address is found on the unique index, without the fallback query', async () => {
    userTable([{ id: 'u1', email: 'krishna@gmail.com' }]);
    let rawQueried = false;
    stub(prisma, '$queryRaw', async () => { rawQueried = true; return []; });
    const user = await auth.findUserByEmail(' Krishna@Gmail.com');
    assert.equal(user.id, 'u1');
    assert.equal(rawQueried, false);
  });

  test('a legacy row stored with capitals is found by lower(email), with the address as a bound value', async () => {
    userTable([{ id: 'u1', email: 'Krishna@Gmail.com' }]);
    let seen;
    const inner = prisma.$queryRaw;
    stub(prisma, '$queryRaw', async (sql, ...values) => { seen = { sql: sql.join('?'), values }; return inner(sql, ...values); });
    const user = await auth.findUserByEmail('krishna@gmail.com');
    assert.equal(user.id, 'u1');
    assert.match(seen.sql, /lower\("email"\) = \?/);
    assert.deepEqual(seen.values, ['krishna@gmail.com']);
  });
});

describe('password sign-in on an account without a password', () => {
  test('is refused with PASSWORD_NOT_SET, not "invalid credentials"', async () => {
    userTable([{ id: 'u1', email: 'a@b.co', googleId: 'g1' }]);
    await assert.rejects(
      auth.loginUser({ email: 'a@b.co', password: 'anything' }),
      (err) => err.statusCode === 401 && err.code === 'PASSWORD_NOT_SET' && err.hasGoogle === true,
    );
  });

  test('the login endpoint passes the code and the Google hint to the page', async () => {
    userTable([{ id: 'u1', email: 'a@b.co', googleId: 'g1' }]);
    const out = await call(authCtrl.login, { email: 'A@b.co', password: 'anything' });
    assert.equal(out.status, 401);
    assert.equal(out.body.code, 'PASSWORD_NOT_SET');
    assert.equal(out.body.hasGoogle, true);
  });

  test('a wrong password on an account that has one is still plain bad credentials', async () => {
    userTable([{ id: 'u1', email: 'a@b.co', googleId: 'g1', passwordHash: HASH }]);
    await assert.rejects(
      auth.loginUser({ email: 'a@b.co', password: 'nope' }),
      (err) => err.statusCode === 401 && err.code === undefined,
    );
  });
});

describe('forgot password', () => {
  const stubTokenWrites = () => {
    const tokens = [];
    stub(prisma.verificationToken, 'updateMany', async () => ({ count: 0 }));
    stub(prisma.verificationToken, 'create', async ({ data }) => { tokens.push(data); return data; });
    return tokens;
  };

  test('mails a code to an account created with Google instead of turning it away', async () => {
    userTable([{ id: 'u1', email: 'a@b.co', googleId: 'g1' }]);
    const sent = captureMail();
    const tokens = stubTokenWrites();
    const out = await call(verifyCtrl.forgotPassword, { email: 'A@B.co' });
    assert.equal(out.status, 200);
    assert.equal(out.body.googleOnly, undefined);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].subject, 'Set a password for your account');
    assert.equal(tokens[0].email, 'a@b.co');
    assert.equal(tokens[0].purpose, 'password_reset');
  });

  test('answers an unknown address exactly as it answers a known one, and sends nothing', async () => {
    userTable([{ id: 'u1', email: 'a@b.co', googleId: 'g1' }]);
    const sent = captureMail();
    stubTokenWrites();
    const known = await call(verifyCtrl.forgotPassword, { email: 'a@b.co' });
    const unknown = await call(verifyCtrl.forgotPassword, { email: 'nobody@b.co' });
    assert.deepEqual(unknown, known);
    assert.equal(sent.length, 1);
  });
});

describe('one account, both ways in', () => {
  test('Google signup, then a password set by emailed code: both sign in to the same account', async () => {
    const table = userTable();
    const sent = captureMail();
    const tokens = [];
    stub(prisma.workspace, 'create', async () => ({ id: 'ws1' }));
    stub(prisma.refreshToken, 'deleteMany', async () => ({ count: 0 }));
    stub(prisma.verificationToken, 'updateMany', async ({ where, data }) => {
      // The attempt claim in spendOtpAttempt, and the supersede in forgotPassword.
      const hits = tokens.filter((t) => (where.id ? t.id === where.id : t.email === where.email) && t.consumedAt === null);
      hits.forEach((t) => { if (data.attempts) t.attempts += 1; else Object.assign(t, data); });
      return { count: hits.length };
    });
    stub(prisma.verificationToken, 'create', async ({ data }) => { const t = { id: `t${tokens.length}`, consumedAt: null, attempts: 0, ...data }; tokens.push(t); return t; });
    stub(prisma.verificationToken, 'findFirst', async ({ where }) => tokens.findLast((t) => t.email === where.email && t.consumedAt === null) ?? null);
    stub(prisma.verificationToken, 'update', async ({ where, data }) => Object.assign(tokens.find((t) => t.id === where.id), data));
    stubSessionWrites();

    // 1. First visit: Continue with Google creates the account.
    const google1 = await auth.loginOrRegisterWithGoogle({ googleId: 'g1', email: 'Example@Mail.com', name: 'Ex', emailVerified: true });
    assert.equal(table.length, 1);
    assert.equal(google1.user.email, 'example@mail.com');

    // 2. Password sign-in: there is no password yet, and the page is told so.
    await assert.rejects(auth.loginUser({ email: 'example@mail.com', password: PASSWORD }), (err) => err.code === 'PASSWORD_NOT_SET');

    // 3. "Email me a code", then set the password with it.
    await call(verifyCtrl.forgotPassword, { email: 'example@mail.com' });
    const code = /\b(\d{6})\b/.exec(sent[0].text)[1];
    const reset = await call(verifyCtrl.resetPassword, { email: 'EXAMPLE@mail.com', otp: code, newPassword: PASSWORD });
    assert.equal(reset.status, 200);

    // 4. Now both work, and both land on the one account.
    const byPassword = await auth.loginUser({ email: 'example@mail.com', password: PASSWORD });
    const byGoogle = await auth.loginOrRegisterWithGoogle({ googleId: 'g1', email: 'example@mail.com', emailVerified: true });
    assert.equal(byPassword.user.id, google1.user.id);
    assert.equal(byGoogle.user.id, google1.user.id);
    assert.equal(table.length, 1);
    assert.ok(byGoogle.user.passwordHash, 'signing in with Google again keeps the password');
  });

  test('password signup, then Google with different capitals, links instead of creating a second account', async () => {
    const table = userTable([{ id: 'u1', email: 'krishna@gmail.com', passwordHash: HASH, emailVerifiedAt: new Date() }]);
    stubSessionWrites();
    const out = await auth.loginOrRegisterWithGoogle({ googleId: 'g1', email: 'Krishna@Gmail.com', emailVerified: true });
    assert.equal(out.user.id, 'u1');
    assert.equal(table.length, 1);
    assert.equal(out.user.googleId, 'g1');
  });
});

describe('linking Google to an existing password account', () => {
  test('keeps a password whose owner proved the mailbox', async () => {
    const table = userTable([{ id: 'u1', email: 'a@b.co', passwordHash: HASH, emailVerifiedAt: new Date('2026-01-01') }]);
    let revoked = false;
    stub(prisma.refreshToken, 'updateMany', async () => { revoked = true; });
    stubSessionWrites();
    await auth.loginOrRegisterWithGoogle({ googleId: 'g1', email: 'a@b.co', emailVerified: true });
    assert.equal(table[0].passwordHash, HASH);
    assert.equal(revoked, false);
  });

  test('drops a password nobody verified, and ends the sessions it opened', async () => {
    const table = userTable([{ id: 'u1', email: 'victim@b.co', passwordHash: HASH, emailVerifiedAt: null }]);
    let revokedFor;
    stub(prisma.refreshToken, 'updateMany', async ({ where }) => { revokedFor = where.userId; return { count: 1 }; });
    stubSessionWrites();
    await auth.loginOrRegisterWithGoogle({ googleId: 'g1', email: 'victim@b.co', emailVerified: true });
    assert.equal(table[0].passwordHash, null);
    assert.ok(table[0].emailVerifiedAt instanceof Date);
    assert.equal(revokedFor, 'u1');
    await assert.rejects(auth.loginUser({ email: 'victim@b.co', password: PASSWORD }), (err) => err.code === 'PASSWORD_NOT_SET');
  });

  test('an account created by Google is marked verified', async () => {
    const table = userTable();
    stub(prisma.workspace, 'create', async () => ({ id: 'ws1' }));
    stubSessionWrites();
    await auth.loginOrRegisterWithGoogle({ googleId: 'g1', email: 'new@b.co', emailVerified: true });
    assert.ok(table[0].emailVerifiedAt instanceof Date);
  });

  test('an account created by accepting an invite is NOT marked verified', async () => {
    const table = userTable();
    stub(prisma.workspaceInvite, 'findUnique', async () => ({ id: 'i1', email: 'Victim@B.co', workspaceId: 'ws1', role: 'Member', expiresAt: new Date(Date.now() + 60_000) }));
    stub(prisma.workspaceMember, 'upsert', async () => ({}));
    stub(prisma.workspaceInvite, 'update', async () => ({}));
    stub(prisma, '$transaction', async (ops) => Promise.all(ops));
    await auth.acceptInvite({ token: 'tok', name: 'Someone', password: PASSWORD });
    assert.equal(table.length, 1);
    assert.equal(table[0].email, 'victim@b.co');
    assert.equal(table[0].emailVerifiedAt, null);
  });
});

describe('signup for an address that already has an account', () => {
  test('is refused with EMAIL_TAKEN whatever the capitals', async () => {
    userTable([{ id: 'u1', email: 'owner@b.co', googleId: 'g1' }]);
    const out = await call(verifyCtrl.requestSignupOtp, { name: 'Owner', email: 'Owner@B.co', password: PASSWORD });
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'EMAIL_TAKEN');
  });

  test('a code verified after Google created the account meanwhile does not create a second one', async () => {
    const table = userTable([{ id: 'u1', email: 'a@b.co', googleId: 'g1' }]);
    const token = { id: 't1', email: 'a@b.co', tokenHash: sha('123456'), consumedAt: null, attempts: 0, payload: JSON.stringify({ name: 'A', passwordHash: HASH, workspaceName: 'W' }) };
    stub(prisma.verificationToken, 'findFirst', async () => token);
    stub(prisma.verificationToken, 'updateMany', async () => ({ count: 1 }));
    stub(prisma.verificationToken, 'update', async ({ data }) => Object.assign(token, data));
    const out = await call(verifyCtrl.verifySignupOtp, { email: 'a@b.co', otp: '123456' });
    assert.equal(out.status, 409);
    assert.equal(table.length, 1);
    assert.ok(token.consumedAt);
  });

  test('a verified signup code marks the new account verified', async () => {
    const table = userTable();
    const token = { id: 't1', email: 'new@b.co', tokenHash: sha('123456'), consumedAt: null, attempts: 0, payload: JSON.stringify({ name: 'N', passwordHash: HASH, workspaceName: 'W' }) };
    stub(prisma.verificationToken, 'findFirst', async () => token);
    stub(prisma.verificationToken, 'updateMany', async () => ({ count: 1 }));
    stub(prisma.verificationToken, 'update', async ({ data }) => Object.assign(token, data));
    stub(prisma.workspace, 'create', async () => ({ id: 'ws1' }));
    const out = await call(verifyCtrl.verifySignupOtp, { email: 'New@B.co', otp: '123456' });
    assert.equal(out.status, 201);
    assert.equal(table[0].email, 'new@b.co');
    assert.ok(table[0].emailVerifiedAt instanceof Date);
  });
});
