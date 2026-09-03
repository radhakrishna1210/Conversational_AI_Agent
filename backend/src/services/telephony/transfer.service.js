// backend/src/services/telephony/transfer.service.js
/**
 * Live human call transfer — the carrier half.
 *
 * WHAT EXISTED BEFORE: prompt text. `agentRuntime.service.js` told the model to
 * "let them know warmly that you'll connect them to a team member and are
 * transferring them now"; `transferNumber` sat in the agent's settings JSON;
 * nothing dialled. The agent announced a transfer and kept talking. This file,
 * transferIntent.js and the bridge wiring replace that with a real handover
 * and — more importantly — an honest failure path.
 *
 * ── THE SHAPE OF A TRANSFER ON A MEDIA-STREAM CALL ──────────────────────────
 *
 * Both carriers in use run the conversation as a bidirectional media stream
 * (Twilio `<Connect><Stream>`, Plivo `<Stream bidirectional>`). Nothing can be
 * dialled from inside that stream; the call has to be REDIRECTED to a new
 * document that dials the human. The redirect is a REST call against the live
 * call (Twilio: update the Call resource with new TwiML; Plivo: the Transfer
 * API with `aleg_url`). The moment the carrier applies it the media stream
 * ends — the bridge's socket closes — and the caller hears ringing.
 *
 * The chosen mode is an ANNOUNCED TRANSFER WITH AUTOMATIC RETURN:
 *
 *   1. The agent tells the caller it is connecting them (the model's own
 *      sentence, spoken through the normal pipeline).
 *   2. Once that audio has played out, the call is redirected to a <Dial> of
 *      the configured number, with a ring timeout and an `action` callback.
 *   3. If the human answers, the two talk; when either hangs up the action
 *      callback reports `completed`, we answer <Hangup/>, and the call log is
 *      finalised with the WHOLE duration (both legs) so billing is right.
 *   4. If nobody answers, the line is busy, the number is bad or the carrier
 *      rejects the leg, the action callback reports it and we answer with a
 *      document that RECONNECTS the media stream to the agent, carrying
 *      `transferOutcome`. The bridge that picks that socket up skips the
 *      greeting, tells the caller honestly that nobody could be reached, and
 *      offers a message or a callback.
 *
 * Why not a true warm (attended) transfer or a conference: both carriers can
 * do it, but only by putting all three parties in a conference room and
 * having the AGENT LEG stay on the line to brief the human, i.e. the bridge
 * would need to keep its media socket open, mix a third participant, and know
 * when to leave. That is a sizeable second media path for a benefit (the
 * human hears a briefing) that the post-call summary already delivers by
 * other means. The announced-with-return shape gives the caller the same
 * experience on the happy path and a strictly better one on every failure
 * path, with one document and one callback per carrier. It is the default
 * for the same reason it is the only one implemented; the setting is called
 * `transferMode` so an attended variant can be added without a rename.
 *
 * PIOPIY: not supported. The modular bridge does not run on it
 * (supportsModularEngine: false) and its PCMO pipeline has no redirect API
 * for a live stream call. transferAvailability() says so, and the prompt then
 * tells the caller the truth instead of promising a person.
 *
 * ── SAFETY ──────────────────────────────────────────────────────────────────
 * Callback URLs carry an HMAC of the call log id (signTransferToken) so a
 * forged callback cannot hang up or re-route someone else's call; Plivo's own
 * signature check applies on top where the controller has it. Numbers are
 * validated as E.164 at save time (agent validator) and again here.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import logger from '../../lib/logger.js';
import { xmlUrl, withStreamParams } from './provider.interface.js';
import { buildStreamXml, resolveAnswerUrlBase } from './plivo.provider.js';

export const TRANSFER_MODES = ['announce', 'immediate'];
export const OUT_OF_HOURS = ['callback', 'attempt', 'decline'];
export const DEFAULT_TRANSFER_TIMEOUT_SEC = 25;
const MIN_TIMEOUT = 5;
const MAX_TIMEOUT = 60;

/** E.164 or null. Accepts spaces/dashes/parentheses and a leading 00. */
export function e164(number) {
  let s = String(number ?? '').trim().replace(/[\s\-().]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  // Without an explicit "+" the country code has to be IN the digits: a bare
  // national number ("415 555 0100", "98765 43210") is ambiguous and would
  // dial the wrong country. Eleven digits is the shortest common CC+national
  // form (US); India is twelve.
  if (!s.startsWith('+')) { if (!/^\d{11,15}$/.test(s)) return null; s = `+${s}`; }
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
}

/**
 * The agent's transfer configuration, resolved from its settings JSON with
 * every field validated and defaulted. `enabled` is false whenever there is
 * no dialable number — the single fact everything else hangs on.
 */
export function resolveTransferConfig(settings = {}) {
  const number = e164(settings?.transferNumber);
  const mode = TRANSFER_MODES.includes(settings?.transferMode) ? settings.transferMode : 'announce';
  const t = Number(settings?.transferTimeoutSec);
  const timeoutSec = Number.isFinite(t) ? Math.min(MAX_TIMEOUT, Math.max(MIN_TIMEOUT, Math.round(t))) : DEFAULT_TRANSFER_TIMEOUT_SEC;
  const outOfHours = OUT_OF_HOURS.includes(settings?.transferOutOfHours) ? settings.transferOutOfHours : 'callback';
  const h = settings?.transferHours;
  let hours = null;
  if (h && typeof h === 'object' && h.enabled) {
    const start = /^\d{2}:\d{2}$/.test(h.start) ? h.start : '09:00';
    const end = /^\d{2}:\d{2}$/.test(h.end) ? h.end : '18:00';
    const days = Array.isArray(h.days) ? h.days.map(Number).filter((d) => d >= 0 && d <= 6) : [1, 2, 3, 4, 5];
    const tz = typeof h.timezone === 'string' && h.timezone ? h.timezone : 'Asia/Kolkata';
    hours = { start, end, days, timezone: tz };
  }
  return {
    enabled: Boolean(number),
    number,
    mode,
    timeoutSec,
    outOfHours,
    hours,
    condition: typeof settings?.transferCondition === 'string' ? settings.transferCondition.trim() : '',
    targetLabel: typeof settings?.transferLabel === 'string' && settings.transferLabel.trim() ? settings.transferLabel.trim() : 'a team member',
  };
}

/** Local wall-clock minutes-of-day and weekday in a timezone, without a library. */
function localClock(now, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
    return { day, minutes };
  } catch {
    return { day: now.getUTCDay(), minutes: now.getUTCHours() * 60 + now.getUTCMinutes() };
  }
}

/** True when no hours are configured, or `now` falls inside them. */
export function isWithinTransferHours(config, now = new Date()) {
  if (!config?.hours) return true;
  const { start, end, days, timezone } = config.hours;
  const { day, minutes } = localClock(now, timezone);
  if (!days.includes(day)) return false;
  const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const a = toMin(start); const b = toMin(end);
  return a <= b ? (minutes >= a && minutes < b) : (minutes >= a || minutes < b); // overnight window
}

/**
 * Can THIS call be transferred right now? The answer drives the prompt (so the
 * model never promises what cannot happen) and the runtime.
 *
 * @param {{ carrierId?: string|null, settings?: object, channel?: 'phone'|'web', now?: Date }} p
 * @returns {{ available: boolean, reason: string|null, config: object, outOfHours: boolean }}
 */
export function transferAvailability({ carrierId = null, settings = {}, channel = 'phone', now = new Date() } = {}) {
  const config = resolveTransferConfig(settings);
  if (!config.enabled) return { available: false, reason: 'no transfer number configured', config, outOfHours: false };
  if (channel !== 'phone') return { available: false, reason: 'a browser call has no phone leg to hand over', config, outOfHours: false };
  const id = String(carrierId || '').toUpperCase();
  if (id === 'PIOPIY') return { available: false, reason: 'PIOPIY has no live-call redirect for a media-stream call', config, outOfHours: false };
  if (id && id !== 'TWILIO' && id !== 'PLIVO') return { available: false, reason: `unknown carrier ${id}`, config, outOfHours: false };
  const inHours = isWithinTransferHours(config, now);
  if (!inHours && config.outOfHours !== 'attempt') {
    return { available: false, reason: `outside transfer hours (${config.outOfHours})`, config, outOfHours: true };
  }
  return { available: true, reason: null, config, outOfHours: !inHours };
}

// ── Callback URL signing ─────────────────────────────────────────────────────
const secret = () => process.env.TRANSFER_CALLBACK_SECRET || process.env.JWT_ACCESS_SECRET || '';
export function signTransferToken(callLogId) {
  const s = secret();
  if (!s) return '';
  return createHmac('sha256', s).update(`transfer:${callLogId}`).digest('hex').slice(0, 32);
}
export function verifyTransferToken(callLogId, token) {
  const expected = signTransferToken(callLogId);
  if (!expected || !token) return false;
  const a = Buffer.from(String(token)); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Public HTTP base of this server (derived from the carriers' own setting). */
export function publicHttpBase() {
  const explicit = process.env.PUBLIC_BACKEND_HTTP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const base = resolveAnswerUrlBase();
  return base ? base.replace(/\/api\/v1\/plivo\/answer$/, '') : '';
}

/**
 * The URL a carrier will call back with the outcome of the <Dial>.
 * @param {{ carrierId: string, callLogId: string, workspaceId: string, agentId: string, kind?: 'dial'|'xml'|'status' }} p
 */
export function transferCallbackUrl({ carrierId, callLogId, workspaceId, agentId, kind = 'dial' }) {
  const base = publicHttpBase();
  if (!base) return null;
  const u = new URL(`${base}/api/v1/telephony/transfer/${String(carrierId).toLowerCase()}/${kind}`);
  u.searchParams.set('callLogId', callLogId);
  u.searchParams.set('workspaceId', workspaceId);
  u.searchParams.set('agentId', agentId);
  u.searchParams.set('t', signTransferToken(callLogId));
  return u.toString();
}

// ── Documents ────────────────────────────────────────────────────────────────
const attr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** The <Dial> document that hands the caller to the human. */
export function buildDialDocument(carrierId, { number, callerId = null, timeoutSec = DEFAULT_TRANSFER_TIMEOUT_SEC, actionUrl }) {
  const to = e164(number);
  if (!to) throw new Error('transfer target is not a valid E.164 number');
  const id = String(carrierId).toUpperCase();
  const cid = callerId ? ` callerId="${attr(callerId)}"` : '';
  const t = Math.min(MAX_TIMEOUT, Math.max(MIN_TIMEOUT, Number(timeoutSec) || DEFAULT_TRANSFER_TIMEOUT_SEC));
  if (id === 'TWILIO') {
    return `<Response><Dial timeout="${t}"${cid} action="${xmlUrl(actionUrl)}" method="POST"><Number>${to}</Number></Dial></Response>`;
  }
  if (id === 'PLIVO') {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="${t}"${cid} action="${xmlUrl(actionUrl)}" method="POST" redirect="true"><Number>${to}</Number></Dial></Response>`;
  }
  throw new Error(`no transfer document for carrier ${id}`);
}

/** Reconnect the media stream to the agent after a failed handover. */
export function buildResumeDocument(carrierId, { baseWsUrl, workspaceId, agentId, callLogId, outcome, direction = null }) {
  const id = String(carrierId).toUpperCase();
  if (id === 'TWILIO') {
    const url = withStreamParams(`${baseWsUrl.replace(/\/$/, '')}/api/v1/twilio-media/${workspaceId}/${agentId}`, { direction, engine: 'modular' });
    return `<Response><Connect><Stream url="${xmlUrl(url)}"><Parameter name="callLogId" value="${attr(callLogId)}" /><Parameter name="transferOutcome" value="${attr(outcome)}" /></Stream></Connect></Response>`;
  }
  if (id === 'PLIVO') {
    const u = new URL(withStreamParams(`${baseWsUrl.replace(/\/$/, '')}/api/v1/plivo-media/${workspaceId}/${agentId}`, { direction, engine: 'modular' }));
    u.searchParams.set('callLogId', callLogId);
    u.searchParams.set('transferOutcome', outcome);
    return buildStreamXml({ streamUrl: u.toString() });
  }
  throw new Error(`no resume document for carrier ${id}`);
}

export function buildHangupDocument(carrierId) {
  const id = String(carrierId).toUpperCase();
  if (id === 'PLIVO') return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
  return '<Response><Hangup/></Response>';
}

/**
 * Normalise a carrier's <Dial> outcome into one vocabulary.
 * @returns {{ outcome: 'completed'|'busy'|'no-answer'|'failed'|'canceled'|'unknown', durationSec: number, raw: string }}
 */
export function parseDialOutcome(carrierId, body = {}) {
  const id = String(carrierId).toUpperCase();
  const get = (...names) => { for (const n of names) { const v = body?.[n]; if (v !== undefined && v !== '') return String(v); } return ''; };
  const raw = (id === 'TWILIO' ? get('DialCallStatus', 'DialStatus') : get('DialStatus', 'DialCallStatus')).toLowerCase();
  const durationSec = Number(get('DialCallDuration', 'DialBLegDuration', 'DialBLegBillDuration', 'Duration')) || 0;
  let outcome = 'unknown';
  if (raw === 'completed' || raw === 'answered') outcome = 'completed';
  else if (raw === 'busy') outcome = 'busy';
  else if (raw === 'no-answer' || raw === 'no_answer' || raw === 'timeout') outcome = 'no-answer';
  else if (raw === 'failed' || raw === 'invalid' || raw === 'rejected') outcome = 'failed';
  else if (raw === 'canceled' || raw === 'cancelled' || raw === 'cancel') outcome = 'canceled';
  return { outcome, durationSec, raw };
}

/** Human-facing outcome line for the agent to speak when the handover failed. */
export function failureLineFor(outcome, { targetLabel = 'a team member', lang = 'en' } = {}) {
  const hi = lang === 'hi';
  switch (outcome) {
    case 'busy': return hi ? `माफ़ कीजिए, ${targetLabel} की लाइन अभी व्यस्त है। मैं आपका संदेश ले सकती हूँ या कॉलबैक की व्यवस्था कर सकती हूँ — आप क्या चाहेंगे?`
      : `I'm sorry, ${targetLabel}'s line is busy right now. I can take a message or arrange a callback — which would you prefer?`;
    case 'no-answer': return hi ? `माफ़ कीजिए, अभी कोई उपलब्ध नहीं है। मैं आपका नंबर और संदेश ले सकती हूँ ताकि कोई आपको वापस कॉल करे — क्या यह ठीक रहेगा?`
      : `I'm sorry, I couldn't reach ${targetLabel} just now. I can take your number and a message so someone calls you back — would that work?`;
    case 'canceled': return hi ? 'ठीक है, हम यहीं जारी रखते हैं। मैं और कैसे मदद कर सकती हूँ?'
      : 'Alright, let’s carry on here. What else can I help with?';
    default: return hi ? `माफ़ कीजिए, अभी कनेक्ट नहीं हो पाया। मैं आपका संदेश ले सकती हूँ या कॉलबैक की व्यवस्था कर सकती हूँ — आप क्या चाहेंगे?`
      : `I'm sorry, the handover didn't go through. I can take a message or arrange a callback — which would you prefer?`;
  }
}

// ── Carrier REST ─────────────────────────────────────────────────────────────
const TWILIO_API = 'https://api.twilio.com/2010-04-01';
const PLIVO_API = 'https://api.plivo.com/v1';

/** Look up the live call's numbers so the <Dial> can present a legitimate caller id. */
export async function lookupCallNumbers(carrierId, carrierCallId, { fetchImpl = fetch } = {}) {
  const id = String(carrierId).toUpperCase();
  try {
    if (id === 'TWILIO') {
      const sid = process.env.TWILIO_ACCOUNT_SID; const tok = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !tok) return null;
      const r = await fetchImpl(`${TWILIO_API}/Accounts/${sid}/Calls/${encodeURIComponent(carrierCallId)}.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${tok}`).toString('base64')}` },
      });
      if (!r.ok) return null;
      const j = await r.json();
      return { from: j.from ?? null, to: j.to ?? null, direction: j.direction ?? null };
    }
    if (id === 'PLIVO') {
      const aid = process.env.PLIVO_AUTH_ID; const tok = process.env.PLIVO_AUTH_TOKEN;
      if (!aid || !tok) return null;
      const r = await fetchImpl(`${PLIVO_API}/Account/${aid}/Call/${encodeURIComponent(carrierCallId)}/`, {
        headers: { Authorization: `Basic ${Buffer.from(`${aid}:${tok}`).toString('base64')}` },
      });
      if (!r.ok) return null;
      const j = await r.json();
      return { from: j.from_number ?? null, to: j.to_number ?? null, direction: j.call_direction ?? null };
    }
  } catch (err) {
    logger.warn(`transfer: could not look up ${id} call ${carrierCallId}: ${err.message}`);
  }
  return null;
}

/**
 * Redirect the LIVE call to the transfer document.
 *
 * @param {object} p
 * @param {'TWILIO'|'PLIVO'|'PIOPIY'} p.carrierId
 * @param {string} p.carrierCallId   Twilio CallSid / Plivo CallUUID
 * @param {string} p.callLogId
 * @param {string} p.workspaceId
 * @param {string} p.agentId
 * @param {object} p.config          resolveTransferConfig()
 * @param {string|null} [p.callerId] number to present; looked up when absent
 * @param {typeof fetch} [p.fetchImpl]
 * @returns {Promise<{ ok: boolean, error?: string, unsupported?: boolean, httpStatus?: number, document?: string }>}
 */
export async function transferLiveCall({ carrierId, carrierCallId, callLogId, workspaceId, agentId, config, callerId = null, fetchImpl = fetch }) {
  const id = String(carrierId || '').toUpperCase();
  if (!config?.enabled) return { ok: false, error: 'no transfer number configured' };
  if (!carrierCallId) return { ok: false, error: 'the carrier call id is unknown, so the live call cannot be redirected' };
  if (id !== 'TWILIO' && id !== 'PLIVO') return { ok: false, unsupported: true, error: `${id || 'this carrier'} cannot redirect a live media-stream call` };

  const actionUrl = transferCallbackUrl({ carrierId: id, callLogId, workspaceId, agentId, kind: 'dial' });
  if (!actionUrl) return { ok: false, error: 'no public URL is configured for carrier callbacks (PUBLIC_BACKEND_WS_URL / PUBLIC_BACKEND_HTTP_URL)' };

  let cid = e164(callerId);
  if (!cid) {
    const nums = await lookupCallNumbers(id, carrierCallId, { fetchImpl });
    // Present OUR number: the one the caller dialled (inbound) or dialled from (outbound).
    const ours = nums?.direction && /outbound/i.test(nums.direction) ? nums?.from : nums?.to;
    cid = e164(ours) || e164(process.env[id === 'TWILIO' ? 'TWILIO_FROM_NUMBER' : 'PLIVO_FROM_NUMBER']) || null;
  }

  const document = buildDialDocument(id, { number: config.number, callerId: cid, timeoutSec: config.timeoutSec, actionUrl });

  try {
    if (id === 'TWILIO') {
      const sid = process.env.TWILIO_ACCOUNT_SID; const tok = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !tok) return { ok: false, error: 'Twilio credentials are not configured' };
      const statusUrl = transferCallbackUrl({ carrierId: id, callLogId, workspaceId, agentId, kind: 'status' });
      const r = await fetchImpl(`${TWILIO_API}/Accounts/${sid}/Calls/${encodeURIComponent(carrierCallId)}.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${tok}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ Twiml: document, StatusCallback: statusUrl, StatusCallbackMethod: 'POST' }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        let msg = ''; try { msg = JSON.parse(text).message; } catch { /* not json */ }
        return { ok: false, httpStatus: r.status, error: `Twilio refused the redirect: ${msg || r.status}`, document };
      }
      return { ok: true, document };
    }
    // PLIVO: the transfer API points the A-leg at a URL that serves the <Dial> XML.
    const aid = process.env.PLIVO_AUTH_ID; const tok = process.env.PLIVO_AUTH_TOKEN;
    if (!aid || !tok) return { ok: false, error: 'Plivo credentials are not configured' };
    const xmlUrlStr = transferCallbackUrl({ carrierId: id, callLogId, workspaceId, agentId, kind: 'xml' });
    const r = await fetchImpl(`${PLIVO_API}/Account/${aid}/Call/${encodeURIComponent(carrierCallId)}/`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${aid}:${tok}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ legs: 'aleg', aleg_url: xmlUrlStr, aleg_method: 'POST' }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      let msg = ''; try { msg = JSON.parse(text).error; } catch { /* not json */ }
      return { ok: false, httpStatus: r.status, error: `Plivo refused the transfer: ${msg || r.status}`, document };
    }
    return { ok: true, document };
  } catch (err) {
    return { ok: false, error: `carrier request failed: ${err.message}`, document };
  }
}

// ── Pending-transfer registry (in-process) ───────────────────────────────────
// What a resumed bridge and the callback controller need to know about a
// handover that is in flight: enough to build the resume document and to
// finalise the call with the right numbers. The durable record is the
// CallTransfer row; this is the hot copy.
const pending = new Map();
export function registerPendingTransfer(callLogId, info) { pending.set(callLogId, { ...info, at: Date.now() }); }
export function takePendingTransfer(callLogId) { const p = pending.get(callLogId); pending.delete(callLogId); return p ?? null; }
export function peekPendingTransfer(callLogId) { return pending.get(callLogId) ?? null; }
export function __resetPendingForTests() { pending.clear(); }
