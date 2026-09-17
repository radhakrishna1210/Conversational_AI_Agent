// Shared outbound dialling for agent calls.
//
// Extracted from agent.controller.testCall so the "Test call" button and the
// bulk-campaign worker place calls through ONE code path. Anything that changes
// how a call is set up — the call document, the media-stream handoff, call-log
// creation — changes for both at once.
//
// The carrier itself lives behind `services/telephony/` and is never named here:
// India has to route through Plivo because Twilio cannot legally carry
// Indian domestic traffic, so this file owns the *policy* (which carrier, call
// mode, logging, billing state) and the provider owns the *protocol*.
//
// Carrier choice is per caller ID (`VoiceNumber.provider`), not global — see
// resolveProviderIdForNumber below. That is what lets India move one tenant at a
// time, and lets a bad carrier be rolled back by editing one row.
//
// This module deliberately does NOT gate on plan/balance: the test-call
// controller and the campaign worker gate at different granularities (per press
// vs per batch), and both do it BEFORE calling here, while refusing is still
// free. Once the carrier is asked to dial, the leg is billable to us.

import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';
import { VOICE_NUMBER_STATUS } from '../constants/compliance.js';
import { outboundRefusal } from './agentDirection.js';
import { resolveProvider } from './telephony/index.js';
import { acquireSlot } from './telephony/concurrency.js';
import { resolveDialCredentials } from './telephony/dialCredentials.js';
import { twilioCallStatusUrl } from './telephony/carrierCloseOut.js';
import { xmlSafe } from './telephony/provider.interface.js';
import { isDeepgramConfigured } from './stt/deepgramStream.service.js';
import { supportsTelephony } from './voice/telephonyAudio.js';
import {
  telephonyFormatForVoice,
  synthesisProviderForVoice,
} from './voice/telephonyVoice.js';
import { getRenderedWelcome, neutralGreeting, loadAgent } from './agentRuntime.service.js';
import { resolveAgentVoice } from './voice.service.js';
import { warmGreetingAudio, greetingSynthesisOpts } from './voice/greetingAudio.js';

const BUNDLED_ENGINES = new Set(['xai', 'elevenlabs']);

/**
 * Does this `settings.voiceEngine` value run on a bundled speech-to-speech
 * engine (the carrier's media stream is piped straight into the vendor's own
 * realtime session), rather than on our modular STT→LLM→TTS pipeline?
 *
 * Exported because server.js has to answer the same question when a carrier
 * opens a media socket, and it used to answer it with its own inline
 * `engine === 'xai' || engine === 'elevenlabs'`. Two copies of the same list is
 * how a third bundled engine ends up dialled through the modular bridge —
 * silently, for the whole call.
 */
export const isBundledEngine = (engine) => BUNDLED_ENGINES.has(String(engine || 'modular'));

const parseSettings = (agent) => {
  try { return JSON.parse(agent.settings || '{}'); } catch { return {}; }
};

/**
 * Get this agent's greeting synthesized before anyone is listening for it.
 *
 * The one cost left on the answer path is the TTS round trip for those one or
 * two sentences — measured p50 581ms, p90 1450ms of silence the caller hears.
 * The audio cache (services/voice/greetingAudio.js) removes it for every call
 * after the first; this makes the first one a hit too.
 *
 * Deliberately best-effort in every direction: it resolves the same greeting
 * text the bridge will (getRenderedWelcome, for the same direction) and the
 * same synthesis options (greetingSynthesisOpts), but if any of that diverges
 * the bridge simply misses the cache and streams the greeting exactly as it
 * does without a warm. A miss costs what no warm costs; it can never be wrong.
 *
 * Only for the modular route — a bundled engine speaks its own greeting inside
 * the vendor's realtime session and never calls our TTS at all.
 *
 * @param {'OUTBOUND'|'INBOUND'} [direction] must match the bridge's: the two
 *   directions are different sentences, so warming the wrong one warms an entry
 *   nothing reads.
 */
async function warmPhoneGreeting(workspaceId, agent, direction = 'OUTBOUND') {
  const settings = parseSettings(agent);

  let text = neutralGreeting(agent, settings, direction);
  try {
    const rendered = await getRenderedWelcome(workspaceId, agent.id, { direction });
    if (rendered?.welcome) text = rendered.welcome;
  } catch (e) {
    logger.warn(`Greeting pre-render failed (the call will render it on answer): ${e.message}`);
  }

  const voice = await resolveAgentVoice(agent.voice).catch(() => null);
  if (!voice) return;

  // The bridge refuses a voice that cannot emit a telephony format, so there is
  // nothing to warm for one — and warming the provider's default MP3 would fill
  // a cache entry the bridge will never ask for.
  //
  // Through the SAME resolver the bridge uses: reading voice.provider.name here
  // meant every cloned voice missed this cache silently, because a clone's row
  // says `Custom`. See services/voice/telephonyVoice.js.
  const ttsFormat = telephonyFormatForVoice(voice, settings.ttsProvider);
  if (!ttsFormat) return;

  await warmGreetingAudio(voice, text, greetingSynthesisOpts(ttsFormat, settings));
}

/**
 * Warm the INBOUND greeting of an agent that answers a rented number.
 *
 * An outbound greeting is warmed while the phone rings. An inbound call has no
 * ringing we control — Plivo connects the caller and fetches the answer URL in
 * the same moment — so warming then would only race the bridge's own live
 * synthesis. And the audio cache is per process, so every deploy emptied it:
 * the first caller of the day to each number paid the full TTS round trip in
 * silence. So warm at the points that come BEFORE a call: when an agent is put
 * on a number, when an agent that answers one is saved, and at startup.
 *
 * Never throws, never blocks its caller's response.
 */
export async function warmInboundGreeting(workspaceId, agentId) {
  try {
    const agent = await loadAgent(workspaceId, agentId);
    if (!agent) return;
    if (isBundledEngine(parseSettings(agent).voiceEngine)) return;
    await warmPhoneGreeting(workspaceId, agent, 'INBOUND');
  } catch (e) {
    logger.warn(`Inbound greeting warm failed for agent ${agentId}: ${e.message}`);
  }
}

/** warmInboundGreeting, for an agent only if some active number routes to it. */
export async function warmInboundGreetingIfAnswering(workspaceId, agentId) {
  try {
    const answering = await prisma.voiceNumber.count({
      where: { workspaceId, inboundAgentId: agentId, status: VOICE_NUMBER_STATUS.ACTIVE },
    });
    if (answering) await warmInboundGreeting(workspaceId, agentId);
  } catch (e) {
    logger.warn(`Inbound greeting warm check failed for agent ${agentId}: ${e.message}`);
  }
}

/**
 * Warm every inbound agent's greeting — called once at startup.
 * One at a time: this is a background refill, and N parallel TTS requests at
 * boot would compete with the first real calls for the same provider quota.
 */
export async function warmAllInboundGreetings() {
  try {
    const rows = await prisma.voiceNumber.findMany({
      where: { status: VOICE_NUMBER_STATUS.ACTIVE, inboundAgentId: { not: null } },
      select: { workspaceId: true, inboundAgentId: true },
    });
    const seen = new Set();
    for (const r of rows) {
      const key = `${r.workspaceId}:${r.inboundAgentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await warmInboundGreeting(r.workspaceId, r.inboundAgentId);
    }
    if (seen.size) logger.info({ agents: seen.size }, 'Warmed inbound greetings');
  } catch (e) {
    logger.warn(`Inbound greeting warm-up at startup failed: ${e.message}`);
  }
}

/**
 * Can this agent hold a real two-way phone conversation?
 *
 * TWO routes now reach `conversation`:
 *
 *   bundled  xAI / ElevenLabs Conversational Agent — the carrier's media stream
 *            is bridged straight into the provider's own realtime session.
 *   modular  STT→LLM→TTS, bridged by ws/twilioMediaModular.handler.js, which
 *            supplies server-side turn detection, conversation state and
 *            barge-in (the things the browser does on a web call).
 *
 * The modular route has two hard requirements that the bundled one does not,
 * because it assembles the pipeline itself:
 *
 *   - streaming STT (Deepgram) — it IS the turn detector. Without it nothing
 *     can decide the caller has stopped talking.
 *   - a TTS provider that can emit a telephony format. Every provider defaults
 *     to MP3, which a carrier cannot play, and decoding MP3 per sentence on a
 *     live call is a latency cost we refuse to pay silently.
 *
 * When either is missing we keep the old honest answer rather than dialling and
 * hoping — the alternative is 10,000 people hearing a recorded message when the
 * operator expected a conversation.
 *
 * ── WHY THIS IS ASYNC ───────────────────────────────────────────────────────
 *
 * It used to judge the TTS provider from `settings.ttsProvider || agent.voiceProvider`.
 * Both of those are unset on almost every agent in this database — the voice is
 * stored as a LABEL on `agent.voice` ("ElevenLabs - Rachel", "Custom - krishna")
 * and resolved to a row at call time — so the guard below was reading empty
 * strings and waving every agent through, whatever voice it actually had.
 *
 * The bridge, meanwhile, resolves the real voice row and refuses one it cannot
 * speak. Two checks, the same question, different inputs: the pre-flight always
 * said yes and the bridge said no AFTER the callee had picked up, so the whole
 * class of "wrong voice for a phone line" surfaced as a live call dropping in
 * about a second instead of as a refusal before dialling. Resolving the voice
 * here — one cached lookup per dial, on the ringing path where nobody is
 * waiting — is what makes the two agree.
 *
 * @returns {Promise<{ mode: 'conversation'|'greeting', engine: string, reason: string }>}
 */
export async function resolveCallMode(agent) {
  const settings = parseSettings(agent);
  const engine = settings.voiceEngine || 'modular';
  const bundled = BUNDLED_ENGINES.has(engine);

  // Shared by both routes: without a public wss:// origin the carrier has
  // nowhere to stream audio to, whatever the engine.
  if (!env.PUBLIC_BACKEND_WS_URL) {
    return {
      mode: 'greeting',
      engine,
      reason: `This agent would hold a two-way conversation, but PUBLIC_BACKEND_WS_URL is not `
        + 'configured, so the carrier has no public wss:// address to stream audio to. Calls will '
        + 'play the welcome message only.',
    };
  }

  if (bundled) return { mode: 'conversation', engine, reason: '' };

  if (!isDeepgramConfigured()) {
    return {
      mode: 'greeting',
      engine,
      reason: 'This agent uses the modular voice pipeline, whose phone bridge needs Deepgram '
        + 'streaming speech-to-text to detect when the caller has finished speaking. '
        + 'DEEPGRAM_API_KEY is not set, so phone calls will play the welcome message and hang up.',
    };
  }

  // The voice this agent will really speak with, resolved exactly as the bridge
  // resolves it. A lookup failure is deliberately NOT treated as a refusal: the
  // bridge re-resolves it moments later anyway, and downgrading every call to
  // greeting-only because one database read blipped is far worse than letting
  // the call try.
  const voice = await resolveAgentVoice(agent?.voice).catch(() => null);
  const ttsProvider = voice
    ? synthesisProviderForVoice(voice, settings.ttsProvider)
    : (settings.ttsProvider || agent?.voiceProvider || '');

  // An empty provider with a voice row present means the row cannot synthesize
  // at all — a clone whose neural training never finished. Named separately
  // because "finish cloning this voice" and "pick a different provider" are
  // different actions, and the generic message sends the operator to the wrong one.
  if (voice && !ttsProvider) {
    return {
      mode: 'greeting',
      engine,
      reason: `The voice "${voice.name}" has only a raw sample — its neural clone was never `
        + 'completed, so nothing can synthesize new speech with it. Finish cloning it on the '
        + 'Clone Voice page, or pick another voice; until then calls play the welcome message only.',
    };
  }

  if (ttsProvider && !supportsTelephony(ttsProvider)) {
    return {
      mode: 'greeting',
      engine,
      // Names the provider that would really speak it, which for a cloned voice
      // is its host (Fish Audio / ElevenLabs) rather than the `Custom` label the
      // picker shows — an operator told "Custom cannot do telephony" has nothing
      // to act on.
      reason: `This agent's voice${voice ? ` ("${voice.name}")` : ''} is spoken by ${ttsProvider}, `
        + 'which can only produce MP3 — a format a phone line cannot play. Switch the agent to an '
        + 'ElevenLabs, Sarvam or Fish Audio voice (a clone hosted by one of those counts) for a '
        + 'two-way phone conversation, or calls will play the welcome message only.',
    };
  }

  return { mode: 'conversation', engine, reason: '' };
}

/**
 * True when the carrier's credentials + a usable caller ID are present.
 *
 * PREFER `telephonyStatusForNumber` when you have a caller ID. This one checks
 * whichever carrier `providerId` names, defaulting to the platform default —
 * which is NOT necessarily the carrier that number will actually dial through.
 *
 * @param {string} [fromNumber]  caller ID being dialled from
 * @param {string} [providerId]  carrier to check; defaults to the configured one
 */
export function telephonyStatus(fromNumber, providerId) {
  return resolveProvider(providerId).status(fromNumber);
}

/**
 * Readiness of the carrier that THIS caller ID will really dial through.
 *
 * placeOutboundCall routes per number (see resolveProviderIdForNumber), so any
 * pre-flight that skips that lookup is asking the wrong carrier whether the
 * call can be placed. The campaign runner did exactly that, and the two ways it
 * gets the answer wrong are both silent:
 *
 *   • a Plivo caller ID on a box with Twilio configured passes the check, the
 *     campaign starts, and then every single dial fails on Plivo credentials —
 *     10,000 recipients marked failed one per second, with the real reason
 *     buried in per-row failureReason instead of stopping the campaign;
 *   • the mirror image — a Twilio caller ID where only Plivo is configured —
 *     fails the campaign before it starts, quoting a carrier nobody chose.
 *
 * Async because the routing lives in a `VoiceNumber` row. Worth the round trip:
 * it is one query per campaign, not per call.
 *
 * Given the workspace, it also answers "may THIS workspace dial from it" — the
 * same refusal placeOutboundCall applies — so a campaign from another client's
 * or a released number fails before it starts, not once per recipient.
 *
 * @param {string} [fromNumber]
 * @param {object} [opts]
 * @param {string} [opts.workspaceId]
 * @returns {Promise<{ready: boolean, error?: string}>}
 */
export async function telephonyStatusForNumber(fromNumber, { workspaceId } = {}) {
  const routing = await resolveNumberRouting(fromNumber, { workspaceId });
  if (routing.blocked) return { ready: false, error: routing.blocked, code: routing.blockedCode };
  return resolveProvider(routing.providerId).status(fromNumber);
}

/**
 * Which carrier owns this caller ID?
 *
 * Routing is per-number so India moves tenant by tenant: one `VoiceNumber` row
 * switches a workspace to Plivo, and switching it back is one row
 * again. TELEPHONY_PROVIDER_DEFAULT is only for numbers we have no record of —
 * flipping *that* to reach India would reroute every call on the platform,
 * which is precisely the mistake this lookup exists to prevent.
 *
 * Match is exact on the stored number: a row saved as `08047…` does not route
 * a call placed from `+9108047…`. Store caller IDs the way you dial them.
 *
 * Unknown numbers fall back silently — most deployments have no VoiceNumber
 * rows at all, and every one of those is a Twilio call that must keep working.
 */
export async function resolveProviderIdForNumber(fromNumber) {
  return (await resolveNumberRouting(fromNumber)).providerId;
}

/**
 * The caller ID's row, as one lookup: which carrier it routes to, and whether
 * it is allowed to dial at all.
 *
 * The two travel together because they come from the same row, and the dial
 * path already pays for that read. Splitting the payment check into its own
 * query would add a round trip to every single call — this deployment measures
 * ~490ms to its Postgres, which is audible on the line.
 *
 * `blocked` carries a customer-facing message when the number may not dial:
 * suspended for non-payment, released, or — when `workspaceId` is given — held
 * by a different workspace. Unknown numbers are NOT blocked: a caller ID with
 * no VoiceNumber row is a Twilio number or a verified BYO number, neither of
 * which this table governs.
 *
 * @param {string} [fromNumber]
 * @param {object} [opts]
 * @param {string} [opts.workspaceId]  the workspace about to dial; enables the ownership check
 */
export async function resolveNumberRouting(fromNumber, { workspaceId } = {}) {
  if (!fromNumber) return { providerId: undefined, blocked: null };
  try {
    const row = await prisma.voiceNumber.findUnique({
      where: { phoneNumber: String(fromNumber) },
      select: { provider: true, status: true, subaccountId: true, workspaceId: true },
    });
    return {
      providerId: row?.provider || undefined,
      // Which carrier subaccount holds this caller ID — the account the call is
      // dialled AS. See telephony/dialCredentials.js.
      subaccountId: row?.subaccountId || undefined,
      ...callerIdRefusal(row, fromNumber, workspaceId),
    };
  } catch (e) {
    // A lookup failure must not take the dialer down: the default carrier is a
    // worse answer than the right one, but a far better answer than no call.
    // Failing OPEN on `blocked` for the same reason — a database blip must not
    // stop paying customers dialling, and unbilled minutes are recoverable
    // where refused calls are not.
    logger.warn(`Could not resolve carrier for ${fromNumber}: ${e.message}`);
    return { providerId: undefined, blocked: null };
  }
}

/**
 * Why a caller ID's own row forbids dialling from it, if it does.
 *
 * A VoiceNumber row is a tenancy record as much as a routing one: a number
 * rented to one client carries that client's DLT header and caller-ID
 * reputation. The dial path used to read only the row's carrier, so any
 * workspace that typed another client's number into "Call from" dialled out as
 * them — on a Plivo main-account number with nothing else to stop it — and a
 * RELEASED number, given back to the carrier, was still dialled from.
 *
 * @returns {{blocked: string|null, blockedStatus?: number, blockedCode?: string}}
 */
export function callerIdRefusal(row, fromNumber, workspaceId) {
  if (!row) return { blocked: null };
  if (workspaceId && row.workspaceId && row.workspaceId !== workspaceId) {
    return {
      blocked: `${fromNumber} is not one of this workspace's numbers, so calls cannot be placed from it.`,
      blockedStatus: 403,
      blockedCode: 'CALLER_ID_NOT_OWNED',
    };
  }
  if (row.status === VOICE_NUMBER_STATUS.RELEASED) {
    return {
      blocked: `${fromNumber} has been released and can no longer be used as a caller ID. Pick another number.`,
      blockedStatus: 409,
      blockedCode: 'NUMBER_RELEASED',
    };
  }
  if (row.status === VOICE_NUMBER_STATUS.SUSPENDED_NONPAYMENT) {
    return {
      blocked: `${fromNumber} is suspended because its monthly rental could not be taken from your wallet. Top up and it reactivates automatically — the number has not been given up.`,
      blockedStatus: 402,
      blockedCode: 'NUMBER_SUSPENDED_NONPAYMENT',
    };
  }
  return { blocked: null };
}

/**
 * Place one outbound call.
 *
 * @param {object}  p
 * @param {string}  p.workspaceId
 * @param {object}  p.agent          Agent row
 * @param {string}  p.toNumber       destination, E.164
 * @param {string}  [p.fromNumber]   caller ID; falls back to the provider's default
 * @param {string}  [p.closingLine]  spoken after the greeting on greeting-only calls
 * @param {string}  [p.callLogId]    reuse an existing log instead of creating one
 * @param {string}  [p.providerId]   carrier override; otherwise routed from the
 *                                   caller ID's VoiceNumber row, then the default
 * @returns {Promise<{ok: boolean, callSid?: string, mode: string, callLogId?: string,
 *                    error?: string, status?: number}>}
 */
export async function placeOutboundCall({
  workspaceId,
  agent,
  toNumber,
  fromNumber,
  closingLine = '',
  callLogId = null,
  providerId,
}) {
  // Every path that dials goes through here, so this is the gate that holds
  // whichever caller forgot to check: an Inbound agent never places a call.
  // Refused before a call log exists or a carrier leg is spent.
  const directionRefusal = outboundRefusal(agent);
  if (directionRefusal) {
    return { ok: false, mode: 'none', error: directionRefusal, status: 409, code: 'AGENT_IS_INBOUND' };
  }

  // An explicit override wins; otherwise the caller ID's own row decides. Only
  // a number we have never seen falls through to the configured default.
  //
  // This one read also answers "may this number dial?". The payment gate lives
  // here rather than with the wallet/concurrency checks because those are
  // called per-press and per-batch by different callers, and a suspended number
  // has to be refused on EVERY path — a test call from a suspended number is
  // still a call we pay the carrier for. Nothing else in this module gates, and
  // this stays the exception: it costs no extra query.
  const routing = await resolveNumberRouting(fromNumber, { workspaceId });
  if (routing.blocked) {
    return { ok: false, mode: 'none', error: routing.blocked, status: routing.blockedStatus, code: routing.blockedCode };
  }
  const provider = resolveProvider(providerId || routing.providerId);
  const tw = provider.status(fromNumber);
  if (!tw.ready) return { ok: false, mode: 'none', error: tw.error, status: 503 };

  // A number rented into this workspace's carrier subaccount is dialled AS that
  // subaccount, so the usage attributes to this client and the per-client kill
  // switch actually stops their calls. See telephony/dialCredentials.js.
  const credentials = await resolveDialCredentials(provider, tw, {
    workspaceId,
    subaccountId: routing.subaccountId,
  });
  if (!credentials.ready) {
    return {
      ok: false, mode: 'none', error: credentials.error, status: credentials.status ?? 503, code: credentials.code,
    };
  }

  const from = fromNumber || provider.defaultFrom();
  const { mode, engine, reason } = await resolveCallMode(agent);
  // Both engine families now reach the same media-stream URL; server.js picks
  // the bridge from the agent's engine. This flag is about the CALL DOCUMENT
  // (stream vs play-and-hang-up), not about which engine answers.
  const streamsMedia = mode === 'conversation';

  // Not every carrier has a bridge for every engine. The modular STT→LLM→TTS
  // pipeline is µ-law-native end to end (Deepgram is opened in mulaw/8000, TTS
  // is asked for a telephony format), so a carrier that streams PCM16 cannot
  // run it. Refuse before spending a leg rather than connecting a call to a
  // socket that will close on the first frame.
  if (streamsMedia && provider.supportsModularEngine === false && !BUNDLED_ENGINES.has(engine)) {
    return {
      ok: false,
      mode,
      status: 400,
      error: `${provider.label} calls need a bundled Conversational Agent (xAI or ElevenLabs). This `
        + `agent uses the modular speech pipeline, which has no ${provider.label} media bridge — `
        + 'switch the agent\'s voice engine, or place the call through Twilio.',
    };
  }

  // Not every carrier can speak arbitrary per-call text either. On a carrier
  // whose greeting lives in a dashboard flow, a greeting-only call would dial
  // the lead and play whatever that flow happens to contain. No wired carrier
  // is in that position today, so this guard is the contract for the next one:
  // refuse before creating a call log or spending a carrier leg.
  if (!streamsMedia && provider.supportsGreetingMode === false) {
    return {
      ok: false,
      mode,
      status: 400,
      error: `${provider.label} cannot play a per-agent greeting: it has no per-call speech, only `
        + 'flows configured in its dashboard. Give this agent a Conversational Agent voice engine '
        + '(xAI or ElevenLabs), or place the call through a carrier that supports greeting-only calls.'
        // Without this the operator is told to change the engine when the real
        // cause is often server config (an unset PUBLIC_BACKEND_WS_URL demotes
        // every agent to greeting mode, whatever engine it uses).
        + (reason ? ` Reason this call fell back to greeting mode: ${reason}` : ''),
    };
  }

  // Pre-create the call log so its id can be handed to the media-stream bridge
  // (as a call parameter) for the bundled-engine branch to update in place.
  let logId = callLogId;
  if (!logId) {
    const created = await prisma.agentCallLog.create({
      data: {
        workspaceId,
        agentId: agent.id,
        type: 'PHONE_CALL',
        status: 'INITIATED',
        // Inbound Plivo calls now have rows too (openInboundCallLog), so this is
        // no longer implied by the row existing.
        direction: 'OUTBOUND',
        phoneNumber: String(toNumber).slice(0, 32),
        // Which carrier carried this leg, and from which caller ID. Recorded at
        // creation rather than after the dial so a call that fails at the
        // carrier still says who it was going out through — that row is
        // otherwise indistinguishable from a web call that never had a carrier.
        provider: provider.id,
        fromNumber: from ? String(from).slice(0, 32) : null,
      },
    }).catch((e) => { logger.warn(`Could not pre-create phone call log: ${e.message}`); return null; });
    logId = created?.id ?? null;
  }

  let document;
  let greeting = '';
  if (streamsMedia) {
    // Full two-way conversation: hand the call to the media-stream bridge
    // (ws/twilioMediaRealtime for bundled engines, ws/twilioMediaModular for
    // the STT→LLM→TTS pipeline).
    const streamUrl = provider.mediaStreamUrl({
      baseWsUrl: env.PUBLIC_BACKEND_WS_URL,
      workspaceId,
      agentId: agent.id,
      // This service exists to DIAL OUT. Whatever the agent is configured as,
      // the person about to answer did not call us, so a greeting that thanks
      // them for calling is wrong — and that is exactly what an INBOUND-marked
      // (or direction-less) agent used for a campaign used to say. The bridge
      // reads this back off the socket URL; see getRenderedWelcome().
      direction: 'OUTBOUND',
      // Which bridge this call is for. We resolved it above (resolveCallMode)
      // to decide whether to dial at all, so server.js should not have to
      // re-read the agent row during the WebSocket handshake to learn the same
      // thing — that read is 490-1400ms of silence after the callee picks up,
      // on every call in the campaign. Absent for inbound; see
      // resolveBundledEngine() in server.js for the fallback.
      engine: isBundledEngine(engine) ? 'bundled' : 'modular',
    });
    document = provider.buildConversationDoc({ streamUrl, callLogId: logId });
    // Render and synthesize the greeting NOW, while the phone is about to ring.
    // Ringing is the one stretch of a phone call with nobody waiting on us, and
    // the alternative is doing both at the moment the callee says "hello?",
    // where every millisecond is dead air. Fire-and-forget on purpose: a failed
    // or slow warm just means the bridge does it the old way, so this can never
    // delay or fail a dial. See services/voice/greetingAudio.js.
    if (!isBundledEngine(engine)) warmPhoneGreeting(workspaceId, agent).catch(() => {});
  } else {
    // The rendered welcome, for the same reason the media bridge uses it: the
    // Outgoing greeting, legacy text only where it suits an outbound call, with
    // [placeholders] stripped. A greeting-only campaign is the one call where the
    // welcome is the ENTIRE conversation, so the raw legacy field is the worst
    // thing to fall back to here. Rendering reads a cached agent row and runs no
    // model, so there is nothing to wait on.
    let welcomeText = neutralGreeting(agent, parseSettings(agent), 'OUTBOUND');
    try {
      const rendered = await getRenderedWelcome(workspaceId, agent.id, { direction: 'OUTBOUND' });
      if (rendered?.welcome) welcomeText = rendered.welcome;
    } catch (e) {
      logger.warn(`Welcome rendering failed for greeting-only call: ${e.message}`);
    }
    greeting = xmlSafe(welcomeText);
    document = provider.buildGreetingDoc({ greeting, closingLine });
  }

  try {
    const result = await provider.placeCall({
      credentials,
      to: toNumber,
      from,
      document,
      // Carriers with no per-call document carry these through their own
      // metadata field instead; providers that embed them in XML ignore it.
      // `direction` and `engine` ride along for carriers whose bridge cannot be
      // reached through a stream URL we build here — Plivo hands the carrier an
      // ANSWER URL and rebuilds the stream URL in its own controller, so both
      // flags have to survive that hop to reach the bridge. On Twilio they are
      // already on the stream URL inside `document` and this is ignored.
      context: {
        workspaceId,
        agentId: agent.id,
        callLogId: logId,
        direction: 'OUTBOUND',
        engine: isBundledEngine(engine) ? 'bundled' : 'modular',
        // Twilio's completed-call callback. Without it a Twilio agent call nobody
        // answered — and every greeting-only one, which opens no socket — was
        // never closed: INITIATED and unbilled forever, its slot held for an
        // hour. Plivo and PIOPIY have their own end-of-call callbacks and ignore
        // this. See services/telephony/carrierCloseOut.js.
        statusCallbackUrl: provider.id === 'TWILIO' ? twilioCallStatusUrl(logId) : '',
      },
    });

    if (!result.ok) {
      logger.warn(
        { provider: provider.id, status: result.httpStatus, body: result.raw },
        `${provider.label} call request failed`,
      );
      if (logId) {
        // billingStatus must be closed out here too. The carrier rejected the
        // dispatch so nobody ever spoke and there is nothing to charge — but
        // left at its PENDING default the row reads as an unpaid call forever,
        // since no settlement path ever revisits a call that never connected.
        await prisma.agentCallLog.update({
          where: { id: logId },
          data: { status: 'FAILED', endedAt: new Date(), billingStatus: 'SKIPPED' },
        }).catch(() => {});
      }
      return {
        ok: false,
        mode,
        callLogId: logId,
        status: result.status ?? 502,
        error: result.error,
      };
    }

    // The carrier has accepted the dial, so a leg now exists and counts against
    // the account's concurrency ceiling from this moment — ringing included,
    // which on an unanswered bulk dial is most of the holding time.
    //
    // Released by ws/callFinalizer.js for streamed calls, and by the carrier's
    // hangup callback for greeting-only ones, which have no socket to finalize.
    // NOT released here: the greeting is still being spoken when this returns.
    // The stale sweep in concurrency.js is the backstop if a release is missed.
    acquireSlot({ workspaceId, callLogId: logId });

    // The carrier's id for this leg, which is how its own usage records find
    // this row again during reconciliation. On Plivo this is the request_uuid;
    // the real CallUUID replaces it when the hangup callback lands.
    if (logId && result.callId) {
      await prisma.agentCallLog.update({
        where: { id: logId },
        data: { providerCallId: String(result.callId) },
      }).catch((e) => logger.warn(`Could not record the carrier call id for ${logId}: ${e.message}`));
    }

    // A greeting-only call has no bridge to record what was said, so record it
    // here. NOT endedAt: the call has not ended — it is only now ringing — and
    // endedAt is the claim the carrier's end-of-call callback finalizes on
    // (ws/callFinalizer.js). Stamping it here made the call look finished
    // before anyone picked up.
    if (!streamsMedia && logId) {
      await prisma.agentCallLog.update({
        where: { id: logId },
        data: {
          transcript: JSON.stringify([{ role: 'assistant', content: greeting }]),
        },
      }).catch((e) => logger.warn(`Could not log phone call: ${e.message}`));
    }

    // `callSid` is Twilio's word for it, kept as the public field name so this
    // extraction stays invisible to callers; Plivo's call_uuid arrives here too.
    return { ok: true, callSid: result.callId, mode, callLogId: logId };
  } catch (err) {
    logger.error('placeOutboundCall failed', err);
    if (logId) {
      // Same as the rejection path above: the call never happened, so close the
      // billing state rather than leaving it PENDING forever.
      await prisma.agentCallLog.update({
        where: { id: logId },
        data: { status: 'FAILED', endedAt: new Date(), billingStatus: 'SKIPPED' },
      }).catch(() => {});
    }
    return { ok: false, mode, callLogId: logId, status: 502, error: `Call failed: ${err.message}` };
  }
}
