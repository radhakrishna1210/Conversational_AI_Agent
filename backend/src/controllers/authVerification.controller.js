// Email verification (signup OTP) + password reset flows.
// Both share the VerificationToken model and the stdlib SMTP mailer.
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { sendMail, isMailerConfigured } from '../lib/mailer.js';
import { hashPassword } from '../lib/hash.js';
import * as authService from '../services/auth.service.js';

const OTP_TTL_MS = 10 * 60 * 1000;        // 10 minutes
const RESET_TTL_MS = 30 * 60 * 1000;      // 30 minutes
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const genOtp = () => String(crypto.randomInt(100000, 1000000)); // 6 digits

const emailOk = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** The mail transport, held in an object so tests can replace it (an ES module export cannot be reassigned). */
export const mailer = { send: sendMail, isConfigured: isMailerConfigured };

/** Codes a single token may be tried with before the user must ask for a new one. */
export const MAX_OTP_ATTEMPTS = 5;

/**
 * Spend one attempt on an emailed code, then compare it.
 *
 * A wrong code used to leave the token live for the next guess, so the only
 * brake on a million-code space was the per-IP limiter. The attempt is claimed
 * in the database BEFORE comparing: parallel guesses cannot all read a fresh
 * counter, so no token is ever compared more than MAX_OTP_ATTEMPTS times.
 *
 * @returns {Promise<'ok'|'wrong'|'exhausted'>}
 */
export const spendOtpAttempt = async (token, otp) => {
  const claimed = await prisma.verificationToken.updateMany({
    where: { id: token.id, consumedAt: null, attempts: { lt: MAX_OTP_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return 'exhausted';
  return token.tokenHash === sha256(String(otp).trim()) ? 'ok' : 'wrong';
};

const TOO_MANY_ATTEMPTS = 'Too many incorrect codes. Request a new code and try again.';

// ── POST /auth/register  (now: validate → email OTP → account created on verify)
export const requestSignupOtp = async (req, res) => {
  const { name, password, workspaceName } = req.body ?? {};
  const email = authService.normalizeEmail(req.body?.email);
  if (!name || !emailOk(email) || !password || password.length < 8) {
    return res.status(400).json({ error: 'Valid name, email, and a password of at least 8 characters are required' });
  }
  const existing = await authService.findUserByEmail(email);
  if (existing) {
    // A second account for the same address is never the answer — point at
    // the ways into the one that exists. An account made with Google has no
    // password yet; "Forgot password" is how its owner adds one.
    return res.status(409).json({
      error: 'An account with this email already exists. Sign in instead — with Google, or with "Forgot password?" to set or reset a password.',
      code: 'EMAIL_TAKEN',
    });
  }

  if (!mailer.isConfigured()) {
    // No SMTP → we cannot verify email ownership.
    //  - In production: verified signup is required, refuse honestly.
    //  - Outside production (or with ALLOW_UNVERIFIED_SIGNUP=true): create the
    //    account directly so local development isn't dead-ended, and say so.
    const allowUnverified =
      process.env.ALLOW_UNVERIFIED_SIGNUP === 'true' || process.env.NODE_ENV !== 'production';
    if (!allowUnverified) {
      return res.status(503).json({
        error: 'Email verification is unavailable (SMTP not configured on the server). Contact the administrator.',
      });
    }
    logger.warn(`SMTP not configured — creating UNVERIFIED account for ${email} (non-production convenience path)`);
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: { name, email, passwordHash } });
    const wsName = workspaceName || `${name}'s Workspace`;
    const workspace = await prisma.workspace.create({
      data: {
        name: wsName,
        slug: wsName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36),
        members: { create: { userId: user.id, role: 'Member' } },
        settings: { create: {} },
      },
    });
    return res.status(201).json({
      message: 'Account created without email verification (SMTP is not configured on this server). You can log in now.',
      unverified: true,
      userId: user.id,
      workspaceId: workspace.id,
    });
  }

  const otp = genOtp();
  const passwordHash = await hashPassword(password);

  // Invalidate previous pending OTPs for this email
  await prisma.verificationToken.updateMany({
    where: { email, purpose: 'signup_otp', consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.verificationToken.create({
    data: {
      email,
      purpose: 'signup_otp',
      tokenHash: sha256(otp),
      payload: JSON.stringify({ name, passwordHash, workspaceName: workspaceName || `${name}'s Workspace` }),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  await mailer.send({
    to: email,
    subject: 'Your verification code',
    text: `Your verification code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your verification code is:</p><h2 style="letter-spacing:4px">${otp}</h2><p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>`,
  });

  res.json({ message: 'Verification code sent to your email', email });
};

// ── POST /auth/verify-otp  { email, otp } → creates the account
export const verifySignupOtp = async (req, res) => {
  const { otp } = req.body ?? {};
  const email = authService.normalizeEmail(req.body?.email);
  if (!emailOk(email) || !otp) return res.status(400).json({ error: 'Email and code are required' });

  const token = await prisma.verificationToken.findFirst({
    where: { email, purpose: 'signup_otp', consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!token) return res.status(400).json({ error: 'Invalid or expired verification code' });
  const verdict = await spendOtpAttempt(token, otp);
  if (verdict === 'exhausted') return res.status(400).json({ error: TOO_MANY_ATTEMPTS });
  if (verdict !== 'ok') return res.status(400).json({ error: 'Invalid or expired verification code' });

  // The address may have gained an account while the code sat in the inbox —
  // most often by the same person pressing "Continue with Google". Creating
  // another would fail on the unique email (a bare 500) or, for a differently
  // cased legacy row, succeed as a duplicate.
  if (await authService.findUserByEmail(email)) {
    await prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
    return res.status(409).json({
      error: 'An account with this email already exists. Sign in instead — with Google, or with "Forgot password?" to set or reset a password.',
      code: 'EMAIL_TAKEN',
    });
  }

  const pending = JSON.parse(token.payload);
  const user = await prisma.user.create({
    // The code just proved this person reads the mailbox.
    data: { name: pending.name, email, passwordHash: pending.passwordHash, emailVerifiedAt: new Date() },
  });
  const workspace = await prisma.workspace.create({
    data: {
      name: pending.workspaceName,
      slug: pending.workspaceName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36),
      members: { create: { userId: user.id, role: 'Member' } },
      settings: { create: {} },
    },
  });
  await prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });

  logger.info({ email }, 'Account created after OTP verification');
  res.status(201).json({ message: 'Account created — you can now log in', userId: user.id, workspaceId: workspace.id });
};

// ── POST /auth/forgot-password  { email }
// Resets a password, or sets the first one on an account created with Google.
export const forgotPassword = async (req, res) => {
  const email = authService.normalizeEmail(req.body?.email);
  if (!emailOk(email)) return res.status(400).json({ error: 'A valid email is required' });

  const user = await authService.findUserByEmail(email);

  // Always respond identically to avoid account enumeration…
  const genericOk = () => res.json({ message: 'If an account exists for that email, a code has been sent.' });

  if (!user) return genericOk();

  // An account created with Google gets a code too. This used to answer "use
  // Continue with Google" and send nothing, so such an account could never
  // gain a password at all. Reading the code proves the same thing Google
  // does — that this person owns the mailbox — so it is as safe a way in.
  const hasPassword = Boolean(user.passwordHash);

  if (!mailer.isConfigured()) {
    return res.status(503).json({
      error: 'Password reset requires the email service, which is not configured on this server (SMTP_HOST/SMTP_USER/SMTP_PASSWORD/EMAIL_FROM in backend/.env). Ask the administrator to set it up.',
    });
  }

  const otp = genOtp();
  await prisma.verificationToken.updateMany({
    where: { email, purpose: 'password_reset', consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.verificationToken.create({
    data: { email, purpose: 'password_reset', tokenHash: sha256(otp), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });

  await mailer.send({
    to: email,
    subject: hasPassword ? 'Password reset code' : 'Set a password for your account',
    text: hasPassword
      ? `Your password reset code is ${otp}. It expires in 30 minutes.`
      : `Your account signs in with Google. To also sign in with a password, use this code: ${otp}. It expires in 30 minutes.`,
    html: hasPassword
      ? `<p>Your password reset code is:</p><h2 style="letter-spacing:4px">${otp}</h2><p>It expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>`
      : `<p>Your account signs in with Google. To also sign in with a password, enter this code:</p><h2 style="letter-spacing:4px">${otp}</h2><p>It expires in 30 minutes. Google sign-in keeps working either way. If you didn't request this, you can safely ignore this email.</p>`,
  });

  return genericOk();
};

// ── POST /auth/reset-password  { email, otp, newPassword }
export const resetPassword = async (req, res) => {
  const { otp, newPassword } = req.body ?? {};
  const email = authService.normalizeEmail(req.body?.email);
  if (!emailOk(email) || !otp || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Email, code, and a new password of at least 8 characters are required' });
  }

  const token = await prisma.verificationToken.findFirst({
    where: { email, purpose: 'password_reset', consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!token) return res.status(400).json({ error: 'Invalid or expired reset code' });
  const verdict = await spendOtpAttempt(token, otp);
  if (verdict === 'exhausted') return res.status(400).json({ error: TOO_MANY_ATTEMPTS });
  if (verdict !== 'ok') return res.status(400).json({ error: 'Invalid or expired reset code' });

  const user = await authService.findUserByEmail(email);
  if (!user) return res.status(400).json({ error: 'Invalid or expired reset code' });

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    // The code proved mailbox ownership, so this password is the owner's —
    // a later Google link keeps it (see loginOrRegisterWithGoogle).
    data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
  });
  await prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });

  // Revoke all existing sessions for safety
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } }).catch(() => {});

  logger.info({ email }, 'Password reset completed; sessions revoked');
  res.json({ message: 'Password updated. Please log in with your new password.' });
};
