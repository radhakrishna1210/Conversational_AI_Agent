import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { generateOtp, storeOtp, sendEmailOtp, verifyOtp } from '../services/otp.service.js';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';

const router = Router();

const emailSchema = z.string().email({
  message: 'Please provide a valid email address',
});

// ── POST /otp/send ─────────────────────────────────────────────────────────────
router.post('/send', async (req, res) => {
  const parsed = emailSchema.safeParse(req.body.email);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const email = parsed.data;
  const otp   = generateOtp();

  await storeOtp(email, otp);
  await sendEmailOtp(email, otp);

  res.json({ message: 'OTP sent successfully to your email' });
});

// ── POST /otp/verify ───────────────────────────────────────────────────────────
router.post('/verify', async (req, res) => {
  const emailParsed = emailSchema.safeParse(req.body.email);
  if (!emailParsed.success) {
    return res.status(400).json({ error: emailParsed.data?.errors?.[0]?.message ?? 'Invalid email address' });
  }

  const otpStr = String(req.body.otp ?? '').trim();
  if (!/^\d{6}$/.test(otpStr)) {
    return res.status(400).json({ error: 'OTP must be 6 digits' });
  }

  const email = emailParsed.data;
  const valid = await verifyOtp(email, otpStr);

  if (!valid) {
    return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new one.' });
  }

  // Issue a short-lived token proving this email was verified
  const otpToken = jwt.sign(
    { email, purpose: 'signup-otp' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '10m' }
  );

  logger.info({ email }, 'OTP verified — otpToken issued');
  res.json({ otpToken });
});

export default router;
