// PIOPIY (TeleCMI), behind the provider contract.
//
// The second India carrier, added alongside Plivo for the reason India has more
// than one at all: carriers fail differently, and having a second means a
// carrier problem is a routing change rather than an outage. TeleCMI holds its
// own Indian licences and sells +91 DID/toll-free inventory directly, so it is
// a peer of Plivo here, not of Twilio.
//
// ── What makes PIOPIY structurally different from the others ─────────────────
//
// 1. THE DOCUMENT TRAVELS INLINE, AND IT IS JSON. Twilio takes TwiML inline,
//    Plivo fetches XML from an answer URL. PIOPIY takes a "PCMO" array — PIOPIY Call Management Objects — in the body
//    of the make-call request itself. So `deliverDocument` is 'inline' like
//    Twilio, but every builder here returns a JSON STRING rather than markup,
//    and there is no public answer endpoint to serve, sign, or protect. That is
//    the single biggest operational difference: no controller, no signature
//    scheme, one less public surface.
//
// 2. THE MEDIA SOCKET IS PCM16, NOT µ-LAW, AND ONLY AT 8k OR 16k. The SDK's
//    `playStream` validator accepts sample rates {8000, 16000} and audio types
//    {raw, mp3, wav, ogg} and nothing else — there is no G.711 option at all.
//    The bundled engines emit PCM16 at 24kHz, so BOTH directions are resampled
//    here. See
//    ws/piopiyMediaRealtime.handler.js; the cost is linear interpolation per
//    chunk, which is why the modular µ-law pipeline is refused rather than
//    bodged through a second conversion.
//
// 3. PER-CALL IDENTITY HAS TWO CHANNELS, AND WE USE BOTH. `extra_params` is an
//    object on the dial request that comes back on the CDR webhook as a JSON
//    *string* — that is the channel the webhook reads. The media bridge cannot
//    use it (the socket never sees the CDR), so the same ids are also pinned to
//    the ws_url, which is ours and arrives with the socket.
//
// 4. THE DIAL ENDPOINT IS CHOSEN BY DESTINATION. `/v2/ind_pcmo_make_call` for
//    +91, `/v2/global_pcmo_make_call` for everything else. The official SDK
//    switches on the destination's country code and so do we — posting an
//    Indian destination to the global endpoint is a routing error, not a
//    preference.
//
// ── Which API version this speaks, and why ───────────────────────────────────
//
// The v2 appid/secret API (`rest.telecmi.com`), NOT the newer v3 Bearer-token
// API (`rest.piopiy.com/v3`). Every published streaming example uses v2, the
// `stream` action's shape is confirmed against the official SDK's own source
// (piopiy@1.2.0, lib/action/stream.js), and app id + secret is what the PIOPIY
// dashboard issues per app. v3 exists and adds a `pipeline` abstraction whose
// streaming shape is not publicly documented; when that changes, only
// `placeCall` below has to move.
//
// Call identifier: PIOPIY returns `request_id` on the dial response and
// `cmiuuid` on the CDR. `request_id` is what exists at dial time, so that is
// what normalizes to `callId`; the CDR webhook records `cmiuuid` alongside it.

import logger from '../../lib/logger.js';
import { xmlSafe } from './provider.interface.js';

const HOST = 'https://rest.telecmi.com';
const PATH_INDIA = '/v2/ind_pcmo_make_call';
const PATH_GLOBAL = '/v2/global_pcmo_make_call';

/**
 * The only two rates the platform accepts on a media stream.
 *
 * Not a tuning range — the SDK's own validator rejects anything else outright
 * (lib/action/play_stream.js), and a rejected `streamAudio` frame is silent
 * rather than loud: the call connects and the agent never speaks.
 */
const SAMPLE_RATES = new Set([8000, 16000]);

/**
 * 8kHz by default, which is the PSTN rate the call carries anyway.
 *
 * 16000 is allowed and costs nothing but bytes: the far leg is a phone, so the
 * extra bandwidth carries no extra information. The reason to reach for it is
 * diagnostic — if 8k audio sounds wrong, moving to 16k tells you whether the
 * problem is the rate or the encoding.
 */
const DEFAULT_SAMPLE_RATE = 8000;

/**
 * Which leg of the call we are given.
 *
 * On an outbound PCMO call the destination is leg A, so 'caller' is the
 * customer — which is what PIOPIY's own outbound AI-streaming example uses.
 * 'both' is deliberately NOT the default: it feeds our own synthesized speech
 * back into the socket, and the engines treat inbound audio as the customer
 * talking, so the agent interrupts itself in a loop.
 */
const DEFAULT_LISTEN_MODE = 'caller';
const LISTEN_MODES = new Set(['caller', 'callee', 'both']);

/** PIOPIY's own default ceiling on a single call, in seconds. */
const DEFAULT_DURATION_SEC = 4200;

/** A closing line is one short sentence; anything longer is a script. */
const MAX_CLOSING_CHARS = 300;

/** Broadcast replays, matching the ceiling the other providers impose. */
const MAX_BROADCAST_REPEAT = 5;

export const resolveSampleRate = () => {
  const n = Number(process.env.PIOPIY_SAMPLE_RATE);
  return SAMPLE_RATES.has(n) ? n : DEFAULT_SAMPLE_RATE;
};

const resolveListenMode = () => {
  const mode = String(process.env.PIOPIY_LISTEN_MODE || '').toLowerCase();
  return LISTEN_MODES.has(mode) ? mode : DEFAULT_LISTEN_MODE;
};

/**
 * PIOPIY wants a NUMBER, not a string: the API's own validator type-checks
 * `to`/`from`, and its CDR echoes them back as JSON numbers.
 *
 * The rest of this codebase stores E.164 with the plus (`assignNumberSchema`
 * enforces `/^\+91\d{10,}$/` on VoiceNumber.phoneNumber), and that same string
 * routes the call here, so the conversion belongs at the carrier boundary — the
 * same place plivo.provider.js strips its leading plus. Keeping one canonical
 * format above this line matters because `resolveProviderIdForNumber` matches
 * the caller ID by exact string: a number stored one way and dialled the other
 * silently routes to the wrong carrier.
 *
 * Returns null rather than NaN on anything that is not a plain phone number.
 * NaN would serialize to JSON `null` and the carrier would reject the call with
 * a parameter error that names the wrong field.
 */
export const piopiyNumber = (n) => {
  const digits = String(n ?? '').trim().replace(/^\+/, '');
  if (!/^\d{6,15}$/.test(digits)) return null;
  return Number(digits);
};

/** India routes on a different endpoint, chosen by the DESTINATION's country. */
const isIndianDestination = (to) => /^(\+?91)\d{10}$/.test(String(to ?? '').trim());

/** @type {import('./provider.interface.js').TelephonyProvider} */
export const piopiyProvider = {
  id: 'PIOPIY',
  label: 'PIOPIY',

  // The PCMO array is posted with the dial request, exactly as Twilio's TwiML
  // is. Nothing to fetch, nothing to serve.
  deliverDocument: 'inline',

  // PCMO has a `speak` action, so per-call text is possible.
  supportsGreetingMode: true,

  // Only the bundled-engine bridge exists (ws/piopiyMediaRealtime.handler.js).
  // The modular STT→LLM→TTS pipeline is µ-law-native end to end and PIOPIY has
  // no µ-law option at all, so routing it here would mean µ-law→PCM→µ-law per
  // frame in both directions. outboundCall.service refuses those before dialling.
  supportsModularEngine: false,

  // PCMO's `play` action takes a file URL, which is all a one-way broadcast
  // needs. No media socket is opened, so a broadcast costs the carrier minute
  // and nothing else — the same property the Plivo broadcast path has.
  supportsBroadcast: true,

  credentials() {
    const appId = process.env.PIOPIY_APP_ID;
    const appSecret = process.env.PIOPIY_APP_SECRET;
    if (!appId || !appSecret) return null;
    return {
      appId,
      appSecret,
      sampleRate: resolveSampleRate(),
      listenMode: resolveListenMode(),
    };
  },

  defaultFrom() {
    return process.env.PIOPIY_FROM_NUMBER || '';
  },

  status(fromNumber) {
    const creds = this.credentials();
    if (!creds) {
      const appId = process.env.PIOPIY_APP_ID;
      const appSecret = process.env.PIOPIY_APP_SECRET;

      // Half a pair is its own mistake, and reporting it as "not configured"
      // sends an operator hunting for the value they have already pasted in.
      // Checked BEFORE the v3-token branch below for exactly that reason:
      // someone mid-setup usually has the token still sitting there too.
      if (Boolean(appId) !== Boolean(appSecret)) {
        const have = appId ? 'PIOPIY_APP_ID' : 'PIOPIY_APP_SECRET';
        const need = appId ? 'PIOPIY_APP_SECRET' : 'PIOPIY_APP_ID';
        return {
          ready: false,
          error: `PIOPIY has ${have} but not ${need}. v2 authenticates with BOTH, and they are `
            + 'issued together on one app in the dashboard — a value from a different app fails '
            + 'exactly like a wrong one, so copy both from the same screen.',
        };
      }

      // The specific wrong-credential case, called out because the two kinds of
      // PIOPIY credential look interchangeable and are not. A v3 Bearer token is
      // the obvious thing to reach for — it is what the dashboard's API page
      // hands you — but v3's pipeline has no `stream` action, so it cannot carry
      // a media socket at all. Saying so here turns a baffling "not configured"
      // into an instruction. See docs/PIOPIY_INTEGRATION.md §2.
      if (process.env.PIOPIY_API_TOKEN) {
        return {
          ready: false,
          error: 'PIOPIY has a v3 API token (PIOPIY_API_TOKEN) but no v2 credentials. The v3 API '
            + 'cannot stream call audio to our agent — its pipeline supports only connect/play/'
            + 'play_get_input/param/record/hangup/input, with no `stream` action. Set PIOPIY_APP_ID '
            + 'and PIOPIY_APP_SECRET (Dashboard → Developers → your app) instead.',
        };
      }
      return {
        ready: false,
        error: 'PIOPIY is not configured on this server (missing PIOPIY_APP_ID / PIOPIY_APP_SECRET). '
          + 'Both are issued per app in the PIOPIY dashboard under Developers → App.',
      };
    }

    // A UUID here is almost certainly an `agent_id` — in PIOPIY's own examples
    // every UUID is one, and an agent id names a PIOPIY-HOSTED AI agent, which
    // is the thing this integration exists to replace. The v2 `appid` is numeric
    // in their CDR payload. Warn rather than refuse: this is pattern-matching on
    // a vendor's id format, not a rule they publish, and being wrong here must
    // not block an account whose ids simply look different.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creds.appId)) {
      logger.warn(
        'PIOPIY_APP_ID looks like a UUID. In PIOPIY\'s own examples a UUID is an `agent_id` '
        + '(one of THEIR hosted AI agents), while the v2 `appid` is numeric. If calls are rejected '
        + 'as unauthorised, this is the first thing to re-check.',
      );
    }
    const from = fromNumber || this.defaultFrom();
    if (!from) {
      return {
        ready: false,
        error: 'PIOPIY_FROM_NUMBER is not set. Add a PIOPIY number you own to backend/.env, or route '
          + 'the call from a VoiceNumber whose provider is PIOPIY.',
      };
    }
    if (piopiyNumber(from) === null) {
      return {
        ready: false,
        error: `"${from}" is not a dialable caller ID. PIOPIY needs the number with its country `
          + 'code and no punctuation, e.g. +912269851741.',
      };
    }
    return { ready: true, ...creds };
  },

  /**
   * Where the caller's audio is bridged.
   *
   * `sample-rate` is part of the contract, not a tuning knob: it fixes the PCM16
   * rate on BOTH directions of the socket, and the bridge reads it back off the
   * query string to size its frames and its resampler. The value here and the
   * one in the PCMO `stream` action come from the same resolver for that reason.
   */
  /**
   * `direction` is the direction of THIS call, appended so the media bridge can
   * greet correctly. Only the dialler knows it — an inbound webhook builds the
   * same URL without it — so its ABSENCE means "unknown", never "inbound".
   * See getRenderedWelcome() for why the agent's stored callDirection is not
   * enough on its own.
   */
  mediaStreamUrl({ baseWsUrl, workspaceId, agentId, direction = null }) {
    return `${baseWsUrl.replace(/\/$/, '')}/api/v1/piopiy-media/${workspaceId}/${agentId}`
      + `?sample-rate=${resolveSampleRate()}`
      + (direction ? `&direction=${encodeURIComponent(String(direction).toLowerCase())}` : '');
  },

  /**
   * Two-way conversation: a one-action PCMO array pointing at our bridge.
   *
   * The call log id is pinned to the ws_url rather than left to `extra_params`,
   * because the socket never sees `extra_params` — that field only comes back on
   * the CDR webhook, long after the bridge needed to know which call it is
   * carrying.
   *
   * No `hangup` action follows the stream: PCMO runs the array in order, and an
   * action after `stream` would end the call the moment the socket closed —
   * including the moment it closes because the customer hung up first, which is
   * harmless, and the moment it blips mid-call, which is not.
   */
  buildConversationDoc({ streamUrl = '', callLogId = null } = {}) {
    if (!streamUrl) {
      throw new Error(
        'PIOPIY needs a media stream URL, which requires PUBLIC_BACKEND_WS_URL to be set.',
      );
    }
    const url = new URL(streamUrl);
    if (callLogId) url.searchParams.set('callLogId', String(callLogId));

    return JSON.stringify([
      {
        action: 'stream',
        ws_url: url.toString(),
        listen_mode: resolveListenMode(),
      },
    ]);
  },

  /**
   * Greeting-only calls: speak, then hang up.
   *
   * The explicit `hangup` is the opposite of the conversation path's omission
   * and is load bearing — without it the line stays open after the last word and
   * bills the client for silence on every answered call in the campaign.
   *
   * `xmlSafe` is applied even though PCMO is JSON, not XML. It is doing a second
   * job here: capping the text at 800 characters and stripping control-ish
   * characters from something a stranger will hear spoken aloud. The JSON
   * encoding itself is `JSON.stringify`'s problem, and it handles it.
   */
  buildGreetingDoc({ greeting, closingLine }) {
    const text = xmlSafe(greeting).trim();
    if (!text) {
      throw new Error('PIOPIY greeting-only calls need greeting text; none was rendered.');
    }

    const actions = [{ action: 'speak', text }];
    const closing = xmlSafe(closingLine).trim().slice(0, MAX_CLOSING_CHARS);
    if (closing) actions.push({ action: 'speak', text: closing });
    actions.push({ action: 'hangup' });

    return JSON.stringify(actions);
  },

  /**
   * One-way broadcast: play the file, then hang up.
   *
   * Unlike the Plivo broadcast document, the audio URL travels here directly —
   * and safely, because it never leaves our process. Plivo's equivalent has to
   * avoid re-emitting a URL that arrived from outside into markup a carrier will
   * fetch; there is no answer endpoint here, so this string is built server-side
   * from a signed URL we minted and handed straight to the dial request.
   *
   * PCMO has no `loop` attribute the way Plivo's `<Play>` does, so a repeat is
   * literally repeated actions. That means PIOPIY re-fetches the file per
   * repetition — the reason the ceiling is low.
   */
  buildBroadcastDoc({ audioUrl, repeat = 1 }) {
    if (!audioUrl) {
      throw new Error('PIOPIY broadcast needs an audio URL to play.');
    }
    if (!/^https?:\/\//i.test(String(audioUrl))) {
      // PIOPIY fetches this itself over the public internet, so a relative or
      // scheme-less URL fails at the carrier — where the only symptom is an
      // answered call that plays nothing. Worth refusing while the cause is
      // still in hand. http is tolerated because a dev tunnel may serve it;
      // production mints https via PUBLIC_BACKEND_URL.
      throw new Error(`PIOPIY broadcast audio must be an absolute http(s) URL; got "${audioUrl}".`);
    }

    const loop = Math.min(Math.max(Number(repeat) || 1, 1), MAX_BROADCAST_REPEAT);
    const actions = [];
    for (let i = 0; i < loop; i++) actions.push({ action: 'play', file_url: String(audioUrl) });
    actions.push({ action: 'hangup' });

    return JSON.stringify(actions);
  },

  async placeCall({ credentials, to, from, document, context = {} }) {
    const { appId, appSecret } = credentials;

    const toNumber = piopiyNumber(to);
    const fromNumber = piopiyNumber(from);
    if (toNumber === null || fromNumber === null) {
      return {
        ok: false,
        status: 400,
        error: `PIOPIY needs plain international numbers. Got to="${to}", from="${from}"; `
          + 'both must be digits with a country code, e.g. +919876543210.',
      };
    }

    let pcmo;
    try {
      pcmo = JSON.parse(document);
    } catch {
      return {
        ok: false,
        status: 500,
        error: 'PIOPIY call document was not valid PCMO JSON. This is a bug in the document builder, '
          + 'not a carrier or configuration problem.',
      };
    }

    // The per-call identity, on the channel PIOPIY echoes back on the CDR
    // webhook. It arrives there as a JSON *string*, not an object — see
    // controllers/piopiy.controller.js, which parses it back.
    const extraParams = {};
    if (context.workspaceId) extraParams.workspaceId = context.workspaceId;
    if (context.agentId) extraParams.agentId = context.agentId;
    if (context.callLogId) extraParams.callLogId = context.callLogId;
    for (const [key, value] of Object.entries(context.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        extraParams[key] = String(value);
      }
    }

    const body = {
      appid: appId,
      secret: appSecret,
      from: fromNumber,
      to: toNumber,
      // Hard ceiling on the call in seconds. A bridge that never tears down is
      // billable until the carrier gives up, so this is a spend guard rather
      // than a feature: a bridge that never tears down cannot bill
      // indefinitely.
      duration: Number(process.env.PIOPIY_TIME_LIMIT_SEC) || DEFAULT_DURATION_SEC,
      pcmo,
      extra_params: extraParams,
    };

    const path = isIndianDestination(to) ? PATH_INDIA : PATH_GLOBAL;

    let response;
    try {
      response = await fetch(`${HOST}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return {
        ok: false,
        status: 502,
        error: `Could not reach PIOPIY: ${err.message}.`,
      };
    }

    const text = await response.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

    // PIOPIY answers HTTP 200 with its own `cmi_code` for application-level
    // failures, so the HTTP status alone is not the outcome. Treat anything
    // other than 200/OK in the body as a rejection — otherwise a refused call
    // reads as accepted and the log sits at INITIATED forever.
    const cmiCode = Number(json.cmi_code);
    const accepted = response.ok && (!Number.isFinite(cmiCode) || cmiCode === 200);

    if (!accepted) {
      let hint = ' Check your PIOPIY number, account balance, and destination format (+countrycode...).';
      if (response.status === 401 || response.status === 403 || cmiCode === 401) {
        hint = ' Check PIOPIY_APP_ID / PIOPIY_APP_SECRET — both come from the same app in the '
          + 'PIOPIY dashboard, and a secret from a different app fails exactly like a wrong one.';
      } else if (response.status === 429) {
        hint = ' PIOPIY is rate limiting; slow the campaign pacing.';
      } else if (path === PATH_INDIA) {
        // The likely first-call failure on an India account: the caller ID is
        // not one this app holds, or the number has no approved KYC/DLT
        // attachment for the destination.
        hint = ' On an India account this usually means the caller ID is not attached to this app, '
          + 'or the number has no approved KYC for the destination. Check the number in the PIOPIY '
          + 'console before assuming a code fault.';
      }
      return {
        ok: false,
        status: 502,
        httpStatus: response.status,
        raw: json,
        error: `PIOPIY rejected the call: ${json.message || json.error || json.status || response.status}.${hint}`,
      };
    }

    // `status: "progress"` means QUEUED, not connected — the outcome arrives on
    // the CDR webhook. Anything reading this as "the call happened" is wrong.
    return { ok: true, callId: json.request_id || json.data?.request_id || null };
  },
};

export { SAMPLE_RATES, DEFAULT_SAMPLE_RATE, LISTEN_MODES, MAX_BROADCAST_REPEAT };
