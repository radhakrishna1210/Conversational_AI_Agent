// Twilio, behind the provider contract.
//
// Lifted out of outboundCall.service.js unchanged: same TwiML, same form
// encoding, same operator-facing error wording. This file is a move, not a
// rewrite — so when the Plivo path lands, any regression on live traffic can be
// attributed to the new provider rather than to this extraction.
//
// Twilio is the non-India carrier. It stays the default; India routes to Plivo
// by number, not by flag day. See `backend/docs/PLIVO_INTEGRATION.md` §9.

import { xmlSafe, xmlUrl } from './provider.interface.js';

const API_ROOT = 'https://api.twilio.com/2010-04-01';

/** @type {import('./provider.interface.js').TelephonyProvider} */
export const twilioProvider = {
  id: 'TWILIO',
  label: 'Twilio',
  deliverDocument: 'inline',

  credentials() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return null;
    return { accountSid, authToken };
  },

  defaultFrom() {
    return process.env.TWILIO_FROM_NUMBER || '';
  },

  status(fromNumber) {
    const creds = this.credentials();
    if (!creds) {
      return {
        ready: false,
        error: 'Phone calling is not configured on this server (missing TWILIO_ACCOUNT_SID / '
          + 'TWILIO_AUTH_TOKEN). Use the Chat Test tab to test the agent, or configure Twilio.',
      };
    }
    if (!(fromNumber || this.defaultFrom())) {
      return {
        ready: false,
        error: 'TWILIO_FROM_NUMBER is not set. Add a Twilio phone number you own to backend/.env.',
      };
    }
    // accountSid/authToken are spread out flat because callers already read
    // `tw.accountSid` off this result.
    return { ready: true, ...creds };
  },

  mediaStreamUrl({ baseWsUrl, workspaceId, agentId }) {
    return `${baseWsUrl.replace(/\/$/, '')}/api/v1/twilio-media/${workspaceId}/${agentId}`;
  },

  buildConversationDoc({ streamUrl, callLogId }) {
    const param = callLogId ? `<Parameter name="callLogId" value="${callLogId}" />` : '';
    return `<Response><Connect><Stream url="${streamUrl}">${param}</Stream></Connect></Response>`;
  },

  buildGreetingDoc({ greeting, closingLine }) {
    const closing = closingLine
      ? `<Pause length="1"/><Say voice="Polly.Aditi">${xmlSafe(closingLine)}</Say>`
      : '';
    return `<Response><Say voice="Polly.Aditi">${xmlSafe(greeting)}</Say>${closing}</Response>`;
  },

  supportsBroadcast: true,

  /**
   * One-way broadcast: play a hosted file, then hang up.
   *
   * `loop` rather than repeating the verb, so the file is fetched once and
   * replayed from Twilio's own cache — repeating <Play> re-fetches our server
   * per repetition on every single call in the campaign.
   *
   * No <Gather>, no <Record>, nothing after the audio. A one-way broadcast that
   * accidentally waits for input holds the line open and bills the silence.
   */
  buildBroadcastDoc({ audioUrl, repeat = 1 }) {
    const loop = Math.min(Math.max(Number(repeat) || 1, 1), 5);
    return `<Response><Play loop="${loop}">${xmlUrl(audioUrl)}</Play></Response>`;
  },

  async placeCall({ credentials, to, from, document, context = {} }) {
    const { accountSid, authToken } = credentials;
    const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const params = { To: to, From: from, Twiml: document };

    // A conversational call learns its own outcome from the media socket, and a
    // greeting-only one from the log the caller already updates. A broadcast has
    // neither — no socket is ever opened — so the completed-call webhook is the
    // ONLY place its duration (and therefore its charge) can come from. Twilio
    // ignores these params when nobody asks for them.
    if (context.statusCallbackUrl) {
      params.StatusCallback = context.statusCallbackUrl;
      params.StatusCallbackEvent = 'completed';
      params.StatusCallbackMethod = 'POST';
    }
    // Ring for this long before giving up. Left to Twilio's 60s default a
    // broadcast spends real money holding open dials nobody is going to answer.
    if (context.ringTimeoutSec) params.Timeout = String(context.ringTimeoutSec);

    const response = await fetch(`${API_ROOT}/Accounts/${accountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
    });

    const text = await response.text();
    let json = {};
    try { json = JSON.parse(text); } catch { /* not json */ }

    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        httpStatus: response.status,
        raw: json,
        error: `Twilio rejected the call: ${json.message || response.status}. Check your Twilio `
          + 'number, account balance, and destination format (+countrycode...).',
      };
    }

    return { ok: true, callId: json.sid };
  },
};
