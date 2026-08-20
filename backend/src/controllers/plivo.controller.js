// backend/src/controllers/plivo.controller.js
//
// Plivo's public callbacks. Two endpoints, both unauthenticated in the session
// sense because a carrier cannot hold a login:
//
//   POST /api/v1/plivo/answer   Plivo fetches the call document when the callee
//                               picks up. Unlike Twilio, which takes TwiML
//                               inline on the dial request, Plivo fetches — so
//                               this endpoint IS the call script. If it errors,
//                               the callee hears silence and Plivo hangs up.
//   POST /api/v1/plivo/hangup   Terminal call state. For a greeting-only call
//                               this is the ONLY end-of-call signal: no media
//                               socket is ever opened, so without it the log
//                               stays INITIATED and its billing state PENDING
//                               forever.
//
// Everything these endpoints need about the call — workspace, agent, call log,
// mode — arrives on the query string, put there by plivo.provider.js#placeCall.
// Plivo's stream `start` event has no equivalent of Twilio's customParameters,
// so this is the only channel available.

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { env } from '../config/env.js';
import { validateV3Signature } from '../services/plivo/client.js';
import {
  plivoProvider,
  buildStreamXml,
  buildGreetingXml,
  buildPlayXml,
  resolveAnswerUrlBase,
} from '../services/telephony/plivo.provider.js';
import {
  getRecordingUnscoped,
  publicAudioUrl,
} from '../services/broadcast/broadcastRecording.service.js';
import { settleBroadcastCall } from '../services/broadcast/broadcastSettlement.service.js';
import { releaseSlot } from '../services/telephony/concurrency.js';
import { syncProgress } from '../services/broadcast/broadcastRunner.service.js';
import { getRenderedWelcome, loadAgent } from '../services/agentRuntime.service.js';
import { isBundledEngine } from '../services/outboundCall.service.js';
import { createCallFinalizer } from '../ws/callFinalizer.js';

/**
 * The exact URL Plivo signed.
 *
 * Deliberately rebuilt from our own configured answer base rather than from
 * `req`. Express is behind nginx here with no `trust proxy` set, so
 * `req.protocol` reports "http" while Plivo called "https" — signing over that
 * would reject every genuine callback. The configured base is the same string
 * Plivo was handed, which is the string it signs.
 */
const signedUrl = (req, suffix) => {
  const base = resolveAnswerUrlBase().replace(/\/answer$/, suffix);
  const qs = new URLSearchParams(req.query || {}).toString();
  return qs ? `${base}?${qs}` : base;
};

/**
 * Reject forged callbacks.
 *
 * Fails CLOSED: an unsigned or wrongly-signed request is refused. The escape
 * hatch exists because the signature is computed over the URL byte-for-byte,
 * so one proxy rewriting a trailing slash breaks every call with a symptom
 * ("the callee hears silence") that points nowhere near the cause. When it
 * fails we log the exact string we signed, which is the only way to see the
 * mismatch without guessing.
 */
const signatureOk = (req, suffix) => {
  if (process.env.PLIVO_SKIP_SIGNATURE_CHECK === 'true') return true;

  const authToken = process.env.PLIVO_AUTH_TOKEN;
  if (!authToken) {
    logger.error('Plivo callback rejected: PLIVO_AUTH_TOKEN is not set, so nothing can be verified.');
    return false;
  }

  const url = signedUrl(req, suffix);
  const ok = validateV3Signature({
    method: req.method === 'GET' ? 'GET' : 'POST',
    url,
    nonce: req.get('X-Plivo-Signature-V3-Nonce'),
    signature: req.get('X-Plivo-Signature-V3'),
    authToken,
    params: req.method === 'GET' ? {} : (req.body || {}),
  });

  if (!ok) {
    logger.warn(
      { url, hasNonce: Boolean(req.get('X-Plivo-Signature-V3-Nonce')) },
      'Plivo callback signature did not validate. The URL logged here is the exact string that was '
      + 'signed — compare it with what Plivo actually called. Set PLIVO_SKIP_SIGNATURE_CHECK=true '
      + 'only to confirm that is the cause.',
    );
  }
  return ok;
};

/** Plivo sends everything twice over: query on the URL, params in the body. */
const field = (req, ...names) => {
  for (const n of names) {
    const v = req.body?.[n] ?? req.query?.[n];
    if (v !== undefined && v !== '') return String(v);
  }
  return '';
};

const xml = (res, body) => res.type('text/xml').send(body);

/**
 * Plivo hung up on an error rather than leaving the caller in silence.
 *
 * A bare 500 makes Plivo drop the call with no explanation to anyone. A
 * `<Speak>` at least tells whoever answered that something is broken, and shows
 * up in Plivo's own call logs as a completed call rather than a failure with no
 * cause.
 */
const failXml = (res, status, reason) => {
  logger.error(`Plivo answer failed: ${reason}`);
  return res.status(status).type('text/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Response><Speak>Sorry, this service is temporarily unavailable.</Speak></Response>',
  );
};

// ── POST /api/v1/plivo/answer ────────────────────────────────────────────────
export async function answer(req, res) {
  if (!signatureOk(req, '/answer')) {
    return res.status(403).type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
    );
  }

  const workspaceId = field(req, 'workspaceId');
  const agentId = field(req, 'agentId');
  const callLogId = field(req, 'callLogId') || null;
  const mode = field(req, 'mode') || 'conversation';
  const callUuid = field(req, 'CallUUID');

  // ── broadcast ──
  //
  // Handled before the agent lookup because a broadcast HAS no agent: it plays a
  // recording and hangs up. The audio URL is minted here rather than carried on
  // the query string, for the same reason the stream URL is — a public,
  // unauthenticated endpoint must never emit an address that arrived from
  // outside into XML a carrier will fetch.
  if (mode === 'broadcast') {
    const recordingId = field(req, 'recordingId');
    if (!recordingId) return failXml(res, 400, `broadcast answer with no recordingId (CallUUID ${callUuid})`);

    const recording = await getRecordingUnscoped(recordingId);
    if (!recording) return failXml(res, 404, `broadcast recording ${recordingId} not found`);

    let audioUrl;
    try {
      audioUrl = publicAudioUrl(recordingId);
    } catch (err) {
      return failXml(res, 503, `broadcast audio URL could not be built: ${err.message}`);
    }

    logger.info({ recordingId, callUuid }, 'Plivo answered a one-way broadcast call');
    return xml(res, buildPlayXml({ audioUrl, repeat: Number(field(req, 'repeat')) || 1 }));
  }

  if (!workspaceId || !agentId) {
    return failXml(res, 400, `answer called without workspaceId/agentId (CallUUID ${callUuid})`);
  }

  // loadAgent(), not a raw findFirst: Plivo fetches this endpoint AFTER the
  // callee has picked up, so everything here is silence on a live line, and one
  // Supabase round trip from this server measures 490-1400ms. Behind the
  // 5-minute agent cache a campaign pays it once per agent instead of once per
  // call — and it populates the very cache the media bridge reads moments later,
  // so that lookup stops being a second identical round trip too.
  const agent = await loadAgent(workspaceId, agentId);
  if (!agent) {
    return failXml(res, 404, `agent ${agentId} not found in workspace ${workspaceId}`);
  }

  // Set by placeCall() on calls this platform dialled. Normalised to the casing
  // getRenderedWelcome() expects.
  const rawDirection = String(field(req, 'direction') || '').toUpperCase();
  const direction = rawDirection === 'OUTBOUND' || rawDirection === 'INBOUND' ? rawDirection : null;

  // ── An absent flag on THIS endpoint means inbound, not "unknown" ─────────
  //
  // It used to mean unknown, and the greeting then fell back to the agent's
  // configured settings.callDirection — so a customer who dialled a number
  // belonging to an OUTBOUND-configured agent was greeted with "Hi, this is
  // Anjali calling from Sunrise Hospital", on a call they had just placed
  // themselves. The mirror image of the "thank you for calling" bug on outbound
  // campaigns, and it has no configuration that fixes it: the agent's stored
  // direction is a single value, and this line is the other one.
  //
  // The inference is sound rather than convenient. Every outbound call reaches
  // this endpoint through placeCall(), which appends `direction` unconditionally
  // (plivo.provider.js). There is no other way to arrive here with the flag
  // missing except a carrier delivering a call somebody dialled TO us.
  //
  // Deliberately not applied to `mode === 'greeting'` below: that mode is only
  // reachable from the outbound dialler, so it keeps its own OUTBOUND default.
  const conversationDirection = direction || 'INBOUND';

  if (mode === 'greeting') {
    // Re-rendered here rather than carried on the query string: see
    // plivo.provider.js#buildGreetingDoc for why the text does not travel.
    let welcome = agent.welcomeMessage || `Hello, this is a call from ${agent.name}.`;
    try {
      // A greeting-only call is one this platform dialled — there is no other
      // way to reach this mode — so OUTBOUND even if the flag went missing.
      const rendered = await getRenderedWelcome(workspaceId, agentId, { direction: direction || 'OUTBOUND' });
      if (rendered?.welcome) welcome = rendered.welcome;
    } catch (e) {
      logger.warn(`Plivo greeting: welcome rendering failed, using the raw field: ${e.message}`);
    }
    logger.info({ workspaceId, agentId, callUuid }, 'Plivo answered a greeting-only call');
    return xml(res, buildGreetingXml({ greeting: welcome, closingLine: field(req, 'closing') }));
  }

  // ── conversation ──
  //
  // No engine check here — this does not REFUSE anything. Both bridges exist,
  // bundled (plivoMediaRealtime) and modular (plivoMediaModular), and refusing a
  // "non-bundled" engine here, as this did while only the bundled bridge
  // existed, would reject every knowledge-base agent.
  //
  // What it does do is ANSWER the question, so server.js does not have to. We
  // are already holding the agent row (loaded above, for the 404 and the
  // greeting), so the engine is free here — whereas in the upgrade handler it
  // costs a Supabase round trip mid-handshake, i.e. dead air on a line the
  // callee has already answered. This covers INBOUND calls, which have no
  // dialler to have put the flag on the URL; `field(req, 'engine')` is the
  // outbound case, where placeCall() already stamped it on the answer URL.
  if (!env.PUBLIC_BACKEND_WS_URL) {
    return failXml(res, 500, 'PUBLIC_BACKEND_WS_URL is not set, so there is no media bridge address');
  }

  const declaredEngine = String(field(req, 'engine') || '').toLowerCase();
  let engine = declaredEngine === 'bundled' || declaredEngine === 'modular' ? declaredEngine : null;
  if (!engine) {
    let voiceEngine = 'modular';
    try { voiceEngine = JSON.parse(agent.settings || '{}').voiceEngine || 'modular'; } catch { /* default */ }
    engine = isBundledEngine(voiceEngine) ? 'bundled' : 'modular';
  }

  // The bridge learns the call log, the call's direction AND which bridge to be
  // from the socket URL, because Plivo's `start` event carries no per-call
  // parameters of our choosing. Built with URL/searchParams rather than string
  // concatenation: mediaStreamUrl() may already have put a query string on it,
  // and `+= '?…'` would then emit a second `?` and silently lose one of them.
  const streamUrlObj = new URL(plivoProvider.mediaStreamUrl({
    baseWsUrl: env.PUBLIC_BACKEND_WS_URL,
    workspaceId,
    agentId,
    direction: conversationDirection,
    engine,
  }));
  if (callLogId) streamUrlObj.searchParams.set('callLogId', callLogId);
  const streamUrl = streamUrlObj.toString();

  logger.info({ workspaceId, agentId, callUuid, callLogId }, 'Plivo answered a conversational call');
  return xml(res, buildStreamXml({ streamUrl }));
}

// ── POST /api/v1/plivo/hangup ────────────────────────────────────────────────
//
// Plivo's vocabulary for how a call ended. Only a call that was actually
// answered has a Duration worth settling.
const ANSWERED_STATES = new Set(['completed']);

export async function hangup(req, res) {
  if (!signatureOk(req, '/hangup')) return res.status(403).json({ error: 'Invalid signature' });

  // Answer first, work after. A carrier webhook kept waiting on our database is
  // a carrier webhook that retries, and everything below is best effort.
  res.json({ ok: true });

  const callState = String(field(req, 'CallStatus', 'call_state')).toLowerCase();
  const seconds = Number(field(req, 'Duration') || 0);

  // ── broadcast ──
  //
  // For a one-way call this callback is the ONLY end-of-call signal there is: no
  // media socket is ever opened, and no AgentCallLog exists. It is where the
  // answered/no-answer outcome and the charge both come from.
  const broadcastRecipientId = field(req, 'broadcastRecipientId') || null;
  if (broadcastRecipientId) {
    // The leg is down: give the concurrency slot back before settling, so a
    // waiting dialer sees the free slot immediately rather than after the
    // wallet write. Keyed on the recipient id — a broadcast has no call log.
    releaseSlot(broadcastRecipientId);
    try {
      await settleBroadcastCall(broadcastRecipientId, {
        durationSec: seconds,
        answered: ANSWERED_STATES.has(callState) && seconds > 0,
        failureReason: ANSWERED_STATES.has(callState) ? null : (callState || 'unknown'),
        providerCallId: field(req, 'CallUUID') || null,
      });
      const recipient = await prisma.broadcastRecipient.findUnique({
        where: { id: broadcastRecipientId },
        select: { broadcastId: true },
      });
      // Keep the broadcast's counters moving as outcomes land, rather than only
      // when the dispatcher next comes round — otherwise a finished send whose
      // last calls are still resolving sits at 98% indefinitely.
      if (recipient) await syncProgress(recipient.broadcastId).catch(() => {});
    } catch (e) {
      logger.warn(`Plivo hangup could not settle broadcast recipient ${broadcastRecipientId}: ${e.message}`);
    }
    return;
  }

  const callLogId = field(req, 'callLogId') || null;
  if (!callLogId) return;

  const workspaceId = field(req, 'workspaceId');
  const agentId = field(req, 'agentId');
  const hangupCause = field(req, 'HangupCauseName', 'hangup_cause_name');
  const duration = seconds;

  try {
    const log = await prisma.agentCallLog.findUnique({
      where: { id: callLogId },
      select: { status: true },
    });
    // The media bridge already closed this out on socket close. Re-finalizing
    // would duplicate the Sheets row / webhook / email for one call — the exact
    // thing callFinalizer's once-only guard exists to prevent, except that guard
    // is per-bridge-instance and this is a different process path.
    if (!log || (log.status !== 'INITIATED' && log.status !== 'IN_PROGRESS')) return;

    const answered = ANSWERED_STATES.has(callState) && duration > 0;
    const finalize = createCallFinalizer({
      workspaceId,
      agentId,
      label: 'Plivo phone call',
    });
    await finalize(callLogId, answered ? 'COMPLETED' : 'FAILED', {
      transcript: [],
      startedAt: Date.now() - duration * 1000,
    });

    logger.info(
      { callLogId, callState, hangupCause, duration },
      `Plivo hangup closed out a call as ${answered ? 'COMPLETED' : 'FAILED'}`,
    );
  } catch (e) {
    logger.warn(`Plivo hangup callback could not close out ${callLogId}: ${e.message}`);
  }
}
