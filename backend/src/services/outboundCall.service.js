// Shared outbound dialling for agent calls.
//
// Extracted from agent.controller.testCall so the "Test call" button and the
// bulk-campaign worker place calls through ONE code path. Anything that changes
// how a call is set up — the call document, the media-stream handoff, call-log
// creation — changes for both at once.
//
// The carrier itself lives behind `services/telephony/` and is never named here:
// India has to route through Exotel or Plivo because Twilio cannot legally carry
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
import { resolveProvider } from './telephony/index.js';
import { acquireSlot } from './telephony/concurrency.js';
import { xmlSafe } from './telephony/provider.interface.js';
import { isDeepgramConfigured } from './stt/deepgramStream.service.js';
import { supportsTelephony } from './voice/telephonyAudio.js';
import { getRenderedWelcome } from './agentRuntime.service.js';

const BUNDLED_ENGINES = new Set(['xai', 'elevenlabs']);

const parseSettings = (agent) => {
  try { return JSON.parse(agent.settings || '{}'); } catch { return {}; }
};

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
 * @returns {{ mode: 'conversation'|'greeting', engine: string, reason: string }}
 */
export function resolveCallMode(agent) {
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

  const ttsProvider = settings.ttsProvider || agent?.voiceProvider || '';
  if (ttsProvider && !supportsTelephony(ttsProvider)) {
    return {
      mode: 'greeting',
      engine,
      reason: `This agent's speech provider (${ttsProvider}) can only produce MP3, which a phone `
        + 'line cannot play. Switch the agent to an ElevenLabs or Cartesia voice for a two-way '
        + 'phone conversation, or calls will play the welcome message only.',
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
 * @param {string} [fromNumber]
 * @returns {Promise<{ready: boolean, error?: string}>}
 */
export async function telephonyStatusForNumber(fromNumber) {
  return resolveProvider(await resolveProviderIdForNumber(fromNumber)).status(fromNumber);
}

/**
 * Which carrier owns this caller ID?
 *
 * Routing is per-number so India moves tenant by tenant: one `VoiceNumber` row
 * switches a workspace to Exotel or Plivo, and switching it back is one row
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
  if (!fromNumber) return undefined;
  try {
    const row = await prisma.voiceNumber.findUnique({
      where: { phoneNumber: String(fromNumber) },
      select: { provider: true },
    });
    return row?.provider || undefined;
  } catch (e) {
    // A lookup failure must not take the dialer down: the default carrier is a
    // worse answer than the right one, but a far better answer than no call.
    logger.warn(`Could not resolve carrier for ${fromNumber}: ${e.message}`);
    return undefined;
  }
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
  // An explicit override wins; otherwise the caller ID's own row decides. Only
  // a number we have never seen falls through to the configured default.
  const provider = resolveProvider(providerId || await resolveProviderIdForNumber(fromNumber));
  const tw = provider.status(fromNumber);
  if (!tw.ready) return { ok: false, mode: 'none', error: tw.error, status: 503 };

  const from = fromNumber || provider.defaultFrom();
  const { mode, engine, reason } = resolveCallMode(agent);
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

  // Not every carrier can speak arbitrary per-call text either. Exotel's
  // greeting lives in a dashboard flow, so a greeting-only call there would dial
  // the lead and play whatever that flow happens to contain. Refuse before
  // creating a call log or spending a carrier leg.
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
        phoneNumber: String(toNumber).slice(0, 32),
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
    });
    document = provider.buildConversationDoc({ streamUrl, callLogId: logId });
  } else {
    // The rendered welcome, for the same reason the media bridge uses it: this
    // is the agent's greeting in the agent's configured language, with
    // [placeholders] stripped. A greeting-only campaign is the one call where
    // the welcome is the ENTIRE conversation, so speaking the raw English field
    // to a Hindi-configured agent's whole recipient list is the worst place for
    // this divergence to survive. Cached by content hash on the agent row.
    let welcomeText = agent.welcomeMessage || `Hello, this is a call from ${agent.name}.`;
    try {
      const rendered = await getRenderedWelcome(workspaceId, agent.id);
      if (rendered?.welcome) welcomeText = rendered.welcome;
    } catch (e) {
      logger.warn(`Welcome rendering failed for greeting-only call: ${e.message}`);
    }
    greeting = xmlSafe(welcomeText);
    document = provider.buildGreetingDoc({ greeting, closingLine });
  }

  try {
    const result = await provider.placeCall({
      credentials: tw,
      to: toNumber,
      from,
      document,
      // Carriers with no per-call document (Exotel) carry these through their
      // own metadata field instead; providers that embed them in XML ignore it.
      context: { workspaceId, agentId: agent.id, callLogId: logId },
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

    // Nothing else will update a greeting-only log — the media bridge finalizes
    // the streamed ones.
    if (!streamsMedia && logId) {
      await prisma.agentCallLog.update({
        where: { id: logId },
        data: {
          transcript: JSON.stringify([{ role: 'assistant', content: greeting }]),
          endedAt: new Date(),
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
