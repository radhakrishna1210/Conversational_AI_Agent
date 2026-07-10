/**
 * OTP Service
 * Generates, stores (Redis), sends (Email via Nodemailer), and verifies 6-digit OTPs.
 *
 * Email behaviour:
 *  - If SMTP_HOST, SMTP_USER, SMTP_PASS are set → sends real email via Nodemailer
 *  - Otherwise → prints OTP to the backend terminal (safe dev fallback)
 */

import { createHash, randomInt } from 'crypto';
import redis from '../config/redis.js';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';
import nodemailer from 'nodemailer';

const OTP_TTL_SECONDS = 5 * 60;  // 5 minutes
const OTP_KEY_PREFIX  = 'otp:email:';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a cryptographically-random 6-digit string */
export const generateOtp = () =>
  String(randomInt(100000, 999999));

/** SHA-256 hash so we never store the plaintext OTP in Redis */
const hashOtp = (otp) =>
  createHash('sha256').update(String(otp)).digest('hex');

/** Redis key for a given email */
const redisKey = (email) => `${OTP_KEY_PREFIX}${email}`;

// ── Storage ───────────────────────────────────────────────────────────────────

/** Store hashed OTP in Redis with a 5-minute TTL */
export const storeOtp = async (email, otp) => {
  if (!redis) throw Object.assign(new Error('Redis unavailable — OTP not stored'), { statusCode: 503 });
  await redis.set(redisKey(email), hashOtp(otp), 'EX', OTP_TTL_SECONDS);
};

/**
 * Verify OTP — returns true on match, deletes the key (single-use).
 * Returns false if the OTP has expired or was never sent.
 */
export const verifyOtp = async (email, otp) => {
  if (!redis) throw Object.assign(new Error('Redis unavailable — OTP not verifiable'), { statusCode: 503 });

  const stored = await redis.get(redisKey(email));
  if (!stored) return false;              // expired or never sent

  const match = stored === hashOtp(otp);
  if (match) await redis.del(redisKey(email));  // consume — single use only
  return match;
};

// ── Nodemailer Email ──────────────────────────────────────────────────────────

/**
 * Send OTP via Email.
 *
 * DEV FALLBACK: if SMTP is not configured,
 * the OTP is logged to the backend terminal so you can test without an email provider.
 */
export const sendEmailOtp = async (email, otp) => {
  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const from = env.SMTP_FROM || 'OmniDimension <no-reply@omnidimension.com>';

  const isPlaceholder = (str) => !str || str.includes('<') || str === 'your_email@gmail.com';
  const smtpReady = host && !isPlaceholder(user) && !isPlaceholder(pass);

  if (!smtpReady) {
    // ─── DEV MODE ───────────────────────────────────────────────────────────
    logger.warn(
      `\n${'═'.repeat(60)}\n` +
      `  [OTP DEV MODE]  No real SMTP provider configured.\n` +
      `  OTP for ${email} → ${otp}\n` +
      `  To enable real Emails, set SMTP_HOST, SMTP_USER, SMTP_PASS in backend/.env\n` +
      `${'═'.repeat(60)}`
    );
    return;  // OTP was already stored in Redis — verification still works
  }

  // ─── PRODUCTION EMAIL VIA NODEMAILER ─────────────────────────────────────
  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    secure: port === '465', // true for 465, false for other ports like 587
    auth: {
      user,
      pass,
    },
  });

  try {
    const info = await transporter.sendMail({
      from,
      to: email,
      subject: 'Your OmniDimension Verification Code',
      text: `Your OmniDimension verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>OmniDimension Verification</h2>
          <p>Your verification code is:</p>
          <h1 style="font-size: 32px; letter-spacing: 5px; color: #0eb39e;">${otp}</h1>
          <p>This code is valid for 5 minutes. Please do not share it with anyone.</p>
        </div>
      `,
    });
    
    logger.info({ to: email, messageId: info.messageId }, 'OTP Email sent successfully');
  } catch (error) {
    logger.error({ err: error.message }, 'Nodemailer Email send failed');
    throw Object.assign(
      new Error('Failed to send OTP Email. Please try again.'),
      { statusCode: 502 }
    );
  }
};
