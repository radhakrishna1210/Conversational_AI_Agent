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
import prisma from '../config/prisma.js';
import { VOICE_NUMBER_STATUS } from '../constants/compliance.js';

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

/**
 * Numbers assigned to this workspace on a NON-Twilio carrier.
 *
 * `VoiceNumber` is the routing table: `outboundCall.service#resolveProviderIdForNumber`
 * matches the caller ID against `phoneNumber` and dials on that row's
 * `provider`. So a row here is exactly the set of numbers that will actually
 * route somewhere other than the default carrier — which makes it the right
 * thing to offer in the picker, and means listing anything else would offer
 * numbers that silently dial out on Twilio instead.
 *
 * Twilio rows are included. They used to be excluded here because the live
 * Twilio listing below returned them anyway and a number in both places showed
 * twice — but that listing returned the PLATFORM's whole inventory to every
 * workspace, so it is gone. This table is now the only place any carrier's
 * number is tied to one tenant, Twilio included.
 */
const assignedCarrierNumbers = async (workspaceId) => {
  if (!workspaceId) return [];
  try {
    const rows = await prisma.voiceNumber.findMany({
      where: { workspaceId, status: 'ACTIVE' },
      select: { phoneNumber: true, provider: true },
      orderBy: { assignedAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      phoneNumber: r.phoneNumber,
      // "Your number", not the carrier's name. This IS the client's own number —
      // rented to them, billed to them, registered under their DLT header — and
      // labelling it "PLIVO" told them the one thing about it that is none of
      // their business. The broadcast picker renders `label` as the option's
      // title, so that label was the entire visible name of the number there.
      label: 'Your number',
      source: r.provider.toLowerCase(),
    }));
  } catch (e) {
    // A carrier list that partly fails should still show what it can. This
    // table did not exist before the compliance migration, so an older database
    // must not turn the whole picker into an error.
    logger.warn(`Could not read assigned carrier numbers: ${e.message}`);
    return [];
  }
};

/**
 * Numbers this workspace holds that cannot currently dial.
 *
 * Kept OUT of `owned` on purpose — the caller picker must only offer numbers a
 * call can actually go out on. But they must not simply vanish either: a
 * suspended number is still rented, still the client's, and disappearing from
 * the inventory page with no explanation is how "why did my campaigns stop?"
 * becomes a support ticket instead of a top-up.
 */
const unavailableCarrierNumbers = async (workspaceId) => {
  if (!workspaceId) return [];
  try {
    const rows = await prisma.voiceNumber.findMany({
      where: { workspaceId, status: VOICE_NUMBER_STATUS.SUSPENDED_NONPAYMENT },
      select: { phoneNumber: true, provider: true },
      orderBy: { assignedAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      phoneNumber: r.phoneNumber,
      label: 'Your number',
      source: r.provider.toLowerCase(),
      reason: 'Suspended — the monthly rental is unpaid. Top up and it reactivates automatically.',
      actionText: 'Top up wallet',
      actionLink: '/billing',
    }));
  } catch (e) {
    logger.warn(`Could not read suspended carrier numbers: ${e.message}`);
    return [];
  }
};

// GET /workspaces/:workspaceId/caller-numbers
// → { owned: [...], verified: [...], unavailable: [...] }.
// `owned` + `verified` feed the caller picker; `unavailable` is inventory the
// numbers page shows with a reason but nothing may dial from.
export const listCallerNumbers = async (req, res) => {
  const [carrierNumbers, unavailable] = await Promise.all([
    assignedCarrierNumbers(req.params.workspaceId),
    unavailableCarrierNumbers(req.params.workspaceId),
  ]);

  // A workspace may dial only from numbers assigned to IT.
  //
  // Every number the PLATFORM's Twilio account owns used to be merged in here,
  // unfiltered, which showed each client the whole parent account's inventory
  // and let any of them dial as any other — a caller ID is a tenancy fact, and
  // this was the one carrier that did not treat it as one.
  //
  // Tenancy runs through VoiceNumber for every carrier now. To lend a client a
  // Twilio number, record it there with provider TWILIO, exactly as a Plivo
  // number held by the main account is.
  const owned = carrierNumbers;

  // Twilio absent is not an error. An India-only deployment routes through
  // Plivo and may hold no Twilio credentials at all; 503-ing here put a message
  // about a carrier it does not use — naming env vars — in front of every
  // workspace that simply has no number yet.
  if (!twilioReady()) return res.json({ owned, verified: [], unavailable });

  try {
    // Only the BYO caller IDs a client verified as their own. `owned` no longer
    // depends on Twilio, so there is nothing here that can take this
    // deployment's real numbers off the list.
    const verifiedRes = await tw('/OutgoingCallerIds.json?PageSize=50');
    const verified = verifiedRes.ok ? (await verifiedRes.json()).outgoing_caller_ids ?? [] : [];
    res.json({
      owned,
      verified: verified.map((n) => ({ phoneNumber: n.phone_number, label: n.friendly_name, source: 'own' })),
      unavailable,
    });
  } catch (err) {
    logger.error('listCallerNumbers failed', err);
    res.json({ owned, verified: [], unavailable });
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
