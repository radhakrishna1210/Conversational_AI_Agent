// The telephony provider contract.
//
// Every carrier we dial through implements this shape, so `outboundCall.service`
// never names a vendor. It exists because India forces a second carrier on us:
// Twilio cannot legally serve Indian domestic traffic (outbound-to-India needs a
// non-Indian caller ID, and DoT stamps "International Call" on those), so Indian
// numbers have to route through Plivo. See `backend/docs/PLIVO_INTEGRATION.md`.
//
// The awkward parts of the contract are all places where the two carriers
// genuinely differ, not premature generality:
//
//   buildConversationDoc / buildGreetingDoc
//       Twilio speaks TwiML, Plivo speaks Plivo XML. The media-stream verb
//       differs (`<Connect><Stream>` vs a bare `<Stream bidirectional>`), so the
//       document cannot be shared even though both carry mu-law 8k underneath.
//
//   deliverDocument
//       Two different answers to "how does the carrier learn what to do":
//         'inline'     Twilio, PIOPIY — the document travels in the make-call
//                      request itself (TwiML in `Twiml`, PCMO actions in the
//                      body).
//         'answer_url' Plivo — fetches the document from a URL we serve at
//                      answer time.
//       `buildConversationDoc` returns a string rather than XML specifically,
//       because not every carrier's document is markup.
//
//   placeCall's `context`
//       Workspace/agent/log ids for carriers that cannot carry them in the
//       document — Plivo rebuilds its stream URL in its own controller and
//       needs them there. Twilio embeds the same data in the TwiML and ignores
//       `context` entirely.
//
//   from / to
//       Twilio and Plivo: `From` is the caller ID, `To` is the destination.
//       A carrier that inverts the two maps them inside its own provider;
//       nothing above this layer should know.
//
//   placeCall's return
//       Twilio calls it `CallSid`, Plivo calls it `call_uuid`. Both normalize to
//       `callId` here; the outer service keeps exposing `callSid` to its own
//       callers so this refactor stays invisible above it.

/**
 * @typedef {object} ProviderCredentials
 * Carrier auth, shaped per provider. Opaque to callers — pass it straight back
 * into `placeCall`.
 *
 * @typedef {object} ReadyResult
 * @property {boolean} ready
 * @property {string}  [error]   operator-facing reason, safe to surface in the UI
 *
 * @typedef {object} PlaceCallResult
 * @property {boolean} ok
 * @property {string}  [callId]        carrier's own call identifier
 * @property {string}  [error]         operator-facing failure text
 * @property {number}  [status]        HTTP status to answer the API request with
 *
 * @typedef {object} TelephonyProvider
 * @property {string} id                                     'TWILIO' | 'PLIVO'
 * @property {string} label                                  human name for logs
 * @property {'inline'|'answer_url'} deliverDocument          how the carrier learns what to do
 * @property {boolean} [supportsGreetingMode]                false when per-call speech text is impossible
 * @property {boolean} [supportsModularEngine]               false when only the bundled-engine bridge exists
 * @property {boolean} [supportsBroadcast]                   false when the carrier cannot play a hosted audio file
 * @property {(p: {audioUrl: string, repeat: number, recipientId?: string}) => string} [buildBroadcastDoc]
 *           One-way call: play this audio file and hang up. Same 'document'
 *           convention as the other two builders — markup for Twilio, a URL for
 *           Plivo. No media socket is ever opened, which is exactly why a
 *           broadcast costs the carrier minute and nothing else.
 * @property {() => ProviderCredentials|null} credentials
 * @property {() => string} defaultFrom                      env-configured fallback caller ID
 * @property {(fromNumber?: string) => ReadyResult} status
 * @property {(p: {baseWsUrl: string, workspaceId: string, agentId: string,
 *                 direction?: 'INBOUND'|'OUTBOUND'|null,
 *                 engine?: 'bundled'|'modular'|null}) => string} mediaStreamUrl
 * @property {(p: {streamUrl: string, callLogId: string|null}) => string} buildConversationDoc
 * @property {(p: {greeting: string, closingLine: string}) => string} buildGreetingDoc
 * @property {(p: {credentials: ProviderCredentials, to: string, from: string,
 *                 document: string}) => Promise<PlaceCallResult>} placeCall
 */

/**
 * Strip characters that would break the call document.
 *
 * Both TwiML and Plivo XML are XML: one unescaped `&` or `<` in a welcome
 * message and the carrier fails the call with a parse error instead of speaking.
 * Replacing rather than entity-encoding is deliberate — these strings are spoken
 * aloud, and "&amp;" is not a word.
 */
export const xmlSafe = (s) => String(s ?? '').replace(/[<>&]/g, ' ').slice(0, 800);

/**
 * Escape a URL for XML text content.
 *
 * NOT `xmlSafe`: that replaces `&` with a space because it is escaping speech,
 * where "&amp;" is not a word. A URL is the opposite case — a query string with
 * two parameters contains an `&` that has to survive as `&amp;` or the carrier
 * fetches a truncated address and plays nothing. Only a genuine URL is ever
 * passed here (ours, built server-side), so scheme validation belongs at the
 * point the URL is minted, not here.
 */
export const xmlUrl = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Append the media-bridge's per-call query parameters to a stream URL.
 *
 * Two things ride here, both set ONLY by the dialler and both meaning "unknown"
 * by their absence rather than defaulting to something:
 *
 *   direction  which way this leg went, so the bridge greets correctly. An
 *              inbound webhook builds the same URL without it, and campaigns
 *              routinely dial out through agents saved as INBOUND.
 *   engine     'bundled' | 'modular' — which bridge this call is for. The
 *              dialler resolved it (resolveCallMode) before the carrier was
 *              asked to dial, so saying it here saves server.js a Supabase
 *              round trip on the answer path, where it is dead air on a live
 *              line. See resolveBundledEngine() in server.js.
 *
 * Built with URLSearchParams rather than by concatenation because the moment
 * there are TWO parameters the naive `? …` form emits a second `?` and silently
 * drops one of them — and because the resulting `&` then has to survive
 * xmlUrl() into the call document.
 */
export const withStreamParams = (url, { direction = null, engine = null } = {}) => {
  const params = new URLSearchParams();
  if (direction) params.set('direction', String(direction).toLowerCase());
  if (engine) params.set('engine', String(engine).toLowerCase());
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
};
