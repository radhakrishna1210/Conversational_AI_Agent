/**
 * Sync Twilio numbers → create a sub-WABA per number → register on Meta Cloud API → NumberPool
 *
 * Flow per number:
 *  1. Skip if already in NumberPool with a Meta wabaId
 *  2. Create a sub-WABA under your Business ID
 *  3. Subscribe app to the new WABA (webhooks)
 *  4. Add phone number to sub-WABA  → Meta sends OTP SMS to that Twilio number
 *  5. Poll Twilio inbound messages and extract the 6-digit OTP (up to 90 s)
 *  6. Verify OTP with Meta
 *  7. Register number for Cloud API messaging
 *  8. Upsert into NumberPool with per-number wabaId + Meta token
 *
 * Required .env vars:
 *   META_BUSINESS_ID            — your Meta Business Manager ID
 *   META_SYSTEM_USER_TOKEN      — System User token (whatsapp_business_management + business_management)
 *   META_APP_ID                 — your Meta App ID (for webhook subscription)
 *   TWILIO_ACCOUNT_SID          — Twilio account SID
 *   TWILIO_AUTH_TOKEN           — Twilio auth token
 *
 * Optional:
 *   META_API_VERSION            — defaults to v19.0
 *   WABA_CURRENCY               — defaults to USD
 *   WABA_TIMEZONE_ID            — defaults to 1 (America/New_York)
 *
 * Run:
 *   node --env-file=.env scripts/sync-twilio.js
 */

import prisma from '../src/config/prisma.js';
import { encryptToken } from '../src/lib/encryption.js';

// ── Config ────────────────────────────────────────────────────────────────────

const {
  META_BUSINESS_ID,
  META_SYSTEM_USER_TOKEN,
  META_APP_ID,
  META_API_VERSION  = 'v19.0',
  WABA_CURRENCY     = 'USD',
  WABA_TIMEZONE_ID  = '1',
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
} = process.env;

if (!META_BUSINESS_ID || !META_SYSTEM_USER_TOKEN) {
  console.error('❌  META_BUSINESS_ID and META_SYSTEM_USER_TOKEN are required in .env');
  process.exit(1);
}
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error('❌  TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required in .env');
  process.exit(1);
}

const META_BASE   = `https://graph.facebook.com/${META_API_VERSION}`;
const TWILIO_BASE = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}`;
const TWILIO_CREDS = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

// ── Meta helpers ──────────────────────────────────────────────────────────────

async function metaPost(path, body) {
  const res = await fetch(`${META_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${META_SYSTEM_USER_TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`${data.error?.message ?? `Meta error ${res.status}`} — ${JSON.stringify(data.error ?? data)}`);
  }
  return data;
}

async function metaGet(path) {
  const res = await fetch(`${META_BASE}${path}`, {
    headers: { Authorization: `Bearer ${META_SYSTEM_USER_TOKEN}` },
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Meta error ${res.status}`);
  return data;
}

// ── Phone number parser ───────────────────────────────────────────────────────

/** Parse '+16624394273' → { cc: '1', local: '6624394273' } */
function parsePhone(e164) {
  const digits = e164.replace(/^\+/, '');
  const twoDigit = ['20','27','30','31','32','33','34','36','39','40','41','43','44','45','46','47','48','49',
                    '51','52','53','54','55','56','57','58','60','61','62','63','64','65','66','81','82','84',
                    '86','90','91','92','93','94','95','98'];
  const threeDigit = ['353','354','355','356','357','358','359','370','371','372','373','374','375','376',
                      '377','378','380','381','382','385','386','387','389','420','421','423'];

  for (const cc of threeDigit) {
    if (digits.startsWith(cc)) return { cc, local: digits.slice(cc.length) };
  }
  for (const cc of twoDigit) {
    if (digits.startsWith(cc)) return { cc, local: digits.slice(cc.length) };
  }
  return { cc: digits[0], local: digits.slice(1) }; // NANP default
}

// ── OTP poller ────────────────────────────────────────────────────────────────

/** Poll Twilio for an inbound 6-digit OTP SMS sent to `toNumber` after `afterMs`. */
async function waitForOtp(toNumber, afterMs, timeoutMs = 90_000) {
  console.log(`   ⏳  Waiting up to ${timeoutMs / 1000}s for OTP on ${toNumber}…`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4_000));

    const afterDate = new Date(afterMs).toISOString();
    const url = `${TWILIO_BASE}/Messages.json?To=${encodeURIComponent(toNumber)}&PageSize=10&DateSent%3E=${encodeURIComponent(afterDate)}`;
    const res = await fetch(url, { headers: { Authorization: `Basic ${TWILIO_CREDS}` } });
    const json = await res.json();

    for (const msg of json.messages ?? []) {
      const match = msg.body?.match(/\b(\d{6})\b/);
      if (match) {
        console.log(`   📩  OTP received: ${match[1]}`);
        return match[1];
      }
    }
  }

  throw new Error(`Timed out waiting for OTP on ${toNumber}`);
}

// ── Per-number registration ───────────────────────────────────────────────────

async function registerNumber(phone, displayName) {
  const { cc, local } = parsePhone(phone);

  // 1. Create sub-WABA under your Business ID
  console.log(`   📦  Creating sub-WABA under Business ${META_BUSINESS_ID}…`);
  const waba = await metaPost(`/${META_BUSINESS_ID}/whatsapp_business_accounts`, {
    name: displayName ?? phone,
    currency: WABA_CURRENCY,
    timezone_id: WABA_TIMEZONE_ID,
  });
  const wabaId = waba.id;
  console.log(`   ✅  Sub-WABA created: ${wabaId}`);

  // 2. Subscribe app to WABA (enables webhooks for this number)
  if (META_APP_ID) {
    try {
      await metaPost(`/${wabaId}/subscribed_apps`, {});
      console.log(`   🔔  App subscribed to WABA`);
    } catch (err) {
      console.warn(`   ⚠️   Webhook subscription skipped: ${err.message}`);
    }
  }

  // 3. Add phone number → triggers OTP SMS
  console.log(`   📤  Adding number to sub-WABA (cc=${cc}, number=${local})…`);
  const otpRequestedAt = Date.now();
  const phoneResp = await metaPost(`/${wabaId}/phone_numbers`, {
    cc,
    phone_number: local,
    method: 'SMS',
    verified_name: displayName ?? phone,
  });
  const metaPhoneNumberId = phoneResp.id;
  console.log(`   📱  Meta phone_number_id: ${metaPhoneNumberId}`);

  // 4. Read OTP from Twilio inbound SMS
  const otp = await waitForOtp(phone, otpRequestedAt);

  // 5. Verify OTP with Meta
  await metaPost(`/${metaPhoneNumberId}/verify_code`, { code: otp });
  console.log(`   ✅  OTP verified`);

  // 6. Register for Cloud API messaging
  try {
    await metaPost(`/${metaPhoneNumberId}/register`, {
      messaging_product: 'whatsapp',
      pin: '000000',
    });
    console.log(`   🚀  Registered for Cloud API messaging`);
  } catch (err) {
    // May already be registered — non-fatal
    console.log(`   ℹ️   Register step: ${err.message}`);
  }

  return { wabaId, metaPhoneNumberId };
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Fetch all numbers from Twilio
const twRes = await fetch(
  `${TWILIO_BASE}/IncomingPhoneNumbers.json?PageSize=1000`,
  { headers: { Authorization: `Basic ${TWILIO_CREDS}` } }
);
if (!twRes.ok) {
  console.error('❌  Twilio fetch failed:', twRes.status);
  process.exit(1);
}

const { incoming_phone_numbers: numbers = [] } = await twRes.json();
console.log(`\n📋  Found ${numbers.length} number(s) on Twilio\n`);

const encryptedMetaToken = encryptToken(META_SYSTEM_USER_TOKEN);
let added = 0, skipped = 0, failed = 0;

for (const num of numbers) {
  const phone = num.phone_number; // e.g. +16624394273
  console.log(`🔄  Processing ${phone}…`);

  // Skip if already in pool with a real Meta wabaId (not a Twilio SID)
  const existing = await prisma.numberPool.findUnique({ where: { phoneNumber: phone } });
  if (existing?.wabaId && !existing.wabaId.startsWith('AC')) {
    console.log(`   ⏭   Already registered on Meta WABA — skipped\n`);
    skipped++;
    continue;
  }

  try {
    const { wabaId, metaPhoneNumberId } = await registerNumber(phone, num.friendly_name);

    await prisma.numberPool.upsert({
      where: { phoneNumber: phone },
      create: {
        phoneNumber:   phone,
        phoneNumberId: metaPhoneNumberId,
        wabaId,
        accessToken:   encryptedMetaToken,
        displayName:   num.friendly_name ?? phone,
        status:        'AVAILABLE',
        registeredAt:  new Date(),
      },
      update: {
        phoneNumberId: metaPhoneNumberId,
        wabaId,
        accessToken:   encryptedMetaToken,
        displayName:   num.friendly_name ?? phone,
        status:        'AVAILABLE',
      },
    });

    console.log(`   💾  Saved to NumberPool\n`);
    added++;

  } catch (err) {
    console.error(`   ❌  Failed: ${err.message}\n`);
    failed++;
  }
}

console.log(`\n🎉  Done — ${added} registered, ${skipped} skipped, ${failed} failed`);
await prisma.$disconnect();
