// FEATURE: "Call from your own number"
// Two caller-ID sources for outbound agent calls:
//   A) Numbers you own in Twilio (IncomingPhoneNumbers)
//   B) The user's OWN number, verified via Twilio Verified Caller ID:
//      POST OutgoingCallerIds → Twilio returns a 6-digit code AND calls the
//      user's phone; they type the code on the keypad → number becomes usable
//      as the `From` of outbound calls.
// Twilio is the source of truth (no DB migration needed).
// NOTE: verification makes the number a legal caller ID; it does NOT by itself
// show your company name on Indian networks — that needs Airtel DLT +
// Business Name Display (see AIRTEL_VERIFIED_CALLING_GUIDE.md, served at
// GET /config/airtel-verified-calling-guide).

import logger from '../lib/logger.js';

const twilioReady = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
const tw = (path, opts = {}) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  return fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, {
    ...opts,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(opts.headers || {}) },
  });
};
const notConfigured = (res) => res.status(503).json({
  error: 'Phone calling is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing in backend/.env).',
});

// GET /workspaces/:workspaceId/caller-numbers
// → { owned: [...], verified: [...] } for the "select from list" option.
export const listCallerNumbers = async (_req, res) => {
  if (!twilioReady()) return notConfigured(res);
  try {
    const [ownedRes, verifiedRes] = await Promise.all([
      tw('/IncomingPhoneNumbers.json?PageSize=50'),
      tw('/OutgoingCallerIds.json?PageSize=50'),
    ]);
    const owned = ownedRes.ok ? (await ownedRes.json()).incoming_phone_numbers ?? [] : [];
    const verified = verifiedRes.ok ? (await verifiedRes.json()).outgoing_caller_ids ?? [] : [];
    res.json({
      owned: owned.map((n) => ({ phoneNumber: n.phone_number, label: n.friendly_name, source: 'twilio' })),
      verified: verified.map((n) => ({ phoneNumber: n.phone_number, label: n.friendly_name, source: 'own' })),
    });
  } catch (err) {
    logger.error('listCallerNumbers failed', err);
    res.status(502).json({ error: `Could not load numbers from Twilio: ${err.message}` });
  }
};

// POST /workspaces/:workspaceId/caller-numbers/verify  { phoneNumber, label? }
// Starts verification: Twilio CALLS the number; show `validationCode` on
// screen; the user types it on their keypad when they answer.
export const startVerification = async (req, res) => {
  if (!twilioReady()) return notConfigured(res);
  const { phoneNumber, label } = req.body ?? {};
  if (!phoneNumber || !/^\+\d{8,15}$/.test(String(phoneNumber).trim())) {
    return res.status(400).json({ error: 'Provide the number in E.164 format, e.g. +919876543210' });
  }
  try {
    const body = new URLSearchParams({
      PhoneNumber: String(phoneNumber).trim(),
      FriendlyName: (label || 'My number').slice(0, 64),
    });
    const r = await tw('/OutgoingCallerIds.json', { method: 'POST', body });
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status === 400 ? 400 : 502).json({
        error: `Twilio rejected the verification request: ${data.message || r.status}`,
      });
    }
    res.json({
      validationCode: data.validation_code,
      phoneNumber: data.phone_number,
      message: `Twilio is calling ${data.phone_number} now. Answer and enter this code on your keypad: ${data.validation_code}`,
    });
  } catch (err) {
    logger.error('startVerification failed', err);
    res.status(502).json({ error: `Verification request failed: ${err.message}` });
  }
};

// GET /workspaces/:workspaceId/caller-numbers/verify/status?phoneNumber=...
// Poll after the call: verified numbers appear in OutgoingCallerIds.
export const verificationStatus = async (req, res) => {
  if (!twilioReady()) return notConfigured(res);
  const phoneNumber = String(req.query.phoneNumber ?? '').trim();
  if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });
  try {
    const r = await tw(`/OutgoingCallerIds.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`);
    const data = await r.json();
    const found = (data.outgoing_caller_ids ?? []).length > 0;
    res.json({ phoneNumber, verified: found });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

// DELETE /workspaces/:workspaceId/caller-numbers?phoneNumber=...
export const removeVerified = async (req, res) => {
  if (!twilioReady()) return notConfigured(res);
  const phoneNumber = String(req.query.phoneNumber ?? '').trim();
  try {
    const r = await tw(`/OutgoingCallerIds.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`);
    const list = (await r.json()).outgoing_caller_ids ?? [];
    if (!list.length) return res.status(404).json({ error: 'Number not found among verified caller IDs' });
    await tw(`/OutgoingCallerIds/${list[0].sid}.json`, { method: 'DELETE' });
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

// ─── PATCH for the existing testCall (agent.controller.js) ───────────────────
// Replace:   const fromNumber = process.env.TWILIO_FROM_NUMBER;
// With:      const fromNumber = req.body.fromNumber || process.env.TWILIO_FROM_NUMBER;
// The client sends `fromNumber` from the picker; Twilio rejects with error
// 21210 if it isn't owned/verified, which testCall already surfaces honestly.
