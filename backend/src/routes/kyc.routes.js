import { Router } from 'express';
import logger from '../lib/logger.js';

const router = Router();

// In-memory OTP store: { phone -> { otp, expiresAt } }
const otpStore = new Map();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanPhone(raw = '') {
  // Strip non-digits, ensure it has country code
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return `+${digits}`;
}

async function sendViaTwilio(toPhone, otp) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER || '+15005550006';

  if (!accountSid || !authToken) {
    logger.warn('[KYC OTP] Twilio credentials missing — dev mode, OTP not sent via SMS');
    return { sent: false, reason: 'no_credentials' };
  }

  try {
    const { default: twilio } = await import('twilio');
    const client = twilio(accountSid, authToken);

    await client.messages.create({
      body: `Your KYC verification OTP is: ${otp}. Valid for 10 minutes. Do not share this with anyone.`,
      from: fromNumber,
      to: toPhone,
    });

    logger.info(`[KYC OTP] SMS sent from ${fromNumber} to ${toPhone}`);
    return { sent: true };
  } catch (err) {
    logger.error('[KYC OTP] Twilio send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

async function sendViaTextbelt(toPhone, otp) {
  try {
    const res = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: toPhone,
        message: `Your KYC verification OTP is: ${otp}. Valid for 10 minutes.`,
        key: 'textbelt',
      }),
    });
    const data = await res.json();
    if (data.success) {
      logger.info(`[KYC OTP] SMS sent via Textbelt to ${toPhone}`);
      return { sent: true };
    } else {
      logger.warn(`[KYC OTP] Textbelt send failed: ${data.error}`);
      return { sent: false, reason: data.error };
    }
  } catch (err) {
    logger.error('[KYC OTP] Textbelt exception:', err.message);
    return { sent: false, reason: err.message };
  }
}

async function sendViaFast2SMS(toPhone, otp) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    logger.warn('[KYC OTP] Fast2SMS API Key missing in environment');
    return { sent: false, reason: 'no_credentials' };
  }

  // Fast2SMS expects 10 digits for Indian numbers
  const digits = toPhone.replace(/\D/g, '');
  const cleanNumber = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;

  try {
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        route: 'otp',
        variables_values: otp,
        numbers: cleanNumber
      })
    });

    const data = await res.json();
    if (data.return) {
      logger.info(`[KYC OTP] SMS sent via Fast2SMS to ${cleanNumber}`);
      return { sent: true };
    } else {
      logger.error(`[KYC OTP] Fast2SMS send failed: ${data.message || JSON.stringify(data)}`);
      return { sent: false, reason: data.message || 'unknown_error' };
    }
  } catch (err) {
    logger.error('[KYC OTP] Fast2SMS exception:', err.message);
    return { sent: false, reason: err.message };
  }
}

async function sendViaMSG91(toPhone, otp) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !templateId) {
    logger.warn('[KYC OTP] MSG91 credentials missing in environment');
    return { sent: false, reason: 'no_credentials' };
  }

  // MSG91 expects mobile number in international format without leading + (e.g. 919999999999)
  const mobile = toPhone.replace(/\D/g, '');

  try {
    const url = `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(templateId)}&mobile=${encodeURIComponent(mobile)}&authkey=${encodeURIComponent(authKey)}&otp=${encodeURIComponent(otp)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();
    if (data.type === 'success') {
      logger.info(`[KYC OTP] SMS sent via MSG91 to ${mobile}`);
      return { sent: true };
    } else {
      logger.error(`[KYC OTP] MSG91 send failed: ${data.message || JSON.stringify(data)}`);
      return { sent: false, reason: data.message || 'unknown_error' };
    }
  } catch (err) {
    logger.error('[KYC OTP] MSG91 exception:', err.message);
  }
}

async function sendViaWhatsApp(toPhone, otp) {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  const wabaId = process.env.META_WABA_ID;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID || '1031627060036391';

  if (!token) {
    logger.warn('[KYC OTP] Meta System User Token missing in environment');
    return { sent: false, reason: 'no_credentials' };
  }

  // Format toPhone (strip all non-digits, e.g. +91 93732 29862 -> 919373229862)
  const mobile = toPhone.replace(/\D/g, '');

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: mobile,
        type: 'template',
        template: {
          name: 'welcome_new_customer',
          language: {
            code: 'en_US'
          },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: otp
                },
                {
                  type: 'text',
                  text: 'OmniDimension KYC'
                }
              ]
            }
          ]
        }
      })
    });

    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      logger.info(`[KYC OTP] WhatsApp message sent via WABA to ${mobile}`);
      return { sent: true };
    } else {
      logger.error(`[KYC OTP] WhatsApp send failed: ${JSON.stringify(data)}`);
      return { sent: false, reason: data.error?.message || 'unknown_error' };
    }
  } catch (err) {
    logger.error('[KYC OTP] WhatsApp exception:', err.message);
    return { sent: false, reason: err.message };
  }
}

async function sendOTP(toPhone, otp) {
  const provider = (process.env.SMS_PROVIDER || 'twilio').toLowerCase().trim();
  logger.info(`[KYC OTP] Sending OTP via provider: ${provider}`);

  if (provider === 'whatsapp') {
    const waRes = await sendViaWhatsApp(toPhone, otp);
    if (waRes.sent) return waRes;
    logger.warn(`[KYC OTP] WhatsApp delivery failed (${waRes.reason}). Falling back...`);
  } else if (provider === 'fast2sms') {
    const fastRes = await sendViaFast2SMS(toPhone, otp);
    if (fastRes.sent) return fastRes;
    logger.warn(`[KYC OTP] Fast2SMS delivery failed (${fastRes.reason}). Falling back...`);
  } else if (provider === 'msg91') {
    const msgRes = await sendViaMSG91(toPhone, otp);
    if (msgRes.sent) return msgRes;
    logger.warn(`[KYC OTP] MSG91 delivery failed (${msgRes.reason}). Falling back...`);
  }

  // Fallback to Twilio
  const twilioRes = await sendViaTwilio(toPhone, otp);
  if (twilioRes.sent) return twilioRes;

  // Fallback to Textbelt
  logger.info(`[KYC OTP] Twilio delivery failed (${twilioRes.reason}). Trying Textbelt fallback...`);
  const textbeltRes = await sendViaTextbelt(toPhone, otp);
  if (textbeltRes.sent) return textbeltRes;

  return {
    sent: false,
    reason: `Twilio: ${twilioRes.reason} | Textbelt: ${textbeltRes.reason}`
  };
}


/**
 * POST /api/kyc/send-otp
 * Body: { phone: string, type: 'mobile' | 'aadhar' }
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { phone, type = 'mobile' } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const normalized = cleanPhone(phone);
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP
    otpStore.set(normalized, { otp, expiresAt, type });

    // Try to send via Twilio/Textbelt
    const { sent, reason } = await sendOTP(normalized, otp);

    const isDev = process.env.NODE_ENV === 'development';

    logger.info(`[KYC OTP] Generated OTP for ${normalized}: ${otp} (sent=${sent})`);

    return res.json({
      success: true,
      sent,
      message: sent
        ? `OTP sent to ${normalized}`
        : `OTP generated (dev mode — SMS not sent)`,
      // Only expose OTP in development mode when SMS failed
      ...(isDev && !sent ? { devOtp: otp, reason } : {}),
      expiresIn: 600,
    });
  } catch (err) {
    logger.error('[KYC OTP] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to send OTP' });
  }
});

/**
 * POST /api/kyc/verify-otp
 * Body: { phone: string, otp: string }
 */
router.post('/verify-otp', (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, error: 'Phone and OTP are required' });
    }

    const normalized = cleanPhone(phone);
    const record = otpStore.get(normalized);

    if (!record) {
      return res.status(400).json({ success: false, error: 'No OTP found for this number. Please request a new OTP.' });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(normalized);
      return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
    }

    if (record.otp !== otp.trim()) {
      return res.status(400).json({ success: false, error: 'Invalid OTP. Please try again.' });
    }

    // OTP verified — remove from store
    otpStore.delete(normalized);
    return res.json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    logger.error('[KYC OTP] Verify error:', err);
    return res.status(500).json({ success: false, error: 'OTP verification failed' });
  }
});

export default router;
