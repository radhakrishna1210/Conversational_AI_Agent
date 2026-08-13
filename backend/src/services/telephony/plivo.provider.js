// Plivo, behind the provider contract.
//
// The India carrier. Twilio cannot legally carry Indian domestic traffic, so
// this exists for compliance reasons rather than cost. See
// `backend/docs/PLIVO_INTEGRATION.md`.
//
// Four things make Plivo structurally different from Twilio, all absorbed here:
//
// 1. THE CALL DOCUMENT IS FETCHED, NOT SUPPLIED. Twilio takes TwiML inline in
//    the `Twiml` request param; Plivo's Call API takes an `answer_url` and GETs
//    /POSTs it when the callee picks up. So `buildConversationDoc` and
//    `buildGreetingDoc` here return a URL, not markup — the markup is generated
//    by controllers/plivo.controller.js at answer time. `deliverDocument` is
//    'answer_url' for exactly this reason.
//
// 2. THERE IS NOWHERE TO PUT PER-CALL DATA IN THE DOCUMENT, because we do not
//    send a document. Twilio embeds `<Parameter name="callLogId">` in the TwiML
//    and gets it back as `start.customParameters`; Plivo's stream `start` event
//    has no such field. The identity therefore rides on the answer URL's query
//    string, which `placeCall` appends from `context` — the same channel Exotel
//    uses `CustomField` for. The answer endpoint then pins it onto the wss://
//    URL it emits, so by the time the socket opens the bridge knows the call.
//
// 3. THE MEDIA FRAME ENVELOPE DIFFERS even though the codec does not. Both
//    carriers are base64 mu-law 8k, but Plivo plays audio with a `playAudio`
//    event carrying an explicit contentType/sampleRate, and flushes with
//    `clearAudio` — where Twilio uses `media`/`clear` keyed by `streamSid`.
//    That is why ws/plivoMediaRealtime.handler.js exists rather than reusing
//    the Twilio bridge.
//
// 4. PLIVO NEVER SENDS A `stop` EVENT. Twilio's bridge finalizes the call log on
//    `stop`; here the socket closing is the only end-of-call signal there is.
//
// Call identifier: Plivo calls it `call_uuid`, normalized to `callId` here so
// the outer service keeps exposing `callSid` unchanged.

import { xmlSafe } from './provider.interface.js';

const API_HOST = 'https://api.plivo.com';

/**
 * Plivo's own default and the only format the bundled engines are asked for.
 *
 * mu-law 8k is what `realtimeEngine.factory` is given as `g711_ulaw`, and what
 * the PSTN leg carries anyway, so this is a zero-transcode path in both
 * directions — the same property the Twilio bridge has. Changing it means
 * changing the engine's audioFormat in the handler too; they are one decision.
 */
const STREAM_CONTENT_TYPE = 'audio/x-mulaw';
const STREAM_SAMPLE_RATE = 8000;

/** A closing line is one short sentence; the greeting is re-rendered server
 *  side rather than travelling in the URL. See buildGreetingDoc. */
const MAX_CLOSING_CHARS = 300;

/**
 * Plivo wants bare digits with the country code — "912269851741", not
 * "+912269851741".
 *
 * The rest of this codebase stores E.164 WITH the plus: `assignNumberSchema`
 * enforces `/^\+91\d{10,}$/` on VoiceNumber.phoneNumber, and that same string
 * is what routes the call here. Stripping at the carrier boundary keeps one
 * canonical format everywhere above this line, which matters because
 * `resolveProviderIdForNumber` matches the caller ID by exact string — a number
 * stored one way and dialled the other silently routes to the wrong carrier.
 *
 * Only a LEADING plus is removed: `to` may be a SIP URI or several destinations
 * joined by "<", and neither survives broader rewriting.
 */
const plivoNumber = (n) => String(n ?? '').trim().replace(/^\+/, '');

/**
 * Base URL of our answer endpoint.
 *
 * Derived from PUBLIC_BACKEND_WS_URL when PLIVO_ANSWER_URL is unset, for the
 * same reason Exotel derives its status callback: it is the same server, and
 * asking an operator to retype a URL that can only ever be
 * `<the websocket host>/api/v1/plivo/answer` invites a typo whose only symptom
 * is that calls connect and then sit in silence.
 */
export const resolveAnswerUrlBase = () => {
  const explicit = process.env.PLIVO_ANSWER_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const base = process.env.PUBLIC_BACKEND_WS_URL;
  if (!base) return '';
  // Plivo fetches this over HTTP, not on the websocket.
  const http = base.replace(/^ws(s)?:\/\//i, (_m, s) => (s ? 'https://' : 'http://'));
  return `${http.replace(/\/$/, '')}/api/v1/plivo/answer`;
};

/** @type {import('./provider.interface.js').TelephonyProvider} */
export const plivoProvider = {
  id: 'PLIVO',
  label: 'Plivo',
  deliverDocument: 'answer_url',

  // Plivo has a <Speak> verb, so unlike Exotel it can say arbitrary per-call
  // text. The greeting path is a real answer-URL response, not a dashboard flow.
  supportsGreetingMode: true,

  // Only the bundled-engine bridge exists so far (phase 5). The modular
  // STT→LLM→TTS bridge is mu-law-native and Plivo streams mu-law, so a modular
  // sibling is a small job — but until ws/plivoMediaModular.handler.js exists,
  // saying `true` here would route modular agents into a socket nothing serves.
  supportsModularEngine: false,

  credentials() {
    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    if (!authId || !authToken) return null;
    return { authId, authToken };
  },

  defaultFrom() {
    return process.env.PLIVO_FROM_NUMBER || '';
  },

  status(fromNumber) {
    const creds = this.credentials();
    if (!creds) {
      return {
        ready: false,
        error: 'Plivo is not configured on this server (missing PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN).',
      };
    }
    if (!(fromNumber || this.defaultFrom())) {
      return {
        ready: false,
        error: 'PLIVO_FROM_NUMBER is not set. Add a Plivo number you own to backend/.env, or route '
          + 'the call from a VoiceNumber whose provider is PLIVO.',
      };
    }
    // Without this the call connects and then sits silent: Plivo fetches the
    // answer URL, gets nothing, and hangs up. Worth failing before dialling.
    if (!resolveAnswerUrlBase()) {
      return {
        ready: false,
        error: 'Neither PLIVO_ANSWER_URL nor PUBLIC_BACKEND_WS_URL is set. Plivo fetches call XML '
          + 'from a public URL on this server, so one of them must point at this deployment.',
      };
    }
    return { ready: true, ...creds };
  },

  mediaStreamUrl({ baseWsUrl, workspaceId, agentId }) {
    return `${baseWsUrl.replace(/\/$/, '')}/api/v1/plivo-media/${workspaceId}/${agentId}`;
  },

  /**
   * The "document" is the answer URL, not the XML.
   *
   * `streamUrl` is deliberately NOT passed through on the query string. The
   * answer endpoint rebuilds it from PUBLIC_BACKEND_WS_URL via this provider's
   * own `mediaStreamUrl()`, which keeps one definition of the bridge path and
   * — more importantly — means a public, unauthenticated endpoint never emits
   * a wss:// address that arrived from outside into XML a carrier will dial.
   */
  buildConversationDoc() {
    const base = resolveAnswerUrlBase();
    if (!base) {
      throw new Error(
        'Plivo needs a public answer URL, which requires PLIVO_ANSWER_URL or PUBLIC_BACKEND_WS_URL '
        + 'to be set.',
      );
    }
    return `${base}?mode=conversation`;
  },

  /**
   * Greeting-only calls, also as an answer URL.
   *
   * The greeting text does not travel in the URL. `xmlSafe` caps it at 800
   * characters and the closing line adds more; percent-encoded that approaches
   * the length where intermediaries start truncating, and a truncated greeting
   * is spoken aloud to a customer. The endpoint re-renders the welcome from the
   * agent instead, through the same `getRenderedWelcome()` the caller used, so
   * the text is identical and cached by content hash.
   *
   * The closing line has no agent-side source — it is per-call, supplied by the
   * campaign — so it does ride on the query string, capped.
   */
  buildGreetingDoc({ greeting: _greeting, closingLine }) {
    const base = resolveAnswerUrlBase();
    if (!base) {
      throw new Error(
        'Plivo needs a public answer URL, which requires PLIVO_ANSWER_URL or PUBLIC_BACKEND_WS_URL '
        + 'to be set.',
      );
    }
    const params = new URLSearchParams({ mode: 'greeting' });
    if (closingLine) params.set('closing', String(closingLine).slice(0, MAX_CLOSING_CHARS));
    return `${base}?${params.toString()}`;
  },

  async placeCall({ credentials, to, from, document, context = {} }) {
    const { authId, authToken } = credentials;
    const basic = Buffer.from(`${authId}:${authToken}`).toString('base64');

    // The per-call identity Plivo gives us nowhere else to put. `document`
    // already carries `mode` (and `closing` on the greeting path), so append
    // rather than rebuild.
    const answerUrl = new URL(document);
    if (context.workspaceId) answerUrl.searchParams.set('workspaceId', context.workspaceId);
    if (context.agentId) answerUrl.searchParams.set('agentId', context.agentId);
    if (context.callLogId) answerUrl.searchParams.set('callLogId', context.callLogId);

    // JSON, not form-encoded — this is the other half of the Twilio difference
    // recorded in PLIVO_INTEGRATION.md §5.
    const body = {
      to: plivoNumber(to),
      from: plivoNumber(from),
      answer_url: answerUrl.toString(),
      answer_method: 'POST',
    };

    // The hangup callback carries the same per-call identity, because for a
    // GREETING-ONLY call it is the only end-of-call signal that exists: no media
    // socket is ever opened, so nothing else would ever move the log off
    // INITIATED and its billing state off PENDING.
    const hangupUrl = new URL(answerUrl.toString());
    hangupUrl.pathname = hangupUrl.pathname.replace(/\/answer$/, '/hangup');
    hangupUrl.searchParams.delete('closing');   // irrelevant once the call is over
    body.hangup_url = hangupUrl.toString();
    body.hangup_method = 'POST';

    let response;
    try {
      response = await fetch(`${API_HOST}/v1/Account/${authId}/Call/`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return {
        ok: false,
        status: 502,
        error: `Could not reach Plivo: ${err.message}.`,
      };
    }

    const text = await response.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

    if (!response.ok) {
      let hint = ' Check your Plivo number, account balance, and destination format (+countrycode...).';
      if (response.status === 401 || response.status === 403) {
        hint = ' Check PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN. Note subaccount credentials can place '
          + 'calls but cannot do main-account work, and vice versa.';
      } else if (response.status === 429) {
        hint = ' Plivo is rate limiting; slow the campaign pacing.';
      } else if (response.status === 400) {
        // The overwhelmingly likely first-call failure on an India account: the
        // destination is domestic but the number has no compliance application
        // attached, or the caller ID is not one this subaccount holds.
        hint = ' On an India account this usually means the caller ID is not attached to this '
          + 'account, or the number has no approved compliance application for the destination. '
          + 'Check the number in the Plivo console before assuming a code fault.';
      }
      return {
        ok: false,
        status: 502,
        httpStatus: response.status,
        raw: json,
        error: `Plivo rejected the call: ${json.error || json.message || response.status}.${hint}`,
      };
    }

    // 201/202 means QUEUED, not connected — the outcome arrives on the hangup
    // callback. Anything reading this as "the call happened" is wrong.
    return { ok: true, callId: json.request_uuid || json.call_uuid };
  },
};

/**
 * The `<Stream>` document served at answer time for a two-way call.
 *
 * Lives here rather than in the controller so the XML sits next to the
 * provider's own notes about the wire format it implies. `bidirectional` is
 * what makes Plivo accept `playAudio` back from us at all; `keepCallAlive`
 * stops Plivo hanging up the moment the (single-element) document is consumed,
 * which without it ends the call before a word is spoken.
 */
export const buildStreamXml = ({ streamUrl }) =>
  '<?xml version="1.0" encoding="UTF-8"?>'
  + '<Response>'
  + `<Stream bidirectional="true" keepCallAlive="true" contentType="${STREAM_CONTENT_TYPE};rate=${STREAM_SAMPLE_RATE}">`
  + streamUrl
  + '</Stream>'
  + '</Response>';

/**
 * The greeting-only document: speak, then hang up.
 *
 * No `keepCallAlive` here — the opposite of the stream case. Once the words are
 * spoken there is nothing left to do, and holding the line open would bill the
 * client for silence.
 *
 * The voice is `Polly.Aditi` — Plivo's format is `Polly.<VoiceName>`, not a bare
 * "Polly", which it rejects. Aditi is the same en-IN voice the Twilio provider
 * uses, so a greeting sounds the same whichever carrier the number routes over.
 */
export const buildGreetingXml = ({ greeting, closingLine, language = 'en-IN', voice = 'Polly.Aditi' }) => {
  const say = (text) => `<Speak language="${language}" voice="${voice}">${xmlSafe(text)}</Speak>`;
  const closing = closingLine ? `<Wait length="1"/>${say(closingLine)}` : '';
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Response>'
    + say(greeting)
    + closing
    + '</Response>';
};

export { STREAM_CONTENT_TYPE, STREAM_SAMPLE_RATE };
