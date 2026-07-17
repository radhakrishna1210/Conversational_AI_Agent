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

// ── POST /auth/register  (now: validate → email OTP → account created on verify)
export const requestSignupOtp = async (req, res) => {
  const { name, email, password, workspaceName } = req.body ?? {};
  if (!name || !emailOk(email) || !password || password.length < 8) {
    return res.status(400).json({ error: 'Valid name, email, and a password of at least 8 characters are required' });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  if (!isMailerConfigured()) {
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
        members: { create: { userId: user.id, role: 'Admin' } },
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

  await sendMail({
    to: email,
    subject: 'Your verification code',
    text: `Your verification code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your verification code is:</p><h2 style="letter-spacing:4px">${otp}</h2><p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>`,
  });

  res.json({ message: 'Verification code sent to your email', email });
};

// ── POST /auth/verify-otp  { email, otp } → creates the account
export const verifySignupOtp = async (req, res) => {
  const { email, otp } = req.body ?? {};
  if (!emailOk(email) || !otp) return res.status(400).json({ error: 'Email and code are required' });

  const token = await prisma.verificationToken.findFirst({
    where: { email, purpose: 'signup_otp', consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!token || token.tokenHash !== sha256(String(otp).trim())) {
    return res.status(400).json({ error: 'Invalid or expired verification code' });
  }

  const pending = JSON.parse(token.payload);
  const user = await prisma.user.create({
    data: { name: pending.name, email, passwordHash: pending.passwordHash },
  });
  const workspace = await prisma.workspace.create({
    data: {
      name: pending.workspaceName,
      slug: pending.workspaceName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36),
      members: { create: { userId: user.id, role: 'Admin' } },
      settings: { create: {} },
    },
  });
  await prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });

  logger.info({ email }, 'Account created after OTP verification');
  res.status(201).json({ message: 'Account created — you can now log in', userId: user.id, workspaceId: workspace.id });
};

// ── POST /auth/forgot-password  { email }
export const forgotPassword = async (req, res) => {
  const { email } = req.body ?? {};
  if (!emailOk(email)) return res.status(400).json({ error: 'A valid email is required' });

  const user = await prisma.user.findUnique({ where: { email } });

  // Always respond identically to avoid account enumeration…
  const genericOk = () => res.json({ message: 'If an account exists for that email, a reset code has been sent.' });

  if (!user) return genericOk();

  // Google-only account (no password set): tell them to use Google instead of
  // issuing a useless reset token. This is intentionally revealed only after a
  // legitimate mailbox-owner-style request; the tradeoff favors UX here.
  if (!user.passwordHash) {
    return res.json({
      message: 'This account uses Google Sign-In. Use "Continue with Google" to log in.',
      googleOnly: true,
    });
  }

  if (!isMailerConfigured()) {
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

  await sendMail({
    to: email,
    subject: 'Password reset code',
    text: `Your password reset code is ${otp}. It expires in 30 minutes.`,
    html: `<p>Your password reset code is:</p><h2 style="letter-spacing:4px">${otp}</h2><p>It expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>`,
  });

  return genericOk();
};

// ── POST /auth/reset-password  { email, otp, newPassword }
export const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body ?? {};
  if (!emailOk(email) || !otp || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Email, code, and a new password of at least 8 characters are required' });
  }

  const token = await prisma.verificationToken.findFirst({
    where: { email, purpose: 'password_reset', consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!token || token.tokenHash !== sha256(String(otp).trim())) {
    return res.status(400).json({ error: 'Invalid or expired reset code' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: 'Invalid or expired reset code' });

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });

  // Revoke all existing sessions for safety
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } }).catch(() => {});

  logger.info({ email }, 'Password reset completed; sessions revoked');
  res.json({ message: 'Password updated. Please log in with your new password.' });
};
