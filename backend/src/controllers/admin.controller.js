import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { encryptToken } from '../lib/encryption.js';
import fetch from 'node-fetch';

// ─── syncTwilioNumbers ───────────────────────────────────────────────────────
// Reads TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN from .env and upserts every
// purchased phone number into the NumberPool as AVAILABLE.

export const syncTwilioNumbers = async (req, res) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return res.status(503).json({
      error: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set in server .env',
    });
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const twRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=1000`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  if (!twRes.ok) {
    const body = await twRes.json().catch(() => ({}));
    logger.error({ status: twRes.status, body }, 'Twilio API error during pool sync');
    return res.status(502).json({ error: body.message ?? `Twilio error: ${twRes.status}` });
  }

  const data    = await twRes.json();
  const numbers = data.incoming_phone_numbers ?? [];

  const encryptedToken = encryptToken(authToken);
  let added = 0, skipped = 0;

  for (const num of numbers) {
    const existing = await prisma.numberPool.findUnique({ where: { phoneNumber: num.phone_number } });
    if (existing) { skipped++; continue; }

    await prisma.numberPool.create({
      data: {
        phoneNumber:   num.phone_number,
        phoneNumberId: num.sid,
        wabaId:        accountSid,
        accessToken:   encryptedToken,
        displayName:   num.friendly_name ?? num.phone_number,
        status:        'AVAILABLE',
        registeredAt:  new Date(),
      },
    });
    added++;
  }

  logger.info(
    { adminId: req.user?.id ?? req.user?.userId, added, skipped, total: numbers.length },
    'Twilio pool sync complete'
  );

  return res.json({
    success: true,
    total:   numbers.length,
    added,
    skipped,
    message: `${added} number(s) added to pool, ${skipped} already existed.`,
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
