import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { encryptToken } from '../lib/encryption.js';
import { env } from '../config/env.js';
import { metaGet, metaPost } from '../lib/metaApi.js';
import fetch from 'node-fetch';

// ─── In-memory OTP store (keyed by E.164 phone number, TTL 10 min) ─────────────
const pendingOtps = new Map(); // phoneNumber → { otp, expiresAt }

/** Store OTP captured from Twilio webhook */
export const storePendingOtp = (phoneNumber, otp) => {
  pendingOtps.set(phoneNumber, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });
  logger.info({ phoneNumber, otp }, 'OTP stored from Twilio webhook');
};

/** Get OTP for a number (returns null if expired or not found) */
const getStoredOtp = (phoneNumber) => {
  const entry = pendingOtps.get(phoneNumber);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { pendingOtps.delete(phoneNumber); return null; }
  pendingOtps.delete(phoneNumber);
  return entry.otp;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Extract country code + subscriber number from E.164 format (+16624394273 → { cc:'1', number:'6624394273' }) */
function parseE164(e164) {
  const digits = e164.replace(/\D/g, '');
  // Common country code lengths: 1 (US/CA), 2 (most others), 3 (some)
  // Simple heuristic: US/CA numbers are 11 digits total (1 + 10)
  if (digits.length === 11 && digits[0] === '1') {
    return { cc: '1', number: digits.slice(1) };
  }
  // For others assume 2-digit country code
  return { cc: digits.slice(0, 2), number: digits.slice(2) };
}

/** Poll Twilio SMS inbox for OTP from Meta (retries for up to 120 seconds) */
async function readOTPFromTwilio(accountSid, authToken, toNumber, maxWaitMs = 120000) {
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const start = Date.now();

  // Try multiple formats Meta might send to
  const formats = [
    toNumber,                              // +16624394273
    toNumber.replace('+', ''),             // 16624394273
    toNumber.replace(/^\+1/, ''),          // 6624394273 (US without country code)
  ];

  logger.info({ toNumber, formats }, 'Polling Twilio inbox for Meta OTP...');

  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 8000)); // poll every 8s

    for (const fmt of formats) {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?To=${encodeURIComponent(fmt)}&PageSize=10&DateSent%3E=${new Date(start).toISOString().split('T')[0]}`;
      const res = await fetch(url, { headers: { Authorization: `Basic ${credentials}` } });
      if (!res.ok) continue;

      const data = await res.json();
      const messages = data.messages ?? [];

      logger.info({ format: fmt, messageCount: messages.length }, 'Twilio inbox poll');

      for (const msg of messages) {
        // Meta OTP messages contain a 6-digit code
        const match = msg.body?.match(/\b(\d{6})\b/);
        if (match) {
          logger.info({ toNumber, otp: match[1], from: msg.from, body: msg.body }, 'OTP found in Twilio inbox');
          return match[1];
        }
      }
    }
  }
  throw new Error(`OTP not received for ${toNumber} within ${maxWaitMs / 1000}s`);
}

// ─── syncTwilioNumbers ───────────────────────────────────────────────────────
// 1. Fetch all numbers from Twilio
// 2. Register each with Meta platform WABA (sends OTP to number)
// 3. Auto-read OTP from Twilio SMS inbox
// 4. Verify OTP with Meta → get Meta Phone Number ID
// 5. Save to pool with Meta credentials — ready for clients

export const syncTwilioNumbers = async (req, res) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const wabaId     = env.META_WABA_ID;
  const metaToken  = env.META_SYSTEM_USER_TOKEN;

  if (!accountSid || !authToken) {
    return res.status(503).json({ error: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set in .env' });
  }
  if (!wabaId || !metaToken) {
    return res.status(503).json({ error: 'META_WABA_ID / META_SYSTEM_USER_TOKEN not set in .env' });
  }

  // 1. Fetch all Twilio numbers
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const twRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=1000`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );
  if (!twRes.ok) {
    const body = await twRes.json().catch(() => ({}));
    return res.status(502).json({ error: body.message ?? `Twilio error: ${twRes.status}` });
  }

  const { incoming_phone_numbers: numbers = [] } = await twRes.json();
  const encryptedMetaToken = encryptToken(metaToken);

  const results = [];

  for (const num of numbers) {
    const phoneNumber = num.phone_number; // e.g. +16624394273
    const displayName = num.friendly_name ?? phoneNumber;
    const result = { phoneNumber, status: null, error: null };

    try {
      // Check if already registered with Meta in pool
      const existing = await prisma.numberPool.findUnique({ where: { phoneNumber } });
      if (existing && existing.wabaId === wabaId) {
        result.status = 'skipped — already registered with Meta';
        results.push(result);
        continue;
      }

      // 2. Check if number already exists in the WABA (e.g. from a previous attempt)
      let metaPhoneNumberId = null;

      let existingNumbers;
      try {
        existingNumbers = await metaGet(`/${wabaId}/phone_numbers`, metaToken, {
          fields: 'id,display_phone_number,verified_name,status',
        });
        logger.info({ wabaId, count: existingNumbers.data?.length }, 'Fetched WABA phone numbers');
      } catch (err) {
        logger.error({ err: err.message }, 'Step 2a FAILED: GET /{waba}/phone_numbers');
        throw new Error(`Step 2a (list numbers): ${err.message}`);
      }

      // Normalise: strip all non-digit chars for comparison
      const digitsOnly = (s) => s?.replace(/\D/g, '') ?? '';
      const normalisedDigits = digitsOnly(phoneNumber);
      const found = (existingNumbers.data ?? []).find((n) => {
        return digitsOnly(n.display_phone_number) === normalisedDigits;
      });

      if (found) {
        metaPhoneNumberId = found.id;
        logger.info({ phoneNumber, metaPhoneNumberId, status: found.status }, 'Number already in WABA — resending OTP');
        try {
          await metaPost(`/${metaPhoneNumberId}/request_code`, { code_method: 'SMS', language: 'en_US' }, metaToken);
        } catch (err) {
          logger.error({ err: err.message }, 'Step 2b FAILED: POST /request_code');
          throw new Error(`Step 2b (resend OTP): ${err.message}`);
        }
      } else {
        logger.info({ phoneNumber, wabaId }, 'Registering number with Meta WABA');
        const { cc, number } = parseE164(phoneNumber);
        const verifiedName = env.META_DISPLAY_NAME || 'Whabridge';
        try {
          const regResp = await metaPost(`/${wabaId}/phone_numbers`, {
            cc,
            phone_number: number,
            method: 'SMS',
            verified_name: verifiedName,
          }, metaToken);
          metaPhoneNumberId = regResp.id;
          logger.info({ phoneNumber, metaPhoneNumberId }, 'Number registered with Meta — waiting for OTP');
        } catch (err) {
          logger.error({ err: err.message, cc, number, verifiedName }, 'Step 2c FAILED: POST /{waba}/phone_numbers');
          throw new Error(`Step 2c (register number): ${err.message}`);
        }
      }

      // 3. Get OTP — check webhook cache first, then poll Twilio SMS inbox
      const cachedOtp = getStoredOtp(phoneNumber);
      const otp = cachedOtp ?? await readOTPFromTwilio(accountSid, authToken, phoneNumber);
      if (cachedOtp) logger.info({ phoneNumber, otp }, 'OTP from webhook cache (skip polling)');

      // 4. Verify OTP with Meta
      await metaPost(`/${metaPhoneNumberId}/verify_code`, { code: otp }, metaToken);
      logger.info({ phoneNumber, metaPhoneNumberId }, 'OTP verified with Meta');

      // 5. Upsert into pool with Meta credentials
      await prisma.numberPool.upsert({
        where: { phoneNumber },
        create: {
          phoneNumber,
          phoneNumberId: metaPhoneNumberId,
          wabaId,
          accessToken:  encryptedMetaToken,
          displayName,
          status:       'AVAILABLE',
          registeredAt: new Date(),
        },
        update: {
          phoneNumberId: metaPhoneNumberId,
          wabaId,
          accessToken:  encryptedMetaToken,
          displayName,
          status:       'AVAILABLE',
        },
      });

      result.status = 'registered';
      logger.info({ phoneNumber, metaPhoneNumberId }, 'Number ready in pool with Meta credentials');
    } catch (err) {
      result.error = err.message;
      result.status = 'failed';
      logger.error({ phoneNumber, err: err.message }, 'Failed to register number with Meta');
    }

    results.push(result);
  }

  const registered = results.filter((r) => r.status === 'registered').length;
  const skipped    = results.filter((r) => r.status?.startsWith('skipped')).length;
  const failed     = results.filter((r) => r.status === 'failed').length;

  logger.info({ registered, skipped, failed, total: numbers.length }, 'Twilio → Meta sync complete');

  return res.json({
    success: true,
    total: numbers.length,
    registered,
    skipped,
    failed,
    results,
  });
};

// ─── addNumberToPool ──────────────────────────────────────────────────────────

export const addNumberToPool = async (req, res) => {
  const { phoneNumber, phoneNumberId, wabaId, accessToken, displayName } = req.body;

  // Check for duplicate before attempting insert (gives a clearer error than P2002)
  const existing = await prisma.numberPool.findUnique({ where: { phoneNumber } });
  if (existing) {
    return res.status(409).json({ error: `Phone number ${phoneNumber} already exists in the pool` });
  }

  const encryptedToken = encryptToken(accessToken);

  const entry = await prisma.numberPool.create({
    data: {
      phoneNumber,
      phoneNumberId,
      wabaId,
      accessToken: encryptedToken,
      displayName: displayName ?? null,
      status: 'AVAILABLE',
      registeredAt: new Date(),
    },
  });

  logger.info({ adminId: req.user?.id ?? req.user?.userId, phoneNumber }, 'Number added to pool');

  return res.status(201).json({
    success: true,
    id: entry.id,
    phoneNumber: entry.phoneNumber,
    status: entry.status,
  });
};

// ─── runMetaTestCalls ─────────────────────────────────────────────────────────
// Satisfies Meta app review "0 of 1 API call(s) required" for permissions.
// Call this once after deploying — it uses the platform system user token directly.

export const runMetaTestCalls = async (req, res) => {
  const token = env.META_SYSTEM_USER_TOKEN;
  const businessId = env.META_BUSINESS_ID;
  const wabaId = env.META_WABA_ID;

  if (!token || !businessId || !wabaId) {
    return res.status(503).json({
      error: 'META_SYSTEM_USER_TOKEN, META_BUSINESS_ID and META_WABA_ID must all be set in .env',
    });
  }

  const results = {};

  // business_management — GET /me/businesses
  try {
    const r = await metaGet('/me/businesses', token, { fields: 'id,name', limit: '1' });
    results.business_management = { status: 'ok', count: r.data?.length ?? 0 };
    logger.info('Meta test call: GET /me/businesses — ok');
  } catch (err) {
    results.business_management = { status: 'error', message: err.message };
    logger.warn({ err: err.message }, 'Meta test call: GET /me/businesses — failed');
  }

  // whatsapp_business_management — GET /{waba-id}/message_templates
  try {
    const r = await metaGet(`/${wabaId}/message_templates`, token, { limit: '1' });
    results.whatsapp_business_management_templates = { status: 'ok', count: r.data?.length ?? 0 };
    logger.info('Meta test call: GET /{waba-id}/message_templates — ok');
  } catch (err) {
    results.whatsapp_business_management_templates = { status: 'error', message: err.message };
    logger.warn({ err: err.message }, 'Meta test call: GET /{waba-id}/message_templates — failed');
  }

  // whatsapp_business_management — GET /{waba-id}/phone_numbers
  try {
    const r = await metaGet(`/${wabaId}/phone_numbers`, token, { limit: '1' });
    results.whatsapp_business_management_numbers = { status: 'ok', count: r.data?.length ?? 0 };
    logger.info('Meta test call: GET /{waba-id}/phone_numbers — ok');
  } catch (err) {
    results.whatsapp_business_management_numbers = { status: 'error', message: err.message };
    logger.warn({ err: err.message }, 'Meta test call: GET /{waba-id}/phone_numbers — failed');
  }

  // business_management — GET /{business-id}/owned_whatsapp_business_accounts
  try {
    const r = await metaGet(`/${businessId}/owned_whatsapp_business_accounts`, token, { limit: '1' });
    results.business_management_waba = { status: 'ok', count: r.data?.length ?? 0 };
    logger.info('Meta test call: GET /{business-id}/owned_whatsapp_business_accounts — ok');
  } catch (err) {
    results.business_management_waba = { status: 'error', message: err.message };
    logger.warn({ err: err.message }, 'Meta test call: GET /{business-id}/owned_whatsapp_business_accounts — failed');
  }

  logger.info({ adminId: req.user?.id ?? req.user?.userId, results }, 'Meta test calls complete');
  return res.json({ success: true, results });
};

// ─── requestOtp ──────────────────────────────────────────────────────────────
// Send OTP to a phone number that is already registered in the Meta WABA.
// The admin reads the OTP from the Twilio console / phone and then calls verifyOtp.

export const requestOtp = async (req, res) => {
  const { metaPhoneNumberId, method = 'SMS' } = req.body;
  const metaToken = env.META_SYSTEM_USER_TOKEN;

  if (!metaPhoneNumberId) return res.status(400).json({ error: 'metaPhoneNumberId is required' });
  if (!metaToken) return res.status(503).json({ error: 'META_SYSTEM_USER_TOKEN not set' });

  try {
    await metaPost(`/${metaPhoneNumberId}/request_code`, { code_method: method, language: 'en_US' }, metaToken);
    logger.info({ metaPhoneNumberId, method }, 'OTP request sent to Meta');
    return res.json({ success: true, message: `OTP sent via ${method}. Check your Twilio number's inbox/calls.` });
  } catch (err) {
    logger.error({ metaPhoneNumberId, err: err.message }, 'OTP request failed');
    return res.status(502).json({ error: err.message });
  }
};

// ─── twilioSmsWebhook ─────────────────────────────────────────────────────────
// Twilio POSTs inbound SMS to this endpoint. We extract the OTP and store it
// so the syncTwilioNumbers pipeline can pick it up automatically.
// Configure the Twilio number's SMS URL to: POST /api/v1/admin/twilio/sms-webhook

export const twilioSmsWebhook = (req, res) => {
  const { To, From, Body } = req.body ?? {};
  if (Body) {
    const match = Body.match(/\b(\d{6})\b/);
    if (match) {
      // 'To' is the Twilio number that received the SMS
      storePendingOtp(To, match[1]);
    }
  }
  logger.info({ to: To, from: From, body: Body }, 'Twilio SMS webhook received');
  // Respond with empty TwiML (no reply)
  res.set('Content-Type', 'text/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
};

// ─── verifyOtp ────────────────────────────────────────────────────────────────
// Verify OTP entered by admin, then upsert the pool entry with Meta credentials.

export const verifyOtp = async (req, res) => {
  const { phoneNumber, metaPhoneNumberId, otp: manualOtp, displayName } = req.body;
  const otp = manualOtp || getStoredOtp(phoneNumber);

  if (!otp) {
    return res.status(400).json({ error: 'OTP is required — enter it manually or wait for the SMS webhook to capture it' });
  }

  const wabaId    = env.META_WABA_ID;
  const metaToken = env.META_SYSTEM_USER_TOKEN;

  if (!phoneNumber || !metaPhoneNumberId) {
    return res.status(400).json({ error: 'phoneNumber and metaPhoneNumberId are required' });
  }
  if (!wabaId || !metaToken) {
    return res.status(503).json({ error: 'META_WABA_ID / META_SYSTEM_USER_TOKEN not set' });
  }

  try {
    await metaPost(`/${metaPhoneNumberId}/verify_code`, { code: otp }, metaToken);
    logger.info({ phoneNumber, metaPhoneNumberId }, 'OTP verified with Meta');
  } catch (err) {
    logger.error({ phoneNumber, err: err.message }, 'OTP verification failed');
    return res.status(400).json({ error: `OTP verification failed: ${err.message}` });
  }

  const encryptedMetaToken = encryptToken(metaToken);

  await prisma.numberPool.upsert({
    where: { phoneNumber },
    create: {
      phoneNumber,
      phoneNumberId: metaPhoneNumberId,
      wabaId,
      accessToken:  encryptedMetaToken,
      displayName:  displayName ?? phoneNumber,
      status:       'AVAILABLE',
      registeredAt: new Date(),
    },
    update: {
      phoneNumberId: metaPhoneNumberId,
      wabaId,
      accessToken:  encryptedMetaToken,
      displayName:  displayName ?? phoneNumber,
      status:       'AVAILABLE',
    },
  });

  logger.info({ phoneNumber, metaPhoneNumberId }, 'Number verified and saved to pool');
  return res.json({ success: true, phoneNumber, metaPhoneNumberId, status: 'AVAILABLE' });
};

// ─── listWabaNumbers ─────────────────────────────────────────────────────────
// List phone numbers registered in the platform WABA (to find metaPhoneNumberId)

export const listWabaNumbers = async (req, res) => {
  const wabaId    = env.META_WABA_ID;
  const metaToken = env.META_SYSTEM_USER_TOKEN;

  if (!wabaId || !metaToken) {
    return res.status(503).json({ error: 'META_WABA_ID / META_SYSTEM_USER_TOKEN not set' });
  }

  try {
    const data = await metaGet(`/${wabaId}/phone_numbers`, metaToken, {
      fields: 'id,display_phone_number,verified_name,status,code_verification_status',
    });
    return res.json({ success: true, numbers: data.data ?? [] });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to list WABA phone numbers');
    return res.status(502).json({ error: err.message });
  }
};

// ─── resetPoolNumber ──────────────────────────────────────────────────────────

export const resetPoolNumber = async (req, res) => {
  const { id } = req.params;

  const entry = await prisma.numberPool.findUnique({ where: { id } });
  if (!entry) return res.status(404).json({ error: 'Pool entry not found' });

  await prisma.numberPool.update({
    where: { id },
    data: { status: 'AVAILABLE', assignedTo: null },
  });

  logger.info({ adminId: req.user?.id ?? req.user?.userId, phoneNumber: entry.phoneNumber }, 'Pool number reset to AVAILABLE');
  return res.json({ success: true, phoneNumber: entry.phoneNumber, status: 'AVAILABLE' });
};

// ─── getNumberPool ────────────────────────────────────────────────────────────

export const getNumberPool = async (req, res) => {
  const entries = await prisma.numberPool.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const pool = entries.map(({ accessToken: _omit, ...safe }) => safe);

  const summary = {
    total:    entries.length,
    available: entries.filter((e) => e.status === 'AVAILABLE').length,
    assigned:  entries.filter((e) => e.status === 'ASSIGNED').length,
    banned:    entries.filter((e) => e.status === 'BANNED').length,
  };

  logger.info(
    { adminId: req.user?.id ?? req.user?.userId, poolSize: entries.length },
    'Number pool fetched'
  );

  return res.json({ summary, pool });
};
