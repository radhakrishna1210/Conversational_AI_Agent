// Exotel, behind the provider contract.
//
// The second India carrier, added alongside Plivo rather than instead of it.
// Exotel holds a UL-VNO licence and has the strongest DLT operations of the
// Indian providers; its trial is self-serve (₹1000 credits, 15 days, no card),
// which makes it the fastest route to a real Indian test call.
//
// Three things make Exotel structurally different from Twilio and Plivo, all
// absorbed here so nothing above this file has to care:
//
// 1. TWO WAYS TO HAND OVER A CALL, neither of them an inline document.
//
//      stream  Connect Voice AI: `StreamUrl` + `StreamType=bidirectional` on the
//              connect API. The per-call wss:// address travels ON THE DIAL
//              REQUEST, so per-agent routing needs no dashboard object at all.
//              This is the mode to use — it is the only one where the call's
//              identity is carried by something we control end to end.
//      app     The call is pointed at an "App" (flow) built in Exotel's
//              dashboard, identified by EXOTEL_APP_ID, whose Voicebot applet
//              holds the stream URL. Per-call data can then only ride in
//              `CustomField`, and per-agent routing needs the applet pointed at
//              an HTTPS endpoint that answers `{"url": "wss://…"}` per call
//              (controllers/exotel.controller.js serves it).
//
//    Connect Voice AI has to be enabled on the account, which is why `app`
//    survives as a fallback rather than being deleted.
//
// 2. FROM/TO ARE INVERTED, in both modes. Exotel's `From` is the person being
//    DIALLED and `CallerId` is our ExoPhone. Passing our number as `From` — the
//    Twilio habit — dials ourselves.
//
// 3. NO PER-AGENT GREETING. Greeting-only calls need arbitrary text spoken on a
//    specific call; Exotel has no per-call speech verb in either mode. Rather
//    than silently playing whatever a dashboard flow contains to someone's
//    customer, this provider refuses greeting mode. See supportsGreetingMode.
//
// Known limits worth designing around: 60-minute maximum session, and a
// 10-second timeout that FAILS the session — a slow LLM turn drops the call.

const DEFAULT_SUBDOMAIN = 'api.in.exotel.com';

/** Exotel accepts exactly these on `?sample-rate=`; anything else is ignored. */
const SAMPLE_RATES = new Set([8000, 16000, 24000]);

// The bundled realtime engines emit PCM16 at 24kHz (see client xaiCallSocket.ts,
// SAMPLE_RATE = 24000), and Exotel will take 24kHz, so the default costs us no
// resampling in either direction. The PSTN leg is 8kHz regardless — this is
// about avoiding transcode work on our side, not about audio quality.
const DEFAULT_SAMPLE_RATE = 24000;

/** Connect Voice AI documents this ceiling on StreamUrl. */
const MAX_STREAM_URL_CHARS = 600;

const resolveSampleRate = () => {
  const n = Number(process.env.EXOTEL_SAMPLE_RATE);
  return SAMPLE_RATES.has(n) ? n : DEFAULT_SAMPLE_RATE;
};

/** 'stream' unless explicitly opted into the dashboard-flow path. */
const resolveDialMode = () =>
  (String(process.env.EXOTEL_DIAL_MODE || 'stream').toLowerCase() === 'app' ? 'app' : 'stream');

/**
 * Where Exotel posts terminal call events.
 *
 * Derived from PUBLIC_BACKEND_WS_URL when EXOTEL_STATUS_CALLBACK is unset,
 * because it is the same server: asking an operator to write out a second URL
 * that can only ever be `<the first one>/api/v1/exotel/status` is asking them to
 * mistype it. And getting it wrong is quiet — calls simply never close out.
 *
 * An explicit EXOTEL_STATUS_CALLBACK always wins, verbatim, for the deployment
 * whose public hostname is not the websocket hostname.
 */
const resolveStatusCallback = () => {
  const explicit = process.env.EXOTEL_STATUS_CALLBACK;
  if (explicit) return explicit;

  const base = process.env.PUBLIC_BACKEND_WS_URL;
  if (!base) return '';
  // Exotel calls this over HTTP, not on the websocket.
  const http = base.replace(/^ws(s)?:\/\//i, (_m, s) => (s ? 'https://' : 'http://'));
  const url = `${http.replace(/\/$/, '')}/api/v1/exotel/status`;
  const token = process.env.EXOTEL_WEBHOOK_TOKEN;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
};

/** @type {import('./provider.interface.js').TelephonyProvider} */
export const exotelProvider = {
  id: 'EXOTEL',
  label: 'Exotel',
  // Reported for logs/diagnostics; the live answer is per-call and depends on
  // EXOTEL_DIAL_MODE, which `credentials()` resolves.
  get deliverDocument() {
    return resolveDialMode() === 'app' ? 'app_id' : 'stream_url';
  },
  // Exotel cannot speak arbitrary per-call text; only the bundled conversational
  // engines work here. outboundCall.service refuses greeting mode rather than
  // dialling a lead and playing whatever the dashboard flow happens to contain.
  supportsGreetingMode: false,
  // The modular STT→LLM→TTS bridge is µ-law-native; Exotel streams PCM16 and
  // has only the bundled-engine bridge (ws/exotelMediaRealtime.handler.js).
  supportsModularEngine: false,

  credentials() {
    const apiKey = process.env.EXOTEL_API_KEY;
    const apiToken = process.env.EXOTEL_API_TOKEN;
    const sid = process.env.EXOTEL_SID;
    if (!apiKey || !apiToken || !sid) return null;
    return {
      apiKey,
      apiToken,
      sid,
      // Mumbai vs Singapore. Defaults to Mumbai: India's media-anchoring rule
      // requires both legs to stay in-country, so the Singapore subdomain is
      // the wrong default for the traffic this provider exists to carry.
      subdomain: process.env.EXOTEL_SUBDOMAIN || DEFAULT_SUBDOMAIN,
      appId: process.env.EXOTEL_APP_ID || '',
      dialMode: resolveDialMode(),
      sampleRate: resolveSampleRate(),
    };
  },

  defaultFrom() {
    return process.env.EXOTEL_CALLER_ID || '';
  },

  status(fromNumber) {
    const creds = this.credentials();
    if (!creds) {
      return {
        ready: false,
        error: 'Exotel is not configured on this server (missing EXOTEL_API_KEY / '
          + 'EXOTEL_API_TOKEN / EXOTEL_SID).',
      };
    }
    if (!(fromNumber || this.defaultFrom())) {
      return {
        ready: false,
        error: 'EXOTEL_CALLER_ID is not set. Add the ExoPhone (virtual number) you own to backend/.env.',
      };
    }
    // Only the dashboard-flow path needs an App: in stream mode the wss:// URL
    // travels on the dial request itself, so demanding an App id there would
    // block a correctly configured account.
    if (creds.dialMode === 'app' && !creds.appId) {
      return {
        ready: false,
        error: 'EXOTEL_APP_ID is not set. In EXOTEL_DIAL_MODE=app, calls are pointed at a flow built '
          + 'in the Exotel dashboard — create an App containing a Voicebot applet and put its id in '
          + 'backend/.env, or switch to EXOTEL_DIAL_MODE=stream (Connect Voice AI).',
      };
    }
    return { ready: true, ...creds };
  },

  /**
   * Where the caller's audio is bridged.
   *
   * In stream mode this URL is sent to Exotel on the dial request. In app mode
   * Exotel never sees it directly — the Voicebot applet does, either statically
   * or by fetching it from our dynamic endpoint — but it is built the same way
   * in both modes so there is exactly one definition of the bridge path.
   *
   * `sample-rate` is part of the contract, not a tuning knob: it decides the
   * PCM16 rate on BOTH directions of the socket, and the bridge reads it back
   * off the query string to configure the engine.
   */
  mediaStreamUrl({ baseWsUrl, workspaceId, agentId }) {
    const rate = resolveSampleRate();
    return `${baseWsUrl.replace(/\/$/, '')}/api/v1/exotel-media/${workspaceId}/${agentId}`
      + `?sample-rate=${rate}`;
  },

  /**
   * stream mode: the "document" IS the per-call wss:// URL, with the call log id
   * pinned to it. That query param — not `CustomField` — is what the bridge
   * trusts, because it arrives with the socket itself and cannot be dropped by
   * an applet configuration we do not control.
   *
   * app mode: the document is the dashboard flow URL. The bridge then has to
   * learn the call log id the hard way, from CustomField on the `start` event
   * or from the dynamic-URL endpoint.
   */
  buildConversationDoc({ streamUrl = '', callLogId = null } = {}) {
    const { sid, appId, dialMode } = this.credentials() || {};
    if (dialMode === 'app') return `http://my.exotel.com/${sid}/exoml/start_voice/${appId}`;
    if (!streamUrl) {
      throw new Error(
        'Exotel stream mode needs a media stream URL, which requires PUBLIC_BACKEND_WS_URL to be set.',
      );
    }
    if (!callLogId) return streamUrl;
    return `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}callLogId=${encodeURIComponent(callLogId)}`;
  },

  buildGreetingDoc() {
    // Deliberately unreachable: outboundCall.service checks supportsGreetingMode
    // first. Throwing rather than returning a flow URL means a future caller
    // that forgets the check fails loudly instead of playing a stranger's
    // greeting to someone's customer.
    throw new Error(
      'Exotel cannot speak per-call greeting text — greeting-only calls are not supported on '
      + 'this carrier. Use a Conversational Agent (xAI or ElevenLabs) engine, or dial via Twilio.',
    );
  },

  async placeCall({ credentials, to, from, document, context = {} }) {
    const { apiKey, apiToken, sid, subdomain, dialMode } = credentials;
    const basic = Buffer.from(`${apiKey}:${apiToken}`).toString('base64');

    // CustomField is the per-call channel Exotel echoes back to the applet and
    // the status callback. In app mode it is the ONLY way the bridge can learn
    // which agent and call log the audio belongs to; in stream mode the URL
    // carries that too, and this is the redundant copy the status callback
    // reads.
    const customField = JSON.stringify({
      workspaceId: context.workspaceId,
      agentId: context.agentId,
      callLogId: context.callLogId,
    });

    // Inverted on purpose in both modes — see the header comment. `From` is the
    // destination, `CallerId` is our ExoPhone.
    const body = new URLSearchParams({ From: to, CallerId: from, CustomField: customField });

    if (dialMode === 'app') {
      body.set('Url', document);
      // trans(actional) vs promo decides which DLT rules and time windows the
      // call is judged under. Sent only here: Connect Voice AI does not document
      // CallType, and Exotel rejects parameters it does not expect.
      body.set('CallType', 'trans');
    } else {
      if (document.length > MAX_STREAM_URL_CHARS) {
        return {
          ok: false,
          status: 500,
          error: `The media stream URL is ${document.length} characters; Exotel rejects a StreamUrl `
            + `over ${MAX_STREAM_URL_CHARS}. Shorten PUBLIC_BACKEND_WS_URL.`,
        };
      }
      body.set('StreamUrl', document);
      body.set('StreamType', 'bidirectional');
    }

    const statusCallback = resolveStatusCallback();
    if (statusCallback) body.set('StatusCallback', statusCallback);
    // Belt and braces against a bridge that never tears down: Exotel caps
    // sessions at 60 minutes anyway, but a stuck call is billable until it ends.
    if (process.env.EXOTEL_TIME_LIMIT_SEC) {
      body.set('TimeLimit', String(process.env.EXOTEL_TIME_LIMIT_SEC));
    }

    const response = await fetch(
      `https://${subdomain}/v1/Accounts/${sid}/Calls/connect.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    const text = await response.text();
    let json = {};
    try { json = JSON.parse(text); } catch { /* not json */ }

    if (!response.ok) {
      // 429 is documented at 200 calls/minute — worth naming, because the
      // campaign runner will hit it long before anything else goes wrong.
      let hint = ' Check your ExoPhone, account balance, and destination format (+countrycode...).';
      if (response.status === 429) {
        hint = ' Exotel allows 200 calls/minute; slow the campaign pacing.';
      } else if (dialMode !== 'app' && (response.status === 400 || response.status === 403)) {
        // Connect Voice AI is off by default on an Exotel account, and the
        // rejection looks like an ordinary bad-parameter error. Worth naming:
        // it is the single most likely reason a first stream-mode call fails.
        hint = ' If this is the first stream-mode call, ask Exotel to enable Connect Voice AI '
          + '(bidirectional streaming) on the account — it is not on by default. '
          + 'Otherwise check your ExoPhone, balance, and destination format.';
      }
      return {
        ok: false,
        status: 502,
        httpStatus: response.status,
        raw: json,
        error: `Exotel rejected the call: ${json?.RestException?.Message || json.message || response.status}.${hint}`,
      };
    }

    // HTTP 200 means ACCEPTED, not connected — the real outcome arrives on the
    // status callback. Anything reading this as "the call happened" is wrong.
    return { ok: true, callId: json?.Call?.Sid };
  },
};
